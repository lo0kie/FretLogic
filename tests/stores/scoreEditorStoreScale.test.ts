// @vitest-environment jsdom
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';

import { ARRANGE_VIEW_MAX_ZOOM_PERCENT } from '@/domains/score/constants';
import { useScoreEditorStore } from '@/domains/score/editor/store/scoreEditorStore';
import { idb } from '@/platform/services/storage';
import { hydrateIdbKv, kvSet } from '@/platform/services/storage/idbKv';
import { STORAGE_KEYS } from '@/platform/utils/constants';

/**
 * 缩放持久化的**读侧夹取**：滑块是唯一的写入方（区间见 `SCORE_SCALE_MIN/MAX_PERCENT`），但持久化
 * 里可能存着量纲坏掉的值（旧版本、手工改过的 kv、同步回来的别家数据）。那种值一旦直通布局算式与
 * 容器 `zoom`，整屏内容就废了 —— 故读侧必须按维度夹取。
 */
describe('乐谱缩放持久化的读侧夹取', () => {
  beforeEach(async () => {
    // 重置 kv 镜像（IDB kv 库 + 内存 Map），保证用例间小状态隔离
    await idb.clear('kv');
    await hydrateIdbKv();
    setActivePinia(createPinia());
  });

  it('量纲坏掉的持久化值（5000）按维度夹到合法区间，不直通布局算式', async () => {
    await kvSet(STORAGE_KEYS.SCORE_FONT_SCALE, '5000');
    await kvSet(STORAGE_KEYS.SCORE_ARRANGE_VIEW_ZOOM, '5000');

    const scoreEditor = useScoreEditorStore();

    // 字号 / 和弦缩放：合法域是滑块的 60~150
    expect(scoreEditor.previewFontScale).toBe(150);
    // 界面倍率：合法域是手势上下限（50~200）—— 同一个序列化器**按维度**夹取，取并集就会让字号越界
    expect(scoreEditor.arrangeViewZoom).toBe(ARRANGE_VIEW_MAX_ZOOM_PERCENT);
  });

  it('旧版倍率照常迁移为百分制，且迁移结果同样受夹取', async () => {
    await kvSet(STORAGE_KEYS.SCORE_FONT_SCALE, '1.5');
    await kvSet(STORAGE_KEYS.SCORE_FRETBOARD_SCALE, '0.6');

    const scoreEditor = useScoreEditorStore();

    expect(scoreEditor.previewFontScale).toBe(150);
    expect(scoreEditor.previewFretboardScale).toBe(60);
  });
});
