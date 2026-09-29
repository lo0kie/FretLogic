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
import { markDataDeleted } from '@/platform/services/storage/deletionWatermark';
import { useSettingsStore } from '@/platform/store/settingsStore';
import { useUiStore } from '@/platform/store/uiStore';
import { isNumber } from '@/platform/utils/common';
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

// 本模块是懒加载动作实现（仅由 useSyncService 动态 import），求值必然晚于
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
 * 若在此不收敛，异常会逃逸到调用方成为 unhandled rejection，同步动作静默失败（审计 二·1）。
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
  // 校验元数据分开写，数据源不带元数据；需要 meta 的地方（推送前的判等与冲突判定）只拉这份最小数据。
  {
    const ok = await runCloudAction({
      busy: isSyncing,
      loadingText: '正在后台上传至云端...',
      errorPrefix: '同步失败',
      run: async (): Promise<'pushed' | 'identical' | false> => {
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

        // 一次 fetchMeta，下面两道判定共用
        const remoteMeta = await provider.fetchMeta();

        // 云端与本地**一字不差**：再传一遍没有任何意义（上传是幂等的，但纯属白跑一趟网络），
        // 弹提示后按「已是最新」收场。放在冲突判定之前：此时两侧 md5 相同，冲突判定本就到不了。
        if (remoteMeta?.md5 === meta.md5) {
          uiStore.message.info('云端数据与本地一致，无需上传');
          return 'identical';
        }

        // T2 最小防线：若云端比本次负载新，说明其他设备在本地基线之后已更新过——直接覆盖会静默
        // 丢他们的数据，改为显式冲突让用户先拉取。（两侧 md5 相同的情形已在上方返回，不在此列。）
        if (remoteMeta && remoteMeta.updatedAt > meta.updatedAt)
          throw new SyncError('CONFLICT', '云端数据比本地更新（可能其他设备已同步），请先拉取合并后再推送');

        // meta 缺失但数据本体在（meta 机制上线前上传 / pushMeta 曾失败且未补写）：updatedAt 不可比，
        // 上面两道判定整体短路 —— 若照常放行，后传者会静默顶掉别的设备在本地基线之后写的数据。
        // 宁可不传：先拉取确认后本地与云端一致（identical 短路）或已吸收新基线，上传自然解锁。
        // 仅在这条路径多花一次 exists 请求；云端确无数据（从未上传）时 exists 为 false，首传不受影响。
        if (remoteMeta === null && (await provider.exists()))
          throw new SyncError('CONFLICT', '云端已有数据但校验标记缺失，无法判断新旧。请先执行一次拉取，确认后再上传');

        // meta 随 push 传入：server 侧拼 query 需要 md5，复用这里算好的值，
        // 避免 serverSyncProvider 内部为拼 query 把整包再 stringify 一遍
        await provider.push(payload, meta);
        try {
          await provider.pushMeta(meta);
        } catch (metaError) {
          // pushMeta 是数据本体之外的第二次独立写请求（github/gitee/webdav 的 meta 各是一个文件，
          // 协议上无法与数据同请求原子落盘）。它失败时数据已上传成功，但云端 meta 停在旧值——
          // 其他设备再推送时，冲突判定读到的 updatedAt 是**旧数据**的时间戳，判不出「云端更新」，
          // 于是用旧数据覆盖上传，把刚推上去的这份数据顶掉。
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
        return 'pushed';
      },
    });
    // null（重入被挡 / 抛错）与 false（载荷校验失败，已单独提示过）都按失败收场
    if (ok === null || ok === false) return false;
    // 「云端与本地一致」那一路已经弹过提示、且什么都没上传，不再叠一句「成功上传」
    if (ok === 'pushed') uiStore.message.success('成功上传至云端');
  }
  return true;
};

/**
 * 拉到的云端包是否与本地**一字不差**（两侧都算 `computePayloadMd5`）。
 *
 * 可比性靠「同一条构建路径」：本地侧走推送用的那套构建（同一 selection、同一 validate 归一化），
 * 云端侧是 `provider.pull()` 的产物（`decodePayload` 走同一个 `parseAndValidatePayload`）；
 * 哈希本身又把 dataMd5 / dataUpdatedAt / absentSections / deletedAt 这些传输标记剔了出去
 * （见 computePayloadMd5）。故内容一致时两侧校验和必然一致，不一致时也只会更保守地照常拉取。
 *
 * 本地包构建不出来（校验不通过）时返回 false：判不了等就照原流程走，绝不因为判等失败而拦住拉取。
 */
const isSameAsLocal = async (cloudPayload: ImportExportPayload): Promise<boolean> => {
  const { payload: localPayload } = await buildBackupPayloadResult({
    selection: { ...FULL_BACKUP_SELECTION, syncSettings: false },
  });
  return localPayload !== null && computePayloadMd5(cloudPayload) === computePayloadMd5(localPayload);
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
      const payload = await provider.pull();
      // 拉到的与本地一字不差：再进导入面板勾选一遍毫无意义，弹提示按「已是最新」收场
      if (await isSameAsLocal(payload)) {
        uiStore.message.info('云端数据与本地一致，无需拉取');
        return null;
      }
      return payload;
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

  // 显式 void：与备份导入那条同口径 —— 覆盖落盘是 fire-and-forget（失败经持久化上报链路提示）
  if (hasSongs) void songStore.overwriteSongs(cloudData.songs);
  // 吸收云端包的删除水位线（只前进不后退）：拉取后本地再上传时，meta.updatedAt 不得低于
  // 拉取源——否则「云端删过最新实体」的时间信息丢失，方向判定又会回退误判
  if (isNumber(cloudData.deletedAt)) markDataDeleted(cloudData.deletedAt);
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
