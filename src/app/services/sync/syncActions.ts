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
import { MESSAGE_WARNING_DURATION_MS, STORAGE_KEYS } from '@/platform/utils/constants';
import { logger } from '@/platform/utils/logger';

import { computePayloadMaxUpdatedAt, computePayloadMd5 } from './payloadChecksum';
import { SyncError } from './provider';
import { syncProviderRegistry } from './registry';
import { isPulling, isSyncing, isTestingConnection } from './syncState';
import {
  BUILTIN_AUTHOR_TARGET_MESSAGE,
  BUILTIN_AUTHOR_TARGET_SUFFIX,
  isSyncConfigured,
  isUsingBuiltinAuthorTarget,
} from './syncTargetConfig';
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
  // 重入守卫交给 runBusyAction：它同步完成「检查 + 置位 busy」（见 runBusyAction.ts:40-41），
  // 而此前这里是一句裸 `if (isSyncing.value) return false`，真正置位 busy 的 runBusyAction 却排在
  // `await buildBackupPayloadResult` **之后** —— 双击/重试时两次调用都能越过那道检查、各自把整包
  // 构建一遍（第二次才被 runBusyAction 挡下，白构建一次）。故载荷构建也一并挪进 run 内，
  // 让「守卫 → 构建 → 上传」落在同一段互斥区间里。
  // 凭据缺失时不发起任何请求，仅提示
  const credentialIssue = resolvePushCredentialIssue(target);
  if (credentialIssue) {
    uiStore.message.error(credentialIssue);
    return false;
  }
  const provider = resolveProvider('同步失败', target ?? settingsStore.syncTarget);
  if (!provider) return false;

  // 上传：四种 provider 均支持独立 meta（server 的 pushMeta 为 no-op，md5 随 push 的 query 上传）。
  // 校验元数据分开写，数据源不带元数据，启动检测只拉最小 meta。
  {
    const ok = await runCloudAction({
      busy: isSyncing,
      loadingText: '正在后台上传至云端...',
      errorPrefix: '同步失败',
      run: async () => {
        // 云端推送不携带同步配置（含 Token/密码等凭据），仅手动备份导出才包含；采用宽容模式避免单条脏记录阻断同步。
        // 构建放在互斥区间内 —— 理由见函数头。
        const { payload, issues, warnings } = await buildBackupPayloadResult({
          selection: { ...FULL_BACKUP_SELECTION, syncSettings: false },
        });
        if (!payload) {
          const reason = issues.length > 0 ? `：${issues.slice(0, 2).join('; ')}` : '';
          uiStore.message.error(`数据校验失败，已取消同步${reason}`);
          return false;
        }
        if (warnings.length > 0) logger.warn('sync', '数据清洗提示', warnings);
        const meta: SyncMeta = {
          md5: computePayloadMd5(payload),
          updatedAt: computePayloadMaxUpdatedAt(payload),
        };

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
            onAction: async () => void (await syncToRemote()),
          });
          // 继续抛出：本次同步仍按失败收场（返回 false），不把半成品状态伪装成成功
          throw metaError;
        }
        return true;
      },
    });
    // ok 为 null（重入被挡 / 抛错）或 false（载荷校验失败，已单独提示过）都按失败收场
    if (ok !== true) return false;
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

// isSyncConfigured / isUsingBuiltinAuthorTarget 与两条归属提示文案已下沉到 syncTargetConfig.ts：
// 那两处判定要在**四个拉取入口**（启动检测、首访引导、顶栏菜单、同步设置弹窗）共用，而其中三个
// 属首屏闭包；本模块是动态 chunk，从首屏组件静态引它会拖进整条同步实现。此处仅消费。

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
      onAction: async () => void (await syncToRemote()),
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
 * 云端比对基准：只记「上次比对时本地数据的校验和」+ 目标。本地一字未改即视为已比对过，跳过 fetchMeta，
 * 兑现「已比对过的数据不再发请求」，避免匿名 Gitee API 被 Baidu WAF 限流（实测匿名配额仅数十/小时）。
 *
 * 判定**只看本地**，不要求上次结论是「云端 == 本地」。原先还要求 `remoteMd5 === localMd5`（外加 10 分钟 TTL），
 * 那等于只在「已经一致」时才肯短路——而用户常态恰恰是「不一致」（本地有未同步改动，或目标仍是出厂的
 * gitee 作者仓库），正是本检测本来要盯的状态，于是每次加载都照发一条 GET。现改为：
 * 本地校验和不变即短路，本地一变即重新探测。
 *
 * 代价如实说：云端若被其他设备更新、而本地一字未改，本条不会自动发觉，要等本地产生一次改动才会重新探测
 * （即原 TTL「到期复核云端有他人改动」的能力已让位于「不再打扰」）。这是有意取舍。
 * - 用 localStorage 而非默认 IDB：需跨整页刷新同步可读，否则首次检测常被 IDB 异步水合 race 成「必发一次」。
 */
interface CloudCompareBaseline {
  target: SyncProviderKind;
  localMd5: string;
}
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
 * 本地校验和与上次比对时相同则直接短路，不发探测请求（见 compareBaseline）。
 * 目标仍为内置默认数据源（项目作者仓库）时，两处 toast 与不一致通知都会点明数据归属：
 * 不因「目标恰好是作者仓库」而额外抑制探测（只受上面的本地未变短路约束），
 * 但用户必须能分辨「这是作者的数据」。
 */
export const checkCloudDataChange = async (): Promise<void> => {
  if (!isSyncConfigured()) return;
  // 就绪门禁：比对读的是两个 store 的**完整内存状态**。水合未完成时它们是空初值，由此算出的
  // localMd5 是「空库的校验和」，与云端一比必然不等，于是报出「云端数据较新」——而那个常驻
  // 通知上挂着一键「拉取云端覆盖本地」，用户一点就用云端把本地真实数据盖掉。
  // 主链已在 main.ts 里等过 hydration；这里兜底的是「水合读失败」：那种情形下 store 会一直保持
  // 未水合（见 chordStore.hydrate 的 catch），此时宁可本会话不比对，也不给出会把数据盖掉的方向判断。
  if (!chordStore.isHydrated() || !songStore.isHydrated()) {
    logger.warn('sync', '数据尚未水合完成，已跳过云端一致性比对');
    return;
  }
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

    // 本地未改 → 这份数据上一轮已经比对过，跳过 fetchMeta（已比对过的数据不再发请求）；
    // 本地变了一律重探，基准由此自然失效，无需比对时间戳
    const baseline = compareBaseline.value;
    if (baseline && baseline.target === settingsStore.syncTarget && baseline.localMd5 === localMd5) {
      logger.debug('sync', '本地数据未变且已比对过，跳过云端比对请求');
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
    // 记录本次基准（一致与否都记）：后续「本地未变」即短路，不再重复探测同一份本地数据
    compareBaseline.value = { target: settingsStore.syncTarget, localMd5 };
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
