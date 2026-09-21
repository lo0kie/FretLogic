/**
 * 同步后端的展示元数据（中文名 + 图标 + 顺序）——单一事实源。
 *
 * 单独成模块而不是并入 registry.ts：registry 静态引入四个 provider 工厂，而顶栏（同步目标菜单）
 * 是首屏闭包的一部分、provider 只在真正同步时才按需加载。展示表放这里， eager 侧只需这几个字面量。
 *
 * 此前同一份事实在四处各抄一遍（顶栏标签表、顶栏图标表、同步目标子菜单、同步弹窗分段项，
 * 首访引导是第五份标签表）：新增一种后端要改 4~5 个文件，且「未登记的 kind」兜底极性互不相同
 * （顶栏回落成「线上服务器」、首访引导回落成「Gitee」），坏数据会被静默伪装成某个真实后端。
 */

import type { SyncProviderKind } from './provider';
import type { IconName } from '@/platform/ui/icons/icons.registry';

export const SYNC_PROVIDER_META: Record<SyncProviderKind, { label: string; icon: IconName }> = {
  server: { label: '线上服务器', icon: 'server' },
  github: { label: 'GitHub', icon: 'github' },
  gitee: { label: 'Gitee', icon: 'git-branch' },
  webdav: { label: 'WebDAV', icon: 'folder-sync' },
};

/** 展示顺序：顶栏「同步目标」子菜单与同步弹窗分段控件共用同一排列 */
export const SYNC_PROVIDER_ORDER: readonly SyncProviderKind[] = ['server', 'github', 'gitee', 'webdav'];

/** kind 是否已登记（备份包里的 syncTarget 是外来纯字符串，必须先判别再查表） */
export const isSyncProviderKind = (value: unknown): value is SyncProviderKind =>
  typeof value === 'string' && value in SYNC_PROVIDER_META;

/** 取展示元数据；缺失/未登记的 kind 显式标「未知」，不回落成某个真实后端的名字 */
export const getSyncProviderMeta = (kind?: string | null): { label: string; icon: IconName } =>
  isSyncProviderKind(kind) ? SYNC_PROVIDER_META[kind] : { label: '未知', icon: 'cloud' };

/** 取展示名（只需文案的调用点用这个） */
export const getSyncProviderLabel = (kind?: string | null): string => getSyncProviderMeta(kind).label;
