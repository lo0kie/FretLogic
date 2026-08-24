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
 */
import http from 'node:http';
import https from 'node:https';
import { URL } from 'node:url';

const PORT = Number(process.env.PROXY_PORT ?? 9003);
const ALLOWED_HOSTS = (process.env.PROXY_ALLOWED_HOSTS ?? '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

/** 根据请求来源动态返回 CORS 头，支持携带 Authorization 的凭据请求。 */
function corsHeaders(req) {
  return {
    'Access-Control-Allow-Origin': req.headers.origin ?? '*',
    'Access-Control-Allow-Methods': 'GET,HEAD,PUT,POST,DELETE,OPTIONS,MKCOL,PROPFIND,COPY,MOVE,LOCK,UNLOCK,REPORT',
    'Access-Control-Allow-Headers': 'Authorization,Content-Type,Depth,Overwrite,Destination,If,Lock-Token',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Expose-Headers': 'ETag,Content-Length,DAV,Lock-Token',
  };
}

function forward(req, res) {
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

  const isHttps = parsed.protocol === 'https:';
  const lib = isHttps ? https : http;
  // 转发给目标时去掉浏览器侧与 CORS 相关的请求头，避免目标服务器困惑
  const headers = { ...req.headers, host: parsed.host };
  delete headers['access-control-request-headers'];
  delete headers['access-control-request-method'];
  delete headers['origin'];
  delete headers['referer'];

  const options = {
    method: req.method,
    hostname: parsed.hostname,
    port: parsed.port || (isHttps ? 443 : 80),
    path: parsed.pathname + parsed.search,
    headers,
  };

  const upstream = lib.request(options, upRes => {
    res.writeHead(upRes.statusCode ?? 502, { ...upRes.headers, ...corsHeaders(req) });
    upRes.pipe(res);
  });
  upstream.on('error', err => {
    res.writeHead(502, { 'Content-Type': 'text/plain', ...corsHeaders(req) });
    res.end(`Proxy upstream error: ${err.message}`);
  });
  req.pipe(upstream);
}

const server = http.createServer((req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, corsHeaders(req));
    res.end();
    return;
  }
  forward(req, res);
});

server.on('error', err => {
  if (err.code === 'EADDRINUSE') {
    console.error(
      `[dev-webdav-proxy] 端口 ${PORT} 已被占用，无法启动。请先停止旧的代理进程（例如结束占用 9003 的 node），再重新运行 npm run dev:proxy。`
    );
    process.exit(1);
  }
  throw err;
});

server.listen(PORT, () => {
  const hosts = ALLOWED_HOSTS.length ? ` (仅允许: ${ALLOWED_HOSTS.join(', ')})` : '';
  console.log(`[dev-webdav-proxy] listening on http://localhost:${PORT}  (?url=<target>)${hosts}`);
});
