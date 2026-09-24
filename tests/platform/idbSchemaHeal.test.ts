import { describe, expect, it } from 'vitest';

import { createChord } from '@/domains/chord/theory/entityFactories';
import { nameToSegments, Tuning } from '@/domains/chord/theory/theory';
import { DB_NAME, DB_VERSION, idb } from '@/platform/services/storage/idb';

import type { Chord } from '@/domains/chord/types';

/**
 * 在代码侧打开库之前，先用裸连接造出一个「版本号已是当前版本、但 chords 库缺 groupId 索引」的磁盘库。
 * 这正是自愈要处理的形态：`onupgradeneeded` 只在版本变化时触发，索引缺口不会自己补上。
 * 五个对象库都要建齐（否则缺库也会触发 bump，测的就不是索引这一条判据了）。
 */
const seedDbMissingChordIndex = (): Promise<void> =>
  new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      db.createObjectStore('chords', { keyPath: 'id' }); // 故意不建 groupId 索引
      db.createObjectStore('groups', { keyPath: 'id' });
      db.createObjectStore('songs', { keyPath: 'id' });
      db.createObjectStore('syncMeta', { keyPath: 'name' });
      db.createObjectStore('kv', { keyPath: 'key' });
    };
    request.onsuccess = () => {
      request.result.close();
      resolve();
    };
    request.onerror = () => reject(request.error);
  });

/** 直接问磁盘库：某对象库当前有哪些索引 */
const readDiskIndexNames = (storeName: string): Promise<string[]> =>
  new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME);
    request.onsuccess = () => {
      const db = request.result;
      const names = db.transaction(storeName).objectStore(storeName).indexNames;
      const result: string[] = [];
      for (let i = 0; i < names.length; i += 1) {
        const name = names.item(i);
        if (name) result.push(name);
      }
      db.close();
      resolve(result);
    };
    request.onerror = () => reject(request.error);
  });

/** 直接问磁盘库：当前版本号（用于验证「无缺口时不无谓 bump」） */
const readDiskVersion = (): Promise<number> =>
  new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME);
    request.onsuccess = () => {
      const version = request.result.version;
      request.result.close();
      resolve(version);
    };
    request.onerror = () => reject(request.error);
  });

const makeChord = (id: string, groupId: string): Chord =>
  createChord({
    nameSegments: nameToSegments('C'),
    strings: [
      { fret: -1, preferFlat: false },
      { fret: 3, preferFlat: false },
      { fret: 2, preferFlat: false },
      { fret: 0, preferFlat: false },
      { fret: 1, preferFlat: false },
      { fret: 0, preferFlat: false },
    ],
    fretCount: 3,
    groupId,
    tuning: Tuning.STANDARD,
    rootStringIndex: 5,
    id,
  });

describe('IDB schema 自愈', () => {
  it('库版本号已对齐但缺索引时，照样 bump 重开补建索引', async () => {
    await seedDbMissingChordIndex();
    expect(await readDiskIndexNames('chords')).toEqual([]);

    // 触发 openDb：只按「缺库」判自愈的实现会认为无事可做，索引永远补不上
    await idb.put('chords', makeChord('c1', 'g1'));

    expect(await readDiskIndexNames('chords')).toContain('groupId');
    // 索引真的可用才算补上：缺索引时按它查询恒返回空，是一条静默的错误路径
    expect((await idb.getAllByIndex('chords', 'groupId', 'g1')).map(c => c.id)).toEqual(['c1']);
  });

  it('schema 无缺口时不做无谓的版本 bump（否则每次开库都抬高一次版本号）', async () => {
    await idb.getAllKeys('groups');
    const before = await readDiskVersion();

    await idb.close();
    await idb.getAllKeys('groups');

    expect(await readDiskVersion()).toBe(before);
  });
});
