// @vitest-environment jsdom
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';

import { sanitizeChordEntity } from '@/app/services/validation/persistedData';
import { useChordEditorStore } from '@/domains/chord/store/chordEditorStore';
import { toChordId, toGroupId } from '@/domains/chord/theory/entityFactories';
import { getTuningsByStringCount, Tuning, TUNING_PRESETS } from '@/domains/chord/theory/theory';
import { SCORE_EXPORT_CONFIG } from '@/domains/score/constants';
import { cloneGuitarStrings } from '@/platform/utils/common';

import type { RootSegment } from '@/domains/chord/types';
import type { BarreFret, GuitarStringEntity } from '@/domains/fretboard/types';

describe('自定义弦数架构 (Custom String Count Architecture)', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  describe('chordEditorStore 弦数动态调整', () => {
    it('初始默认应当为 6 弦且调弦为 STANDARD', () => {
      const editor = useChordEditorStore();
      expect(editor.stringCount).toBe(6);
      expect(editor.draftChord.strings.length).toBe(6);
      expect(editor.draftChord.tuning).toBe(Tuning.STANDARD);
    });

    it('缩减为 4 弦时应截断多余弦并自动联动切换调弦为 4 弦标准', () => {
      const editor = useChordEditorStore();
      editor.setStringCount(4);
      expect(editor.stringCount).toBe(4);
      expect(editor.draftChord.strings.length).toBe(4);
      expect(editor.draftChord.tuning).toBe(Tuning.UKULELE_STANDARD);
      expect(TUNING_PRESETS[editor.draftChord.tuning].stringCount).toBe(4);
    });

    it('扩充为 7 弦时应补齐静音弦并自动联动切换调弦为 7 弦标准', () => {
      const editor = useChordEditorStore();
      editor.setStringCount(7);
      expect(editor.stringCount).toBe(7);
      expect(editor.draftChord.strings.length).toBe(7);
      expect(editor.draftChord.tuning).toBe(Tuning.SEVEN_STANDARD);
      expect(TUNING_PRESETS[editor.draftChord.tuning].stringCount).toBe(7);
    });

    it('缩减弦数时应清理越界的 rootStringIndex 与横按', () => {
      const editor = useChordEditorStore();
      editor.autoBarre = false;
      editor.draftChord.rootStringIndex = 5;
      editor.draftChord.barres = [
        { fret: 1 as BarreFret, fromString: 0, toString: 5 },
        { fret: 2 as BarreFret, fromString: 1, toString: 3 },
      ];

      // 缩减到 4 弦（有效索引 0~3）
      editor.setStringCount(4);
      expect(editor.draftChord.rootStringIndex).toBeNull();
      // toString 跨到 5 的横按被移除，仅保留 1~3 的横按
      expect(editor.draftChord.barres).toEqual([{ fret: 2, fromString: 1, toString: 3 }]);
    });
  });

  describe('数据清洗与持久化支持非 6 弦', () => {
    it('能够成功清洗并保留合法的 4 弦和弦实体', () => {
      const raw4 = {
        id: 'c_test4',
        groupId: 'g_default',
        chordName: 'C',
        strings: [
          { fret: 0, preferFlat: false },
          { fret: 0, preferFlat: false },
          { fret: 0, preferFlat: false },
          { fret: 3, preferFlat: false },
        ],
        fretCount: 3,
        capo: 0,
        tuning: Tuning.UKULELE_STANDARD,
      };

      const result = sanitizeChordEntity(raw4);
      expect(result).not.toBeNull();
      expect(result?.strings.length).toBe(4);
      expect(result?.tuning).toBe(Tuning.UKULELE_STANDARD);
    });

    it('能够成功清洗并保留合法的 7 弦和弦实体', () => {
      const raw7 = {
        id: 'c_test7',
        groupId: 'g_default',
        chordName: 'B5',
        strings: [
          { fret: 0, preferFlat: false },
          { fret: 2, preferFlat: false },
          { fret: 2, preferFlat: false },
          { fret: -1, preferFlat: false },
          { fret: -1, preferFlat: false },
          { fret: -1, preferFlat: false },
          { fret: -1, preferFlat: false },
        ],
        fretCount: 3,
        capo: 0,
        tuning: Tuning.SEVEN_STANDARD,
      };

      const result = sanitizeChordEntity(raw7);
      expect(result).not.toBeNull();
      expect(result?.strings.length).toBe(7);
      expect(result?.tuning).toBe(Tuning.SEVEN_STANDARD);
    });

    it('超出 3~10 弦合法区间的畸变实体应被防御性拦截', () => {
      const rawTooFew = {
        id: 'c_few',
        groupId: 'g_default',
        chordName: 'X',
        strings: [
          { fret: 0, preferFlat: false },
          { fret: 0, preferFlat: false },
        ], // 仅 2 根弦
      };
      expect(sanitizeChordEntity(rawTooFew)).toBeNull();

      const rawTooMany = {
        id: 'c_many',
        groupId: 'g_default',
        chordName: 'X',
        strings: Array.from({ length: 12 }, () => ({ fret: 0, preferFlat: false })), // 12 根弦
      };
      expect(sanitizeChordEntity(rawTooMany)).toBeNull();
    });
  });

  describe('克隆与尺寸计算', () => {
    it('cloneGuitarStrings 应元素级深克隆弦数组（改副本不污染原数组）', () => {
      const strings4: GuitarStringEntity[] = [
        { fret: 0, preferFlat: false },
        { fret: 1, preferFlat: true },
        { fret: 2, preferFlat: false },
        { fret: 3, preferFlat: true },
      ];
      const cloned = cloneGuitarStrings(strings4);
      expect(cloned).toEqual(strings4);
      expect(cloned).not.toBe(strings4);
      // 逐元素独立：仅「新数组 + 浅拷贝共享元素引用」也能通过上面的 not.toBe，
      // 必须改副本元素后确认原数组不受影响，才证明是元素级深克隆
      cloned[0]!.fret = 99;
      expect(strings4[0]!.fret).toBe(0);
      expect(strings4).toHaveLength(4);
    });

    it('getExportFretboardWidth 应按弦数动态等比伸缩宽度', () => {
      // 6 弦结果必须与声明的标准指板宽度常量一致（单一来源，防两处声明漂移）
      expect(SCORE_EXPORT_CONFIG.getExportFretboardWidth(6)).toBe(SCORE_EXPORT_CONFIG.FRETBOARD_WIDTH);
      // 4 弦 = 14*2 + 3*9.8 = 57.4
      expect(SCORE_EXPORT_CONFIG.getExportFretboardWidth(4)).toBeCloseTo(57.4);
      // 7 弦 = 14*2 + 6*9.8 = 86.8
      expect(SCORE_EXPORT_CONFIG.getExportFretboardWidth(7)).toBeCloseTo(86.8);
      // 1 弦走 Math.max 钳制分支：按 1 段弦距计（而非 0 段）
      expect(SCORE_EXPORT_CONFIG.getExportFretboardWidth(1)).toBeCloseTo(14 * 2 + 9.8);
    });

    it('getTuningsByStringCount 能够准确按弦数筛选选项', () => {
      const tunings4 = getTuningsByStringCount(4);
      expect(tunings4).toContain(Tuning.UKULELE_STANDARD);
      expect(tunings4).toContain(Tuning.BASS_STANDARD);
      expect(tunings4).not.toContain(Tuning.STANDARD);

      const tunings6 = getTuningsByStringCount(6);
      expect(tunings6).toContain(Tuning.STANDARD);
      expect(tunings6).toContain(Tuning.DROP_D);
      expect(tunings6).not.toContain(Tuning.UKULELE_STANDARD);

      const tunings7 = getTuningsByStringCount(7);
      expect(tunings7).toContain(Tuning.SEVEN_STANDARD);
    });
  });

  describe('导入/导出 Payload 与横按支持非 6 弦', () => {
    it('validateImportExportPayload 允许 4 弦与 7 弦和弦，不再硬编码 6 弦报错', async () => {
      const { validateImportExportPayload } = await import('@/app/services/validation/payload');
      const payload = {
        version: 6,
        groups: [{ id: 'g1', name: '常用' }],
        chords: [
          {
            id: 'c4',
            groupId: 'g1',
            nameSegments: { root: ['C', 0] },
            strings: [
              { fret: 0, preferFlat: false },
              { fret: 0, preferFlat: false },
              { fret: 0, preferFlat: false },
              { fret: 3, preferFlat: false },
            ],
            fretCount: 3,
            capo: 0,
            tuning: Tuning.UKULELE_STANDARD,
          },
          {
            id: 'c7',
            groupId: 'g1',
            nameSegments: { root: ['B', 11] },
            strings: [
              { fret: 0, preferFlat: false },
              { fret: 2, preferFlat: false },
              { fret: 2, preferFlat: false },
              { fret: -1, preferFlat: false },
              { fret: -1, preferFlat: false },
              { fret: -1, preferFlat: false },
              { fret: -1, preferFlat: false },
            ],
            fretCount: 3,
            capo: 0,
            tuning: Tuning.SEVEN_STANDARD,
          },
        ],
        songs: [],
      };

      const res = validateImportExportPayload(payload);
      expect(res.isValid).toBe(true);
      // 合法的 4/7 弦不再产生任何问题项（旧实现会硬编码 6 弦报错）
      expect(res.issues).toHaveLength(0);
      // 两条和弦各自保留原本弦数与 id（同时反证两条都被保留，故无需再断 chords.length）
      expect(res.payload?.chords[0]?.strings).toHaveLength(4);
      expect(res.payload?.chords[1]?.strings).toHaveLength(7);
      expect(res.payload?.chords[0]?.id).toBe('c4');
      expect(res.payload?.chords[1]?.id).toBe('c7');
    });

    it('7 弦和弦横按跨至第 7 根弦（toString: 6）不应被丢弃', async () => {
      const { normalizeChord } = await import('@/domains/chord/theory/normalizeChord');
      const chord7 = {
        id: toChordId('c7_barre'),
        groupId: toGroupId('g1'),
        nameSegments: { root: ['B', 0] as RootSegment },
        strings: [
          { fret: 2, preferFlat: false },
          { fret: 2, preferFlat: false },
          { fret: 2, preferFlat: false },
          { fret: 2, preferFlat: false },
          { fret: 2, preferFlat: false },
          { fret: 2, preferFlat: false },
          { fret: 2, preferFlat: false },
        ],
        barres: [{ fret: 2 as BarreFret, fromString: 0, toString: 6 }],
        fretCount: 4 as const,
        fretOffset: 0 as const,
        rootStringIndex: null,
        createdAt: 0,
        updatedAt: 0,
        tuning: Tuning.SEVEN_STANDARD,
      };

      const normalized = normalizeChord(chord7);
      // 7 弦横按不被清洗丢弃：恰好一条，且跨到第 7 根弦（toString: 6）
      expect(normalized.chord.barres).toHaveLength(1);
      expect(normalized.chord.barres![0]).toEqual({ fret: 2, fromString: 0, toString: 6 });
    });

    it('settingsStore 中 webdavPassword 为纯内存态，不落任何盘', async () => {
      const { STORAGE_KEYS } = await import('@/platform/utils/constants');
      const { kvGet } = await import('@/platform/services/storage/idbKv');
      localStorage.setItem(STORAGE_KEYS.WEBDAV_PASSWORD, 'old_plaintext_password');
      const { useSettingsStore } = await import('@/platform/store/settingsStore');
      const store = useSettingsStore();

      // store 自身不触碰 localStorage：历史明文密码由一次性转录丢弃
      //（见 migrateLegacy：WEBDAV_PASSWORD 列入 EXCLUDED_KEYS，不转录进 kv）。
      // 注：原先此处有一条「setItem 后立刻 getItem 断同值」的断言——它测的是 localStorage
      // 自身行为而非常量契约（恒真），已删；真正有效的是下方「赋值后旧值不被改写」这条

      // 设置新密码后仍为内存态：赋值既不得回写 localStorage，也不得进 kv 镜像
      store.webdavPassword = 'new_session_password';
      expect(localStorage.getItem(STORAGE_KEYS.WEBDAV_PASSWORD)).toBe('old_plaintext_password');
      expect(kvGet(STORAGE_KEYS.WEBDAV_PASSWORD)).toBeNull();
    });
  });
});
