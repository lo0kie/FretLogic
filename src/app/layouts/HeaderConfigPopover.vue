<template>
  <!-- 固定留白层：只承担**纵向**留白（py-md）—— 纵向 padding 落在滚动容器里属于可滚动区，
       顶部那条随内容滚走、底部那条只在滚到底时才出现，故必须放在不滚动的祖先上。
       横向留白（px-md）留在滚动宿主自己身上（见下）：没有横向滚动 ⇒ 它天然恒定；若一并提到本层，
       滚动宿主右缘会内缩，而滚动条的横向位置是从**宿主右缘**算的（edgeOffset，默认 4），
       于是滚动条被一起推进去、不再贴面板边（侧栏就是这个结构）。
       尺寸（max-h-80 / w-[360px]）也从滚动宿主接管到本层：两者本就含留白，故外部几何逐像素不变。
       relative 是必需的：滚动条 overlay 挂在滚动宿主的**父元素**（即本层）上，其几何沿 offsetParent
       链累加、必须终止于父元素 —— 本层不定位就会把链让给更上层的面板，每帧退化成 rect 兜底。 -->
  <div class="config-popover-card relative flex max-h-80 w-[360px] flex-col py-md">
    <BaseScrollArea
      :scrollbar="{ endInset: 8 }"
      axis="y"
      class="min-h-0 flex-auto px-md outline-none"
      ref="scrollAreaRef"
    >
      <!-- 内容层：分组列表根（吸附头的共同祖先）—— useStickyHeads 沿它的祖先链找滚动容器 -->
      <div class="flex flex-col gap-1" ref="configListRef">
        <template v-if="isScoreRoute">
          <BaseCollapse
            v-bind="headBind('layout')"
            v-scroll-into-view.y.delay-220.skip-mount="isScoreGroupOpen('layout')"
            :description="layoutGroupDescription"
            :expanded="isScoreGroupOpen('layout')"
            @update:expanded="toggleScoreGroup('layout', $event)"
            initial-auto
            class="scroll-mt-2"
            icon="type"
            icon-size="xl"
            title="排版"
          >
            <BaseForm gap="sm" label-size="2xs" label-tone="muted" size="sm">
              <BaseFormRow label="字号缩放">
                <BaseSlider
                  v-model.lazy="fontScaleModel"
                  :default-value="100"
                  :formatter="val => `${Math.round(val)}%`"
                  :max="150"
                  :min="60"
                  :show-buttons="false"
                  :step="5"
                  bordered
                  readout-position="left"
                />
              </BaseFormRow>

              <BaseFormRow label="和弦缩放">
                <BaseSlider
                  v-model.lazy="fretboardScaleModel"
                  :default-value="100"
                  :formatter="val => `${Math.round(val)}%`"
                  :max="150"
                  :min="60"
                  :show-buttons="false"
                  :step="5"
                  bordered
                  readout-position="left"
                />
              </BaseFormRow>

              <template v-if="isPreviewTab">
                <BaseFormRow label="乐谱对齐">
                  <BaseSegmentedControl
                    v-model="settingsStore.scoreLayoutAlign"
                    :options="[
                      { value: 'start', label: '起始位置' },
                      { value: 'center', label: '居中对齐' },
                    ]"
                    compacted
                  />
                </BaseFormRow>

                <BaseFormRow label="歌词字重">
                  <BaseSegmentedControl
                    v-model="settingsStore.scoreLyricsFontWeight"
                    :options="[
                      { value: 'light', label: '细' },
                      { value: 'regular', label: '常规' },
                      { value: 'bold', label: '粗' },
                    ]"
                    compacted
                  />
                </BaseFormRow>

                <BaseFormRow help="仅预览与导出图生效：歌词中未挂和弦的空格不再占位，排版更紧凑" label="忽略空格">
                  <BaseSwitch v-model="settingsStore.scoreIgnoreEmptySpace" aria-label="是否让无和弦的空格不占位" />
                </BaseFormRow>
              </template>
            </BaseForm>
          </BaseCollapse>

          <BaseCollapse
            v-bind="headBind('display')"
            v-scroll-into-view.y.delay-220.skip-mount="isScoreGroupOpen('display')"
            :description="displayGroupDescription"
            :expanded="isScoreGroupOpen('display')"
            @update:expanded="toggleScoreGroup('display', $event)"
            initial-auto
            class="scroll-mt-2"
            icon="eye"
            icon-size="xl"
            title="显示"
          >
            <BaseForm gap="sm" label-size="2xs" label-tone="muted" size="sm">
              <BaseFormRow help="仅乐谱生效" label="符号简写 (M/°/+)">
                <BaseSwitch v-model="settingsStore.scoreChordShorthand" aria-label="乐谱符号简写" />
              </BaseFormRow>

              <BaseFormRow help="关闭后指板图仅保留按弦圆点" label="显示横按">
                <BaseSwitch v-model="settingsStore.scoreShowBarre" aria-label="是否显示大横按" />
              </BaseFormRow>

              <BaseFormRow help="按实际用到的品位收紧，至少保留 3 列" label="忽略空品格">
                <BaseSwitch v-model="settingsStore.scoreTrimEmptyEdgeFrets" aria-label="指板图是否忽略首末的空品格" />
              </BaseFormRow>

              <BaseFormRow v-if="isPreviewTab" help="A4 分页预览底部居中显示页码" label="显示页脚">
                <BaseSwitch v-model="settingsStore.scoreShowFooter" aria-label="是否显示页脚页码" />
              </BaseFormRow>
            </BaseForm>
          </BaseCollapse>

          <BaseCollapse
            v-bind="headBind('export')"
            v-if="isPreviewTab"
            v-scroll-into-view.y.delay-220.skip-mount="isScoreGroupOpen('export')"
            :expanded="isScoreGroupOpen('export')"
            @update:expanded="toggleScoreGroup('export', $event)"
            initial-auto
            class="scroll-mt-2"
            description="尺寸与质量"
            icon="layout-template"
            icon-size="xl"
            title="版面"
          >
            <BaseForm gap="sm" label-size="2xs" label-tone="muted" size="sm">
              <BaseFormRow help="标准单页尺寸，A4/Letter 常用于打印输出" label="单页尺寸">
                <BaseSegmentedControl
                  v-model="settingsStore.scorePageSize"
                  :options="SCORE_PAGE_SIZE_PRESETS.map(p => ({ label: p.label, value: p.id }))"
                  compacted
                />
              </BaseFormRow>

              <BaseFormRow label="页边距">
                <BaseSegmentedControl
                  v-model="settingsStore.scorePageMargin"
                  :options="SCORE_PAGE_MARGIN_PRESETS.map(p => ({ label: p.label, value: p.value }))"
                  compacted
                />
              </BaseFormRow>

              <BaseFormRow help="JPEG 压缩质量，越高越清晰" label="导出质量">
                <BaseSlider
                  v-model.lazy="settingsStore.scoreExportQuality"
                  :default-value="95"
                  :formatter="val => `${Math.round(val)}%`"
                  :max="100"
                  :min="30"
                  :show-buttons="false"
                  :step="5"
                  bordered
                  readout-position="left"
                />
              </BaseFormRow>
            </BaseForm>
          </BaseCollapse>
        </template>

        <template v-else>
          <BaseCollapse
            v-bind="headBind('timbre')"
            v-scroll-into-view.y.delay-220.skip-mount="isWorkbenchGroupOpen('timbre')"
            :expanded="isWorkbenchGroupOpen('timbre')"
            @update:expanded="toggleWorkbenchGroup('timbre', $event)"
            initial-auto
            class="scroll-mt-2"
            description="音色与扫弦"
            icon="audio-lines"
            icon-size="xl"
            title="音色"
          >
            <BaseForm gap="sm" label-size="2xs" label-tone="muted" size="sm">
              <BaseFormRow help="和弦试听音色" label="音色">
                <BaseSegmentedControl
                  v-model="settingsStore.audioPlayback.timbre"
                  :options="[
                    { value: 'standard', label: '标准' },
                    { value: 'soft', label: '柔和' },
                    { value: 'bright', label: '明亮' },
                    { value: 'pluck', label: '拨弦' },
                  ]"
                  compacted
                  width="auto"
                />
              </BaseFormRow>

              <BaseFormRow help="和弦试听音量" label="试听音量">
                <BaseSlider
                  v-model="settingsStore.audioPlayback.volumeDb"
                  :default-value="-8"
                  :formatter="val => `${Math.round(val)}dB`"
                  :max="0"
                  :min="-30"
                  :show-buttons="false"
                  :step="2"
                  bordered
                  readout-position="left"
                />
              </BaseFormRow>

              <BaseFormRow help="扫弦方向（由内向外：从中音弦向两侧交替展开）" label="扫弦方向">
                <BaseSegmentedControl
                  v-model="settingsStore.audioPlayback.strumDirection"
                  :options="[
                    { value: 'low', label: '下扫' },
                    { value: 'high', label: '上扫' },
                    { value: 'inside-out', label: '由内向外' },
                  ]"
                  compacted
                />
              </BaseFormRow>

              <BaseFormRow help="扫弦相邻弦触发间隔" label="弦间间隔">
                <BaseSlider
                  v-model="settingsStore.audioPlayback.strumDelayMs"
                  :default-value="60"
                  :formatter="val => `${Math.round(val)}ms`"
                  :max="150"
                  :min="20"
                  :show-buttons="false"
                  :step="5"
                  bordered
                  readout-position="left"
                />
              </BaseFormRow>
            </BaseForm>
          </BaseCollapse>

          <BaseCollapse
            v-bind="headBind('effect')"
            v-scroll-into-view.y.delay-220.skip-mount="isWorkbenchGroupOpen('effect')"
            :expanded="isWorkbenchGroupOpen('effect')"
            @update:expanded="toggleWorkbenchGroup('effect', $event)"
            initial-auto
            class="scroll-mt-2"
            description="混响与拟真"
            icon="audio-waveform"
            icon-size="xl"
            title="效果"
          >
            <BaseForm gap="sm" label-size="2xs" label-tone="muted" size="sm">
              <BaseFormRow help="混响尾音占比" label="混响">
                <BaseSlider
                  v-model="settingsStore.audioPlayback.reverbWet"
                  :default-value="20"
                  :formatter="val => `${Math.round(val)}%`"
                  :max="100"
                  :min="0"
                  :show-buttons="false"
                  :step="5"
                  bordered
                  readout-position="left"
                />
              </BaseFormRow>

              <BaseFormRow help="开启后每弦力度与触发时机带随机拟真" label="力度随机">
                <BaseSwitch v-model="settingsStore.audioPlayback.humanize" aria-label="扫弦力度随机拟真" />
              </BaseFormRow>

              <BaseFormRow help="为试听音色添加合唱摆动效果" label="合唱">
                <BaseSwitch v-model="settingsStore.audioPlayback.chorusEnabled" aria-label="合唱效果" />
              </BaseFormRow>
            </BaseForm>
          </BaseCollapse>
        </template>
      </div>
    </BaseScrollArea>
  </div>
