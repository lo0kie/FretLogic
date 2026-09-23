<template>
  <BaseDrawer v-model:visible="visible" :destroy-on-close="false" size="24rem" title="开发面板">
    <div class="flex flex-col gap-1.5 text-xs/relaxed text-fg-body" ref="devListRef">
      <!-- 构建 -->
      <BaseCollapse
        v-bind="headBind('build')"
        v-model:expanded="buildOpen"
        :emphasize-on-expand="false"
        initial-auto
        description="当前产物"
        icon="wrench"
        title="构建"
      >
        <!-- 状态用徽标（附语义色），提交号/构建时间是标识符，保留等宽文本便于比对 -->
        <div class="grid grid-cols-3 gap-xs">
          <div class="rounded-md bg-surface-panel-subtle px-sm py-1.5">
            <div class="text-2xs text-fg-muted">模式</div>
            <BaseBadge
              :content="CLOUD_SYNC_CONFIG.MODE"
              :variant="CLOUD_SYNC_CONFIG.IS_DEV ? 'warning' : 'success'"
              appearance="subtle"
              class="mt-1"
              size="2xs"
              title="当前构建模式"
            />
          </div>
          <div class="rounded-md bg-surface-panel-subtle px-sm py-1.5">
            <div class="text-2xs text-fg-muted">提交</div>
            <div :title="buildCommit" class="mt-0.5 truncate font-mono text-fg-title">{{ shortCommit }}</div>
          </div>
          <div class="rounded-md bg-surface-panel-subtle px-sm py-1.5">
            <div class="text-2xs text-fg-muted">构建时间</div>
            <div :title="builtAt" class="mt-0.5 truncate font-mono text-fg-title">{{ shortBuiltAt }}</div>
          </div>
        </div>

        <BaseDivider class="my-2" />

        <div class="flex flex-col gap-1">
          <div class="text-2xs text-fg-muted">同步与代理地址</div>
          <div v-for="row in buildRows" :key="row.label" class="flex items-center gap-xs">
            <span class="w-14 shrink-0 text-fg-muted">{{ row.label }}</span>
            <span :title="row.value" class="min-w-0 flex-1 truncate font-mono">{{ row.value }}</span>
            <ActionButton
              :aria-label="`复制${row.label}`"
              @click="copyText(row.value, row.label)"
              icon-only
              icon="copy"
              size="sm"
              variant="ghost"
            />
          </div>
        </div>
      </BaseCollapse>

      <!-- 数据概览 -->
      <BaseCollapse
        v-bind="headBind('data')"
        :emphasize-on-expand="false"
        description="本机内容"
        icon="list"
        title="数据"
      >
        <div class="grid grid-cols-3 gap-xs">
          <div v-for="item in dataRows" :key="item.label" class="rounded-md bg-surface-panel-subtle px-sm py-1.5">
            <div class="text-2xs text-fg-muted">{{ item.label }}</div>
            <!-- 条目数即数值读数，统一走徽标（中性色：面板内读数不占用主色，否则满屏品牌色胶囊） -->
            <BaseBadge :content="item.value" appearance="subtle" class="mt-1" size="2xs" variant="neutral" />
          </div>
        </div>
      </BaseCollapse>

      <!-- 内存缓存 -->
      <BaseCollapse
        v-bind="headBind('cache')"
        :emphasize-on-expand="false"
        description="刷新即失"
        icon="chart-column"
        title="内存缓存"
      >
        <div class="flex flex-col gap-1">
          <div class="flex items-center justify-between text-2xs text-fg-muted">
            <span>{{ memoryCaches.length }} 项已登记缓存</span>
            <BaseBadge
              v-if="memoryCacheTotalText"
              :content="`≈ ${memoryCacheTotalText}`"
              appearance="subtle"
              size="2xs"
              title="各缓存字节估算合计（仅统计能给出估算的缓存）"
              variant="neutral"
            />
          </div>
          <div v-for="cache in memoryCacheRows" :key="cache.name" class="flex flex-col gap-0.5">
            <div class="flex items-center justify-between gap-sm">
              <span :title="cache.name" class="min-w-0 truncate">{{ cache.name }}</span>
              <span class="flex shrink-0 items-center gap-xs">
                <!-- 命中率：条数天然不变的全命中缓存与完全没被使用的缓存读数一样，只有它能区分；
                     读数随每次查表变化，故这一行会跟着工作台操作逐秒刷新 -->
                <BaseBadge
                  v-if="cache.hitRateText"
                  :content="cache.hitRateText"
                  :title="cache.hitRateHint"
                  appearance="subtle"
                  size="2xs"
                  variant="neutral"
                />
                <!-- 容量：条数 / 上限（无上限为 ∞），是参照值故走描边形态；
                     满载或多实例聚合溢出时转警示色 -->
                <BaseBadge
                  :content="cache.text"
                  :title="cache.countHint"
                  :variant="cache.full ? 'warning' : 'neutral'"
                  appearance="outline"
                  size="2xs"
                />
                <!-- 同名多份（热替换遗留的旧实例）：份数本身也是读数的一部分 —— 本行读的是最近活跃的一份 -->
                <BaseBadge
                  v-if="cache.instancesText"
                  :content="cache.instancesText"
                  :title="cache.instancesHint"
                  appearance="subtle"
                  size="2xs"
                  variant="neutral"
                />
                <!-- 内存：本条缓存的字节估算（主读数走实底），读不到估算器时不渲染 -->
                <BaseBadge
                  v-if="cache.bytesText"
                  :content="cache.bytesText"
                  :title="cache.bytesHint"
                  appearance="subtle"
                  size="2xs"
                  variant="neutral"
                />
                <ActionButton
                  v-if="cache.clear"
                  @click="clearMemoryCache(cache)"
                  icon-only
                  aria-label="清空该缓存"
                  icon="eraser"
                  size="sm"
                  variant="ghost"
                />
              </span>
            </div>
            <div class="h-0.5 w-full overflow-hidden rounded-full bg-surface-panel-hover">
              <div
                :class="cache.full ? 'bg-tint-warning-40' : 'bg-tint-primary-60'"
                :style="{ width: `${cache.pct}%` }"
                class="h-full rounded-full"
              />
            </div>
          </div>
          <p v-if="memoryCacheRows.length === 0" class="m-0 text-fg-muted">无登记缓存</p>
        </div>
      </BaseCollapse>

      <!-- 存储占用 -->
      <BaseCollapse
        v-bind="headBind('storage')"
        :emphasize-on-expand="false"
        description="持久化"
        icon="folder-open"
        title="存储占用"
      >
        <!-- 指标卡：站点总用量 / 配额（容量读数走徽标） -->
        <div class="grid grid-cols-2 gap-xs">
          <div class="rounded-md bg-surface-panel-subtle px-sm py-1.5">
            <div class="text-2xs text-fg-muted">站点总用量</div>
            <BaseBadge
              :content="originUsageText"
              appearance="subtle"
              class="mt-1"
              size="2xs"
              title="含 IndexedDB / CacheStorage 等站点级存储"
              variant="neutral"
            />
          </div>
          <div class="rounded-md bg-surface-panel-subtle px-sm py-1.5">
            <div class="text-2xs text-fg-muted">配额</div>
            <BaseBadge :content="originQuotaText" appearance="outline" class="mt-1" size="2xs" variant="neutral" />
          </div>
        </div>

        <BaseDivider class="my-2" />

        <!-- 配额占用条：用量 / 配额（接近上限转警示色） -->
        <div class="h-1 w-full overflow-hidden rounded-full bg-surface-panel-hover">
          <div
            :class="originUsageAlert ? 'bg-tint-warning-40' : 'bg-tint-primary-40'"
            :style="{ width: `${originUsagePct}%` }"
            class="h-full rounded-full"
          />
        </div>
        <div class="mt-0.5 flex items-center justify-between gap-sm text-2xs text-fg-muted">
          <span class="flex items-center gap-xs">
            已用
            <BaseBadge
              :content="originUsagePctText"
              :variant="originUsageAlert ? 'warning' : 'neutral'"
              appearance="subtle"
              size="2xs"
              title="站点用量占配额比例"
            />
          </span>
          <BaseBadge
            :content="lsTotalText"
            appearance="subtle"
            size="2xs"
            title="IDB 各对象库记录数 / kv 键数（占用见站点级读数）"
            variant="neutral"
          />
        </div>

        <!-- IDB 对象库明细：记录数，条长表示相对最大库的占比 -->
        <BaseDivider class="my-2" />
        <div class="flex flex-col gap-1">
          <div class="text-2xs text-fg-muted">IndexedDB 明细</div>
          <div v-for="entry in lsEntries" :key="entry.key" class="flex flex-col gap-0.5">
            <div class="flex items-center justify-between gap-sm">
              <span :title="entry.key" class="min-w-0 truncate">{{ entry.key }}</span>
              <BaseBadge :content="entry.text" appearance="subtle" size="2xs" variant="neutral" />
            </div>
            <div class="h-0.5 w-full overflow-hidden rounded-full bg-surface-panel-hover">
              <div :style="{ width: `${entry.pct}%` }" class="h-full rounded-full bg-tint-primary-60" />
            </div>
          </div>
          <p v-if="lsEntries.length === 0" class="m-0 text-fg-muted">无写入</p>
        </div>

        <div class="mt-2 flex justify-end">
          <ActionButton @click="refreshStorageUsage()" icon="refresh-cw" size="sm" variant="ghost">刷新</ActionButton>
        </div>
      </BaseCollapse>

      <!-- 预览缓存 -->
      <BaseCollapse
        v-bind="headBind('preview')"
        :emphasize-on-expand="false"
        description="当前乐谱"
        icon="image"
        title="预览缓存"
      >
        <div class="grid grid-cols-2 gap-xs">
          <div class="rounded-md bg-surface-panel-subtle px-sm py-1.5">
            <div class="text-2xs text-fg-muted">页数</div>
            <BaseBadge
              :appearance="previewValueAppearance"
              :content="previewPageCount"
              class="mt-1"
              size="2xs"
              title="当前乐谱的 A4 分页数"
              variant="neutral"
            />
          </div>
          <div class="rounded-md bg-surface-panel-subtle px-sm py-1.5">
            <div class="text-2xs text-fg-muted">体积</div>
            <BaseBadge
              :appearance="previewValueAppearance"
              :content="previewSizeText"
              class="mt-1"
              size="2xs"
              title="各页 JPEG 字节数合计"
              variant="neutral"
            />
          </div>
        </div>

        <!-- 分页明细：条长表示各页相对大小 -->
        <template v-if="previewPages.length > 0">
          <BaseDivider class="my-2" />
          <div class="flex flex-col gap-1">
            <div class="text-2xs text-fg-muted">分页明细</div>
            <div v-for="page in previewPages" :key="page.label" class="flex flex-col gap-0.5">
              <div class="flex items-center justify-between gap-sm">
                <span class="min-w-0 truncate">{{ page.label }}</span>
                <BaseBadge :content="page.text" appearance="subtle" size="2xs" variant="neutral" />
              </div>
              <div class="h-0.5 w-full overflow-hidden rounded-full bg-surface-panel-hover">
                <div :style="{ width: `${page.pct}%` }" class="h-full rounded-full bg-tint-primary-60" />
              </div>
            </div>
          </div>
        </template>

        <div class="mt-2 flex items-center justify-between gap-sm">
          <span class="text-2xs text-fg-muted">{{ previewHintText }}</span>
          <ActionButton
            v-if="hasPreviewCache"
            @click="handleClearPreviewCache()"
            icon="eraser"
            size="sm"
            variant="ghost"
          >
            清空
          </ActionButton>
        </div>
      </BaseCollapse>

      <!-- 路由跳转 -->
      <BaseCollapse
        v-bind="headBind('route')"
        :emphasize-on-expand="false"
        description="快捷跳转"
        icon="move"
        title="路由"
      >
        <div class="flex flex-col gap-1">
          <div class="flex items-center gap-sm py-sm text-2xs text-fg-muted">
            <span>当前</span>
            <span class="truncate font-mono text-fg-title">{{ route.path }}</span>
          </div>
          <!-- 分段控件承载跳转：选中态即当前分区（子路径归到父分区），点选即 push -->
          <BaseSegmentedControl
            :model-value="activeRoutePath"
            :options="routeOptions"
            @update:model-value="jumpToRoute($event)"
            block
            aria-label="路由快捷跳转"
            size="sm"
          />
        </div>
      </BaseCollapse>

      <!-- 测试数据：一键生成大规模数据集并整体覆盖（仅 dev 构建可见） -->
      <BaseCollapse
        v-bind="headBind('seed')"
        :emphasize-on-expand="false"
        description="一键覆盖"
        icon="server"
        title="测试数据"
      >
        <div class="flex flex-col gap-xs">
          <BaseSegmentedControl
            :model-value="seedScaleKey"
            :options="seedScaleOptions"
            @update:model-value="seedScaleKey = String($event)"
            block
            aria-label="测试数据规模"
            size="sm"
          />
          <p class="m-0 text-2xs text-fg-muted">{{ seedSummaryText }}</p>
          <ActionButton @click="isSeedConfirmOpen = true" color="danger" icon="sparkles" size="sm" variant="subtle">
            生成并覆盖
          </ActionButton>
          <p class="m-0 text-2xs text-fg-muted">整体替换现有和弦库与乐谱，不可恢复。</p>
        </div>
      </BaseCollapse>

      <!-- 危险区：红色语义卡片包裹，与上方常规区块在视觉上强区分 -->
      <BaseCollapse
        v-bind="headBind('danger')"
        :emphasize-on-expand="false"
        description="不可恢复"
        icon="alert-triangle"
        title="危险区"
      >
        <div class="flex flex-col gap-xs rounded-md border border-tint-danger-70 bg-tint-danger-95 p-sm">
          <ActionButton @click="handleDumpStorageKeys()" icon="eraser" size="sm" variant="subtle">
            导出 IDB 键清单
          </ActionButton>
          <!-- 真正破坏性的两个动作走 danger 语义色（导出键清单只是读，保持中性） -->
          <ActionButton
            @click="isWipeIdbConfirmOpen = true"
            color="danger"
            icon="alert-triangle"
            size="sm"
            variant="subtle"
          >
            清空 IndexedDB（刷新后生效）
          </ActionButton>
          <ActionButton @click="handleWipeAndReload()" color="danger" icon="refresh-cw" size="sm" variant="subtle">
            清空 IndexedDB 并重载
          </ActionButton>
          <p class="m-0 text-2xs text-fg-muted">以上操作不可恢复，仅用于本地排查。</p>
        </div>
      </BaseCollapse>
    </div>
  </BaseDrawer>

  <BaseModal
    v-model:visible="isWipeIdbConfirmOpen"
    :confirm-loading="isWipingIdb"
    @confirm="handleWipeIdb()"
    cancel-text="取消"
    confirm-text="清空"
    title="清空 IndexedDB"
  >
    <p class="m-0 py-xs text-xs/relaxed text-fg-body">
      将删除
      <strong class="text-fg-title">fret-logic-v2</strong> 中全部对象库（和弦、分组、乐谱、同步元数据、偏好键值）。
      此操作不可恢复，确定继续吗？
    </p>
  </BaseModal>

  <BaseModal
    v-model:visible="isSeedConfirmOpen"
    :confirm-loading="isSeeding"
    @confirm="handleSeedTestData()"
    cancel-text="取消"
    confirm-text="覆盖"
    title="生成并覆盖测试数据"
  >
    <p class="m-0 py-xs text-xs/relaxed text-fg-body">
      将用 <strong class="text-fg-title">{{ seedSummaryText }}</strong>
      整体替换现有全部和弦库与乐谱。现有数据不可恢复，确定继续吗？
    </p>
  </BaseModal>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, useTemplateRef, watch } from 'vue';

