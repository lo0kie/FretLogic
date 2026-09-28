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

/**
 * 同步动作的就绪门禁：上传与拉取都以两个 store 的**完整内存状态**为基准。
 * 水合未完成时它们是空初值 —— 上传会把空库当成真值推上云端；拉取后经 `applyOverwriteWithCloud`
 * 写回时，本地那份真实数据也不在内存里参与判断。两条方向都会丢数据。
 *
 * 这里**先等一次水合**（`hydrate` 幂等：已完成即立即返回；读失败时它可重试），仍不就绪才放弃 ——
 * 用户主动点的「同步 / 拉取」不该因为一次瞬时读失败就永久不可用。
 *
 * 调用点必须在 `runCloudAction` 的 `run` **内部**，不能放函数头：函数头是重入守卫的同步区间
 * （见 syncToRemote 的说明），在那里 `await` 会让双击的两次调用都越过守卫。
 */
const ensureHydratedForSync = async (): Promise<boolean> => {
  if (chordStore.isHydrated() && songStore.isHydrated()) return true;
  try {
    await Promise.all([chordStore.hydrate(), songStore.hydrate()]);
  } catch (error) {
    logger.error('sync', '同步前数据水合失败', error);
  }
  if (chordStore.isHydrated() && songStore.isHydrated()) return true;
  uiStore.message.warning('本地数据尚未加载完成，请稍后重试');
  return false;
};

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
        // 就绪门禁在互斥区间内（见 ensureHydratedForSync）：未水合时上传会把空库推上云端
        if (!(await ensureHydratedForSync())) return false;
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
    run: async () => {
      // 就绪门禁在互斥区间内（见 ensureHydratedForSync）：未水合时拉取后的覆盖写回
      // 会把云端内容当成唯一真值，而本地那份真实数据根本没进内存
      if (!(await ensureHydratedForSync())) return null;
      return provider.pull();
    },
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
 * 云端比对基准：记「上次比对时的本地校验和 + 目标 + 探测时刻」。本地一字未改即视为已比对过，
 * 跳过 fetchMeta，兑现「已比对过的数据不再发请求」，避免匿名 Gitee API 被 Baidu WAF 限流
 *（实测匿名配额仅数十/小时）。
 *
 * 判定**只看本地**，不要求上次结论是「云端 == 本地」。原先还要求 `remoteMd5 === localMd5`（外加 10 分钟 TTL），
 * 那等于只在「已经一致」时才肯短路——而用户常态恰恰是「不一致」（本地有未同步改动，或目标仍是出厂的
 * gitee 作者仓库），正是本检测本来要盯的状态，于是每次加载都照发一条 GET。现改为：
 * 本地校验和不变即短路，本地变了也**先看间隔**（见 CLOUD_COMPARE_INTERVAL_MS），到点才重新探测。
 *
 * 代价如实说：云端若被其他设备更新、而本地一字未改，本条不会自动发觉，要等本地产生一次改动、
 * 且距上次探测已过一个间隔才会重新探测。这是有意取舍。
 * - 用 localStorage 而非默认 IDB：需跨整页刷新同步可读，否则首次检测常被 IDB 异步水合 race 成「必发一次」。
 * - 值是个对象，故写入时**必须带显式序列化器**（见下方 compareBaseline）：本键的 initial 是 `null`，
 *   让 @vueuse 按类型猜会得到 `any`，对象会被 `String(v)` 写成 "[object Object]"、读回来是字符串，
 *   闸门于是永不成立。这条曾静默失效过很久，别把序列化器当可选项删掉。
 */
interface CloudCompareBaseline {
  target: SyncProviderKind;
  localMd5: string;
  /** 上次探测（fetchMeta）的时刻；旧版本写入的基准没有这个字段，读作 0 = 早已过期，下一次照常探测 */
  checkedAt?: number;
}

/**
 * 两次**自动**探测之间的最小间隔：本地数据变了也不再「下次加载就探」，至多一天一次。
 *
 * 【为什么需要这条】短路条件原本只有「本地校验和没变」。而开发 / 使用期本地数据天天在变，
 * 于是每次加载都重新联网比对一次 —— 用户看到的就是「一直在对比线上数据」。
 * 加一条间隔后：同一份本地数据不重复探测，本地变过也要等间隔到期才复核，
 * 既不再打扰，也保住了「隔天仍能发现云端被别的设备更新」的能力（这一条正是当年 10 分钟 TTL 的职责）。
 */
