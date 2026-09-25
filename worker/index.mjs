/**
 * Fret Logic 云同步后端（Cloudflare Worker + D1）
 *
 * 路由用 Hono 组织：API 形态与 Express 一致（app.get / app.post / app.use 中间件），
 * 但 Hono 是 Workers 原生框架，不需要 nodejs_compat、也不依赖 Node 的 http 原语，
 * 因此 D1 绑定与现有部署方式完全不变。
 *
 * - 读操作（GET 数据 / GET /meta / HEAD）保持公开，与前端「仅推送需 Token」一致；
 * - 写操作 POST 校验 `Authorization: Bearer <SERVER_TOKEN>`（环境变量 / secret），防止他人覆盖云端数据；
 * - GET /auth-check 仅做写鉴权探测、不落库，供前端「测试连接」区分有无 Token（避免真实 POST 污染历史版本）；
 * - POST 支持 `If-Match` 条件写：以前端 HEAD 拿到的 ETag 为基线比对，不一致即 412，防止并发覆盖；
 * - 附带历史版本归档（sync_history，按 SYNC_HISTORY_LIMIT 滚动保留最近若干版）与轻量校验元数据（data_md5 + data_updated_at，供前端启动时只拉最小数据比对）。
 */
import { Hono } from 'hono';
import { cors } from 'hono/cors';

// 内联 MD5（见 worker/lib/md5.mjs 文件头）：不用 js-md5 是因其顶层 require('crypto')/('buffer')，
// 在 esbuild --platform=neutral 下会解析失败；内联实现与前端 js-md5 逐字节等价（已交叉验证）。
import { md5 } from './lib/md5.mjs';

/** POST 载荷体积上限：超过即 413，避免超大 body 一次性落库 / 撑爆 D1 配额 */
const MAX_PAYLOAD_BYTES = 25 * 1024 * 1024;
/** sync_history 保留的历史版本数：超出即裁掉最旧的，避免无限累积撑配额 */
const SYNC_HISTORY_LIMIT = 50;

/**
 * ETag 与条件写基线：ETag 就是快照行的写入时刻 `updated_at`（毫秒）。
 * 读路径（GET/HEAD）下发它，写路径用 `If-Match` 回收比对——两端必须共用同一套
 * 编解码，否则会出现「读回来带引号、比对时没剥引号」这种恒不相等的假冲突。
 * 选择写入时刻而非内容 md5：md5 相同也可能是两次独立写入，用它做基线会漏判并发覆盖。
 */
