import { Chord, Group, GuitarStringsModel } from '@/types/chord';

// 🌟 新增：显式定义导入/导出时的松散数据载荷契约，用 Record 代替 any
interface LooseChordPayload {
  id?: string | number;
  chordName?: string;
  groupId?: string | number;
  fretCount?: number;
  capo?: number;
  tuning?: string;
  barreFret?: number;
  strings?: GuitarStringsModel;
  // 以下为旧版向前兼容字段
  selectedFrets?: unknown[];
  rootMark?: number;
  useFlat?: boolean[];
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

  // 🚀 核心重构：将 any[] 平替为标准具有约束力的结构或 unknown
  const rawGroups = d.groups as unknown[];
  const rawChords = d.chords as Record<string, any>[]; // 转换为内部可自由写属性的字典对象

  // 1. 物理清洗 Group 序列，强转 ID 为 string，断断绝关系型错位
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

  // 2. 核心铁腕拦截：将旧版本 JSON 的 3 套平行数组无缝转换、补齐为全新单体 Entity 对象数组
  for (const c of rawChords) {
    if (!c || typeof c !== 'object') {
      isValid = false;
      continue;
    }

    const chordItem = c as LooseChordPayload;

    // 游离脏数据安全拦截
    if (
      !chordItem.groupId ||
      String(chordItem.groupId).trim() === '' ||
      !validGroupIds.has(String(chordItem.groupId))
    ) {
      console.warn(`⚠️ ${logPrefix} -> 和弦 "${chordItem.chordName || '未命名'}" 分组外键关联失效，执行物理拦截脱离`);
      continue;
    }

    const finalId = chordItem.id !== undefined ? String(chordItem.id) : crypto.randomUUID().slice(0, 10);
    const finalName = typeof chordItem.chordName === 'string' ? chordItem.chordName : '未命名';
    const finalGroupId = String(chordItem.groupId);
    const finalFretCount = typeof chordItem.fretCount === 'number' ? chordItem.fretCount : 3;
    const finalCapo = typeof chordItem.capo === 'number' ? chordItem.capo : 0;
    const finalTuning = typeof chordItem.tuning === 'string' ? chordItem.tuning : 'STANDARD';
    const finalBarreFret = typeof chordItem.barreFret === 'number' ? chordItem.barreFret : 0;

    // 🚀 向前兼容转换防线：如果是旧版备份，在运行期动态组装升级
    if (chordItem.selectedFrets && Array.isArray(chordItem.selectedFrets) && !chordItem.strings) {
      const rm = typeof chordItem.rootMark === 'number' ? chordItem.rootMark : -1;
      const uf = Array.isArray(chordItem.useFlat) ? chordItem.useFlat : [false, false, false, false, false, false];

      chordItem.strings = chordItem.selectedFrets.map((fretVal: unknown, idx: number) => ({
        fret: typeof fretVal === 'number' ? fretVal : -1,
        isRoot: idx === rm,
        preferFlat: !!uf[idx],
      })) as GuitarStringsModel;

      // 干净清除历史残余平行字段，执行 Payload 铁腕瘦身
      delete chordItem.selectedFrets;
      delete chordItem.rootMark;
      delete chordItem.useFlat;
    }

    // 实体合法性终极契约审查
    if (!Array.isArray(chordItem.strings) || chordItem.strings.length !== 6) {
      console.error(`❌ ${logPrefix} -> 和弦 "${finalName}" 核心物理琴弦实体破损`);
      isValid = false;
      continue;
    }

    const finalChord: Chord = {
      id: usedChordIds.has(finalId) ? 'c_recovery_' + crypto.randomUUID().slice(0, 8) : finalId,
      chordName: finalName,
      groupId: finalGroupId,
      fretCount: finalFretCount,
      capo: finalCapo,
      tuning: finalTuning as Chord['tuning'], // 映射到导出的强类型 Presets
      barreFret: finalBarreFret,
      strings: chordItem.strings,
    };

    usedChordIds.add(finalChord.id as string);
    validChords.push(finalChord);
  }

  // 映射回宿主载荷
  d.groups = cleanedGroups;
  d.chords = validChords;

  return isValid;
};
