import { describe, expect, it } from 'vitest';

import {
  hitSlotKey,
  hitTestArrangeLine,
  layoutArrangeLine,
  measureArrangeLineHeight,
} from '@/domains/score/editor/render/arrangeLineLayout';
import { charKey, chordSlotKey, parseSlotKey } from '@/domains/score/model/scoreModel';

import type { Chord } from '@/domains/chord/types';
import type { LineData } from '@/domains/score/preview/services/scoreExportCanvas';
import type { SlotKey } from '@/domains/score/types';

/**
 * 排列区一行 canvas 的**排版与命中**：两条契约各自锁一组断言。
 *
 * 1. **行高只有一个算式**：`layoutArrangeLine(...).height` 与 `measureArrangeLineHeight(...)`
 *    必须逐值相等 —— 前者画行、后者给离屏行的占位高度（见 useScoreViewportRender），
 *    两者一旦分叉，内容总高就会随「哪些行挂进了 DOM」漂移、滚动落点算不准。
 * 2. **命中与所见同源**：命中测试吃的就是排版表本身，故断言「槽中心命中该槽」「行末删除钮中心
 *    命中 delete-line」「槽上的清除钮中心命中 slot-remove」—— 这三条正是交互的三个入口
 *   （打开面板 / 删行 / 清和弦）。它们若各自另算一套几何，就会「点得中」与「看得见」错位。
 *
 * 断言一律写成**关系**（相对大小、相等、非空），不写死像素字面量：本文件跑在 jsdom 里，
 * 文本度量走的是字符数粗估兜底（见 arrangeLineLayout 的 measureTextWidth），像素值没有意义。
 */

const LINE_ID = 'l_probe';

/** 最小可用和弦：本用例只关心「有没有卡、卡多高」，指法给中性值 */
const chordOf = (fretCount: 4 | 5 = 4, frets: number[] = [0, 0, 0, 3]): Chord => ({
  id: 'c_probe' as Chord['id'],
  nameSegments: null,
  strings: frets.map(fret => ({ fret, preferFlat: false })),
  fretCount,
  fretOffset: 0 as Chord['fretOffset'],
  groupId: 'g_probe' as Chord['groupId'],
  tuning: 'STANDARD',
  rootStringIndex: null,
  barres: [],
  createdAt: 0,
  updatedAt: 0,
});

interface MakeLineOptions {
  /** 歌词文本（逐字符成为一个槽） */
  chars?: string;
  /** 行首边和弦 */
  startChords?: Chord[];
}

/**
 * 造一行行数据。
 *
 * 注意 `LineData` 里**不含和弦本体**（绑定存在乐谱的 chordMap 上，随编辑实时变化），
 * 故和弦由排版选项的 `resolveChord` 提供 —— 与宿主里那份解析器同一条路径。
 */
const makeLine = ({ chars = 'ab', startChords = [] }: MakeLineOptions = {}): LineData => ({
  lineIdx: 0,
  lineId: LINE_ID,
  chars: chars.split('').map((char, index) => ({ char, slotKey: charKey(LINE_ID, index) })),
  startChords: startChords.map((chord, index) => ({ chord, slotKey: chordSlotKey(LINE_ID, 'start', index) })),
  endChords: [],
  nextStartKey: chordSlotKey(LINE_ID, 'start', startChords.length),
  nextEndKey: chordSlotKey(LINE_ID, 'end', 0),
});

/** 排版选项：只给必需项，缩放取中性值 1；和弦由 `charChords` 按字符下标给出 */
const layoutOptions = (options?: { containerWidth?: number; charChords?: Map<number, Chord> }) => ({
  fontScale: 1,
  cardScale: 1,
  trimEmptyEdgeFrets: false,
  containerWidth: options?.containerWidth ?? 600,
  buttonSize: 40,
  gutterWidth: 24,
  resolveChord: (slotKey: SlotKey): Chord | null => {
    const parsed = parseSlotKey(slotKey);
    if (!parsed || parsed.type !== 'char') return null;
    return options?.charChords?.get(parsed.index) ?? null;
  },
});

