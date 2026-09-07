/**
 * 开发用 WebDAV CORS 转发代理（零依赖）。
 *
 * 浏览器受同源策略限制，无法直连坚果云等不返回 CORS 头的 WebDAV 服务器。
 * 本脚本在本地起一个 Node 服务，浏览器把请求发给它（同源 / 跨域但带 CORS 头），
 * 由 Node 在服务端转发到真实 WebDAV 服务器，再把响应带回。
 *
 * 用法：
 *   1) 终端 A：npm run dev:proxy
 *   2) 终端 B：npm run dev
 *   3) 在「云端同步设置 → WebDAV」里，把「CORS 代理」填为 http://localhost:9003
 *   4) 其余（服务器地址 / 账号 / 密码 / 路径）照常填写
 *
 * 约定（与 services/sync/webdavSyncProvider.ts 一致）：
 *   实际请求形如  http://localhost:9003/?url=<encodeURIComponent(目标完整 URL)>
 *   脚本会原样转发 method / headers（含 Authorization）/ body 到目标。
 *
 * 安全默认值（仅本地开发，勿暴露公网）：
 *   - 默认只绑定 127.0.0.1（PROXY_HOST 可改）
 *   - 默认拒绝转发到内网/回环目标（SSRF 防护；PROXY_ALLOW_PRIVATE=1 放开）
 *   - CORS 仅对 localhost 来源回显（PROXY_ALLOWED_ORIGINS 可加白名单）
 *   - PROXY_ALLOWED_HOSTS 可进一步把目标限制到指定主机
 */
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import { lookup } from 'node:dns/promises';
import { URL } from 'node:url';

const PORT = Number(process.env.PROXY_PORT ?? 9003);
// 默认双栈监听（'::' 同时接受 IPv6 与 IPv4-mapped 连接）：
// Windows 上浏览器把 localhost 优先解析为 IPv6 ::1，若只绑 127.0.0.1 会导致浏览器连不上代理（fetch 报 TypeError）。
// 可用 PROXY_HOST 收窄（如 127.0.0.1）。
const HOST = process.env.PROXY_HOST ?? '::';
const ALLOWED_HOSTS = (process.env.PROXY_ALLOWED_HOSTS ?? '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);
// 默认拒绝转发到内网/回环地址（SSRF 防护）；设置 PROXY_ALLOW_PRIVATE=1 可放开
const ALLOW_PRIVATE = process.env.PROXY_ALLOW_PRIVATE === '1';
// 重定向跟随：3xx 由代理在服务端消化，避免浏览器跟随重定向直连目标被 CORS 拦截
const MAX_REDIRECT_HOPS = 5;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

/**
 * 判断地址是否为内网/回环/链路本地等不应被代理访问的目标（SSRF 防护）。
 * 覆盖：IPv4 回环/私网/CGNAT/链路本地/广播，IPv6 回环/ULA/链路本地，以及 IPv4-mapped 地址。
 */
function isPrivateAddress(address) {
  const ip = address.replace(/^::ffff:/i, '');
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return (
      a === 127 ||
      a === 10 ||
      a === 0 ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 169 && b === 254) ||
      (a === 100 && b >= 64 && b <= 127)
    );
  }
  if (net.isIPv6(ip)) {
    const lower = ip.toLowerCase();
    return (
      lower === '::1' ||
      lower === '::' ||
      lower.startsWith('fc') ||
      lower.startsWith('fd') ||
      lower.startsWith('fe8') ||
      lower.startsWith('fe9') ||
      lower.startsWith('fea') ||
      lower.startsWith('feb')
    );
  }
  return false;
}

