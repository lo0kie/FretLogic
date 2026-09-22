/**
 * 云同步动作实现（懒加载模块，由 useSyncService 状态壳动态 import）：
 * 基于 Provider（GitHub / WebDAV / Gitee / 服务器）的推拉同步与连接测试。
 * 推送使用不含凭据的 selection（见 buildBackupPayload），拉取结果走统一清洗层后应用。
 *
 * 独立成模块的原因：provider 注册表、备份载荷构建（buildBackupPayload）整条链只在用户
 * 真正触发同步动作时才需要；状态 refs 在 syncState.ts（模块级单例，壳与实现共享）。
 */
import { FULL_BACKUP_SELECTION } from '@/app/services/backup/backupSelection';
import { buildBackupPayloadResult } from '@/app/services/backup/buildBackupPayload';
import { useChordEditorStore } from '@/domains/chord/store/chordEditorStore';
import { useChordStore } from '@/domains/chord/store/chordStore';
import { useSongStore } from '@/domains/score/library/store/songStore';
import { runBusyAction } from '@/platform/composables/runBusyAction';
import { useStorage } from '@/platform/composables/useStorage';
import { markDataDeleted } from '@/platform/services/storage/deletionWatermark';
import { useSettingsStore } from '@/platform/store/settingsStore';
import { useUiStore } from '@/platform/store/uiStore';
import {
  GITEE_SYNC_CONFIG,
  GITHUB_SYNC_CONFIG,
  MESSAGE_WARNING_DURATION_MS,
  STORAGE_KEYS,
} from '@/platform/utils/constants';
import { logger } from '@/platform/utils/logger';

import { computePayloadMaxUpdatedAt, computePayloadMd5 } from './payloadChecksum';
import { SyncError } from './provider';
import { syncProviderRegistry } from './registry';
import { isPulling, isSyncing, isTestingConnection } from './syncState';
import { resolvePushCredentialIssue } from './useSyncService';

import type { SyncConfig, SyncMeta, SyncProvider, SyncProviderKind } from './provider';
import type { ProviderFactory } from './registry';
import type { ImportExportPayload } from '@/app/types';
import type { Ref } from 'vue';

// 本模块是懒加载动作实现（仅由 useSyncService 与 main 的启动检测动态 import），求值必然晚于
// app.use(pinia)，故 store 引用在模块加载时取一次即可长期复用——与 textTransferActions.ts 同一写法。
// 原先 6 个导出动作各自在函数体内 useXxxStore()，每次调用都重新解析同一份引用，无必要。
const chordStore = useChordStore();
const songStore = useSongStore();
const settingsStore = useSettingsStore();
const uiStore = useUiStore();
const editorStore = useChordEditorStore();

/** 按目标类型解析同步 Provider；配置无效时 message 并返回 null（契约：绝不抛出） */
const resolveProvider = (errorPrefix: string, target: SyncProviderKind): SyncProvider | null => {
  const factory = syncProviderRegistry[target];
  return openProvider(factory, factory.resolveConfig(settingsStore), errorPrefix);
};

/**
 * 由已解析结果构造 Provider：配置无效或构造期抛错一律提示 + 返回 null（契约：绝不抛出）。
 * create 会在构造期做凭据 / 地址校验并可能抛错（如 WebDAV 非 https、地址内嵌 userinfo）。
 * 若在此不收敛，异常会逃逸到调用方（含启动期 checkCloudDataChange 的 void 调用）成为
 * unhandled rejection，令云一致性检测静默失败（审计 二·1）。
 */
const openProvider = (
  factory: ProviderFactory,
  resolved: { config?: SyncConfig; error?: string },
  errorPrefix: string
): SyncProvider | null => {
  if (resolved.error || !resolved.config) {
    uiStore.message.error(`${errorPrefix}：${resolved.error ?? '配置无效'}`);
    return null;
  }
  try {
    return factory.create(resolved.config);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    uiStore.message.error(`${errorPrefix}：${detail}`);
    return null;
  }
};