describe('排列区行排版：行高只有一个算式', () => {
  it('有卡行比无卡行高（卡片的画布高整个加进行高）', () => {
    const plain = layoutArrangeLine(makeLine(), layoutOptions());
    const chord = chordOf();
    const withChord = layoutArrangeLine(makeLine(), layoutOptions({ charChords: new Map([[0, chord]]) }));
    expect(withChord.height).toBeGreaterThan(plain.height);
  });

  it('排版给出的行高与离屏占位算式逐值相等（卡高取该行最高那张卡）', () => {
    const chord = chordOf(5, [-1, 5, 5, 5, 5]);
    const line = makeLine();
    const layout = layoutArrangeLine(line, layoutOptions({ charChords: new Map([[1, chord]]) }));

    // 该行唯一的卡就是这一张：卡高取「卡片外框减掉两圈描边」，与排版内部取的是同一个数
    const cardBox = layout.slots.find(slot => slot.card)?.card;
    expect(cardBox).toBeDefined();

    expect(
      measureArrangeLineHeight({
        cardHeightPx: (cardBox?.h ?? 0) - 2,
        fontScale: 1,
        buttonSize: 40,
      })
    ).toBe(layout.height);
  });

  it('容器更宽时行被拉伸到容器宽（内容宽不足时仍撑满）', () => {
    const line = makeLine();
    const narrow = layoutArrangeLine(line, layoutOptions({ containerWidth: 300 }));
    const wide = layoutArrangeLine(line, layoutOptions({ containerWidth: 900 }));
    expect(wide.width).toBeGreaterThan(narrow.width);
    expect(narrow.width).toBeGreaterThanOrEqual(300);
  });

  it('行末删除钮不与任何槽位重叠 —— 含容器窄到内容占满行宽的情形', () => {
    // 窄容器是重叠最容易出现的场景：内容顶到行右端时，无条件贴右端的删除钮会压在行尾添加槽上
    const line = makeLine({ chars: 'abcdefgh' });
    const layout = layoutArrangeLine(line, layoutOptions({ containerWidth: 120 }));
    const { deleteRect } = layout;

    for (const slot of layout.slots) {
      const overlaps = slot.rect.x < deleteRect.x + deleteRect.w && deleteRect.x < slot.rect.x + slot.rect.w;
      expect(overlaps).toBe(false);
    }
  });

  it('容器足够宽时删除钮贴内容区右沿（右端留白与行首那一侧同源）', () => {
    const line = makeLine({ chars: 'ab' });
    const layout = layoutArrangeLine(line, layoutOptions({ containerWidth: 900 }));
    const lastSlot = layout.slots.at(-1)!;
    // 行框内边距在两端都生效：右端留白 = 行号距左沿的那一段（同一个 lineInset）
    expect(layout.lineRect.w - (layout.deleteRect.x + layout.deleteRect.w)).toBe(layout.lineIndexRect.x);
    expect(layout.deleteRect.x).toBeGreaterThan(lastSlot.rect.x + lastSlot.rect.w);
  });

  it('空行只挂行首一枚添加槽，有内容的行两端各一枚', () => {
    const empty = layoutArrangeLine(makeLine({ chars: '' }), layoutOptions());
    const filled = layoutArrangeLine(makeLine(), layoutOptions());

    expect(empty.slots.filter(slot => slot.kind === 'add-start')).toHaveLength(1);
    expect(empty.slots.filter(slot => slot.kind === 'add-end')).toHaveLength(0);
    expect(filled.slots.filter(slot => slot.kind === 'add-end')).toHaveLength(1);
  });
});

describe('排列区行排版：命中与所见同源', () => {
  /** 取一个矩形的中心点（命中测试的入参是行局部坐标） */
  const centerOf = (rect: { x: number; y: number; w: number; h: number }) => ({
    x: rect.x + rect.w / 2,
    y: rect.y + rect.h / 2,
  });

  it('槽中心命中该槽；行内空白处不命中任何元件', () => {
    const line = makeLine();
    const layout = layoutArrangeLine(line, layoutOptions());
    const slot = layout.slots[1]!;
    const { x, y } = centerOf(slot.rect);

    const hit = hitTestArrangeLine(layout, x, y);
    expect(hit?.kind).toBe('slot');
    expect(hit?.kind === 'slot' && hit.slot.slotKey).toBe(slot.slotKey);

    // 行号左侧（内容区左沿之外）是行框内边距，不该命中任何槽
    expect(hitTestArrangeLine(layout, 1, y)).toBeNull();
  });

  it('行末删除钮中心命中 delete-line（且不属于任何槽）', () => {
    const line = makeLine();
    const layout = layoutArrangeLine(line, layoutOptions());
    const { x, y } = centerOf(layout.deleteRect);
    const hit = hitTestArrangeLine(layout, x, y);
    expect(hit?.kind).toBe('delete-line');
    expect(hitSlotKey(hit)).toBeNull();
  });

  it('绑了和弦的槽才带清除钮，其中心命中 slot-remove（且优先于槽本体）', () => {
    const chord = chordOf();
    const charChords = new Map([[0, chord]]);
    const line = makeLine();
    const layout = layoutArrangeLine(line, layoutOptions({ charChords }));

    const plain = layout.slots.find(slot => slot.kind === 'char' && !slot.chord);
    const withChord = layout.slots.find(slot => slot.kind === 'char' && slot.chord);
    expect(plain?.removeButton).toBeUndefined();
    expect(withChord?.removeButton).toBeDefined();

    const { x, y } = centerOf(withChord!.removeButton!);
    const hit = hitTestArrangeLine(layout, x, y);
    expect(hit?.kind).toBe('slot-remove');
    expect(hit?.kind === 'slot-remove' && hit.slot.slotKey).toBe(withChord!.slotKey);
    // 清除钮与槽本体算**同一个槽**：只认槽本体的话，指针一移到钮上就会被判成「不在任何槽上」，
    // 那枚钮当场消失、槽级 hover 也闪断（用户报的正是这个）
    expect(hitSlotKey(hit)).toBe(withChord!.slotKey);
  });
});