import { useRoute, useRouter } from 'vue-router';

import BaseBadge from '@/platform/ui/badge/BaseBadge.vue';
import ActionButton from '@/platform/ui/button/ActionButton.vue';
import BaseCollapse from '@/platform/ui/collapse/BaseCollapse.vue';
import BaseDivider from '@/platform/ui/divider/BaseDivider.vue';
import BaseDrawer from '@/platform/ui/drawer/BaseDrawer.vue';
import BaseModal from '@/platform/ui/modal/BaseModal.vue';
import BaseSegmentedControl from '@/platform/ui/segmented/BaseSegmentedControl.vue';
import { useChordStore } from '@/domains/chord/store/chordStore';
import { useSongStore } from '@/domains/score/library/store/songStore';
import { clearPreviewCache, currentRenderData } from '@/domains/score/preview/scorePreviewCache';
import { useStickyHeads } from '@/platform/composables/useStickyHeads';
import { idb, SCHEMA } from '@/platform/services/storage/idb';
import { useUiStore } from '@/platform/store/uiStore';
import { createCacheSampler } from '@/platform/utils/cache';
import { clamp, formatBytes } from '@/platform/utils/common';
import { CLOUD_SYNC_CONFIG, ROUTE_PATHS, WEBDAV_SYNC_CONFIG } from '@/platform/utils/constants';