/** 统一同步错误提示：按 SyncError code 映射为用户可读文案，其余错误走通用提示 */
const showSyncError = (prefix: string, err: unknown) => {
  logger.error('sync', '云端同步失败', err);
  if (err instanceof SyncError) {
    const messageByCode: Record<SyncError['code'], string> = {
      FILE_NOT_FOUND: '云端文件不存在，请先执行一次上传',
      INVALID_CLOUD_DATA: '云端数据格式破损，已触发安全拦截',
      REQUEST_FAILED: err.message,
      TIMEOUT: '请求超时：请检查网络或服务器状态',
      CORS: '跨域请求被浏览器拦截。请在 WebDAV 服务器开启 CORS，或在设置中填写「CORS 代理」后重试',
      NETWORK: err.message,
      CONFLICT: '云端数据已被其他设备更新（版本冲突），请先拉取最新数据再同步',
    };
    uiStore.message.error(`${prefix}：${messageByCode[err.code]}`);
    return;
  }
  if (err instanceof Error) uiStore.message.error(`${prefix}：云端操作失败，请检查网络或配置信息`);
};

/**
 * 通用云端动作管线：互斥守卫 → loading message → 执行 → 失败统一提示，finally 复位进行中状态。
 * 委托给通用 runBusyAction 管线，仅注入按 SyncError code 映射的错误提示。
 * @returns run 的返回值；重入守卫退出或执行失败时返回 null（成功提示由调用方在返回后追加，保证先移除 loading）
 */
const runCloudAction = async <T>(opts: {
  busy: Ref<boolean>;
  loadingText: string;
  errorPrefix: string;
  run: () => Promise<T>;
}): Promise<T | null> =>
  runBusyAction({
    busy: opts.busy,
    loadingText: opts.loadingText,
    run: opts.run,
    onError: err => showSyncError(opts.errorPrefix, err),
  });

/** 推送本地数据到云端（不含凭据类同步配置），全程互斥防重入；返回是否成功 */
export const syncToRemote = async (target?: SyncProviderKind): Promise<boolean> => {
  if (isSyncing.value) return false;
  // 凭据缺失时不发起任何请求，仅提示
  const credentialIssue = resolvePushCredentialIssue(target);
  if (credentialIssue) {
    uiStore.message.error(credentialIssue);
    return false;
  }
  const provider = resolveProvider('同步失败', target ?? settingsStore.syncTarget);
  if (!provider) return false;
  // 云端推送不携带同步配置（含 Token/密码等凭据），仅手动备份导出才包含；采用宽容模式避免单条脏记录阻断同步
  const { payload, issues, warnings } = await buildBackupPayloadResult({
    selection: { ...FULL_BACKUP_SELECTION, syncSettings: false },
  });
  if (!payload) {
    const reason = issues.length > 0 ? `：${issues.slice(0, 2).join('; ')}` : '';
    uiStore.message.error(`数据校验失败，已取消同步${reason}`);
    return false;
  }
  if (warnings.length > 0) logger.warn('sync', '数据清洗提示', warnings);

  // 上传：四种 provider 均支持独立 meta（server 的 pushMeta 为 no-op，md5 随 push 的 query 上传）。
  // 校验元数据分开写，数据源不带元数据，启动检测只拉最小 meta。
  {
    const meta: SyncMeta = {
      md5: computePayloadMd5(payload),
      updatedAt: computePayloadMaxUpdatedAt(payload),
    };
    const ok = await runCloudAction({
      busy: isSyncing,
      loadingText: '正在后台上传至云端...',
      errorPrefix: '同步失败',
      run: async () => {
        // T2 最小防线：推送前重取云端 meta，若云端比本次负载新，说明其他设备在本地基线之后
        // 已更新过——直接覆盖会静默丢他们的数据，改为显式冲突让用户先拉取。
        const remoteMeta = await provider.fetchMeta();
        if (remoteMeta && remoteMeta.updatedAt > meta.updatedAt && remoteMeta.md5 !== meta.md5)
          throw new SyncError('CONFLICT', '云端数据比本地更新（可能其他设备已同步），请先拉取合并后再推送');

        // meta 随 push 传入：server 侧拼 query 需要 md5，复用这里算好的值，
        // 避免 serverSyncProvider 内部为拼 query 把整包再 stringify 一遍
        await provider.push(payload, meta);
        try {
          await provider.pushMeta(meta);
        } catch (metaError) {
          // pushMeta 是数据本体之外的第二次独立写请求（github/gitee/webdav 的 meta 各是一个文件，
          // 协议上无法与数据同请求原子落盘）。它失败时数据已上传成功，但云端 meta 停在旧值——
          // 其他设备启动比对会把「云端较旧」误判为真，用旧数据覆盖上传，把刚推上去的这份数据顶掉。
          // 因此不能止步于报错：挂常驻通知 + 一键重试（重试即完整重传一遍，内容相同、幂等安全）。
          logger.error('sync', '校验标记写入失败（数据本体已上传）', metaError);
          uiStore.notice.warning({
            title: '数据已上传，但同步标记写入失败',
            message:
              '其他设备可能因此误判云端版本并用旧数据覆盖这次上传。建议点击「重试上传」补写标记；重试会重新上传一遍相同数据，是安全的。',
            actionText: '重试上传',
            onAction: async () => {
              await syncToRemote();
            },
          });
          // 继续抛出：本次同步仍按失败收场（返回 false），不把半成品状态伪装成成功
          throw metaError;
        }
      },
    });
    if (ok === null) return false;
  }
  uiStore.message.success('成功上传至云端');
  return true;
};

