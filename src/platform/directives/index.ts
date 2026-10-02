// 基础指令集公共门面
//
// 只有 `animation/` 是按**类别**收拢的子目录（`vScrollbar/` 那种是「一个指令一个目录」，
// 用于单个指令自身拆成多文件的情况）。归入它的判据是「核心职责是否让某个量随时间变化」：
// 补间与关键帧动画（v-auto-width / v-auto-height / v-shake）、SVG 描边（v-draw）、
// 子项交错（v-stagger）与循环滚动（v-marquee）在列；
// 定位 / 布局 / 语义 / 视觉遮罩类（v-focus、v-scroll-into-view、v-arrow-nav、v-as-button、
// v-edge-fade、v-tooltip、v-wheel-scroll、v-scrollbar）仍与门面同级。
export * from './vTooltip';
export * from './animation/vAutoHeight';
export * from './animation/vAutoWidth';
export * from './animation/vDraw';
export * from './vFocus';
export * from './vArrowNav';
export * from './animation/vMarquee';
export * from './animation/vShake';
export * from './animation/vStagger';
export * from './vScrollIntoView';
export * from './vWheelScroll';
export * from './vScrollbar';
export * from './vAsButton';
// 补上此前漏掉的一项：门面少一个成员就不再是「公共门面」，而是一个会骗人的清单
//（此前只有 vEdgeFade 没在这里出现，靠 import 具体模块才用得上）
export * from './vEdgeFade';
// 注册入口也属门面：装配层只认这一个入口，指令增删在这里与上面的清单一起改
export * from './register';
