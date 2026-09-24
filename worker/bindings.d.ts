/**
 * worker/ 的绑定类型（全局环境声明，供 `tsconfig.worker.json` 这条链使用）。
 *
 * 为什么手写而不是装 `@cloudflare/workers-types`：那份包会把整套 Workers 全局
 * （KV / R2 / Queues / 各种事件类型…）注入全局作用域，而本 Worker 只用得到 D1 的六个方法。
 * 为了「绑定名拼错能被拦住」这一件事引入一份要跟着 compatibility_date 走的全局类型面并不划算。
 *
 * **代价要认**：这份声明会与 CF 的真实 API 漂移。一旦用到新方法（如 `.raw()`、`.batch()` 之外
 * 的接口），必须同步补在这里，否则会出现「运行时明明有、类型里没有」的假红。等到用到的面
 * 明显变大，正确做法是换成 `@cloudflare/workers-types`，而不是继续加长这份 shim。
 *
 * 这里刻意**只声明用到的成员**（而非把 D1 全量 API 抄一遍）：声明得越全，越容易被误读成
 * 「这些就是 D1 的全部能力」；只留实际用到的，反而让「加新用法就得改这份文件」变成显式动作。
 */

/** D1 语句的返回形态（只声明本项目读取过的字段） */
interface D1Result<T> {
  results: T[];
  success: boolean;
  meta: Record<string, unknown>;
}

/** D1 预编译语句（只声明本项目调用过的方法） */
interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = Record<string, unknown>>(column?: string): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  run<T = Record<string, unknown>>(): Promise<D1Result<T>>;
}

/** D1 数据库绑定 */
interface D1Database {
  prepare(query: string): D1PreparedStatement;
  batch<T = Record<string, unknown>>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]>;
}

/**
 * `worker/wrangler.{dev,prod}.jsonc` 里声明的绑定与 secret。
 * 绑定的**名字**是这份类型的全部意义所在：名字拼错时请求会在运行时 500，
 * 而在此之前（无类型检查）只有部署后才发现。
 */
interface WorkerBindings {
  /** D1 绑定（jsonc 的 `d1_databases[0].binding`） */
  DB: D1Database;
  /** 写操作鉴权 Token：由部署脚本以 `wrangler secret put` 注入，不在仓库里，故可选 */
  SERVER_TOKEN?: string;
}