/** 从云端拉取原始数据包（仅拉取不应用，应用由调用方走 openImportWithPayload/applyOverwriteWithCloud） */
export const pullFromRemote = async (target?: SyncProviderKind): Promise<ImportExportPayload | null> => {
  if (isPulling.value) return null;
  const provider = resolveProvider('拉取失败', target ?? settingsStore.syncTarget);
  if (!provider) return null;

  return runCloudAction({
    busy: isPulling,
    loadingText: '正在从云端获取数据...',
    errorPrefix: '拉取失败',
    run: () => provider.pull(),
  });
};

/** 用云端数据完全覆盖本地实体与偏好设置，并复位指板编辑草稿 */
export const applyOverwriteWithCloud = (cloudData: ImportExportPayload) => {
  // 入参是 provider 校验后的产物（全新对象图），可直接被 store 接管
  // 「缺分区」与「显式空数组」必须区别对待：前者代表该分区不在本包范围内（旧版本云端包没有 songs
  // 字段），按「不越权代改」保持本地原样；后者才是「云端确实没有数据」，才按完全覆盖语义清空。
  // 校验层会把缺失分区兜底成 []，故必须靠它留下的 absentSections 标记还原真实语义。
  const absent = new Set(cloudData.absentSections ?? []);
  // 另一层兜底面向未经校验层的调用方：类型上分区必填，运行时却可能真的缺（校验层是唯一兜底点）
  const hasChords = !absent.has('chords') && cloudData.groups !== undefined && cloudData.chords !== undefined;
  const hasSongs = !absent.has('songs') && cloudData.songs !== undefined;

  if (hasChords) chordStore.replaceAllData({ groups: cloudData.groups, chords: cloudData.chords });

  if (hasSongs) songStore.overwriteSongs(cloudData.songs);
  // 吸收云端包的删除水位线（只前进不后退）：拉取后本地再上传时，meta.updatedAt 不得低于
  // 拉取源——否则「云端删过最新实体」的时间信息丢失，方向判定又会回退误判
  if (typeof cloudData.deletedAt === 'number') markDataDeleted(cloudData.deletedAt);
  // v6 起云端包携带偏好设置（不含凭据），拉取时一并恢复
  settingsStore.applyPreferencesBackup(cloudData.preferences);
  uiStore.message.success('已使用云端数据完全覆盖本地');
  // 拉取后清空指板编辑草稿（全部静音），避免残留旧指法
  editorStore.resetEditor();
};

