import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import ScorePreviewPane from '@/domains/score/preview/components/ScorePreviewPane.vue';
import { useScoreEditorStore } from '@/domains/score/editor/store/scoreEditorStore';
import { useSongStore } from '@/domains/score/library/store/songStore';
import * as workerExportService from '@/domains/score/preview/services/workerExportService';

describe('ScorePreviewPane 切换乐谱防闪烁与旧谱残留守卫', () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
    vi.restoreAllMocks();

    let objectUrlCounter = 0;
    globalThis.URL.createObjectURL = vi.fn(() => `blob:mock-url-${++objectUrlCounter}`);
    globalThis.URL.revokeObjectURL = vi.fn();
  });

  it('切歌时旧乐谱图应立即被清空或同步置换为缓存，绝不在界面上残留上一张乐谱', async () => {
    const songStore = useSongStore();
    const editor = useScoreEditorStore();

    const songA = songStore.createSong('歌曲A');
    songStore.updateSongMeta(songA.id, { lyrics: '歌词A1\n歌词A2', lineIds: ['la1', 'la2'] });

    const songB = songStore.createSong('歌曲B');
    songStore.updateSongMeta(songB.id, { lyrics: '歌词B1\n歌词B2', lineIds: ['lb1', 'lb2'] });

    // Mock Worker 导出：返回虚拟 blob
    let resolveExport: (val: { blobs: Blob[]; durationMs: number }) => void = () => {};
    vi.spyOn(workerExportService, 'runWorkerExport').mockImplementation(
      () =>
        new Promise(resolve => {
          resolveExport = resolve;
        })
    );

    editor.setActiveSong(songA.id);
    const wrapper = mount(
      {
        components: { ScorePreviewPane },
        template: '<KeepAlive><ScorePreviewPane /></KeepAlive>',
      },
      {
        global: {
          directives: {
            'wheel-scroll': {},
          },
        },
      }
    );
    await wrapper.vm.$nextTick();

    // 触发首次生成：A 开始渲染，尚未完成
    expect(wrapper.findAll('img')).toHaveLength(0);
    expect(wrapper.text()).toContain('正在生成预览');

    // Worker 导出完成，A 渲染出图片
    resolveExport({ blobs: [new Blob(['pageA'])], durationMs: 10 });
    await wrapper.vm.$nextTick();
    await wrapper.vm.$nextTick();

    const imgsA = wrapper.findAll('img');
    expect(imgsA).toHaveLength(1);
    const urlA = imgsA[0]!.attributes('src');
    expect(urlA).toContain('blob:mock-url-');

    // 关键步骤：在预览模式下直接切歌 A -> B（未命中缓存的新歌）
    editor.setActiveSong(songB.id);
    await wrapper.vm.$nextTick();

    // 核心断言：切歌瞬间，上一张乐谱 A 的图片必须被立即清空，绝不能残留！
    expect(wrapper.findAll('img')).toHaveLength(0);
    expect(wrapper.text()).toContain('正在生成预览');

    // Worker 完成 B 的渲染
    resolveExport({ blobs: [new Blob(['pageB'])], durationMs: 10 });
    await wrapper.vm.$nextTick();
    await wrapper.vm.$nextTick();

    const imgsB = wrapper.findAll('img');
    expect(imgsB).toHaveLength(1);
    const urlB = imgsB[0]!.attributes('src');
    expect(urlB).not.toBe(urlA);

    // 关键步骤 2：再次切回歌曲 A（此时命中会话级缓存 previewCache）
    editor.setActiveSong(songA.id);
    await wrapper.vm.$nextTick();

    // 核心断言：命中缓存时立即同步展示 A 的图片（0ms 闪电切换，无 loading，更无残留 B）
    const imgsA2 = wrapper.findAll('img');
    expect(imgsA2).toHaveLength(1);
    expect(imgsA2[0]!.attributes('src')).toBe(urlA);
  });
});