</template>

<script lang="ts">
// 双 script 块：imports 整体置于首个块顶部（import/first）；
// 折叠分组展开态声明于模块作用域（而非 <script setup> 体内），实现会话级记忆——重开设置弹窗
// 仍停留上次展开的分组，且乐谱/工作台两 tab 各自独立、互不干扰；<script setup> 经别名暴露给模板。
import { computed, ref, useTemplateRef } from 'vue';

import { useRoute } from 'vue-router';

import BaseCollapse from '@/platform/ui/collapse/BaseCollapse.vue';
import BaseForm from '@/platform/ui/form/BaseForm.vue';
import BaseFormRow from '@/platform/ui/form/BaseFormRow.vue';
import BaseScrollArea from '@/platform/ui/scroll-area/BaseScrollArea.vue';
import BaseSegmentedControl from '@/platform/ui/segmented/BaseSegmentedControl.vue';
import BaseSlider from '@/platform/ui/slider/BaseSlider.vue';
import BaseSwitch from '@/platform/ui/switch/BaseSwitch.vue';
import { SCORE_PAGE_MARGIN_PRESETS, SCORE_PAGE_SIZE_PRESETS } from '@/domains/score/constants';
import { useScoreEditorStore } from '@/domains/score/editor/store/scoreEditorStore';
import { useScrollMemory } from '@/platform/composables/useScrollMemory';
import { useStickyHeads } from '@/platform/composables/useStickyHeads';
import { useSettingsStore } from '@/platform/store/settingsStore';
import { usePopoverPin } from '@/platform/ui/popover/popoverPin';
import { useScrollAreaElement } from '@/platform/ui/scroll-area/scrollAreaHandle';
import { ROUTE_PATHS } from '@/platform/utils/constants';

