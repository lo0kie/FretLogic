/**
 * 备份包敏感凭据加密（AES-256-GCM + PBKDF2-SHA256）。
 *
 * 背景：导出备份勾选「同步配置」时，历史实现将 Token / WebDAV 密码以明文 JSON 落地，
 * 备份文件一旦被分发即等于泄露全部云端凭据。现改为：导出时由用户输入一次性导出密码，
 * 四个敏感字段（githubToken / giteeToken / webdavPassword / serverToken）被剥离出明文区，
 * 加密为 secrets 块随包携带；导入时输入同一密码才能还原。非敏感字段（仓库地址、用户名等
 * 元数据）保持明文，便于在不解密的情况下识别配置归属。
 *
 * 算法：PBKDF2（SHA-256，迭代数随包携带，见下，16B 随机盐）派生 AES-GCM 256 密钥；12B 随机 IV。
 * GCM 自带完整性校验：密码错误或密文被篡改在 decrypt 阶段统一表现为解密失败。
 *
 * 迭代数写进包体（secrets.iter）而不是只留一个常量：迭代成本要随硬件与建议值演进（150k → 600k），
 * 而解密侧一旦只认「当前常量」，一次调参就会让所有历史备份派生出不同密钥、被 GCM 判为损坏——用户看到
 * 的只会是「密码错误或备份已损坏」，且无从排查。历史包（v1，信封无 iter）解密时固定回落 150k。
 */
import { logger } from '@/platform/utils/logger';

import type { EncryptedSecrets, EncryptedSyncSettingsBackup, SyncSettingsBackup } from '@/platform/types';

/** 加密侧写入包体的迭代数：OWASP 对 PBKDF2-SHA256 的建议为 ≥600k */
const PBKDF2_ITERATIONS = 600_000;
/** 历史包的固定迭代数：v1 信封不记录迭代数，解密这些包必须按它派生 */
const PBKDF2_ITERATIONS_V1 = 150_000;
/** 迭代数上限：包体可能来自第三方，拦掉「巨量迭代」把导入变成长时间冻结的构造 */
const PBKDF2_ITERATIONS_MAX = 5_000_000;
/** 迭代数下限：低于此值只可能来自构造或损坏，不该被当成合法参数跑一次派生 */
const PBKDF2_ITERATIONS_MIN = 1_000;
const SALT_BYTES = 16;
const IV_BYTES = 12;
/** secrets 块格式版本：1 = 无 iter（按 PBKDF2_ITERATIONS_V1 解密）；2 = 随包携带 iter */
const SECRETS_FORMAT_V1 = 1;
const SECRETS_FORMAT_VERSION = 2;

const toB64 = (bytes: Uint8Array): string => btoa(String.fromCharCode(...bytes));

const fromB64 = (b64: string): Uint8Array => {
  const raw = atob(b64);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
  return bytes;
};

/** 迭代数是否落在可用区间（整数且不越上下限） */
const isUsableIterations = (value: unknown): value is number =>
  typeof value === 'number' &&
  Number.isInteger(value) &&
  value >= PBKDF2_ITERATIONS_MIN &&
  value <= PBKDF2_ITERATIONS_MAX;

const deriveKey = async (passphrase: string, salt: Uint8Array, iterations: number): Promise<CryptoKey> => {
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(passphrase), 'PBKDF2', false, [
    'deriveKey',
  ]);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
};

/**
 * 同步凭据的「分支 → 密钥字段名 + 在配置上的落点」单一来源。
 *
 * 加密侧（collectSecrets 提取）与解密侧（revealEncryptedSyncSettings 还原）互为逆操作：
 * 密钥字段名只在写入侧出现、读取侧照抄，任一侧改名而另一侧没跟，凭据就会在备份/恢复往返后
 * 静默丢失（P0 审计 #2 即这一类）。故收成一张表，两侧都从这里取。
 * `field` 逐行写死（而不是统一标成 `'token' | 'password'`），让「webdav 的凭据是 password」
 * 这条事实同样由类型把守 —— 与原先 switch 里靠判别联合收窄得到的效果一致。
 */
export const SECRET_FIELD_BY_KIND = {
  github: { secret: 'githubToken', field: 'token' },
  gitee: { secret: 'giteeToken', field: 'token' },
  webdav: { secret: 'webdavPassword', field: 'password' },
  server: { secret: 'serverToken', field: 'token' },
} as const satisfies {
  github: { secret: string; field: 'token' };
  gitee: { secret: string; field: 'token' };
  webdav: { secret: string; field: 'password' };
  server: { secret: string; field: 'token' };
};

/** 同步配置上的敏感字段视图：判别联合各分支只带 `token` 或 `password` 之一，收成可按键访问的形状，
 *  让两侧共用上表而不必各写一套 switch。**注解返回类型即可，无需断言**（各分支都能赋给该形状）。 */
export const credentialFieldsOf = (settings: SyncSettingsBackup): { token?: string; password?: string } => settings;

/**
 * 从同步配置中提取待加密的敏感字段（按判别联合各分支的 token/password）；
 * 无任何非空敏感字段时返回 undefined。键名取自 SECRET_FIELD_BY_KIND，解密侧按同一套键还原。
 */
