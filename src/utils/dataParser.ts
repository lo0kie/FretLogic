import type { ImportExportPayload } from '@/types';

export const cleanAndValidateData = (
  data: unknown,
  mode: 'import' | 'export' = 'import'
): data is ImportExportPayload => {
  const logPrefix = mode === 'import' ? '📥 原生导入校验' : '📤 原生导出清洗';

  if (!data || typeof data !== 'object') {
    console.error(`❌ ${logPrefix}失败！检测到资产并非有效对象。`);
    return false;
  }

  const payload = data as Record<string, any>;
  const issues: string[] = [];

  if (!Array.isArray(payload.groups)) {
    issues.push('groups 字段必须为数组');
  } else {
    payload.groups = payload.groups.filter((g: any, index: number) => {
      if (!g || typeof g !== 'object' || typeof g.id !== 'string' || typeof g.name !== 'string') {
        issues.push(`groups[${index}] 结构损坏缺失必要属性`);
        return false;
      }
      if (g.collapsed === undefined) g.collapsed = false;
      return true;
    });
  }

  if (!Array.isArray(payload.chords)) {
    issues.push('chords 字段必须为数组');
  } else {
    payload.chords = payload.chords.filter((c: any, index: number) => {
      if (!c || typeof c !== 'object') {
        issues.push(`chords[${index}] 不是有效的对象`);
        return false;
      }
      if (typeof c.id !== 'string' || typeof c.chordName !== 'string' || typeof c.groupId !== 'string') {
        issues.push(`chords[${index}] (${c.id || index}) 缺失基础识别属性`);
        return false;
      }
      if (!Array.isArray(c.strings) || c.strings.length !== 6) {
        issues.push(`chords[${index}] (${c.id}) 琴弦物理资产数组损坏(必须为6弦)`);
        return false;
      }

      const isStringsValid = c.strings.every((s: any) => {
        return (
          s &&
          typeof s === 'object' &&
          typeof s.fret === 'number' &&
          typeof s.preferFlat === 'boolean' &&
          typeof s.isRoot === 'boolean'
        );
      });
      if (!isStringsValid) {
        issues.push(`chords[${index}] (${c.id}) 内部存在损坏的琴弦音符节点`);
        return false;
      }

      if (c.fretCount !== 3 && c.fretCount !== 4 && c.fretCount !== 5) {
        c.fretCount = 3;
      }
      if (typeof c.capo !== 'number' || c.capo < 0 || c.capo > 12) {
        c.capo = 0;
      }
      if (!c.tuning) c.tuning = 'STANDARD';

      return true;
    });
  }

  if (issues.length > 0) {
    console.error(`❌ ${logPrefix}失败！检测到核心物理资产结构严重破损。`);
    console.group(`详细错误报告 (共 ${issues.length} 项违规):`);
    issues.forEach(msg => console.warn(msg));
    console.groupEnd();
    return false;
  }

  const validGroupIds = new Set<string>(payload.groups.map((g: any) => g.id));
  payload.chords = payload.chords.filter((chord: any) => {
    if (!validGroupIds.has(chord.groupId)) {
      console.warn(`⚠️ ${logPrefix} -> 和弦 "${chord.chordName}" (${chord.id}) 外键关联失效，执行物理拦截脱离`);
      return false;
    }
    return true;
  });

  return true;
};

export function cloneDeep<T>(value: T, cache = new WeakMap()): T {
  if (value === null || typeof value !== 'object') {
    return value;
  }

  let rawValue: any = value;
  if ((value as any)['__v_raw']) {
    rawValue = (value as any)['__v_raw'];
  } else if ((value as any)['__raw__']) {
    rawValue = (value as any)['__raw__'];
  }

  if (cache.has(rawValue)) {
    return cache.get(rawValue);
  }

  if (rawValue instanceof Date) {
    return new Date(rawValue.getTime()) as any;
  }

  if (rawValue instanceof RegExp) {
    return new RegExp(rawValue.source, rawValue.flags) as any;
  }

  if (rawValue instanceof Set) {
    const cloneSet = new Set();
    cache.set(rawValue, cloneSet);
    rawValue.forEach(val => {
      cloneSet.add(cloneDeep(val, cache));
    });
    return cloneSet as any;
  }

  if (rawValue instanceof Map) {
    const cloneMap = new Map();
    cache.set(rawValue, cloneMap);
    rawValue.forEach((val, key) => {
      cloneMap.set(key, cloneDeep(val, cache));
    });
    return cloneMap as any;
  }

  const cloneTarget = Array.isArray(rawValue) ? [] : Object.create(Object.getPrototypeOf(rawValue));

  cache.set(rawValue, cloneTarget);

  const keys = Reflect.ownKeys(rawValue);
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(rawValue, key);

    if (descriptor) {
      const clonedValue = cloneDeep(rawValue[key], cache);

      Object.defineProperty(cloneTarget, key, {
        ...descriptor,
        value: clonedValue,
      });
    }
  }

  return cloneTarget;
}
