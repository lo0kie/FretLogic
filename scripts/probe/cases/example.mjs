/**
 * 样例 case：**探针自检** —— 三件事同时验：真样式表注进去了、主题令牌解出来了、视口扫描按组独立。
 *
 * 换个新 case 时照着这份改：把 `body` 换成要复刻的 DOM 链、`measure` 换成要读的量。
 * 想快速确认探针本身没坏（换机器 / 重装依赖 / 改了产物之后），直接跑这一份。
 */
export default {
  title: '探针自检',
  viewports: [
    [1440, 900],
    [768, 1024],
    [390, 844],
  ],
  body: `
    <div class="flex h-full items-center justify-center p-6">
      <div id="card" class="w-80 rounded-lg border border-border-base bg-surface-panel p-4">
        <p id="label" class="text-sm text-fg-muted">探针自检卡片</p>
      </div>
    </div>`,
  async measure(page) {
    return page.evaluate(() => {
      const card = document.getElementById('card');
      const label = document.getElementById('label');
      const box = card.getBoundingClientRect();
      return {
        卡宽: Math.round(box.width * 100) / 100,
        圆角: getComputedStyle(card).borderTopLeftRadius,
        卡底色: getComputedStyle(card).backgroundColor,
        文字色: getComputedStyle(label).color,
        主题: document.documentElement.dataset.theme ?? '(未挂)',
      };
    });
  },
};
