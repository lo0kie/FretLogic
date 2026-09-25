// 平台基础设施层类型门面：通用标量品牌、基础 UI 状态，以及「平台自身就要消费的领域设置类型」。
//
// ⚠️ 关于下方 './settings'：它里面确实住着带领域语义的类型（SyncProviderKind、四个 *SyncBackup、
// ScoreLyricsFontWeight、AudioTimbreId、StrumDirection、AudioPlaybackSettings…），但这**不算**
// 反向 re-export 领域业务类型 —— platform/store/settingsStore.ts（持有 syncTarget /
// scoreLyricsFontWeight / audioPlayback 等领域偏好）与 platform/store/uiStore.ts 自身就要消费它们，
// 而 platform 严禁 import domains（rules/02-protected-zones.md 的「一、稳定保护区」 + eslint 的 platform↛domains zone），
// 这些类型因此只能住在 platform。**这是隔离规则下的必然归属，不是漂移**，不要试图把它们迁回各域
// （迁了会让 settingsStore 直接撞 zone；真要动，前提是先决定 settingsStore 该不该留在 platform）。
//
// 本条门面真正的红线是：严禁把领域**业务实体**（Chord / Song / Group 等）从这里 re-export。
export * from './brand';
export * from './notice';
export * from './ui';
export * from './settings';
