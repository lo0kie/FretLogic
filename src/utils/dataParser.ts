/**
 * @Author likan
 * @Date 2026-05-30 11:15:00
 * @Filepath fret-logic\src\utils\dataParser.ts
 */

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

  // 1. 校验与清洗分组数据 (Groups)
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

  // 用于追踪和弦 ID 集合，防止非法篡改/复制导致的主键碰撞
  const usedChordIds = new Set<number | string>();
  const validChords: any[] = [];

  // 2. 校验与清洗和弦数据 (Chords)
  chords.forEach((c, index) => {
    if (!c) {
      isValid = false;
      return;
    }
    // 过滤掉归属了不存在分组的孤儿和弦
    if (!c.groupId || String(c.groupId).trim() === '' || !validGroupIds.has(String(c.groupId))) {
      console.warn(`⚠️ ${logPrefix} -> 和弦 "${c.chordName || '未命名'}" 分组失效，已过滤。`);
      return;
    }

    const errors: string[] = [];
    if (typeof c.id !== 'number' && typeof c.id !== 'string') errors.push(`id 异常`);
    if (typeof c.chordName !== 'string') errors.push(`chordName 异常`);
    if (typeof c.groupId !== 'string') errors.push(`groupId 异常`);

    // 品位与把位核心属性纠偏
    if (c.fretCount === undefined || c.fretCount === null) c.fretCount = 3;
    if (c.capo === undefined || c.capo === null) c.capo = 0;

    // 严格类型与界限校验
    if (typeof c.fretCount !== 'number' || c.fretCount < 3 || c.fretCount > 5) errors.push(`fretCount 越界`);
    if (typeof c.capo !== 'number' || c.capo < 0 || c.capo > 15) errors.push(`capo 越界`);

    // 根音主键修正，防止 null 穿透导致类型崩溃
    if (c.rootMark === undefined || c.rootMark === null) {
      c.rootMark = -1;
    } else if (typeof c.rootMark === 'number') {
      if (c.rootMark !== -1 && (c.rootMark < 0 || c.rootMark > 5)) errors.push(`rootMark 越界`);
    } else {
      errors.push(`rootMark 类型异常`);
    }

    // 🌟 核心加固：等音名状态（useFlat）单弦偏好容错抹平，完美向下兼容老数据
    if (!Array.isArray(c.useFlat) || c.useFlat.length !== 6) {
      c.useFlat = [false, false, false, false, false, false];
    } else {
      c.useFlat = c.useFlat.map((v: any) => !!v); // 强行布尔化，拦截非法的脏注入
    }

    // 指板手指按压数据验证
    if (!Array.isArray(c.selectedFrets) || c.selectedFrets.length !== 6) {
      errors.push(`selectedFrets 长度异常`);
    } else if (!c.selectedFrets.every((f: any) => typeof f === 'number')) {
      errors.push(`selectedFrets 类型异常`);
    } else {
      const outOfRange = c.selectedFrets.some((fret: number) => fret < -1 || fret > c.fretCount);
      if (outOfRange) errors.push(`selectedFrets 存在越界品位值`);
    }

    if (errors.length > 0) {
      console.error(`❌ ${logPrefix} -> 和弦数据严重损坏 [索引 ${index}]:\n   `, errors.join('\n    '));
      isValid = false;
      return;
    }

    // 如果发现 ID 重复冲突，直接注入当前时间戳加随机因子重制它，确保 Vue v-for 的 Key 绝对纯净
    if (usedChordIds.has(c.id)) {
      c.id = Date.now() + Math.floor(Math.random() * 100000);
    }
    usedChordIds.add(c.id);

    validChords.push(c);
  });

  d.chords = validChords;
  return isValid;
};