/** 测试同步后端的连通性（探测请求，不读写业务数据） */
export const testConnection = async (target: SyncProviderKind): Promise<boolean> => {
  if (isTestingConnection.value) return false;
  const factory = syncProviderRegistry[target];
  const provider = openProvider(factory, factory.resolveTestConfig(settingsStore), '测试连接失败');
  if (!provider) return false;

  const detail = await runCloudAction({
    busy: isTestingConnection,
    loadingText: '正在测试连接...',
    errorPrefix: '测试连接失败',
    run: () => provider.testConnection(),
  });
  if (detail === null) return false;
  uiStore.message.success(`连接成功：${detail}`);
  return true;
};

/** 当前同步目标是否具备可用于拉取探测的配置（探测只读不写，公开仓库无需 Token） */
const isSyncConfigured = (): boolean => {
  switch (settingsStore.syncTarget) {
    case 'server':
      // 服务器地址由构建环境注入，视为始终已配置
      return true;
    case 'github':
    case 'gitee':
      // 仓库定位（owner/repo）有默认值，公开仓库拉取无需 Token
      return true;
    case 'webdav':
      return settingsStore.webdavServerUrl.trim() !== '';
  }
};

/**
 * 当前同步目标是否仍指向内置默认数据源（项目作者的公开仓库 / 线上默认服务端）。
 * 出厂状态下 syncTarget 默认就是 gitee + 作者仓库，启动探测因此会「替用户」访问作者的数据源。
 * 该访问本身无害（只读探测、不写数据），但提示文案必须点明数据归属——否则用户会把作者示例数据
 * 造成的不一致当成自己的数据出了问题，甚至一键「拉取云端覆盖本地」把示例数据写进自己的库。
 */
const isUsingBuiltinAuthorTarget = (): boolean => {
  switch (settingsStore.syncTarget) {
    case 'github':
      return (
        (settingsStore.githubOwner.trim() || GITHUB_SYNC_CONFIG.DEFAULT_OWNER) === GITHUB_SYNC_CONFIG.DEFAULT_OWNER &&
        (settingsStore.githubRepo.trim() || GITHUB_SYNC_CONFIG.DEFAULT_REPO) === GITHUB_SYNC_CONFIG.DEFAULT_REPO
      );
    case 'gitee':
      return (
        (settingsStore.giteeOwner.trim() || GITEE_SYNC_CONFIG.DEFAULT_OWNER) === GITEE_SYNC_CONFIG.DEFAULT_OWNER &&
        (settingsStore.giteeRepo.trim() || GITEE_SYNC_CONFIG.DEFAULT_REPO) === GITEE_SYNC_CONFIG.DEFAULT_REPO
      );
    case 'server':
      // 空地址即回落到构建环境注入的线上默认服务端（见 serverSyncProvider 的 serverUrl 兜底）
      return settingsStore.serverUrl.trim() === '';
    case 'webdav':
      // WebDAV 无内置默认地址；未填地址时 isSyncConfigured 已提前短路
      return false;
  }
};

/** 不一致常驻通知里的归属说明（比 toast 可稍长，但需克制，避免撑满通知区） */
const BUILTIN_AUTHOR_TARGET_MESSAGE =
  '当前同步的是项目作者的默认数据源（示例数据）。如需同步自己的数据，请在同步设置中更换仓库地址。';

/** 一次性 toast 的归属后缀（短文案，避免长句撑爆提示条） */
const BUILTIN_AUTHOR_TARGET_SUFFIX = '（当前为内置默认数据源，属于项目作者）';

