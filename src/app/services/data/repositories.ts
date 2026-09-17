/**
 * 数据仓库层入口：统一 re-export 领域侧的 IDB 仓储实现。
 *
 * 历史说明：本文件曾各自维护一份与领域仓储平行的 IDB 实现（v2 备份链路专用），
 * IDB 成为唯一权威存储后两份实现合并为领域侧单例，这里只保留聚合出口
 * （转录链路 migrateLegacy 经此消费）。
 */
export { chordRepository } from '@/domains/chord/model/chordRepository';
export { songRepository } from '@/domains/score/model/songRepository';