const collectSecrets = (settings: SyncSettingsBackup): Record<string, string> | undefined => {
  const { secret, field } = SECRET_FIELD_BY_KIND[settings.kind];
  const value = credentialFieldsOf(settings)[field];
  return typeof value === 'string' && value.length > 0 ? { [secret]: value } : undefined;
};

/**
 * 加密同步配置中的敏感字段：返回剥除明文敏感字段、附带 secrets 块的新配置对象。
 * 无敏感字段时原样返回（附一个 secrets 字段都没有）；加密失败抛错由调用方提示。
 *
 * 返回类型是宽联合（分支特有字段从类型上不可见）：调用方若要读自己刚传进去的 owner / serverUrl，
 * 先按 `kind` 收窄即可 —— 加密不改变分支。
 */
export async function encryptSyncSettingsSecrets(
  settings: SyncSettingsBackup,
  passphrase: string
): Promise<EncryptedSyncSettingsBackup> {
  const secrets = collectSecrets(settings);
  if (!secrets) return { ...settings };

  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const key = await deriveKey(passphrase, salt, PBKDF2_ITERATIONS);
  const cipher = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    key,
    new TextEncoder().encode(JSON.stringify(secrets))
  );

  const rest = { ...settings } as SyncSettingsBackup & Record<string, unknown>;
  // 按 kind 剥除已加密的敏感字段：字段名取自 SECRET_FIELD_BY_KIND —— 它已经是「本 kind 的凭据
  // 落在哪个字段」的单一来源，此处再写一遍 switch 就是同一事实的第二个家。后果不是丢数据而是**泄漏**：
  // 新 kind 进了表却漏了这个 switch，凭据会既加密进 secrets、又以明文留在包体里跟着导出。
  delete rest[SECRET_FIELD_BY_KIND[settings.kind].field];
  return {
    ...rest,
    secrets: {
      v: SECRETS_FORMAT_VERSION,
      iter: PBKDF2_ITERATIONS,
      salt: toB64(salt),
      iv: toB64(iv),
      data: toB64(new Uint8Array(cipher)),
    },
  } as EncryptedSyncSettingsBackup;
}

/**
 * 取该包加密时实际使用的迭代数：v2 起读包内 iter，v1 回落历史常量 150k。
 * 只有把「读」与「写」绑在同一个值上，加密侧调参才不会波及历史包。
 */
const resolveIterations = (blob: EncryptedSecrets): number =>
  blob.v > SECRETS_FORMAT_V1 && isUsableIterations(blob.iter) ? blob.iter : PBKDF2_ITERATIONS_V1;

/**
 * 解密备份包中的 secrets 块，还原为敏感字段键值对。
 * 密码错误 / 密文损坏统一抛出 Error（GCM 校验失败），由调用方转为用户提示。
 */
export async function decryptSyncSettingsSecrets(
  blob: EncryptedSecrets,
  passphrase: string
): Promise<Record<string, string>> {
  const salt = fromB64(blob.salt);
  const iv = fromB64(blob.iv);
  const data = fromB64(blob.data);
  const key = await deriveKey(passphrase, salt, resolveIterations(blob));
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv as BufferSource }, key, data as BufferSource);
  const parsed: unknown = JSON.parse(new TextDecoder().decode(plain));
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('解密结果非对象');

  const result: Record<string, string> = {};
  for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) if (typeof v === 'string') result[k] = v;

  return result;
}

/**
 * 校验备份包携带的 secrets 块结构是否完整（用于清洗与导入前判断）。
 * v1 与 v2 都接受：v2 起必须携带合法 iter，否则视为结构不完整（清洗层会丢弃该块），
 * 而不是让解密侧拿一个缺省的迭代数去猜——猜错只会表现为「密码错误」，无从排查。
 */
export const isValidEncryptedSecrets = (value: unknown): value is EncryptedSecrets => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;
  const version = v['v'];
  if (version !== SECRETS_FORMAT_V1 && version !== SECRETS_FORMAT_VERSION) return false;
  if (version === SECRETS_FORMAT_VERSION && !isUsableIterations(v['iter'])) return false;
  // 长度上限：salt/iv 仅几十字节（base64 后数百字符），data 为整包密文（上限 5MB 密文）；
  // 否则解密前 atob + TypedArray 双份分配会在超大值时 OOM（与 S1 同入口）
  const len = (x: unknown): number => (typeof x === 'string' ? x.length : -1);
  const MAX_SECRETS_DATA_LEN = 5_000_000;
  return (
    len(v['salt']) <= 256 &&
    len(v['iv']) <= 256 &&
    len(v['data']) <= MAX_SECRETS_DATA_LEN &&
    typeof v['salt'] === 'string' &&
    typeof v['iv'] === 'string' &&
    typeof v['data'] === 'string'
  );
};

/** 解密失败的统一用户提示语（不区分密码错与密文损坏，避免给攻击者探测信息） */
export const describeSecretDecryptFailure = (err: unknown): string => {
  logger.warn('backup', '凭据解密失败', err);
  return '凭据解密失败：导出密码错误或备份已损坏';
};