import { buildDevTestData, DEV_TEST_SCALES } from './devSeedData';

import type { StoreName } from '@/platform/services/storage/idb';
import type { CacheStat } from '@/platform/utils/cache';

const visible = defineModel<boolean>('visible', { required: true });

const route = useRoute();
const router = useRouter();
const uiStore = useUiStore();
const chordStore = useChordStore();
const songStore = useSongStore();

const devListRef = useTemplateRef<HTMLElement>('devListRef');

/**
 * 折叠头的吸附是「宿主环境相关」的能力，与侧栏和弦库同源（见 useStickyHeads 的说明）：
 * 一次发现滚动容器、批量判定哪些头被顶在吸附线上，并按吸附头的**实测高度**让开容器顶部羽化带
 * ——面板里的头是默认行高，与侧栏的固定行高不同，写死内缩量必然漂移。
 *
 * 定位几何（sticky / top / z / 底色）仍由本文件的类与 style 下发；收起时「把头按回吸附线」与
 * 滚动钳位补偿由 BaseCollapse 自带的平台 composable 负责，这里不必接线。
 * id 取各段头上的 data-dev-section（DevPanel 是排查工具，顺带给每段一个稳定的 DOM 钩子）。
 */
const { headBind } = useStickyHeads({
  listRef: devListRef,
  idAttribute: 'data-dev-section',
  // 吸附线 = 容器可视上沿：头顶不留间隙，滚过的内容直接被头部自身遮住
  offset: '0px',
  // 有头吸附时：容器顶部羽化带内缩一个头高，让开吸附中的头
  fadeOffset: true,
});

