import { describe, expect, it } from 'vitest';

import { computePayloadMaxUpdatedAt, computePayloadMd5 } from '@/app/services/sync/payloadChecksum';

import type { ImportExportPayload } from '@/app/types';

const basePayload: ImportExportPayload = {
  version: 6,
  groups: [],
  chords: [],
  songs: [],
};

describe('computePayloadMd5 云端数据校验和', () => {
  it('同一载荷计算出的校验和是确定性的', () => {
    expect(computePayloadMd5(basePayload)).toBe(computePayloadMd5({ ...basePayload }));
  });

  it('剔除 dataMd5 / dataUpdatedAt 元数据后计算，避免自引用导致校验和循环', () => {
    const withChecksum: ImportExportPayload = { ...basePayload, dataMd5: 'any', dataUpdatedAt: 123 };
    // 无论两个元数据字段是否已存在，校验和都只覆盖真实数据，结果一致
    expect(computePayloadMd5(withChecksum)).toBe(computePayloadMd5(basePayload));
  });

  it('内容变化时校验和随之变化', () => {
    const changed: ImportExportPayload = { ...basePayload, version: 4 };
    expect(computePayloadMd5(changed)).not.toBe(computePayloadMd5(basePayload));
  });
});

describe('computePayloadMaxUpdatedAt 载荷最新修改时间戳', () => {
  it('取所有实体 updatedAt 的最大值，空载荷返回 0', () => {
    expect(computePayloadMaxUpdatedAt(basePayload)).toBe(0);
    const payload: ImportExportPayload = {
      version: 6,
      groups: [{ id: 'g1', name: 'A', sortRule: 'ROOT_PITCH', createdAt: 1, updatedAt: 200 }],
      chords: [
        {
          id: 'c1',
          chordName: 'C',
          strings: [],
          fretCount: 3,
          fretOffset: 0,
          groupId: 'g1',
          tuning: 'STANDARD',
          createdAt: 1,
          updatedAt: 500,
        },
      ],
      songs: [],
    };
    expect(computePayloadMaxUpdatedAt(payload)).toBe(500);
  });
});
