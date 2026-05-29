/**
 * @Author likan
 * @Date 2026-05-29 00:42:20
 * @Filepath fret-logic\src\utils\dataParser.ts
 */

// src/utils/dataParser.ts
import type { Chord, Group } from '@/stores/chordLabStore';

export const cleanAndValidateData = (
  data: unknown,
  mode: 'import' | 'export' = 'import'
): data is { groups: Group[]; chords: Chord[] } => {
  const logPrefix = mode === 'import' ? '📥 导入校验' : '📤 导出清洗';

  if (!data || typeof data !== 'object') {
    console.error(`❌ ${logPrefix}失败：根节点不是对象。`);
    return false;
  }

  const d = data as Record<string, unknown>;
  if (!Array.isArray(d.groups) || !Array.isArray(d.chords)) {
    console.error(`❌ ${logPrefix}失败：缺少 "groups" 或 "chords" 数组。`);
    return false;
  }

  let isValid = true;
  const groups = d.groups as any[];
  const chords = d.chords as any[];

  // 1. 校验并修补分组 (Group)
  groups.forEach((g, index) => {
    if (!g) {
      isValid = false;
      return;
    }
    const errors: string[] = [];
    if (typeof g.id !== 'string') errors.push(`id 应为 string`);
    if (typeof g.name !== 'string') errors.push(`name 应为 string`);
    if (g.collapsed === undefined || g.collapsed === null) {
      g.collapsed = false;
    } else if (typeof g.collapsed !== 'boolean') {
      errors.push(`collapsed 应为 boolean`);
    }
    if (errors.length > 0) {
      console.error(`❌ ${logPrefix} -> 分组异常 [索引 ${index}]:\n   `, errors.join('\n    '));
      isValid = false;
    }
  });

  const validGroupIds = new Set<string>(groups.filter(g => g && typeof g.id === 'string').map(g => g.id));

  // 2. 校验、清洗并严格过滤和弦 (Chord)
  const validChords: any[] = [];
  chords.forEach((c, index) => {
    if (!c) {
      isValid = false;
      return;
    }
    if (!c.groupId || String(c.groupId).trim() === '' || !validGroupIds.has(String(c.groupId))) {
      console.warn(`⚠️ ${logPrefix} -> 和弦 "${c.chordName || '未命名'}" 分组失效，已过滤。`);
      return;
    }

    const errors: string[] = [];
    if (typeof c.id !== 'number' && typeof c.id !== 'string') errors.push(`id 异常`);
    if (typeof c.chordName !== 'string') errors.push(`chordName 异常`);
    if (typeof c.groupId !== 'string') errors.push(`groupId 异常`);

    if (c.fretCount === undefined || c.fretCount === null) c.fretCount = 3;
    if (c.capo === undefined || c.capo === null) c.capo = 0;

    if (c.rootMark === undefined || c.rootMark === null) {
      c.rootMark = null;
    } else if (typeof c.rootMark === 'number') {
      if (c.rootMark !== -1 && (c.rootMark < 0 || c.rootMark > 5)) errors.push(`rootMark 越界`);
    } else {
      errors.push(`rootMark 类型异常`);
    }

    if (typeof c.fretCount !== 'number' || c.fretCount < 3 || c.fretCount > 8) errors.push(`fretCount 越界`);
    if (typeof c.capo !== 'number' || c.capo < 0 || c.capo > 15) errors.push(`capo 越界`);
    if (!Array.isArray(c.selectedFrets) || c.selectedFrets.length !== 6) errors.push(`selectedFrets 长度异`);
    else if (!c.selectedFrets.every((f: any) => typeof f === 'number')) errors.push(`selectedFrets 类型异常`);
    else {
      const outOfRange = c.selectedFrets.some((fret: number) => fret < -1 || fret > c.fretCount);
      if (outOfRange) errors.push(`selectedFrets 存在越界品位值`);
    }

    if (errors.length > 0) {
      console.error(`❌ ${logPrefix} -> 和弦数据严重损坏 [索引 ${index}]:\n   `, errors.join('\n    '));
      isValid = false;
      return;
    }
    validChords.push(c);
  });

  d.chords = validChords;
  return isValid;
};
