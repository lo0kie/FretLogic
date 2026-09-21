/**
 * platform/utils 公共出口：通用基础工具。
 *
 * 按职责模块组织——每个模块是一个入口文件，承载一组同职责工具：
 *   common / constants / logger / prefetch        基础件
 *   pinyin（例外表在仓库根 data/pinyin-overrides.json，脚本生成、经 @data 别名注入）  拼音
 *   cache                                          LRU 缓存 + 缓存统计注册表
 *   dom                                            布局查询 / 尺寸观察 / 滚轮归一 / 淡出遮罩 / 插槽文本
 *   motion                                         减弱动效 / 滚动行为 / transition 操作 / 翻页对位
 *   output                                         Canvas→Blob / PDF 合成 / 分页打印
 *   transfer                                       分享链接 / 设置校验 / 文件选取
 */

// 基础件
export * from './common';
export * from './constants';
export * from './logger';
export * from './prefetch';

// 拼音（例外表已迁到仓库根 data/pinyin-overrides.json，由脚本生成后经 @data 别名注入）
export * from './pinyin';

// 职责模块
export * from './cache';
export * from './dom';
export * from './motion';
export * from './output';
export * from './transfer';
