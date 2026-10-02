/**
 * 平台指令的注册入口：把「有哪些指令、各自注册成什么名字」收在指令目录内，装配层只调一次。
 *
 * 注册名逐条手写、不做 `vAutoWidth` → `auto-width` 的推导：注册名就是模板里实际敲的那个词，
 * 必须可 grep。推导出来的名字在源码里没有字面量 —— 改名时全仓搜不到，只能等跑起来才发现。
 *
 * ⚠️ 本文件**收不了领域指令**（`v-chord-name` 在 `domains/chord/directives/`）：zone ① 明令
 * platform 不得反向依赖 domains（含 type-only 导入），而该约束不接受任务级覆盖
 * （见 `rules/02-protected-zones.md` 与 `rules/07-loop-limits-and-circuit-breaker.md` 的「五」）。
 * 领域指令由所在层的注册器负责，见 `domains/chord/directives/register.ts`。
 */
import { vAutoHeight } from './animation/vAutoHeight';
import { vAutoWidth } from './animation/vAutoWidth';
import { vDraw } from './animation/vDraw';
import { vMarquee } from './animation/vMarquee';
import { vShake } from './animation/vShake';
import { vStagger } from './animation/vStagger';
import { vArrowNav } from './vArrowNav';
import { vAsButton } from './vAsButton';
import { vEdgeFade } from './vEdgeFade';
import { vFocus } from './vFocus';
import { vScrollbar } from './vScrollbar';
import { vScrollIntoView } from './vScrollIntoView';
import { vTooltip } from './vTooltip';
import { vWheelScroll } from './vWheelScroll';

import type { App } from 'vue';

/** 把平台指令全部注册到 app 上（注册名即模板里的 `v-xxx`，顺序沿用 main.ts 时期的原序） */
export const registerPlatformDirectives = (app: App): void => {
  app.directive('tooltip', vTooltip);
  app.directive('as-button', vAsButton);
  app.directive('wheel-scroll', vWheelScroll);
  app.directive('focus', vFocus);
  app.directive('scroll-into-view', vScrollIntoView);
  app.directive('scrollbar', vScrollbar);
  app.directive('arrow-nav', vArrowNav);
  app.directive('edge-fade', vEdgeFade);
  app.directive('marquee', vMarquee);
  app.directive('auto-width', vAutoWidth);
  app.directive('auto-height', vAutoHeight);
  app.directive('shake', vShake);
  app.directive('stagger', vStagger);
  app.directive('draw', vDraw);
};
