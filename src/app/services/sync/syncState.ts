/**
 * 云同步进行中状态（模块级单例 refs）。
 * 独立成小模块：useSyncService 状态壳与 syncActions 懒加载实现共享同一组状态，
 * 两端读写完全一致，且壳层无需引入任何同步动作依赖。
 */
import { ref } from 'vue';

export const isSyncing = ref(false);
export const isPulling = ref(false);
export const isTestingConnection = ref(false);