/** 云端与本地的不一致方向：按「本地/云端最新修改时间戳」判定，时间戳不可比时为 unknown */
type SyncDirection = 'local-newer' | 'cloud-newer' | 'unknown';

const pickSyncDirection = (localUpdatedAt: number, cloudUpdatedAt: number | undefined): SyncDirection => {
  if (cloudUpdatedAt !== undefined && localUpdatedAt > cloudUpdatedAt) return 'local-newer';
  if (cloudUpdatedAt !== undefined && localUpdatedAt < cloudUpdatedAt) return 'cloud-newer';
  return 'unknown';
};

const SYNC_DIRECTION_TEXT: Record<SyncDirection, string> = {
  'local-newer': '检测到本地存在未同步的改动',
  'cloud-newer': '检测到云端数据较新',
  'unknown': '检测到云端数据与本地不一致',
};

/**
 * 按不一致方向给出可一键执行的修正动作（挂在常驻通知上，替代一次性 toast）：
 * 本地较新 → 上传；云端较新 → 拉取并覆盖本地；方向不明 → 无动作，仅文案引导去同步设置。
 */
const buildSyncFixAction = (
  direction: SyncDirection
): { actionText: string; onAction: () => Promise<void> } | undefined => {
  if (direction === 'local-newer')
    return {
      actionText: '上传至云端',
      onAction: async () => {
        await syncToRemote();
      },
    };

  if (direction === 'cloud-newer')
    return {
      actionText: '拉取云端覆盖本地',
      onAction: async () => {
        const payload = await pullFromRemote();
        if (payload) applyOverwriteWithCloud(payload);
      },
    };

  return undefined;
};

/** 已提示过的数据不一致签名（`${target}:${localMd5}:${cloudMd5}`）：同一组合只在首次提示，之后不再打扰。
 *  任一侧数据发生变化（上传/拉取/继续编辑）签名即失效，重新出现不一致时会再次提示。 */
const acknowledgedMismatch = useStorage<string>(STORAGE_KEYS.SYNC_MISMATCH_ACK, '');

/**
 * 云端比对基准缓存：本地数据未变且上次已确认云端一致时，跳过本次 fetchMeta 请求，
 * 直接兑现「已比对过的数据不再发请求」，避免匿名 Gitee API 被 Baidu WAF 限流（实测匿名配额仅数十/小时）。
 * - 用 localStorage 而非默认 IDB：需跨整页刷新同步可读，否则首次检测常被 IDB 异步水合 race 成「必发一次」。
 * - 仅在 `localMd5 === remoteMd5`（上次验证云端=本地）且本地未改、未超 TTL 时短路；TTL 到期仍重拉 meta 复核云端是否有他人改动。
 */
interface CloudCompareBaseline {
  target: SyncProviderKind;
  localMd5: string;
  remoteMd5: string;
  checkedAt: number;
}
const CLOUD_COMPARE_TTL_MS = 10 * 60 * 1000;
const compareBaseline = useStorage<CloudCompareBaseline | null>(STORAGE_KEYS.SYNC_COMPARE_BASELINE, null, localStorage);

/** 不一致时以常驻 notice 提示（留痕可回看 + 一键修正），避免 toast 飘走后操作入口消失。
 *  同一签名（同一同步目标 + 同一对本地/云端校验和）只提示一次，已提示过的重启后静默跳过。
 *  目标仍是内置默认数据源时额外附一段归属说明：此时不一致几乎必然来自作者示例数据，
 *  用户需要知道「这不是我的数据出了问题」，否则会误操作一键覆盖本地。 */
const notifyCloudMismatch = (
  localMd5: string,
  cloudMd5: string,
  localUpdatedAt: number,
  cloudUpdatedAt: number | undefined
): void => {
  const signature = `${settingsStore.syncTarget}:${localMd5}:${cloudMd5}`;
  if (signature === acknowledgedMismatch.value) return;
  const direction = pickSyncDirection(localUpdatedAt, cloudUpdatedAt);
  const action = buildSyncFixAction(direction);
  acknowledgedMismatch.value = signature;
  uiStore.notice.warning({
    title: SYNC_DIRECTION_TEXT[direction],
    ...(isUsingBuiltinAuthorTarget() ? { message: BUILTIN_AUTHOR_TARGET_MESSAGE } : {}),
    ...(action ? { actionText: action.actionText, onAction: action.onAction } : {}),
  });
};