const etagOf = updatedAt => `"${updatedAt}"`;
/** 剥掉 RFC 允许的弱校验前缀 `W/` 与两侧引号，取出裸值用于比对 */
const parseIfMatch = raw =>
  raw
    .trim()
    .replace(/^W\//i, '')
    .replace(/^"(.*)"$/, '$1');

// 泛型用 JSDoc 断言补上（JS 里没法写 `new Hono<…>()`）：不写的话 c.env 是 unknown，
// `c.env.DB` 就成了「属性不存在」——那正是绑定名拼错时该被拦住的地方，故这里必须给准。
// 绑定与 secret 的名字见 worker/bindings.d.ts。
const app = /** @type {import('hono').Hono<{ Bindings: WorkerBindings }>} */ (new Hono());

// CORS 与 OPTIONS 预检统一交给中间件：原先手写的 CORS_HEADERS 与 OPTIONS 分支整段省掉。
// 两项与条件写直接相关，漏一个整条 If-Match 链路都会在浏览器侧断掉（前端读不到 / 发不出）：
//  - exposeHeaders 含 ETag：ETag 不在 CORS 安全响应头清单内，不显式暴露的话
//    前端 HEAD 后 `headers.get('ETag')` 恒为 null，条件写基线根本拿不到；
//  - allowHeaders 含 If-Match：该头非安全请求头，会触发预检，不在白名单里浏览器直接拦下请求。
app.use(
  '*',
  cors({
    origin: '*',
    allowMethods: ['GET', 'POST', 'HEAD', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization', 'X-Environment', 'If-Match'],
    exposeHeaders: ['ETag'],
    maxAge: 86400,
  })
);

// 最新快照表（含 data_md5 / data_updated_at 校验列）+ 历史表（每次写入追加一行，按 SYNC_HISTORY_LIMIT 滚动裁剪）
// 两个时间戳分开放，语义不同、不可互相替代：
//  - updated_at      = 服务端写入时刻（谁在什么时候推的）
//  - data_updated_at = 载荷自身的 maxUpdatedAt（数据内容最后被修改的时间，客户端随 POST 提交）
// 前端「推送前冲突防线」要拿后者与本地 maxUpdatedAt 做同口径比较，用写入时刻会误判。
async function ensureTable(db) {
  await db.batch([
    db.prepare(
      'CREATE TABLE IF NOT EXISTS sync_data (id TEXT PRIMARY KEY, data TEXT NOT NULL, data_md5 TEXT, data_updated_at INTEGER, updated_at INTEGER NOT NULL)'
    ),
    db.prepare(
      'CREATE TABLE IF NOT EXISTS sync_history (id INTEGER PRIMARY KEY AUTOINCREMENT, data TEXT NOT NULL, created_at INTEGER NOT NULL)'
    ),
  ]);
  // 兼容旧表：给已存在的 sync_data 补校验列（幂等，忽略「列已存在」错误）
  try {
    await db.prepare('ALTER TABLE sync_data ADD COLUMN data_md5 TEXT').run();
  } catch {
    /* 列已存在 */
  }
  try {
    await db.prepare('ALTER TABLE sync_data ADD COLUMN data_updated_at INTEGER').run();
  } catch {
    /* 列已存在 */
  }
}

// D1 绑定校验 + 建表：每个请求都过一遍（ensureTable 内部幂等）。
// 抽成中间件后各路由不再重复这几行，等价于原 fetch 开头那段。
app.use('*', async (c, next) => {
  const db = c.env.DB;
  if (!db) {
    return c.json({ error: 'D1 数据库未绑定！请在 Worker -> Settings -> Bindings 中添加 D1 绑定' }, 500);
  }
  await ensureTable(db);
  await next();
});

// POST 写操作鉴权：fail-closed——未配置 SERVER_TOKEN 时拒绝一切写操作（含 /auth-check），
// 绝不因「未配置」而放行，否则任何人都能覆盖云端数据（P0 审计 #4）。读操作（GET/HEAD）保持公开。
function isAuthorized(c) {
  const expected = c.env.SERVER_TOKEN;
  if (!expected) return false;
  const token = (c.req.header('Authorization') || '').replace(/^Bearer\s+/i, '');
  return token === expected;
}

// GET /history：查看所有历史版本列表
app.get('/history', async c => {
  const { results } = await c.env.DB.prepare(
    'SELECT id, created_at, datetime(created_at/1000, "unixepoch", "localtime") as time, length(data) as size FROM sync_history ORDER BY id DESC'
  ).all();
  return c.json({ total: results.length, history: results });
});

// GET /meta：轻量校验元数据 {md5, updatedAt}，前端启动检测只拉这份
app.get('/meta', async c => {
  const row = await c.env.DB.prepare('SELECT data_md5, updated_at, data_updated_at FROM sync_data WHERE id = ?')
    .bind('latest_backup')
    .first();
  if (!row || !row.data_md5) {
    return c.json({ message: '暂无校验元数据' }, 404);
  }
  // 优先返回载荷自身的 maxUpdatedAt（与前端本地值同口径）；
  // 该列上线前写入的旧记录为 NULL，回退到服务端写入时刻，避免历史数据拿不到时间戳
  const updatedAt = row.data_updated_at ?? row.updated_at;
  return c.json({ md5: row.data_md5, updatedAt }, 200);
});

// GET /auth-check：轻量写鉴权探测（不落库），供前端「测试连接」校验 Token 有效性
app.get('/auth-check', async c => {
  if (!isAuthorized(c)) {
    return c.json({ error: '鉴权失败：Token 无效或缺失' }, 401);
  }
  return c.json({ authorized: true }, 200);
});

// GET / HEAD 任意路径：拉取最新数据（完整数据源，公开）。
// 必须排在 /history、/meta、/auth-check 之后——Hono 按注册顺序匹配，否则会被通配吃掉。
const readSnapshot = async c => {
  const row = await c.env.DB.prepare('SELECT data, updated_at FROM sync_data WHERE id = ?')
    .bind('latest_backup')
    .first();
  if (!row) {
    return c.json({ message: '暂无数据存档' }, 404);
  }
  c.header('ETag', etagOf(row.updated_at));
  // HEAD 只回 ETag 不带体：前端拿它做存在性探测与 If-Match 条件写的基线（POST 分支实现比对）
  if (c.req.method === 'HEAD') return c.body('', 200);
  return c.body(row.data, 200, { 'Content-Type': 'application/json; charset=utf-8' });
};
app.get('*', readSnapshot);
// GET-only 的三个端点显式登记 HEAD 为 405：否则 HEAD 会落到下面那条通配 HEAD 上，
// 拿到的是**快照**的 200 + ETag —— 对 /history 或 /meta 做存在性探测的一方会据此误判。
for (const path of ['/history', '/meta', '/auth-check']) app.on('HEAD', path, c => c.body(null, 405));
app.on('HEAD', '*', readSnapshot);

// POST 任意路径：同步（写操作，需鉴权），md5 与载荷 maxUpdatedAt 经 query 提交落库
app.post('*', async c => {
  if (!isAuthorized(c)) {
    return c.json({ error: '鉴权失败：Token 无效或缺失' }, 401);
  }

  // 条件写（If-Match）：前端推送前先 HEAD 取 ETag 作为基线，此处与当前行的写入时刻比对。
  // 不一致 = 探测之后已有别的设备写过，返回 412 让前端走 CONFLICT 分支，
  // 避免「后写静默覆盖前写」。两个作用：
  //   1. 补上协议层防线——此前只有前端 fetchMeta 比 updatedAt 一道（两次请求之间仍有窗口）；
  //   2. 让前端 push() 里那个 412 分支从死代码变成真能命中。
  // 未带 If-Match 时退化为无条件写，行为与旧版一致（旧客户端 / 直连调用不受影响）。
  const ifMatchRaw = c.req.header('If-Match');
  if (ifMatchRaw) {
    const current = await c.env.DB.prepare('SELECT updated_at FROM sync_data WHERE id = ?')
      .bind('latest_backup')
      .first();
    const expected = parseIfMatch(ifMatchRaw);
    const exists = Boolean(current);
    // `*`：RFC 语义是「资源存在即放行」，不比对具体值；其余按 ETag 严格比对
    const matched = expected === '*' ? exists : exists && String(current.updated_at) === expected;
    if (!matched) {
      // 一并把当前 ETag 回给调用方，便于前端直接刷新基线、少一次 HEAD 往返
      if (current) c.header('ETag', etagOf(current.updated_at));
      return c.json({ error: '数据已被其他设备更新，请先拉取最新数据后再上传' }, 412);
    }
  }

  const payloadText = await c.req.text();
  // 体积上限：超过即拒绝，避免超大 body 一次性落库 / 撑爆 D1 配额。
  // 口径必须是**字节**：`String.prototype.length` 是 UTF-16 码元数，中文一字一码元却是 3 字节，
  // 用码元数比字节上限等于把闸门放宽到约 3 倍。
  const payloadBytes = new TextEncoder().encode(payloadText).byteLength;
  if (payloadBytes > MAX_PAYLOAD_BYTES) {
    return c.json({ error: `载荷过大（上限 ${Math.floor(MAX_PAYLOAD_BYTES / 1024 / 1024)}MB）` }, 413);
  }
  const now = Date.now();
  // 解析载荷（同时作为 md5 的规范化输入）：非法 JSON 在此抛出，与旧行为一致
  const parsedPayload = JSON.parse(payloadText);
  // data_md5 不再信任客户端提交值：用**与前端 computePayloadMd5 同一口径**现场重算。
  // 前端算的是「剥掉元数据字段后的 serializeForStorage」——dataMd5 / dataUpdatedAt /
  // absentSections / deletedAt 四个字段先 delete 再序列化（见 payloadChecksum.ts）。
  // 这里曾经直接 md5(payloadText)（整包字节），依据是「push 的 body 就是同一个
  // serializeForStorage(payload)，故与前端值逐字节一致」——该等式自包内开始携带
  // deletedAt 删除水位线起就不再成立（前端剥掉它、整包字节里却带着），于是只要任一设备
  // 删过东西两侧必然不等：/meta 回读的 md5 与本地值恒不匹配，启动比对永久短路。
  // 键序无需额外处理：body 由同一 payload 序列化而来，JSON.parse 保留原序，
  // 删键后重序列化得到的就是前端 serializeForStorage(content) 的字节。
  delete parsedPayload.dataMd5;
  delete parsedPayload.dataUpdatedAt;
  delete parsedPayload.absentSections;
  delete parsedPayload.deletedAt;
  const serverMd5 = md5(JSON.stringify(parsedPayload));
  const clientMd5 = c.req.query('md5') || null;
  if (clientMd5 && clientMd5 !== serverMd5) {
    console.warn(`[sync] 客户端 md5 与重算不一致：client=${clientMd5} server=${serverMd5}`);
  }
  const dataMd5 = serverMd5;
  // 载荷自身的 maxUpdatedAt（客户端随 query 提交）：与前端本地值同口径，供冲突防线比较。
  // 不能直接 Number(param)：Number(null) 与 Number('') 都是 0，会把「缺失」误存成一个合法时间戳；
  // 先判空再转数值，非法/缺失一律存 null，读取时回退到服务端写入时刻。
  const updatedAtRaw = c.req.query('updatedAt');
  const updatedAtNum = updatedAtRaw ? Number(updatedAtRaw) : NaN;
  const dataUpdatedAt = Number.isFinite(updatedAtNum) ? updatedAtNum : null;

  const db = c.env.DB;
  await db.batch([
    db
      .prepare(
        'INSERT INTO sync_data (id, data, data_md5, data_updated_at, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data, data_md5 = excluded.data_md5, data_updated_at = excluded.data_updated_at, updated_at = excluded.updated_at'
      )
      .bind('latest_backup', payloadText, dataMd5, dataUpdatedAt, now),
    db.prepare('INSERT INTO sync_history (data, created_at) VALUES (?, ?)').bind(payloadText, now),
    // 历史归档裁剪：batch 在同一事务内顺序执行，此语句能看到上方刚插入的行；只留最近 N 条
    db
      .prepare('DELETE FROM sync_history WHERE id NOT IN (SELECT id FROM sync_history ORDER BY id DESC LIMIT ?)')
      .bind(SYNC_HISTORY_LIMIT),
  ]);

  // 写入成功同样回 ETag（=本次写入时刻），前端 push() 直接拿它作为返回的 sha，
  // 不必再退化到 Date.now() 兜底——整条链路的基线口径统一到服务端写入时刻。
  c.header('ETag', etagOf(now));
  return c.json({ success: true, updatedAt: now }, 200);
});

// 未匹配（PUT / DELETE 等不支持的方法）统一 405，对应原「不支持的请求方法」分支
app.notFound(c => c.json({ error: '不支持的请求方法' }, 405));

// 兜底异常处理：等价于原 fetch 的 try/catch，但绝不把内部错误详情/堆栈回显给调用方（脱敏，P0 审计 #4）
app.onError((_err, c) => c.json({ error: '服务器内部错误' }, 500));

export default app;