import type { ScrollAreaHandle } from '@/platform/ui/scroll-area/scrollAreaHandle';

/** 乐谱页设置分组名 */
type ScoreGroupName = 'layout' | 'display' | 'export';
/** 工作台页设置分组名 */
type WorkbenchGroupName = 'timbre' | 'effect';

/** 乐谱页折叠分组展开项（可多开：会话级记忆，重开仍停留在上次那几组，可全部收起）。
 *  按编辑 tab（排列和弦）与预览 tab 分维度记忆，两 tab 各自独立、互不共用。
 *  不再排他：调参时常要边看「排版」效果边改「显示」里的项，互斥会逼用户来回切、上一组自动收起，
 *  每切一次就丢一次对照上下文。条目不多（3 组），全开也在弹层高度预算内（超出由滚动区承担）。 */
const scoreEditOpenGroups = ref<Set<ScoreGroupName>>(new Set(['layout', 'display', 'export']));
const scorePreviewOpenGroups = ref<Set<ScoreGroupName>>(new Set(['layout', 'display', 'export']));
/** 工作台页折叠分组展开项（可多开，同上）。原第三组「显示」仅含和弦简写一项，已迁入工作台指板设置面板 */
const workbenchOpenGroups = ref<Set<WorkbenchGroupName>>(new Set(['timbre', 'effect']));
</script>

