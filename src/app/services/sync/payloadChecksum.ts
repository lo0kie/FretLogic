/**
 * 云端载荷校验和（MD5）：上传时随载荷写入 dataMd5，供启动时与本地数据比对判定是否一致。
 */
import { md5 } from 'js-md5';

import { serializeForStorage } from '@/platform/utils/common';

import type { ImportExportPayload } from '@/app/types';

/**
 * 计算载荷内容的 MD5 校验和。
 * 剔除 dataMd5 / dataUpdatedAt 两个元数据字段自身后再序列化，保证校验和只覆盖真实数据（避免自引用）：
 * 上传与启动比对两侧走同一路径（同一 validate 归一化 + 同一序列化 + 同一哈希），
 * 数据一致时校验和必然一致。
 */
export const computePayloadMd5 = (payload: ImportExportPayload): string => {
  const content: ImportExportPayload = { ...payload };
  delete content.dataMd5;
  delete content.dataUpdatedAt;
  return md5(serializeForStorage(content));
};

/**
 * 取载荷内所有实体的最新修改时间戳（max updatedAt）；无任何实体时间戳时返回 0。
 * 上传时随包写入 dataUpdatedAt，供启动比对时判断「本地 / 云端」哪边更新。
 */
export const computePayloadMaxUpdatedAt = (payload: ImportExportPayload): number => {
  let max = 0;
  for (const entity of [...payload.groups, ...payload.chords, ...(payload.songs ?? [])]) {
    if (typeof entity.updatedAt === 'number' && entity.updatedAt > max) max = entity.updatedAt;
  }
  return max;
};
