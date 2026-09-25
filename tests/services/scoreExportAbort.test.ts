import { beforeEach, describe, expect, it } from 'vitest';

import {
  markExportAborted,
  resetExportAbort,
  throwIfAborted,
} from '@/domains/score/preview/workers/scoreExportWorker/scoreExportAbort';
import { RENDER_ABORT_MESSAGE } from '@/domains/score/preview/workers/scoreExportWorker/scoreExportTypes';

describe('渲染中断标志', () => {
  beforeEach(() => resetExportAbort());

  // 同一条「未置位不抛」的两个起点：初始态与「上一笔作废后复位」
  it.each([
    { label: '默认不中断：await 边界的检查点原样放行', arm: () => {} },
    {
      label: '复位后重新放行 —— 新一笔真实请求不被上一笔的作废误伤',
      arm: () => {
        markExportAborted();
        resetExportAbort();
      },
    },
  ])('$label', ({ arm }) => {
    arm();
    expect(() => throwIfAborted()).not.toThrow();
  });

  it('置位后检查点抛出跨线程共用的作废文案', () => {
    markExportAborted();
    expect(() => throwIfAborted()).toThrow(RENDER_ABORT_MESSAGE);
  });
});
