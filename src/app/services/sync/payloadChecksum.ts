/**
 * 云端载荷校验和（MD5）与最新修改时间戳的**计算**入口：上传时作为独立 meta 载体落盘
 *（github/gitee/webdav 的 `.meta.json`、server 的 query + `/meta`），启动比对只读这份最小元数据。
 */
import { md5 } from 'js-md5';

import { serializeForStorage } from '@/platform/utils/common';

import type { ImportExportPayload } from '@/app/types';

/**
 * 计算载荷内容的 MD5 校验和。
 * 剔除元数据字段自身后再序列化，保证校验和只覆盖真实数据：
 * dataMd5 / dataUpdatedAt 避免历史包重传时把旧校验和算进新校验和（两侧永远比不齐）；
 * absentSections 是校验层写入的「缺分区」传输标记（非数据，见 ImportExportPayload.absentSections），
 * deletedAt 是删除水位线（元数据，见 ImportExportPayload.deletedAt）——
 * 留着它们会让同一个包因标记/水位不同算出不同校验和。
 * 上传与启动比对两侧走同一路径（同一 validate 归一化 + 同一序列化 + 同一哈希），
 * 数据一致时校验和必然一致。
 */
export const computePayloadMd5 = (payload: ImportExportPayload): string => {
  const content: ImportExportPayload = { ...payload };
  delete content.dataMd5;
  delete content.dataUpdatedAt;
  delete content.absentSections;
  delete content.deletedAt;
  return md5(serializeForStorage(content));
};

/**
 * 取载荷内所有实体的最新修改时间戳（max updatedAt）；无任何实体时间戳时返回 0。
 * 额外并入 deletedAt（删除水位线）：「删掉库里最新一条实体」时存活实体的 max(updatedAt)
 * 会回退到删除前的旧值，不并入水位线的话方向判定会误以为「云端较新」而引导拉取刚删的数据。
 * 上传时与 MD5 一起写入独立 meta（meta.updatedAt），供启动比对判断「本地 / 云端」哪边更新。
 */
export const computePayloadMaxUpdatedAt = (payload: ImportExportPayload): number => {
  let max = 0;
  for (const entity of [...payload.groups, ...payload.chords, ...(payload.songs ?? [])])
    if (typeof entity.updatedAt === 'number' && entity.updatedAt > max) max = entity.updatedAt;

  if (typeof payload.deletedAt === 'number' && payload.deletedAt > max) max = payload.deletedAt;

  return max;
};