<script setup lang="ts">
const scrollAreaRef = useTemplateRef<ScrollAreaHandle>('scrollAreaRef');
/** 设置面板滚动容器元素：会话级滚动位置存取用 */
const scrollRef = useScrollAreaElement(scrollAreaRef);

/** 分组列表根（内容层）：吸附头的共同祖先，useStickyHeads 沿它找滚动容器 */
const configListRef = useTemplateRef<HTMLElement>('configListRef');

/**
 * 分组折叠头的吸附：宿主环境相关的能力交给 useStickyHeads（一次发现滚动容器、一次监听、
 * 批量判定哪些头被顶在吸附线上，并按吸附头实测高度让开容器顶部羽化带）。
 *
 * listRef 是**内容层**而不是滚动宿主本身 —— findScrollParent 沿 parentElement 往上找、不看元素自身。
 * 5 个头的接线（id 钩子 / 滚动容器 / 定位 sticky、top、z）由 headBind 统一下发 —— 折叠组件不假设宿主布局。
 */
const { headBind } = useStickyHeads({
  listRef: configListRef,
  idAttribute: 'data-config-group',
  // 吸附线 = 容器可视上沿：头顶不留间隙，滚过的内容直接被头部自身遮住
  offset: '0px',
  // 有头吸附时：容器顶部羽化带内缩一个头高，让开吸附中的头
  fadeOffset: true,
});