const ROUTE_OPTIONS = [
  { label: '工作台', path: ROUTE_PATHS.WORKBENCH },
  { label: '乐谱', path: ROUTE_PATHS.SCORE },
] as const;

/** 分段控件选项：把 ROUTE_OPTIONS 的 path 映射为通用控件约定的 value（显式标注为 string，
 *  否则 T 会被推断为字面量联合，而 activeRoutePath 含 string 兜底，赋值处类型打架） */
const routeOptions: { label: string; value: string }[] = ROUTE_OPTIONS.map(opt => ({
  label: opt.label,
  value: opt.path,
}));

/** 当前路由所属分区（子路径如 /score/xxx 归到父分区）；不在任何分区内时原样返回，
 *  分段控件自然无选中项而不是错选一个 */
const activeRoutePath = computed(() => {
  const hit = ROUTE_OPTIONS.find(opt => route.path === opt.path || route.path.startsWith(`${opt.path}/`));
  return hit?.path ?? route.path;
});

/** 点选跳转：点当前项不再重复 push */
const jumpToRoute = (path: string) => {
  if (path !== activeRoutePath.value) void router.push(path);
};

const buildOpen = ref(true);

const buildCommit = __BUILD_INFO__.commit;
const buildDate = new Date(__BUILD_INFO__.time);
const builtAt = buildDate.toLocaleString('zh-CN', { hour12: false });
const shortCommit = buildCommit.slice(0, 7);
/** 构建时间压成「M/D HH:mm」：面板窄，完整时间留给 title 悬浮。
 *  显式拼装而非截取本地化字符串——截取会把分钟后的冒号一并带出（9/16 17:49:） */
