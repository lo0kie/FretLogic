/**
 * 乐理层统一出口（barrel）。
 *
 * 原 theory.ts 为单一巨型模块（约 1874 行）。本次拆分将其按主题拆为若干自包含模块，
 * 本文件仅做 `export *` 重导出，保持对外公开 API（及全部 import 调用点）与拆分前完全一致：
 *
 *   - tuning.ts          调弦预设 / 映射
 *   - pitch.ts           音高 / 音名 / 品记 Label
 *   - chordName.ts       和弦名解析 / 命名 / 性质格式化 / 根音音高
 *   - chordSearch.ts     搜索匹配 / 指板音集收集 / 根音解析 / 转位 / 演唱调
 *   - transpose.ts       移调
 *   - chordSort.ts       排序元数据 / 比较器 / 分组排序规则
 *   - chordDegree.ts     罗马数字级数 / 等音等价
 *   - bassConsistency.ts 斜杠低音一致性 / 调弦空弦基准
 *   - chordIdentity.ts   和弦身份判定（指纹 / 归一化名称键）
 *
 * 注意：theory.shared.ts 为跨模块私有 helper 枢纽（NOTES_*、DIATONIC_*、性质口味判定等），
 * 仅被上述主题模块内部引用，不在此处对外公开，避免污染公开命名空间与循环依赖。
 */

export * from './tuning';
export * from './pitch';
export * from './chordName';
export * from './chordSearch';
export * from './transpose';
export * from './chordSort';
export * from './chordDegree';
export * from './bassConsistency';
export * from './chordIdentity';
