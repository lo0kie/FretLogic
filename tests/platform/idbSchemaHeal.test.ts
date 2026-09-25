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

/** 删掉整个库（自愈用例要从低版本重新造盘，不能踩在别的用例留下的当前版本库上） */
const deleteDb = (): Promise<void> =>
  new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });

/**
 * 造一个「版本落后于当前 DB_VERSION、且 chords 上带着 SCHEMA 已不再声明的死索引」的库。
 * 死索引（nameKey）的 keyPath 在实体上根本不存在 —— Chord 用的是 nameSegments —— 故它恒为空，
 * 按它查询会静默返回空结果。它只在版本变化时的 upgrade 里才可能被清掉。
 */
const seedDbWithStaleIndex = (): Promise<void> =>
  new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION - 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      const chords = db.createObjectStore('chords', { keyPath: 'id' });
      chords.createIndex('nameKey', 'nameKey'); // 死索引：SCHEMA 里已不再声明
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

  // 放在最后：本用例要从零重造一个低版本库，会踩掉前面用例留下的当前版本库
  it('老库上 SCHEMA 已不再声明的死索引在升级时被删除（只加不删会永久残留）', async () => {
    await idb.close();
    await deleteDb();
    await seedDbWithStaleIndex();
    expect(await readDiskIndexNames('chords')).toEqual(['nameKey']);

    // 触发 openDb：按当前 DB_VERSION 打开，2 → 3 的 upgrade 里既有补建也有陈旧索引清理
    await idb.getAllKeys('groups');

    const after = await readDiskIndexNames('chords');
    expect(after).not.toContain('nameKey');
    expect(after).toContain('groupId');
  });
});