const scoreEditor = useScoreEditorStore();
const settingsStore = useSettingsStore();
const route = useRoute();
/** 乐谱专属子项（缩放/对齐/简写）仅在乐谱页显示；音频项在工作台显示 */
const isScoreRoute = computed(() => route.path === ROUTE_PATHS.SCORE);
/** 乐谱对齐仅在预览 tab 显示（对齐排版只作用于预览/导出图片） */
const isPreviewTab = computed(() => route.path === ROUTE_PATHS.SCORE && scoreEditor.activeTab === 'preview');
/** 会话级展开态：按当前 tab（排列和弦 / 预览）取对应维度记忆（重开弹窗不重置） */
const scoreOpenGroups = computed(() => (isPreviewTab.value ? scorePreviewOpenGroups.value : scoreEditOpenGroups.value));
const workbenchOpenGroup = workbenchOpenGroups;

/**
 * 排版缩放按 tab 分维度读写：
 *  - 排列和弦 tab → 编辑视图维度，只改编辑区看谱的字号/和弦大小；
 *  - 预览 tab → 预览 / 导出维度，只改出图排版。
 * 两者各存一份、互不覆盖，故同一个滑块在不同 tab 下是不同的值。
 */
const fontScaleModel = computed({
  get: () => (isPreviewTab.value ? scoreEditor.previewFontScale : scoreEditor.arrangeFontScale),
  set: (val: number) => {
    if (isPreviewTab.value) scoreEditor.previewFontScale = val;
    else scoreEditor.arrangeFontScale = val;
  },
});
const fretboardScaleModel = computed({
  get: () => (isPreviewTab.value ? scoreEditor.previewFretboardScale : scoreEditor.arrangeFretboardScale),
  set: (val: number) => {
    if (isPreviewTab.value) scoreEditor.previewFretboardScale = val;
    else scoreEditor.arrangeFretboardScale = val;
  },
});

/**
 * 分组行尾描述按 tab 取用：两项设置（乐谱对齐、显示页脚）都只作用于预览 / 导出，
 * 排列和弦 tab 下并不渲染，写死在描述里会指向一个当前 tab 没有的设置项。
 */
/** 「排版」组：预览 tab 含对齐，排列和弦 tab 只有字号与和弦两个缩放项 */
const layoutGroupDescription = computed(() => (isPreviewTab.value ? '缩放与对齐' : '字号与和弦'));
/** 「显示」组：页脚（A4 分页页码）仅预览显示，排列和弦 tab 只剩简写与横按 */
const displayGroupDescription = computed(() => (isPreviewTab.value ? '简写与页脚' : '简写与横按'));

/** 用户与面板内容交互（展开/折叠分组）即钉住浮层：hover 移出不再自动关闭，点外部/Esc 仍可关闭 */
const pinPopover = usePopoverPin();

/** 切换乐谱页分组：多开语义——只增删本组，不动其它组；按当前 tab 记忆到对应维度 */
function toggleScoreGroup(group: ScoreGroupName, value: boolean) {
  pinPopover();
  const target = isPreviewTab.value ? scorePreviewOpenGroups : scoreEditOpenGroups;
  // 换一个新 Set 再赋值：比原地 add/delete 更直白地触发依赖（也避免深层集合变更的追踪差异）
  const next = new Set(target.value);
  if (value) next.add(group);
  else next.delete(group);
  target.value = next;
}

/** 切换工作台页分组：同上（只增删本组） */
function toggleWorkbenchGroup(group: WorkbenchGroupName, value: boolean) {
  pinPopover();
  const next = new Set(workbenchOpenGroups.value);
  if (value) next.add(group);
  else next.delete(group);
  workbenchOpenGroups.value = next;
}

