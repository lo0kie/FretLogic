/**
 * AppDBSchema 的应用层类型填充（declaration merging）。
 *
 * 为什么放在 app 层：idb.ts（platform）需要 chords/groups/songs 三库的记录类型做编译期
 * 绑定，但 AGENTS §3 禁止 platform 反向依赖 domains（含 type-only 导入）。app 是唯一
 * 能同时看见 platform 与 domains 的层，故由这里经 TS interface merging 把具体记录类型
 * 并入 platform 声明的 AppDBSchema——platform 零 domain 依赖，绑定强度不降。
 *
 * 生效机制：本文件位于 tsconfig 的 src/** 程序内，augmentation 对全程序生效；
 * 下方显式 import 仅作兜底引用，防止某些构建路径裁剪掉无值导出的模块。
 */
import type { Chord, Group } from '@/domains/chord/types';
import type { Song } from '@/domains/score/types';
import type { AppDBSchema } from '@/platform/services/storage/idb';

declare module '@/platform/services/storage/idb' {
  interface AppDBSchema {
    chords: { key: string; value: Chord; indexes: { groupId: string } };
    groups: { key: string; value: Group };
    songs: { key: string; value: Song };
  }
}

// 保留一个类型侧引用：确保 augmentation 在任何消费方之前被加载（自文档化，无运行时代码）
export type { AppDBSchema };