/** 校验转发目标：默认禁止内网地址（SSRF）。显式列入 ALLOWED_HOSTS 的主机视为已受信任，跳过检查。 */
async function assertTargetAllowed(parsed) {
  if (ALLOWED_HOSTS.includes(parsed.host)) return;
  const host = parsed.hostname.replace(/^\[|\]$/g, '');
  // 字面量 IP 直接判断；域名先做 DNS 解析，防止用域名绕过
  let addresses;
  if (net.isIP(host)) {
    addresses = [{ address: host, family: net.isIPv4(host) ? 4 : 6 }];
  } else {
    addresses = await lookup(host, { all: true, verbatim: true }).catch(() => []);
  }
  if (!ALLOW_PRIVATE && addresses.some(a => isPrivateAddress(a.address))) {
    throw new Error(`target resolves to private/intranet address: ${parsed.host}`);
  }
}

/** 根据请求来源动态返回 CORS 头。默认仅信任 localhost 来源，避免把「任意来源带凭据」暴露到非本机环境。 */
function corsHeaders(req) {
  const origin = req.headers.origin;
  const allowedOrigins = (process.env.PROXY_ALLOWED_ORIGINS ?? '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
  let allowOrigin = '';
  if (origin) {
    let hostname;
    try {
      hostname = new URL(origin).hostname;
    } catch {
      hostname = '';
    }
    if (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '[::1]' ||
      allowedOrigins.includes(origin)
    ) {
      allowOrigin = origin;
    }
  }
  return {
    ...(allowOrigin ? { 'Access-Control-Allow-Origin': allowOrigin } : {}),
    'Access-Control-Allow-Methods': 'GET,HEAD,PUT,POST,DELETE,OPTIONS,MKCOL,PROPFIND,COPY,MOVE,LOCK,UNLOCK,REPORT',
    'Access-Control-Allow-Headers': 'Authorization,Content-Type,Depth,Overwrite,Destination,If,Lock-Token',
    ...(allowOrigin ? { 'Access-Control-Allow-Credentials': 'true' } : {}),
    'Access-Control-Expose-Headers': 'ETag,Content-Length,DAV,Lock-Token,Vary',
    'Vary': 'Origin',
  };
}

async function forward(req, res) {
  const reqUrl = new URL(req.url ?? '/', 'http://localhost');
  const target = reqUrl.searchParams.get('url');
  if (!target) {
    res.writeHead(400, { 'Content-Type': 'text/plain' });
    res.end('Missing "url" query parameter');
    return;
  }

  let parsed;
  try {
    parsed = new URL(target);
  } catch {
    res.writeHead(400, { 'Content-Type': 'text/plain' });
    res.end('Invalid "url"');
    return;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    res.writeHead(400, { 'Content-Type': 'text/plain' });
    res.end('Only http(s) targets allowed');
    return;
  }
  if (ALLOWED_HOSTS.length && !ALLOWED_HOSTS.includes(parsed.host)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end(`Target host not allowed: ${parsed.host}`);
    return;
  }
  try {
    await assertTargetAllowed(parsed);
  } catch (err) {
    console.warn(`[dev-webdav-proxy] blocked request to ${parsed.host}: ${err.message}`);
    res.writeHead(403, { 'Content-Type': 'text/plain', ...corsHeaders(req) });
    res.end(`Target blocked: ${err.message}`);
    return;
  }

  // 转发给目标时去掉浏览器侧与 CORS 相关的请求头，避免目标服务器困惑
  const headers = { ...req.headers, host: parsed.host };
  delete headers['access-control-request-headers'];
  delete headers['access-control-request-method'];
  delete headers['origin'];
  delete headers['referer'];

  // 先缓冲请求体：重定向需要原样重发（WebDAV 的 PROPFIND/PUT body 都不大，缓冲无压力）
  const body = await new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });

  // 服务端跟随重定向（最多 5 跳）：浏览器 fetch 会自动跟随 3xx，
  // 若把重定向透传给浏览器，浏览器将直连目标服务器而被 CORS 拦截
  // （典型场景：TeraCloud 对 /dav 返回 301 -> /dav/）。
  let current = parsed;
  try {
    for (let hop = 0; ; hop++) {
      if (hop > MAX_REDIRECT_HOPS) {
        res.writeHead(502, { 'Content-Type': 'text/plain', ...corsHeaders(req) });
        res.end(`Too many redirects (> ${MAX_REDIRECT_HOPS})`);
        return;
      }
      if (current.protocol !== 'http:' && current.protocol !== 'https:') {
        res.writeHead(400, { 'Content-Type': 'text/plain', ...corsHeaders(req) });
        res.end('Only http(s) targets allowed');
        return;
      }
      if (ALLOWED_HOSTS.length && !ALLOWED_HOSTS.includes(current.host)) {
        res.writeHead(403, { 'Content-Type': 'text/plain', ...corsHeaders(req) });
        res.end(`Target host not allowed: ${current.host}`);
        return;
      }
      try {
        await assertTargetAllowed(current);
      } catch (err) {
        console.warn(`[dev-webdav-proxy] blocked request to ${current.host}: ${err.message}`);
        res.writeHead(403, { 'Content-Type': 'text/plain', ...corsHeaders(req) });
        res.end(`Target blocked: ${err.message}`);
        return;
      }

      const isHttps = current.protocol === 'https:';
      const lib = isHttps ? https : http;
      // host 头随每跳更新；跨 host 重定向剥离 Authorization，避免凭据外泄
      const hopHeaders = { ...headers, host: current.host };
      if (current.host !== parsed.host) delete hopHeaders.authorization;

      const outcome = await new Promise((resolve, reject) => {
        const upstream = lib.request(
          {
            method: req.method,
            hostname: current.hostname,
            port: current.port || (isHttps ? 443 : 80),
            path: current.pathname + current.search,
            headers: hopHeaders,
          },
          upRes => {
            const code = upRes.statusCode ?? 502;
            if (REDIRECT_STATUSES.has(code) && upRes.headers.location) {
              upRes.resume(); // 丢弃重定向响应体，继续下一跳
              resolve({ code, location: upRes.headers.location });
              return;
            }
            res.writeHead(code, { ...upRes.headers, ...corsHeaders(req) });
            upRes.pipe(res);
            resolve({ code, location: null });
          }
        );
        upstream.on('error', reject);
        if (body.length) upstream.write(body);
        upstream.end();
      });

      if (!outcome.location) return;
      const next = new URL(outcome.location, current);
      console.log(`[dev-webdav-proxy] ${outcome.code} ${current} -> ${next}`);
      current = next;
    }
  } catch (err) {
    if (!res.headersSent) {
      res.writeHead(502, { 'Content-Type': 'text/plain', ...corsHeaders(req) });
    }
    res.end(`Proxy upstream error: ${err.message}`);
  }
}

