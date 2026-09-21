import { describe, expect, it } from 'vitest';

import { computePayloadMaxUpdatedAt, computePayloadMd5 } from '@/app/services/sync/payloadChecksum';
import { toChordId, toGroupId } from '@/domains/chord/theory/entityFactories';
import { GroupSortRule } from '@/domains/chord/types';
import { nameToSegments, Tuning } from '@/domains/chord/theory/theory';

import type { ImportExportPayload } from '@/app/types';

const basePayload: ImportExportPayload = {
  version: 6,
  groups: [],
  chords: [],
  songs: [],
};

describe('computePayloadMd5 云端数据校验和', () => {
  it('同一载荷计算出的校验和是确定性的', () => {
    // 守卫哨兵：断言「同内容不同引用 → 同校验和」。它守不住序列化细节是否正确（纯常量实现也能过），
    // 但实现若丢掉哈希或引入不稳定输入即红，故保留；取值正确性由下方已知向量锁定
    expect(computePayloadMd5(basePayload)).toBe(computePayloadMd5({ ...basePayload }));
  });

  it('已知向量：固定载荷的校验和取值锁定', () => {
    // 已知向量 = md5(JSON.stringify({version:6,groups:[],chords:[],songs:[]}))，
    // 经 node crypto 与 js-md5 两个独立实现复算一致。
    // 这是本文件唯一能锁住「校验和取值正确」（而非仅「稳定」）的断言：
    // 实现若改动序列化方式（key 序、字段增删、Map 展开规则），此值必变
    expect(computePayloadMd5(basePayload)).toBe('8df2a3ba5e28248a23d29a5098858fe0');
  });

  it('剔除 dataMd5 / dataUpdatedAt 元数据后计算，避免自引用导致校验和循环', () => {
    const withChecksum: ImportExportPayload = { ...basePayload, dataMd5: 'any', dataUpdatedAt: 123 };
    // 无论两个元数据字段是否已存在，校验和都只覆盖真实数据，结果一致
    expect(computePayloadMd5(withChecksum)).toBe(computePayloadMd5(basePayload));
  });

  it('内容变化时校验和随之变化', () => {
    const changed: ImportExportPayload = { ...basePayload, version: 4 };
    // 守卫哨兵：只断「输入变化 → 校验和变化」（敏感性方向），取值由上方已知向量锁定
    expect(computePayloadMd5(changed)).not.toBe(computePayloadMd5(basePayload));
  });
});

describe('computePayloadMaxUpdatedAt 载荷最新修改时间戳', () => {
  it('取所有实体 updatedAt 的最大值，空载荷返回 0', () => {
    expect(computePayloadMaxUpdatedAt(basePayload)).toBe(0);
    const payload: ImportExportPayload = {
      version: 6,
      groups: [{ id: toGroupId('g1'), name: 'A', sortRule: GroupSortRule.ROOT_PITCH, createdAt: 1, updatedAt: 200 }],
      chords: [
        {
          id: toChordId('c1'),
          nameSegments: nameToSegments('C'),
          strings: [],
          fretCount: 3,
          fretOffset: 0,
          groupId: toGroupId('g1'),
          tuning: Tuning.STANDARD,
          rootStringIndex: null,
          createdAt: 1,
          updatedAt: 500,
        },
      ],
      songs: [],
    };
    expect(computePayloadMaxUpdatedAt(payload)).toBe(500);
  });
});
