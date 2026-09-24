// 指板领域的**模块清单**：列清本域对外可用的模块，便于人快速了解边界。
// ⚠️ 它**不是导入入口**（见 .github/CONTRIBUTING.md「目录结构」）：跨领域消费一律走深路径
//（例如 chord 域直接引 `@/domains/fretboard/components/FretboardCanvas.vue`），
// 域内新增 / 移动模块时同步维护本清单。此约定同样适用于 chord/index.ts 与 score/index.ts。
//
// 以下模块同样对外可用、且已被跨域消费，但**不在此 star-export**：
//   - model/fretboardGeometry —— 它导出的 `FretboardGeometry` 与 renderFretboardCanvas 的同名再导出
//     撞名，`export *` 会让该名字在 barrel 里被静默剔除（ESM 歧义规则），反而比现状更差；
//   - model/interactiveGeometry、model/fretGeometry、model/fretWindow —— 由上面的几何底座派生，
//     消费方一律深路径直取，避免为一个类型把整条几何链拉进 barrel。
export { default as Fretboard } from './components/Fretboard.vue';
export { default as FretboardSvg } from './components/FretboardSvg.vue';
export { default as FretboardCanvas } from './components/FretboardCanvas.vue';
export { default as FretboardNote } from './components/FretboardNote.vue';
export * from './composables/useFretboardInteraction';
export * from './composables/useFretboardKeyboard';
export * from './composables/useFretboardLayout';
export * from './model/coordinates';
export * from './components/renderFretboardCanvas';
export * from './constants';
export * from './types';