const shortBuiltAt = `${buildDate.getMonth() + 1}/${buildDate.getDate()} ${String(buildDate.getHours()).padStart(2, '0')}:${String(buildDate.getMinutes()).padStart(2, '0')}`;

const buildRows = [
  { label: '同步', value: CLOUD_SYNC_CONFIG.SERVER_URL },
  { label: '代理', value: WEBDAV_SYNC_CONFIG.DEFAULT_PROXY_URL },
];

/** 数据概览读数：数值转字符串再交给徽标——徽标对数字内容有「超过 max 显示 N+」的截断语义（默认 99），
 *  计数类读数不该被截断，字符串内容不参与该规则 */
const dataRows = computed(() => [
  { label: '和弦组', value: `${chordStore.groups.length}` },
  { label: '和弦', value: `${chordStore.savedChordsList.length}` },
  { label: '乐谱', value: `${songStore.songs.length}` },
]);

const copyText = (value: string, label: string) => {
  void navigator.clipboard.writeText(value);
  uiStore.message.success(`已复制${label}`);
};

/* ---- 内存缓存 ---- */

const memoryCaches = ref<CacheStat[]>([]);

/** 缓存读数采样器：内部保管上次指纹基线，返回 null 表示与上次完全相同。
 *  基线为什么必须由它保管、指纹为什么要带注册表结构版本，见 cacheRegistry 的注释 */
const sampleMemoryCaches = createCacheSampler();

/** 重新采样缓存读数：与上次完全相同则跳过赋值，省掉稳态下每秒一次的无谓重渲染 */
const refreshMemoryCaches = () => {
  const next = sampleMemoryCaches();
  if (!next) return;
  memoryCaches.value = next;
};

/** 读数的自动采样间隔（ms）：面板开着时按此频率重取快照 */
const CACHE_SAMPLE_INTERVAL_MS = 1000;

let cacheSampleTimer: ReturnType<typeof setInterval> | null = null;

const stopCacheSampling = () => {
  if (cacheSampleTimer === null) return;
  clearInterval(cacheSampleTimer);
  cacheSampleTimer = null;
};

// 打开面板后按秒重取快照，关闭即停。只在开关面板时取一次是不够的：
// 面板开着的时候，在工作台里填缓存、改容量常量（HMR 后新实例带新 limit）、清预览缓存，
// 读数都会一直停在打开那一刻的值，看起来像「怎么改都不变」。
// 位图等组件级缓存的注册时机也被自然覆盖，不必关心它早于还是晚于面板挂载。
// 采样成本可接受：size() 是 O(1)，字节估算有深度上限与环保护且只随条数增长。
watch(
  visible,
  open => {
    stopCacheSampling();
    refreshMemoryCaches();
    if (open) cacheSampleTimer = setInterval(refreshMemoryCaches, CACHE_SAMPLE_INTERVAL_MS);
  },
  { immediate: true }
);

onBeforeUnmount(stopCacheSampling);

