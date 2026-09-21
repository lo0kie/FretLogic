/**
 * 分享链接消费桥接（应用装配层专用）：
 * 监听 URL 上的分享参数（`#/score?s=xxx` 乐谱 / `#/workbench?s=xxx` 和弦或分组），
 * 解析载体 → 按魔数分诊 → 交给对应域的导入能力落地 → 从 URL 移除参数。
 *
 * 职责划分：**生成**留在各域（乐谱域、和弦域），**消费**必须同时读懂三种载荷并跨域落地，
 * 属装配层职责（与 chordScoreBridge 同层）。
 * 载体解析与「粘贴剪贴板」共用同一个入口（platform/utils/transfer 的 `resolveTransferPayload`），
 * 两者只在入口宽容度上分叉：URL 参数必须是 token，剪贴板则额外接受纯文本。
 * 载体解码与落地（shareLinkApply：编解码链 + 各域导入能力）均为动态 import——只有 URL 上
 * 真的出现分享参数时才拉取，装配本桥不产生任何首屏成本。在 App 装配时调用一次即可。
 */
import { watch } from 'vue';

import { useRoute, useRouter } from 'vue-router';

import { useUiStore } from '@/platform/store/uiStore';
import { STORAGE_KEYS } from '@/platform/utils/constants';
import { resolveTransferPayload, SHARE_LINK_PARAM } from '@/platform/utils/transfer';

/** 读取本标签页已消费的 token 集合（sessionStorage 不可用时退化为空集，仅内存去重） */
const readConsumedTokens = (): Set<string> => {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEYS.CONSUMED_SHARE_TOKENS);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : []);
  } catch {
    return new Set();
  }
};

/** 写回已消费 token（只留最近 20 条：仅用于去重，无需完整历史） */
const writeConsumedTokens = (tokens: Set<string>): void => {
  try {
    sessionStorage.setItem(STORAGE_KEYS.CONSUMED_SHARE_TOKENS, JSON.stringify([...tokens].slice(-20)));
  } catch {
    // 隐私模式等不可写场景：退化为仅本会话内存去重
  }
};

export function setupShareLinkBridge(): void {
  const route = useRoute();
  const router = useRouter();
  const uiStore = useUiStore();

  /**
   * 已消费 token 集合。
   * 落 sessionStorage 而非仅内存：清参数与各类并发 replace 都可能基于旧 query 快照互相覆盖，
   * 万一参数残留在 URL 里，同标签页刷新也不该把同一份数据再导入一遍。
   */
  const consumedTokens = readConsumedTokens();

  /**
   * 从 URL 移除分享参数。
   * 用「导航落地后复查」而非一次了事：消费恰好发生在路由就绪瞬间，路由组件可能正并发发起
   * 自己的 replace（如乐谱页冷启动用「最近乐谱」补位），两侧都以各自的 query 快照合并，
   * 后提交的一方会把先清掉的参数写回来。
   * 实现要点：每轮循环都从 `router.currentRoute` 读**最新** query（响应式 `route` 的快照在
   * await 期间可能滞后，用它合并等于把旧参数写回去）；上限 3 轮防极端导航重入。
   * 参数不会再由任何其它来源出现，正常 1 轮即收敛。同 token 不会重复导入
   * （consumedTokens 已先记账），复查只负责把残留参数擦干净。
   */
  const clearShareParam = async (): Promise<void> => {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const { query } = router.currentRoute.value;
      if (typeof query[SHARE_LINK_PARAM] !== 'string') return;
      try {
        await router.replace({ query: { ...query, [SHARE_LINK_PARAM]: undefined } });
      } catch {
        // 导航失败（被取消等）：保留参数，由 watch 下次触发时再清
        return;
      }
    }
  };

  const consume = async (token: string): Promise<void> => {
    // 已消费过（URL 参数残留、前进后退回到该地址）：只清参数，不再导入
    if (consumedTokens.has(token)) {
      void clearShareParam();
      return;
    }
    // 先记账再解码：解码是异步的（压缩库动态导入），期间的重复触发不应再走一遍导入
    consumedTokens.add(token);
    writeConsumedTokens(consumedTokens);

    // 与「粘贴剪贴板」共用同一个载体解析入口；URL 上必须是 token，纯文本参数一律判损坏。
    // 落地实现（编解码链 + 各域导入能力）懒加载，见 shareLinkApply.ts 文件头注释
    const resolved = await resolveTransferPayload(token);
    if (resolved.status !== 'ok' || resolved.carrier !== 'token') uiStore.message.warning('分享链接已损坏，无法解析');
    else {
      const { applyPayload } = await import('./shareLinkApply');
      // URL 分享参数不能免确认直接落库：诱导点击即可污染曲库并随下次同步扩散。
      // 先经用户确认再落地（window.confirm 为应用内确认弹窗基建就绪前的最小门禁）。
      if (window.confirm('此链接携带分享数据，是否导入到本机曲库？'))
        if (!applyPayload(resolved.payload)) uiStore.message.warning('分享链接内容无法识别或已损坏');
    }

    void clearShareParam();
  };

  /**
   * immediate 首跑时路由往往尚未就绪（query 还是空的），拿不到值即为空操作；
   * 路由就绪后 query 落定会再触发一次；持续监听同时覆盖「在同一标签页打开另一条分享链接」。
   */
  watch(
    () => route.query[SHARE_LINK_PARAM],
    value => {
      if (typeof value === 'string' && value) void consume(value);
    },
    { immediate: true }
  );
}
