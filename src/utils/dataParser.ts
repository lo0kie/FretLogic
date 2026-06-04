import { Chord, Group, GuitarStringsModel } from '@/types';

// 🌟 显式定义符合你当前扁平 Chord 契约的导入/导出松散数据载荷
interface LooseChordPayload {
  id: string | number;
  chordName: string;
  groupId: string | number;
  fretCount: Chord['fretCount'];
  capo: number;
  tuning: string;
  strings: GuitarStringsModel;
}

export const cleanAndValidateData = (
  data: unknown,
  mode: 'import' | 'export' = 'import'
): data is { groups: Group[]; chords: Chord[] } => {
  const logPrefix = mode === 'import' ? '📥 导入校验' : '📤 导出清洗';
  if (!data || typeof data !== 'object') {
    console.error(`❌ ${logPrefix}失败：根节点不是有效对象`);
    return false;
  }

  const d = data as Record<string, unknown>;
  if (!Array.isArray(d.groups) || !Array.isArray(d.chords)) {
    console.error(`❌ ${logPrefix}失败：数据破损，缺少分组或和弦序列`);
    return false;
  }

  let isValid = true;

  const rawGroups = d.groups as unknown[];
  const rawChords = d.chords as Record<string, any>[];

  // 1. 清洗 Group 分组序列
  const cleanedGroups: Group[] = [];
  for (const g of rawGroups) {
    if (!g || typeof g !== 'object') {
      isValid = false;
      continue;
    }

    const groupItem = g as Record<string, unknown>;
    const id = groupItem.id !== undefined ? String(groupItem.id) : crypto.randomUUID().slice(0, 8);
    const name = typeof groupItem.name === 'string' ? groupItem.name : '未命名分组';
    const collapsed = groupItem.collapsed !== undefined ? !!groupItem.collapsed : false;

    cleanedGroups.push({ id, name, collapsed });
  }

  const validGroupIds = new Set<string>(cleanedGroups.map(g => g.id));
  const usedChordIds = new Set<string>();
  const validChords: Chord[] = [];

  // 2. 清洗扁平的 Chord 和弦序列（无兼容残留，100% 贴合你的 Chord 契约定义）
  for (const c of rawChords) {
    if (!c || typeof c !== 'object') {
      isValid = false;
      continue;
    }

    const chordItem = c as LooseChordPayload;

    // 游离脏数据安全拦截：如果没有外键 groupId，或者 groupId 在分组里找不到，执行脱离
    if (
      !chordItem.groupId ||
      String(chordItem.groupId).trim() === '' ||
      !validGroupIds.has(String(chordItem.groupId))
    ) {
      console.warn(`⚠️ ${logPrefix} -> 和弦外键关联失效，执行物理拦截脱离`);
      continue;
    }

    const finalId = chordItem.id !== undefined ? String(chordItem.id) : crypto.randomUUID().slice(0, 10);
    const finalName = typeof chordItem.chordName === 'string' ? chordItem.chordName : '未命名';
    const finalGroupId = String(chordItem.groupId);
    const finalFretCount = typeof chordItem.fretCount === 'number' ? chordItem.fretCount : 3;
    const finalCapo = typeof chordItem.capo === 'number' ? chordItem.capo : 0;
    const finalTuning = typeof chordItem.tuning === 'string' ? chordItem.tuning : 'STANDARD';

    // 严格审查每根琴弦实体的合法性
    if (!Array.isArray(chordItem.strings) || chordItem.strings.length !== 6) {
      console.error(`❌ ${logPrefix} -> 和弦 "${finalName}" 核心物理琴弦实体破损或长度不是6`);
      isValid = false;
      continue;
    }

    // 🌟 核心修正：严格按照你给出的 Chord 接口字段进行对象字面量装配
    const finalChord: Chord = {
      id: usedChordIds.has(finalId) ? 'c_recovery_' + crypto.randomUUID().slice(0, 8) : finalId,
      chordName: finalName,
      strings: chordItem.strings,
      fretCount: finalFretCount,
      capo: finalCapo,
      groupId: finalGroupId,
      tuning: finalTuning as Chord['tuning'],
    };

    usedChordIds.add(finalChord.id as string);
    validChords.push(finalChord);
  }

  // 重新映射回宿主载荷
  d.groups = cleanedGroups;
  d.chords = validChords;

  return isValid;
};
