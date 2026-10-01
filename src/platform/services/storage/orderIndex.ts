/**
 * 顺序索引基础设施（业务无关，消费方为各域仓储）。
 *
 * 成因：IndexedDB 的 getAll 按主键序返回记录；当主键是随机 id、顺序信息又不在实体字段里时，
 * 手动拖拽产生的顺序无法承载在每次读取里 —— 顺序必须独立持久化为一条元记录
 * （存 syncMeta 库：name 为主键、ids 为顺序序列）。
 *
 * 此前各域仓储各自重复实现的三条不变量在此收敛：
 * 1. 元记录形状：{ name, ids }，name 在定义处绑定；
 * 2. 载入侧重排：索引命中者按索引序在前，索引缺失/漂移的记录追加尾部 —— 绝不因索引损坏而丢实体；
 * 3. 落库侧 diff：以顺序签名为基准，顺序变了才写元记录（实体 put 是按 id 覆盖、不带顺序信息，
 *    纯换序在实体侧 diff 里完全静默，顺序只能靠这条元记录落地）。
 */

/** 顺序索引元记录：name 为主键（syncMeta 库 keyPath），ids 为实体 id 的顺序序列 */
export interface OrderIndexMeta<K extends string = string> {
  name: K;
  ids: string[];
}

/** 一条顺序索引的定义：绑定元记录主键（syncMeta.name 的取值）与元记录构造入口 */
export interface OrderIndexDef<K extends string> {
  /** 元记录在 syncMeta 库中的主键 */
  key: K;
  /** 构造元记录（ids 按调用方数组原样引用，落库时由 IDB structuredClone） */
  createMeta: (ids: string[]) => OrderIndexMeta<K>;
}

export const defineOrderIndex = <K extends string>(key: K): OrderIndexDef<K> => ({
  key,
  createMeta: ids => ({ name: key, ids }),
});

/** 顺序签名字符串：id 之间用不可能出现在 id 里的分隔符，避免拼接歧义 */
export const orderIndexSignature = (ids: readonly string[]): string => ids.join('\u0000');

/**
 * 落库侧顺序镜像：记录上次成功落库的顺序签名，供「顺序变了才写元记录」的 diff 判断。
 * 失败安全：markSaved 必须只在落库事务成功提交后调用 —— 事务失败时旧基准保留，
 * 下一次落库以旧基准重试完整 diff，不漏写。
 */
export interface OrderIndexTracker {
  /** ids 与上次基准是否不同 */
  isChanged(ids: readonly string[]): boolean;
  /** 覆写基准：load 初始化与落库成功提交后调用 */
  markSaved(ids: readonly string[]): void;
}

export const createOrderIndexTracker = (): OrderIndexTracker => {
  let lastSignature = '';
  return {
    isChanged: ids => orderIndexSignature(ids) !== lastSignature,
    markSaved: ids => {
      lastSignature = orderIndexSignature(ids);
    },
  };
};

/**
 * 按顺序索引重排实体：索引命中者按索引序在前、索引缺失或漂移的记录追加尾部。
 * 元记录 ids 与实体的对应关系由 getEntityId 提供；索引数组里的非字符串项跳过。
 * 不变量：绝不因索引损坏而丢实体 —— metaIds 非数组或全部未命中时，退化为实体的原有序列。
 */
export const orderEntitiesByIndex = <T>(
  entities: readonly T[],
  metaIds: unknown,
  getEntityId: (entity: T) => string
): T[] => {
  if (!Array.isArray(metaIds)) return [...entities];
  const byId = new Map(entities.map(entity => [getEntityId(entity), entity] as const));
  const ordered: T[] = [];
  for (const id of metaIds) {
    if (typeof id !== 'string') continue;
    const entity = byId.get(id);
    if (!entity) continue;
    byId.delete(id);
    ordered.push(entity);
  }
  return [...ordered, ...byId.values()];
};