/** 缓存行：条长按各缓存自身容量占用率（无上限的按当前最大条数折算）；
 *  容量与字节都渲染成徽标（容量按是否满载转预警色）；
 *  字节读数来自各缓存注册时提供的估算器（位图按 w×h×4，数据类按结构粗估）——
 *  逐条估算成本随条数增长（如拼音记忆表上万条），故只算一次并在行内携带结果供合计复用。
 *  自带内存配额（maxBytes）的缓存（位图 / 预览页图）另按配额口径参与占用率与满载判定 ——
 *  它们的条数上限与内存上限是两条独立护栏，只看条数会漏掉「配额已在驱逐」这件事 */
const memoryCacheRows = computed(() => {
  const maxSize = Math.max(...memoryCaches.value.map(cache => cache.size()), 0);
  return memoryCaches.value.map(cache => {
    const size = cache.size();
    const base = cache.limit ?? Math.max(maxSize, 1);
    const bytes = cache.bytes?.();
    // 配额占用率：条数没满也可能已被配额驱逐，故占用率取两条口径中较大的那个
    const bytePct = bytes === undefined || !cache.maxBytes ? 0 : (bytes / cache.maxBytes) * 100;
    // 满载（含多实例聚合后的溢出、或配额到顶）即不再有新条目能被留住，值得警示
    const full = (cache.limit !== null && size >= cache.limit) || bytePct >= 100;
    const pct = clamp(Math.round(Math.max((size / base) * 100, bytePct)), size > 0 ? 4 : 0, 100);

    // 命中率：条数天然不变的全命中缓存（如尺寸/名字变化都不作废位图）与「一次都没被用过」的缓存
    // 读数完全相同，只靠条数无从分辨 —— 命中数是判断缓存是否真在生效的直接证据
    const hits = cache.hits?.();
    const misses = cache.misses?.();
    let hitRateText = '';
    let hitRateHint: string | undefined;
    if (hits !== undefined && misses !== undefined) {
      const lookups = hits + misses;
      // 0 次查表显示「未使用」而不是「命中 0%」：没查过与查了全落空是两回事
      hitRateText = lookups === 0 ? '未使用' : `命中 ${Math.round((hits / lookups) * 100)}%`;
      hitRateHint = `命中 ${hits} 次 / 未命中 ${misses} 次（共 ${lookups} 次查表）`;
    }

    // 同名多份 = 热替换留下的旧实例（它可能才是应用在用的那份）。标出份数，说明当前行读的是
    // 「最近活跃」的一份、以及「清空」会逐份回收 —— 否则读数与直觉不符时无从判断
    const instances = cache.instances ?? 1;
    const instancesText = instances > 1 ? `${instances} 份实例` : '';
    const instancesHint =
      instances > 1
        ? `同名缓存共 ${instances} 份实例（热替换会留下旧实例，其数据仍在内存中）：本行读数取自最近活跃的一份，「清空」会逐份回收`
        : undefined;

    // 有配额的缓存把分子分母一起给出：只报当前占用时看不出「离上限还有多远」
    const quota = cache.maxBytes;
    const quotaSuffix = quota === undefined ? '' : ` / ${formatBytes(quota)}`;
    const bytesText = bytes === undefined ? '' : `${formatBytes(bytes)}${quotaSuffix}`;
    const bytesHint =
      bytes === undefined
        ? undefined
        : quota === undefined
          ? `内存占用估算 ${bytes.toLocaleString('zh-CN')} 字节`
          : `内存占用估算 ${bytes.toLocaleString('zh-CN')} 字节，配额 ${quota.toLocaleString('zh-CN')}`;

    return {
      ...cache,
      text: `${size} / ${cache.limit ?? '∞'}`,
      full,
      countHint: `${size} 条 / 上限 ${cache.limit ?? '无上限'}（当前占用 ${pct}%）`,
      bytesValue: bytes,
      bytesText,
      bytesHint,
      hitRateText,
      hitRateHint,
      instancesText,
      instancesHint,
      pct,
    };
  });
});

/** 已登记缓存的字节合计（仅统计能给出估算的缓存） */
const memoryCacheTotalText = computed(() => {
  const known = memoryCacheRows.value.filter(row => row.bytesValue !== undefined);
  if (known.length === 0) return '';
  return formatBytes(known.reduce((sum, row) => sum + (row.bytesValue ?? 0), 0));
});

const clearMemoryCache = (cache: CacheStat) => {
  cache.clear?.();
  refreshMemoryCaches();
  uiStore.message.success(`已清空「${cache.name}」`);
};

/* ---- 预览缓存 ---- */

const hasPreviewCache = computed(() => Boolean(currentRenderData.value));

const previewPageCount = computed(() => (currentRenderData.value ? `${currentRenderData.value.a4Urls.length}` : '—'));

