import { describe, expect, it } from 'vitest';

import { computePayloadMaxUpdatedAt, computePayloadMd5 } from '@/app/services/sync/payloadChecksum';
import { toChordId, toGroupId } from '@/domains/chord/theory/entityFactories';
import { nameToSegments, Tuning } from '@/domains/chord/theory/theory';
import { GroupSortRule } from '@/domains/chord/types';

import type { ImportExportPayload } from '@/app/types';

const basePayload: ImportExportPayload = {
  version: 6,
  groups: [],
  chords: [],
  songs: [],
};

describe('computePayloadMd5 云端数据校验和', () => {
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

  it('剔除 absentSections / deletedAt 后计算：两者都是协议元数据，不属于数据本体', () => {
    // 这两条此前**没有任何断言** —— 把 payloadChecksum.ts 里那两行 delete 删掉仍全绿
    //（absentSections 在本文件出现 0 次、deletedAt 只出现在 maxUpdatedAt 用例里）。
    // 必须剔除：absentSections 描述「包里缺哪些分区」、deletedAt 是删除水位线，
    // 同一份数据不该因这两者的差异算出不同校验和（否则跨设备比对会凭空报不一致）。
    const withMeta: ImportExportPayload = { ...basePayload, absentSections: ['songs'], deletedAt: 900 };
    expect(computePayloadMd5(withMeta)).toBe(computePayloadMd5(basePayload));

    // 反方向锚点：真的数据变了必须变 —— 否则上一条会被「实现恒返回同一个值」蒙过去
    const withSong: ImportExportPayload = {
      ...basePayload,
      songs: [{ id: 's1', title: 't', lyrics: '', lineIds: [], chordMap: new Map(), createdAt: 1, updatedAt: 1 }],
    } as unknown as ImportExportPayload;
    expect(computePayloadMd5(withSong)).not.toBe(computePayloadMd5(basePayload));
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

  it('并入删除水位线 deletedAt：删掉最新实体后时间戳不得回退', () => {
    // 这是「防拉回刚删数据」的唯一防线：删掉库里 updatedAt 最大的那条实体后，存活实体的
    // max(updatedAt) 会回退到删除前的旧值，方向判定就会以为「云端较新」、引导用户拉取，
    // 把刚删掉的实体灌回来。并入水位线后，删完仍保持删除时刻的值（单调不回退）。
    const afterDeletingLatest: ImportExportPayload = { ...basePayload, deletedAt: 900 };
    expect(computePayloadMaxUpdatedAt(afterDeletingLatest)).toBe(900);

    // 反方向也要成立：水位线比实体时间戳旧时不得把结果压低（取二者较大者，而非无条件采用水位线）
    const entityIsNewer: ImportExportPayload = { ...basePayload, deletedAt: 100 };
    expect(computePayloadMaxUpdatedAt(entityIsNewer)).toBe(100);
    expect(
      computePayloadMaxUpdatedAt({
        ...entityIsNewer,
        groups: [{ id: toGroupId('g1'), name: 'A', sortRule: GroupSortRule.ROOT_PITCH, createdAt: 1, updatedAt: 700 }],
      })
    ).toBe(700);
  });
});
