/**
 * 数据删除水位线：记录最近一次实体删除（和弦/分组/乐谱）的时间戳。
 *
 * 为什么需要它：同步方向判定读 meta.updatedAt = max(载荷内**存活**实体的 updatedAt)。
 * 「删掉库里最新的一条实体」这种操作不留下任何时间戳——其余实体都没变，本地 max(updatedAt)
 * 反而回退到删除前的旧值，启动比对就会误判「云端较新」并引导拉取，把刚删的数据又拉回来。
 * 水位线把删除动作本身变成一个可比较的时间戳（随备份包 deletedAt 字段走完整同步链路），
 * 保证 meta.updatedAt 单调不减，方向判定不再被删除操作骗过。
 */
import { STORAGE_KEYS } from '@/platform/utils/constants';

import { kvGet, kvSet } from './idbKv';

/** 读当前水位线；从未删除过任何实体时返回 0。
 *  kv 层是 string 通道（见 idbKv 的 kvGet/kvSet）：写入 String(at)、读取 Number() 回解析；
 *  空值/脏值经 Number() 得 0 或 NaN，由下面的有限性判断挡掉 */
export const getDataDeletedAt = (): number => {
  const at = Number(kvGet(STORAGE_KEYS.DATA_DELETED_AT));
  return Number.isFinite(at) && at > 0 ? at : 0;
};

/** 记录一次删除。水位线只前进不后退：与当前值取 max，保证 meta.updatedAt 单调。 */
export const markDataDeleted = (at: number = Date.now()): void => {
  if (at > getDataDeletedAt()) kvSet(STORAGE_KEYS.DATA_DELETED_AT, String(at));
};