const previewSizeText = computed(() => {
  const data = currentRenderData.value;
  const sizes = data?.a4Sizes;
  if (!sizes || sizes.length === 0) return data ? '0 B' : '—';
  // 含页脚合成层（若已生成）：它是同一批页面的第二份 JPEG，漏掉就会把实际占用报成一半
  // （与缓存内存配额记账同口径，见 scorePreviewCache 的 weigh）
  const footerBytes = (data?.footerBlobs ?? []).reduce((sum, blob) => sum + blob.size, 0);
  return formatBytes(sizes.reduce((sum, n) => sum + n, 0) + footerBytes);
});

/** 指标读数徽标的形态：有缓存走实底（主读数），无缓存时的占位「—」走描边弱化。
 *  语义色统一中性——面板内读数不用主色 */
const previewValueAppearance = computed(() => (hasPreviewCache.value ? 'subtle' : 'outline'));

/** 分页明细：条长按各页相对最大页的比例（最小 4% 保证小页仍可见） */
const previewPages = computed(() => {
  const sizes = currentRenderData.value?.a4Sizes ?? [];
  const max = Math.max(...sizes, 0);
  return sizes.map((bytes, i) => ({
    label: `第 ${i + 1} 页`,
    text: formatBytes(bytes),
    pct: max > 0 ? Math.max(4, Math.round((bytes / max) * 100)) : 4,
  }));
});

const previewHintText = computed(() => {
  if (!currentRenderData.value) return '暂无渲染结果';
  return `共 ${currentRenderData.value.a4Urls.length} 页，占内存（非磁盘存储）`;
});

const handleClearPreviewCache = () => {
  clearPreviewCache();
  refreshMemoryCaches();
  uiStore.message.success('预览缓存已清空，改动内容或切歌后将重新渲染');
};

/* ---- 存储占用 ---- */

/** IDB 各对象库记录数（不取值）；kv 库是偏好/UI 态，其余为实体与同步元数据 */
const lsEntries = ref<{ key: string; text: string; pct: number }[]>([]);
const lsTotalText = ref('—');
const originUsageText = ref('—');
const originQuotaText = ref('—');

/** 配额占用百分比：estimate 未就绪或配额未知时按 0 处理（条为空） */
const originUsagePct = ref(0);
const originUsagePctText = ref('—');

/** 占用逼近配额上限（≥80%）时，读数徽标与占用条转警示色 */
const originUsageAlert = computed(() => originUsagePct.value >= 80);

const refreshStorageUsage = async () => {
  // IDB 按对象库统计记录数：条长按各库相对最大库的比例（最小 4% 保证小库仍可见）
  const storeNames = Object.keys(SCHEMA) as StoreName[];
  const counts = await Promise.all(
    storeNames.map(async name => {
      try {
        const keys = await idb.getAllKeys(name);
        return { name, count: keys.length };
      } catch {
        return { name, count: 0 };
      }
    })
  );
  const max = Math.max(...counts.map(c => c.count), 0);
  lsEntries.value = counts.map(item => ({
    key: item.name,
    text: `${item.count} 条`,
    pct: max > 0 ? Math.max(4, Math.round((item.count / max) * 100)) : 4,
  }));
  lsTotalText.value = `${storeNames.length} 库 / ${counts.reduce((sum, item) => sum + item.count, 0)} 条`;

  // 站点级用量（含 IndexedDB / CacheStorage 等）；estimate 不可用时降级为未知
  if (navigator.storage?.estimate)
    try {
      const { usage, quota } = await navigator.storage.estimate();
      originUsageText.value = usage != null ? formatBytes(usage) : '未知';
      originQuotaText.value = quota != null ? formatBytes(quota) : '未知';
      if (usage != null && quota) {
        const pct = (usage / quota) * 100;
        originUsagePct.value = clamp(pct, pct > 0 ? 1 : 0, 100);
        originUsagePctText.value = `${pct < 0.1 ? '<0.1' : pct.toFixed(1)}%`;
      } else {
        originUsagePct.value = 0;
        originUsagePctText.value = '未知';
      }
    } catch {
      originUsageText.value = '未知';
      originQuotaText.value = '未知';
      originUsagePct.value = 0;
      originUsagePctText.value = '未知';
    }
  else {
    originUsageText.value = '不支持';
    originQuotaText.value = '不支持';
    originUsagePct.value = 0;
    originUsagePctText.value = '不支持';
  }
};

refreshStorageUsage();

/* ---- 测试数据 ---- */

/** 默认「大」档位：足以压出滚动/分组/缓存压力，又不至于逼近磁盘配额 */
const seedScaleKey = ref(DEV_TEST_SCALES[1]!.key);
const seedScaleOptions = DEV_TEST_SCALES.map(scale => ({ label: scale.label, value: scale.key }));
const isSeedConfirmOpen = ref(false);
const isSeeding = ref(false);