const CLOUD_COMPARE_INTERVAL_MS = 24 * 60 * 60 * 1000;
const compareBaseline = useStorage<CloudCompareBaseline | null>(
  STORAGE_KEYS.SYNC_COMPARE_BASELINE,
  null,
  localStorage,
  {
    /**
     * 序列化器**必须显式给**，不能让 @vueuse 按 initial 的类型去猜。
     *
     * 本键的 initial 是 `null`，猜出来是 `any` —— 而 `any` 的 write 是 `String(v)`：
     * 整个对象落盘成字面量 "[object Object]"，读回来是个字符串。于是 `baseline.target` 恒为
     * undefined、闸门永不成立，**每次启动都照发一次探测**（这正是本条此前失效的原因，
     * 与「失败路径不写基准」是两回事，两条都得修）。
     * read 额外兜一层：解析不出对象（历史落盘的 "[object Object]" / 损坏值）一律当「没有基准」。
     */
    serializer: {
      read: (raw: string): CloudCompareBaseline | null => {
        try {
          const parsed: unknown = JSON.parse(raw);
          return parsed && typeof parsed === 'object' ? (parsed as CloudCompareBaseline) : null;
        } catch {
          return null;
        }
      },
      write: (value: CloudCompareBaseline | null): string => JSON.stringify(value),
    },
  }
);

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
 * 本地校验和与上次比对时相同则直接短路；本地变过也要等间隔到期才复核
 *（两道闸都在 compareBaseline，见其说明与 CLOUD_COMPARE_INTERVAL_MS）。
 * **一次启动至多发一次探测请求**：「云端根本没有数据」「探测直接抛错（断网 / 401 / CORS）」
 * 与「探测成功」一样都写基准（见 armCompareBaseline 与 finally）—— 它们都是一次确定的探测结论，
 * 不写就等于下次启动又无条件发一次请求、并可能重复弹同一条提示。
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

  // 本次比对的本地校验和。提到 try 之外：catch 里「云端从未上传过数据」那条分支也要用它写基准，
  // 而 catch 看不见 try 内的局部量。
  let localMd5: string | null = null;

  /**
   * 把「这份本地数据已经比过一次」落进基准。
   *
   * 【语义】基准的语义是「这份本地校验和**已经探测过**云端」，而不是「云端 == 本地」，
   * 更不是「探测成功」。一致、不一致、云端没有数据、探测直接抛错（断网 / 401 / CORS / 代理没开），
   * 四种都是「本次探测已有结论」，都该落基准。
   *
   * 【为什么失败也要写】此前只有成功那几条出口写，探测抛错的路径直接 return —— 于是目标侧一旦
   * 长期不可达，基准永远不成立，**每次启动都无条件再发一次请求**（用户看到的就是「一直在对比
   * 线上数据」）。改由调用方的 finally 收口后，一次启动至多发一次探测，成败一视同仁。
   *
   * 【不写的情形】两条「跳过」出口（本地未变 / 间隔未到）不写：它们根本没发请求，
   * 若也写就会把 checkedAt 一路推到当下，间隔闸永远等不到期（见调用方的 probed）。
   *
   * 【代价如实说】探测失败后，本机要等本地产生一次改动、且距上次探测已过一个间隔才会再试。
   * 这是「不要每次启动都打扰」与「尽快自愈」之间取的舍，与上方 compareBaseline 那条同源。
   */
  const armCompareBaseline = (): void => {
    if (localMd5) compareBaseline.value = { target: settingsStore.syncTarget, localMd5, checkedAt: Date.now() };
  };

  /**
   * 本次是否真的发出了探测请求。只有真探测过才写基准 —— 两条「跳过」出口若也写，
   * 就会把 checkedAt 推到当下，间隔闸永远等不到期（见 armCompareBaseline）。
   */
  let probed = false;

  try {
    // 本地校验和/时间戳走与推送完全相同的构建路径，保证两侧归一化一致可比
    const { payload: localPayload } = await buildBackupPayloadResult({
      selection: { ...FULL_BACKUP_SELECTION, syncSettings: false },
    });
    if (!localPayload) return;
    // 取成 const 供本次比对内部使用（localMd5 只作为基准的载荷，见 armCompareBaseline）
    const md5 = computePayloadMd5(localPayload);
    localMd5 = md5;
    const localUpdatedAt = computePayloadMaxUpdatedAt(localPayload);

    // 本地未改 → 这份数据上一轮已经比对过，跳过 fetchMeta（已比对过的数据不再发请求）；
    // 本地变过则看间隔：距上次探测不足一个间隔就再等，到点才复核（见 CLOUD_COMPARE_INTERVAL_MS）
    const baseline = compareBaseline.value;
    if (baseline && baseline.target === settingsStore.syncTarget) {
      if (baseline.localMd5 === md5) {
        logger.debug('sync', '本地数据未变且已比对过，跳过云端比对请求');
        return;
      }
      if (Date.now() - (baseline.checkedAt ?? 0) < CLOUD_COMPARE_INTERVAL_MS) {
        logger.debug('sync', '距上次云端比对不足间隔，跳过本次探测');
        return;
      }
    }

    // 四种 provider 均支持独立 meta：只拉最小元数据，避免每次启动下载全量数据源
    // probed 必须在 await **之前**置位：探测抛错时也要算「本次已探测过」（见 finally）
    probed = true;
    const meta = await provider.fetchMeta();
    if (!meta) {
      uiStore.message.warning(`无法检测云端一致性，请先上传数据${authorSuffix}`, {
        duration: MESSAGE_WARNING_DURATION_MS,
      });
      return;
    }
    if (md5 === meta.md5) return;
    notifyCloudMismatch(md5, meta.md5, localUpdatedAt, meta.updatedAt);
  } catch (error) {
    // 云端从未上传过数据（无文件）：提示引导首次上传建立校验基准；其余启动期异常静默跳过
    if (error instanceof SyncError && error.code === 'FILE_NOT_FOUND') {
      uiStore.message.warning(`云端暂无同步数据，请先上传数据${authorSuffix}`, {
        duration: MESSAGE_WARNING_DURATION_MS,
      });
      return;
    }
    logger.warn('sync', '云端比对失败，已跳过', error);
  } finally {
    // 唯一的写基准出口：只要真发过探测（成功、云端没数据、还是探测抛错），本次都算「比过一次」。
    // 散在各 return 前写会漏掉抛错那条路 —— 而那正是「每次启动都无条件发请求」的来源。
    if (probed) armCompareBaseline();
  }
};