/**
 * 启动时比对云端与本地数据校验和：只拉独立 meta（最小元数据），四种 provider 均支持，不再下载全量数据源。
 * 不一致时结合 meta.updatedAt 判断「本地 / 云端」哪边更新，以常驻 notice 提示：
 * 本地较新可一键上传、云端较新可一键拉取覆盖，方向不明则引导手动同步（留痕可回看）。
 * 云端无校验数据（旧数据 / 从未上传）时提示先行上传；目标未配置或探测异常则静默跳过。
 * 目标仍为内置默认数据源（项目作者仓库）时，两处 toast 与不一致通知都会点明数据归属：
 * 探测请求照常发出（只读、且用户在设置里可改），但用户必须能分辨「这是作者的数据」。
 */
export const checkCloudDataChange = async (): Promise<void> => {
  if (!isSyncConfigured()) return;
  // 归属提示后缀：目标仍是内置默认数据源时非空；不一致通知内部自行判定，共用同一 helper
  const authorSuffix = isUsingBuiltinAuthorTarget() ? BUILTIN_AUTHOR_TARGET_SUFFIX : '';
  const provider = resolveProvider('同步检测', settingsStore.syncTarget);
  if (!provider) return;
  try {
    // 本地校验和/时间戳走与推送完全相同的构建路径，保证两侧归一化一致可比
    const { payload: localPayload } = await buildBackupPayloadResult({
      selection: { ...FULL_BACKUP_SELECTION, syncSettings: false },
    });
    if (!localPayload) return;
    const localMd5 = computePayloadMd5(localPayload);
    const localUpdatedAt = computePayloadMaxUpdatedAt(localPayload);

    // 本地未改且上次已确认云端一致 → 跳过 fetchMeta（已比对过的数据不再发请求）
    const baseline = compareBaseline.value;
    if (
      baseline &&
      baseline.target === settingsStore.syncTarget &&
      baseline.localMd5 === localMd5 &&
      baseline.remoteMd5 === localMd5 &&
      Date.now() - baseline.checkedAt < CLOUD_COMPARE_TTL_MS
    ) {
      logger.debug('sync', '本地数据未变且上次云端比对一致，跳过云端比对请求');
      return;
    }

    // 四种 provider 均支持独立 meta：只拉最小元数据，避免每次启动下载全量数据源
    const meta = await provider.fetchMeta();
    if (!meta) {
      uiStore.message.warning(`无法检测云端一致性，请先上传数据${authorSuffix}`, {
        duration: MESSAGE_WARNING_DURATION_MS,
      });
      return;
    }
    // 记录本次基准（一致与否都记）：后续「本地未变」时可短路；不一致时 remoteMd5≠localMd5 不会误跳
    compareBaseline.value = {
      target: settingsStore.syncTarget,
      localMd5,
      remoteMd5: meta.md5,
      checkedAt: Date.now(),
    };
    if (localMd5 === meta.md5) return;
    notifyCloudMismatch(localMd5, meta.md5, localUpdatedAt, meta.updatedAt);
  } catch (error) {
    // 云端从未上传过数据（无文件）：提示引导首次上传建立校验基准；其余启动期异常静默跳过
    if (error instanceof SyncError && error.code === 'FILE_NOT_FOUND') {
      uiStore.message.warning(`云端暂无同步数据，请先上传数据${authorSuffix}`, {
        duration: MESSAGE_WARNING_DURATION_MS,
      });
      return;
    }
    logger.warn('sync', '云端比对失败，已跳过', error);
  }
};