const activeSeedScale = computed(
  () => DEV_TEST_SCALES.find(scale => scale.key === seedScaleKey.value) ?? DEV_TEST_SCALES[0]!
);
/** 档位摘要：和弦实际条数取决于指法反推的命中与去重，故只承诺乐谱数，和弦数由生成后回报 */
const seedSummaryText = computed(() => {
  const scale = activeSeedScale.value;
  const lineChars = `${scale.longLineWords[0] * 2}~${scale.longLineWords[1] * 2} 字`;
  return `${scale.songCount} 首乐谱 · ${scale.groupCount} 个分组 · 指法密度 ×${scale.variantsPerQuality} · 每首 ${scale.linesPerSong[0]}~${scale.linesPerSong[1]} 行（长句 ${lineChars} · 行内和弦 ${scale.chordsPerLyricLine[0]}~${scale.chordsPerLyricLine[1]} 个）`;
});

/**
 * 生成测试数据并整体覆盖两个数据域。
 *
 * 生成是同步 CPU（大档位下数百毫秒），随后各自整体替换：
 *  - 和弦走 `replaceAllData` + 立即刷盘（绕过防抖窗口）；
 *  - 乐谱走 `overwriteSongs`（内部会清理孤立存储记录并 flush）。
 * 落盘失败（如磁盘配额超限）时内存已替换、持久化失败经上报链路提示，
 * 故提示改用更小档位，而不是假装成功。
 */
const handleSeedTestData = () => {
  isSeeding.value = true;
  try {
    const data = buildDevTestData(activeSeedScale.value);
    chordStore.replaceAllData({ groups: data.groups, chords: data.chords });
    void chordStore.persistAll();
    void songStore.overwriteSongs(data.songs);
    uiStore.message.success(
      `已覆盖：${data.chords.length} 条和弦 / ${data.songs.length} 首乐谱（约 ${formatBytes(data.estimatedBytes)}）`
    );
    isSeedConfirmOpen.value = false;
  } catch (err) {
    console.error('[dev] 生成测试数据失败', err);
    uiStore.message.error('生成或落盘失败，请改用更小档位');
  } finally {
    isSeeding.value = false;
  }
};

/* ---- 危险区 ---- */

/** 导出 IDB 键清单：kv 库导出键名（可能含 token 类配置，仅键名不含值），实体库导出记录数 */
const handleDumpStorageKeys = async () => {
  const lines: string[] = [];
  try {
    const kvKeys = (await idb.getAllKeys('kv')).filter((k): k is string => typeof k === 'string');
    lines.push(`# kv (${kvKeys.length})`, ...kvKeys.sort());
    for (const name of Object.keys(SCHEMA) as StoreName[]) {
      if (name === 'kv') continue;
      lines.push(`# ${name} (${(await idb.getAllKeys(name)).length})`);
    }
  } catch {
    uiStore.message.error('读取 IndexedDB 失败，请看控制台');
    return;
  }
  void navigator.clipboard.writeText(lines.join('\n'));
  uiStore.message.success('已复制 IDB 键清单到剪贴板');
};

const isWipeIdbConfirmOpen = ref(false);
const isWipingIdb = ref(false);

/** 清空全部对象库（SCHEMA 声明的每一库）：wipe 确认框与 wipe+reload 两个动作共用 */
const clearAllIdbStores = async (): Promise<void> => {
  const storeNames = Object.keys(SCHEMA) as StoreName[];
  // 内层不能写成 `map(name => void idb.clear(name))`：void 运算符把每个元素求值成 undefined，
  // Promise.all 收到 undefined[] 会在下一个微任务即 resolve、不等任何 clear 完成——
  // 「已清空」提示早于删除落地，各 clear 的 rejection 还成为游离 Promise，下方 try/catch 永不捕获。
  await Promise.all(storeNames.map(name => idb.clear(name)));
};

const handleWipeIdb = async () => {
  isWipingIdb.value = true;
  try {
    await clearAllIdbStores();
    uiStore.message.warning('IndexedDB 已清空，刷新页面后生效');
  } catch {
    uiStore.message.error('清空 IndexedDB 失败，请看控制台');
  } finally {
    isWipingIdb.value = false;
    // 必须显式复位：BaseModal 的确认按钮只 emit('confirm') 不自关（见其模板），
    // 不复位会让确认框常驻，且每点一次「清空」就把整库再 clear 一遍
    isWipeIdbConfirmOpen.value = false;
  }
};

const handleWipeAndReload = async () => {
  try {
    await clearAllIdbStores();
  } catch {
    /* 清空失败也要重载：残留数据交由下次启动处理 */
  }
  window.location.reload();
};
</script>