/**
 * 展开判定：供 v-scroll-into-view 在分组展开（false→true）时，待高度过渡（--duration-base: 0.18s）
 * 稳定后把该分组头部滚入弹层可视区顶部（.delay-220 即过渡时长）。头部按钮本身带 scroll-mt-2 保证 8px 上边距。
 * 多开语义下只滚动刚被点开的那组（其余组的展开态没变，指令不触发）。
 *
 * 各处都挂 .skip-mount（指令只在挂载后的激活态变化时才滚动）：展开态是会话级记忆，重开弹层时
 * 默认分组在挂载那一刻就已经是 true，指令的挂载分支（同样走 .delay-220，落在入场动画之后）
 * 会把该分组段滚回视口，把下方 useScrollMemory 刚贴回的停留位置顶掉——现象就是「重开、动画结束后自己
 * 往上跳一段」。跳过挂载触发后，首次定位完全归滚动位置恢复，指令只管用户点开另一组时的对焦。
 */
const isScoreGroupOpen = (group: ScoreGroupName): boolean => scoreOpenGroups.value.has(group);
const isWorkbenchGroupOpen = (group: WorkbenchGroupName): boolean => workbenchOpenGroup.value.has(group);

/** 面板内容的档位全集：路由种类 × 乐谱页 tab，各占一份滚动记忆（activeKey 的类型由此收窄） */
const PANEL_KEYS = ['score:edit', 'score:preview', 'workbench'] as const;
type PanelKey = (typeof PANEL_KEYS)[number];

/** 当前档位：乐谱页「排列和弦」/「预览」两个 tab 与工作台页各一份（面板内容一变就换档） */
const activeKey = computed<PanelKey>(() =>
  isScoreRoute.value ? (isPreviewTab.value ? 'score:preview' : 'score:edit') : 'workbench'
);

/**
 * 会话级滚动位置记忆：关闭 / 重开设置弹层仍返回上次滚动位置（浮层以 v-if 销毁重建容器，
 * 默认 scrollTop=0，不记就会「闪回顶部」）。
 *
 * 档位键（activeKey）按**面板内容**分，而不是只按路由分：乐谱页「排列和弦」与「预览」两个 tab
 * 的面板内容并不一样（预览多出对齐 / 忽略空格 / 页脚 / 版面几组），高度差可达数百像素。
 * 共用一份记忆时，切到矮的那个 tab 会把容器钳到它的上限，把另一个 tab 记的位置写坏
 * ——现象就是「切个 tab 位置就丢了」。展开态（scoreEditOpenGroups / scorePreviewOpenGroups）
 * 本来就是按这两个 tab 分开记的，滚动位置同理。
 *
 * 滚动时的持续记录与容器换绑后的贴回都由 useScrollMemory 内部完成
 *（边缘渐隐仍由 v-edge-fade 指令自行处理，无需手动同步）。
 *
 * 贴回是重开时**唯一**的定位动作：分组头上的 v-scroll-into-view 一律 .skip-mount，
 * 不会在挂载后（哪怕延迟 220ms）再来把它顶走。
 *
 * 历史说明：此处曾有一套「MutationObserver 监听 -leave- 类 + rAF 逐帧贴回 scrollTop」的离场保持机制，
 * 用于对抗"关闭瞬间浏览器把 scrollTop 静默钳回 0"。逐帧采样（scrollTop / scrollHeight / clientHeight /
 * computed overflow-y）证明该假设不成立：关闭期间 scroll 事件正常派发、可滚动空间始终充裕，
 * 真正原因是 v-scrollbar 卸载时摘掉内联 overflow-y，导致元素 scrolling box 被销毁、scrollTop 随之丢弃。
 * 根因已在 vScrollbar.ts 修复，故这套逐帧纠偏机制一并移除。
 *（这也正是 useScrollMemory 用「滚动时持续记录」而非「换档时现读」的原因：销毁那一刻不派发 scroll，
 * 持续记录保住的是销毁前最后一个真实位置。）
 */
useScrollMemory({
  scope: 'header-config-popover',
  keys: PANEL_KEYS,
  activeKey,
  target: scrollRef,
});
</script>