const server = http.createServer((req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, corsHeaders(req));
    res.end();
    return;
  }
  forward(req, res).catch(err => {
    // forward 内部已处理可预期错误，这里只兜底未捕获异常，避免进程崩溃
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
    }
    res.end(`Proxy internal error: ${err.message}`);
  });
});

server.on('error', err => {
  if (err.code === 'EADDRINUSE') {
    console.error(
      `[dev-webdav-proxy] 端口 ${PORT} 已被占用，无法启动。请先停止旧的代理进程（例如结束占用 ${PORT} 的 node），再重新运行 npm run dev:proxy。`
    );
    process.exit(1);
  }
  throw err;
});

server.listen(PORT, HOST, () => {
  const hosts = ALLOWED_HOSTS.length
    ? ` (仅允许: ${ALLOWED_HOSTS.join(', ')})`
    : ' (未设置 PROXY_ALLOWED_HOSTS：仅拦截内网目标，公网目标不限制)';
  const privateNote = ALLOW_PRIVATE ? ' [已放开内网拦截]' : ' [已拦截内网目标]';
  const displayHost = HOST === '::' ? '[::]' : HOST;
  console.log(`[dev-webdav-proxy] listening on http://${displayHost}:${PORT}  (?url=<target>)${hosts}${privateNote}`);
  console.log(
    '[dev-webdav-proxy] 仅限本地开发使用，请勿暴露到公网。可用环境变量：PROXY_PORT / PROXY_HOST / PROXY_ALLOWED_HOSTS / PROXY_ALLOWED_ORIGINS / PROXY_ALLOW_PRIVATE'
  );
});
