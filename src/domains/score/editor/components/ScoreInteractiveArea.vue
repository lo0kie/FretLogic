<template>
  <BaseScrollArea
    :style="{
      '--score-font-scale': (scoreEditor.effectiveFontScale / 100) * viewScale,
      // 这两条是容器局部 px（见 lineRowHeights）：容器带 zoom 时浏览器会再乘一次倍率，正好等于
      // 真实行高。它们**不含** zoom，故捏合改倍率时这两条不变 —— 继承给整棵子树的变量一旦每帧
      // 都变，就是每帧一次全子树样式 + 布局失效。
      '--score-line-height-chord': lineRowHeights.chord > 0 ? `${lineRowHeights.chord}px` : undefined,
      '--score-line-height-plain': lineRowHeights.plain > 0 ? `${lineRowHeights.plain}px` : undefined,
    }"
    @scroll.passive="handleScroll()"
    close-popovers
    axis="both"
    class="interactive-score-zone relative min-w-0 flex-1 [touch-action:pan-x_pan-y] py-6 pr-0 pl-xl max-md:pt-sm max-md:pb-[calc(6.5rem+env(safe-area-inset-bottom,0px))] max-md:pl-sm"
    ref="scoreZoneAreaRef"
  >
    <div class="contents">
      <Feedback
        v-if="!scoreEditor.activeSong?.lyrics.trim()"
        description="请先在“编辑歌词”模式下输入文本内容"
        icon="file-text"
        size="lg"
      />
      <!-- 槽位事件委托：一行就有二十多个槽、长谱面可达千级，逐槽挂 click / pointerdown / Delete
           等于上千份监听器与闭包；改在本容器上按 `[data-slot-key]` 寻址分发（该属性挂在每个槽的
           根元素上——和弦槽与添加槽经 SlotShell、瘦槽位由下面模板直接内联，拖拽系统同样按它寻址，
           故它本身就是寻址契约）。
           焦点进出仍留在槽内：它只在焦点真正进出时才触发，没有委托的收益；且它的唯一消费方是
           添加槽「焦点转交给 + 按钮」这条协议，属槽自己的事。
           键盘只挂 delete：Vue 的该修饰符同时匹配 Backspace 与 Delete（原先槽壳上两行绑定会让
           Backspace 触发两次删除，虽幂等但属冗余）。 -->
      <div
        v-else
        :style="viewZoomStyle"
        @click="handleDelegatedClick($event)"
        @keydown.delete="handleDelegatedDelete($event)"
        @pointerdown="handleDelegatedPointerDown($event)"
        class="mx-auto flex w-max max-w-[900px] min-w-full flex-col gap-xs max-md:gap-3xs"
        ref="zoomLayerRef"
      >
        <div
          v-for="lineData in visibleLines"
          v-memo="[
            lineData.lineId,
            lineData.lineIdx,
            lineData.startChords,
            lineData.chars,
            lineData.endChords,
            // 行级和弦绑定签名（见 lineChordSignatures）：本行任一槽位绑定变化 ⇒ 签名变 ⇒ 该行
            // memo 失效并重渲染（getCharChord 实时读新 chordMap，不残留旧和弦）；
            // 别的行变更时本行签名不变，memo 命中——不再因整表引用变化而全表失效
            lineChordSignatures.get(lineData.lineId),
            // 行形态（有没有指板图卡）决定离屏占位高度取哪一档（见 .line-row 的 is-chord-row）。
            // 它与上面的行级签名同源 —— 都由本行的和弦绑定决定，故这里不会带来额外的失效，
            // 写出来只是让「占位高度」这个消费方在依赖表里有名有姓。
            lineHasChord(lineData.lineId),
            hoveredLineKey === lineData.lineId,
            // 这里此前还挂过 isDragging（用来抑制各行和弦上的悬停删除钮）。该抑制已改由
            // body.is-global-dragging 的 CSS 承担、字形 hover 染色的拖拽抑制也一并 CSS 化，
            // 这条链路上已没有任何 prop 吃它，依赖随之摘掉——它是全行共享的，留着就等于
            // 「起拖/松手各让所有已渲染行重渲一次」（每行二十多个槽，字形类名全改）。
            // 拖拽落点严格按行归约：仅当前悬停行触发撑开与落点边框，
            // 其余行全程命中 memo 缓存，绝不触发全量重排掉帧
            isLineActiveDrop(lineData.lineId),
            isLineActiveDrop(lineData.lineId) ? lineDropTargetKey(lineData.lineId) : null,
            // 面板目标高亮同样按行归约：只有「目标所在行」的 dep 会从 null 变成具体槽位键，
            // 其余行恒为 null 继续命中缓存。此前这里漏了它——面板关闭时 pickerTargetSlotKey 已归 null，
            // 但本行 memo 因依赖未变而命中，is-picker-target 的虚线框要等鼠标移出本行
            // （hoveredLineKey 在依赖里）触发重渲染才消失。
            linePickerTargetKey(lineData.lineId),
            // 行内三枚图标钮的尺寸档（见 actionButtonSize）随断点变 —— 本表里唯一一个
            // 「按设备形态而非数据」失效的条目：跨断点那一瞬已渲染行各重渲一次。
            // 尺寸档只能经 prop 下发、没有 CSS 写法，故这一条进表（不像显隐那样走媒体查询）；
            // 顺带把 viewScale 此前没进表、跨断点不刷新的缺口一并盖上。
            isMobile,
            // 尾部窗口的「空档」由本行承载（见 gapMarginOf）：这一条对绝大多数行恒为 undefined，
            // 故空档缩短时只有承载行与新承载行两行失效，其余行照旧命中缓存。
            gapMarginOf(lineData.lineIdx),
          ]"
          :class="{ 'is-chord-row': lineHasChord(lineData.lineId) }"
          :key="lineData.lineId"
          :style="{ marginTop: gapMarginOf(lineData.lineIdx) }"
          class="line-row flex w-max min-w-full items-stretch"
        >
          <div
            :class="{ 'is-empty-line': lineData.chars.length === 0 }"
            :data-line-index="lineData.lineId"
            @mouseenter="hoveredLineKey = lineData.lineId"
            @mouseleave="hoveredLineKey = null"
            class="lyrics-line relative flex min-h-0 w-max min-w-0 flex-[1_1_auto] flex-nowrap items-stretch gap-0 rounded-md border border-transparent p-2xs transition-all duration-base ease-standard select-none focus-within:border-border-base focus-within:bg-surface-panel-hover hover:border-border-base hover:bg-surface-panel-hover"
          >
            <!-- 行号承担长谱面的扫读定位（「第几行」），不是装饰性文本，故用次级文字色 muted
                 而非禁用色 disabled：后者语义是「不可用/失效」，且暗色下比重明显偏轻，
                 谱面一长，数行号反而更费眼 -->
            <div class="mr-2 flex shrink-0 items-end pb-0.5 select-none">
              <span class="rounded-lg font-mono text-2xs font-bold text-fg-muted transition-colors duration-fast">
                {{ formatLineIndex(lineData.lineIdx) }}
              </span>
            </div>
            <div class="flex shrink-0 items-stretch gap-0">
              <!-- 行首添加槽：本行恒有这一枚（纯空行也只留这一枚，见行尾那枚的说明）。
                   左右各补一份外边距（mx-md）：左那份把它与行号 / 行框隔开，右那份把它与紧随的
                   首个槽隔开 —— 行内相邻槽是 gap-0 紧贴的，只留外侧那一份时按钮与内容仍然粘在一起。
                   外边距归宿主而不是 AddSlot：「两侧各留多少」属行级排版。
                   档位取 md（0.75rem）而不是 sm：**左这一侧本来就有一份 0.5rem** —— 行号 div 自带
                   `mr-2`（同为 0.5rem），sm 只在 19.5px 的既有间隙上再加 2.8px，肉眼看不出来；
                   再宽一档才够形成可辨的变化。**不随宽窄屏分档**：按钮本身在移动端降了一档
                   （见 actionButtonSize），外边距若跟着缩，两端只会更挤。 -->
              <AddSlot
                :is-drop-line="isLineActiveDrop(lineData.lineId)"
                :is-drop-target="isSlotDropTarget(lineData.nextStartKey)"
                :is-picker-target="isPickerTarget(lineData.nextStartKey)"
                :line-hovered="hoveredLineKey === lineData.lineId"
                :size="actionButtonSize"
                :slot-key="lineData.nextStartKey"
                add-placeholder-title="点击添加行首和弦"
                class="mx-md"
              />

              <ChordSlot
                v-for="item in lineData.startChords"
                :chord="item.chord"
                :is-drop-target="isSlotDropTarget(item.slotKey)"
                :is-picker-target="isPickerTarget(item.slotKey)"
                :key="item.slotKey"
                :scale-factor="viewScale"
                :slot-key="item.slotKey"
                @remove="handleRemoveSlotChord($event)"
              />
            </div>

            <template v-for="(item, index) in lineData.chars" :key="item.slotKey">
              <!-- 胖槽位：已分配和弦的槽位，实例化全功能 ChordSlot 组件 -->
              <ChordSlot
                v-if="getCharChord(item.slotKey)"
                :char="item.char"
                :chord="getCharChord(item.slotKey) ?? undefined"
                :is-drop-target="isSlotDropTarget(item.slotKey)"
                :is-picker-target="isPickerTarget(item.slotKey)"
                :key="item.slotKey"
                :left-chord-gap="isLeftAdjacentChord(lineData, index)"
                :scale-factor="viewScale"
                :slot-key="item.slotKey"
                @remove="handleRemoveSlotChord($event)"
              />

              <!-- 瘦槽位：未分配和弦的普通字符槽位。**内联而不挂组件** —— 它是谱面里数量占绝对
                   多数的一类（一行二十来个字符就是二十来个槽，长谱面可达数千个），此前每个都挂
                   SlotShell + SlotGlyph 两个实例，是单行挂载成本的大头。
                   类串与状态判据全部取自 slotStyles（与 SlotShell / SlotGlyph 同一份），故改槽的
                   留白 / 状态视觉仍只改那一处；骨架与 SlotShell 同形，只少一层内容层 —— 瘦槽位没有
                   内容，那一层在 SlotShell 里是个空 div，字形靠自身的 mt-auto 贴底。
                   这里不需要任何监听器：点击 / 按下 / Delete 已由行列表容器委托，hover 与拖拽抑制
                   已 CSS 化，而 focusin / focusout 只有添加槽用得上（焦点转交给「+」按钮）。 -->
              <div
                v-action-card
                v-else
                v-wave
                :aria-label="`字符 ${item.char === ' ' ? '空格' : item.char}，未分配和弦，按 Enter 打开和弦面板`"
                :class="[
                  SLOT_SHELL_CLASS,
                  slotShellStateClass({
                    isDropLine: isLineActiveDrop(lineData.lineId),
                    isPickerTarget: isPickerTarget(item.slotKey),
                  }),
                ]"
                :data-slot-key="item.slotKey"
                :title="openPickerSlotTitle"
                data-focusable-outline
              >
                <div
                  :class="[SLOT_DROP_LAYER_CLASS, slotDropLayerStateClass(isSlotDropTarget(item.slotKey))]"
                  aria-hidden="true"
                />
                <span :class="[SLOT_GLYPH_CLASS, slotGlyphColorClass(item.char)]">{{ slotGlyphText(item.char) }}</span>
              </div>
            </template>

            <div class="flex shrink-0 items-stretch gap-0">
              <ChordSlot
                v-for="(item, index) in lineData.endChords"
                :chord="item.chord"
                :is-drop-target="isSlotDropTarget(item.slotKey)"
                :is-picker-target="isPickerTarget(item.slotKey)"
                :key="item.slotKey"
                :left-chord-gap="isEndEdgeGap(lineData, index)"
                :scale-factor="viewScale"
                :slot-key="item.slotKey"
                @remove="handleRemoveSlotChord($event)"
              />

              <!-- 行尾添加槽：本行**有内容**（有字符或有和弦）时才挂 —— 纯空行两端各一枚「+」
                   是同一个入口的两份拷贝（同一行、同一个面板、落点也是这一行），而空行只有一行高，
                   两枚挤在一起只是噪声。留行首那枚：它紧挨行号，读作「给这一行加」。
                   判据与 .is-empty-line 同源（都以 chars 为空为「空」），两处对「空行」的理解不会分叉；
                   它读的三个量（chars / startChords / endChords）本来就在 v-memo 依赖表里，不必补条目。 -->
              <AddSlot
                v-if="lineHasContent(lineData)"
                :is-drop-line="isLineActiveDrop(lineData.lineId)"
                :is-drop-target="isSlotDropTarget(lineData.nextEndKey)"
                :is-picker-target="isPickerTarget(lineData.nextEndKey)"
                :line-hovered="hoveredLineKey === lineData.lineId"
                :size="actionButtonSize"
                :slot-key="lineData.nextEndKey"
                add-placeholder-title="点击添加行尾和弦"
                class="mx-md"
              />
            </div>

            <!-- 行末删除钮：显隐三档 —— 行被悬停（桌面）、获得焦点（键盘）、以及**没有悬停能力的设备
                 常驻可见**（触屏）。第三档是本轮加的：那类设备上 hover 永不匹配，「删掉这一行」等于
                 完全不可达 —— 与 AddSlot 的「+」同一个问题、同一个判据（(hover: none)，理由见那边：
                 它直接表达「这台设备没有悬停能力」，触屏二合一接上鼠标后是 (hover: hover)、不会误触发）。

                 常驻那一档写成 CSS 变体、不进 :class 的条件里：显隐是纯表现，媒体查询与渲染无关、
                 跨断点自动生效（槽级 hover 一律走 CSS 是同一条理由）。尺寸档没有 CSS 写法
                 （见 actionButtonSize），断点确实进了依赖表 —— 但「显隐走 CSS」这条不变量不因此改变。
                 状态类 .line-delete-idle 只挂在「行未悬停」那一档上：它带两个类、特异性 (0,2,0)，
                 压得住 :class 里的 opacity-0；行被悬停时不挂这个类，opacity-100 不受影响。
                 按钮本就没有 pointer-events-none（不像「+」），故这里只需放开不透明度。 -->
            <ActionButton
              :aria-label="deleteLineButtonTitle"
              :class="
                hoveredLineKey === lineData.lineId ? 'opacity-100' : 'line-delete-idle opacity-0 focus:opacity-100'
              "
              :icon-size="actionButtonSize"
              :size="actionButtonSize"
              :tabindex="0"
              :title="deleteLineButtonTitle"
              @pointerdown.stop
              @click.stop="deleteLine(lineData)"
              data-focusable-outline
              icon-only
              class="ml-auto shrink-0 self-center pl-sm text-danger transition-opacity duration-fast [@media(hover:none)]:[&.line-delete-idle]:opacity-100"
              icon="trash-2"
              icon-stroke="thin"
              variant="subtle"
            />
          </div>

          <div aria-hidden="true" class="line-row-gutter w-6 shrink-0 max-md:w-2" />
        </div>

        <!-- 滚动扩容哨兵：紧随当前已渲染行末尾，用户滚动接近当前底部时静默追加渲染。
             空档存在时不挂（hasGap）：尾部已含真实末尾、视口窗口更是悬在谱面中间，
             哨兵的位置与「前缀的末尾」不再对应，命中它只会把前缀挂到不需要的位置上 -->
        <div
          v-if="!hasGap && renderedLineCount < lyricsLinesWithEdges.length"
          aria-hidden="true"
          class="pointer-events-none h-8 w-full shrink-0"
          ref="sentinelRef"
        />
      </div>
    </div>

    <Teleport to="body">
      <div
        v-if="isDragging"
        :ref="setGhostEl"
        class="pointer-events-none fixed top-0 left-0 z-top will-change-transform"
      >
        <div
          class="flex -translate-1/2 scale-105 items-center justify-center rounded-md border-[1.5px] border-primary bg-surface-panel px-md py-sm shadow-floating"
        >
          <span class="text-sm leading-none font-extrabold text-primary">
            {{ ghostChordName }}
          </span>
        </div>
      </div>

      <!-- 取消投放区：位置固定（视口底部居中）、不跟手，指针落到它上面松手即取消本次拖拽。
           只在拖拽会话里出现 —— 常驻会平白占着谱面，而「取消」只在拖拽中有意义。
           刻意不吃指针事件（`pointer-events-none`）：命中判定走矩形（见 useLyricsDragDrop 的
           applyCancelZone），若在这里接管指针，它会先被 elementFromPoint 命中，
           反而把内部源的落点解析挡掉（`closest('[data-slot-key]')` 与谱面区都命中不到）。
           纵向落位是**贴底**的 1.5rem（+ 安全区），落在边缘自动滚动的判定带宽（50px）之内 ——
           故 useLyricsDragDrop 在指针悬到本区上时会停掉自动滚动，否则「想取消」会顺带把谱面滚下去。
           层级取 z-fab —— 高于谱面内容，与右侧两枚边缘滚动钮同层（两者水平位置不重叠）。
           两档视觉刻意分开「待命」与「就绪」：待命态**半透明**（opacity-70）—— 它此刻只是一条
           提示，不该与谱面争夺注意力；指针真正落到它上面（isOverCancelZone）才**过渡为实色**
           （opacity-100）并**轻微放大**（scale-105），成为「松手就取消」的明确承诺。
           三样（透明度 / 缩放 / 边框与文字色）都走同一条过渡，故 transition 取 all 而不是
           transition-colors —— 后者只覆盖颜色，缩放与透明度会瞬跳。
           缩放用 Tailwind 的 scale-*（写 `scale` 独立属性）而非拼 transform：与同元素上的
           -translate-x-1/2（写 `translate` 独立属性）互不覆盖，两者天然叠加。
           入场出场走 v-transition-scale（「浮层微弹淡入淡出」那一档）：本区是典型的浮层类瞬现元件
           （拖拽期间才在、会话一结束就走），裸 v-if 的瞬现瞬没与它的观感不搭。这条对**矩形命中**
           无影响：本区只在起拖那一刻挂上（此时指针还在源槽位上、离视口底部很远）、松手之后才摘，
           过渡期间不会有任何一次命中判定。
           **外面多包一层**（过渡挂在外层，视觉与 setCancelZoneEl 留在内层）是必需的，不是随手加的：
           v-transition-scale 往挂载元素上写 opacity，而本区自己也有 opacity-*（待命半透明 / 就绪实色），
           两者同属性、同特异性，胜负只看源序 —— transitions.scss 由 main.scss 在 Tailwind 工具层
           **之后**引入（产物里 .v-transition-scale-* 恒排在 .opacity-* 之后），过渡类因此压过工具类。
           单元素写法下入场会一路淡到 1、再在过渡类摘掉时跌回 0.7；出场更糟：起始态被抬到 1，
           先「亮一下」再淡出。拆成两层后外层的 0→1 与内层的 0.7 是相乘关系，两端都连续。
           命中的矩形仍取内层（它就是那个可见的盒子）：外层只有定位与过渡的 transform。 -->
      <Transition name="v-transition-scale">
        <div
          v-if="isDragging"
          class="pointer-events-none fixed bottom-[calc(1.5rem+env(safe-area-inset-bottom,0px))] left-1/2 z-fab -translate-x-1/2"
        >
          <div
            :class="
              isOverCancelZone
                ? 'scale-105 border-solid border-danger text-danger opacity-100'
                : 'border-dashed border-border-base text-fg-muted opacity-70'
            "
            :ref="setCancelZoneEl"
            class="flex items-center gap-sm rounded-lg border-[1.5px] bg-surface-panel px-lg py-md shadow-floating transition-all duration-fast ease-standard"
          >
            <BaseIcon name="trash-2" />
            <span class="text-xs leading-none font-bold whitespace-nowrap">拖到此处取消</span>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- 两枚边缘滚动钮：窄屏贴边收一档 —— 桌面那套（`right: 2rem` ≈ 44.5px、`bottom: 7rem/4rem`）
         在手机上把按钮推到离屏幕边缘一成屏宽的位置，拇指要跨过去才够得着。
         窄屏取 `right: 1rem`（与本平台浮动元件的默认边距同值，见 floatingPositions 的 ALIGN_CLASS_MAP
         `end: right-4`），纵向同时收到 `5rem / 2.5rem`：两钮间距不变，整摞下移后其顶边 ≈ 6.5rem，
         正好与本容器给窄屏预留的底部留白（`max-md:pb-[calc(6.5rem+…)]`）对齐。
         判据是脚本里的 `isMobile`，与本组件其它窄屏取舍同一处。 -->
    <BaseFab
      :bottom="isMobile ? '5rem' : '7rem'"
      :hidden="!scrollTopVisible"
      :right="isMobile ? '1rem' : '2rem'"
      @click="scrollToTop()"
      align="end"
      aria-label="滚动到顶部"
      icon="chevron-up"
      tooltip="滚动到顶部"
    />
    <BaseFab
      :bottom="isMobile ? '2.5rem' : '4rem'"
      :hidden="!scrollBottomVisible"
      :right="isMobile ? '1rem' : '2rem'"
      @click="handleScrollToBottom()"
      align="end"
      aria-label="滚动到底部"
      icon="chevron-down"
      tooltip="滚动到底部"
    />

    <!-- 和弦选择面板（chord 域装配，外壳为 platform/ui 的 BaseFloatingPanel）：贴右侧、非模态，
         面板只作拖动来源，把卡片拖到字符槽即完成绑定；面板由点击字符槽开启、
         关闭靠外壳本身的关闭按钮 / Escape 手动完成；
         面板与视口上/右/下三条留白由外壳的 intercept 能力接管指针事件。
         context-key 传当前乐谱 id：换歌时清空面板的选择记忆（面板不读本域 store，保持与宿主解耦） -->
    <ChordPickerPanel
      v-model:visible="isPickerPanelOpen"
      :is-dragging
      :context-key="scoreEditor.activeSongId"
      :drag-chord-starter="startExternalChordDrag"
      @select="handlePickerSelect($event)"
    />
  </BaseScrollArea>
</template>

<script setup lang="ts">
import { computed, nextTick, onActivated, onBeforeUnmount, onDeactivated, ref, useTemplateRef, watch } from 'vue';

import ChordPickerPanel from '@/domains/chord/components/ChordPickerPanel.vue';
import ActionButton from '@/platform/ui/button/ActionButton.vue';
import Feedback from '@/platform/ui/feedback/Feedback.vue';
import BaseFab from '@/platform/ui/floating-bar/BaseFab.vue';
import BaseIcon from '@/platform/ui/icons/BaseIcon.vue';
import BaseScrollArea from '@/platform/ui/scroll-area/BaseScrollArea.vue';
import { getChordName } from '@/domains/chord/theory/theory';
import { useLineChordSignatures } from '@/domains/score/editor/composables/useLineChordSignatures';
import { useLineRowHeightTransition } from '@/domains/score/editor/composables/useLineRowHeightTransition';
import { useLyricsDragDrop } from '@/domains/score/editor/composables/useLyricsDragDrop';
import { useScoreLinesData } from '@/domains/score/editor/composables/useScoreLinesData';
import { useScoreViewportRender } from '@/domains/score/editor/composables/useScoreViewportRender';
import { useViewZoomSettle } from '@/domains/score/editor/composables/useViewZoomSettle';
import { useScoreEditorStore } from '@/domains/score/editor/store/scoreEditorStore';
import { lineCharChord, lineSlots, parseSlotKey, slotKeyLinePrefix } from '@/domains/score/model/scoreModel';
import { useEdgeScroll } from '@/platform/composables/useEdgeScroll';
import { useResponsive } from '@/platform/composables/useResponsive';
import { useUiStore } from '@/platform/store/uiStore';
import { useScrollAreaElement } from '@/platform/ui/scroll-area/scrollAreaHandle';

import AddSlot from './slot/AddSlot.vue';
import ChordSlot from './slot/ChordSlot.vue';
import {
  SLOT_DROP_LAYER_CLASS,
  SLOT_GLYPH_CLASS,
  SLOT_SHELL_CLASS,
  slotDropLayerStateClass,
  slotGlyphColorClass,
  slotGlyphText,
  slotShellStateClass,
} from './slot/slotStyles';

import type { Chord } from '@/domains/chord/types';
import type { LineData } from '@/domains/score/preview/services/scoreExportCanvas';
import type { LineId, SlotKey } from '@/domains/score/types';
import type { ComponentSize } from '@/platform/types';
import type { ScrollAreaHandle } from '@/platform/ui/scroll-area/scrollAreaHandle';

defineOptions({ name: 'ScoreInteractiveArea' });

const scoreEditor = useScoreEditorStore();
const uiStore = useUiStore();
const { isMobile } = useResponsive();

/**
 * 排列区在窄屏（< md）上的整体缩放：**字与指板一起缩到 0.7**。
 *
 * 手机上一个字符是 0.875rem（22.25px 根字号 ⇒ 19.5px，即本项目的 `text-sm` 档）、一张六弦四品
 * 指板图卡是 101 × 130px（scale 1.4），一行装不下几个字、也装不下几张图 —— 排列和弦要
 * 「一眼看到一行怎么排」，于是整块一起缩，比例才不会失衡（只缩字的话指板反而更显大）。
 * 0.7 是把字符落到 ≈ 13.7px（`text-2xs` 档 13.9px 上下）、图卡落到 71 × 91px 的取值；
 * 再想微调由用户偏好承担（顶栏偏好里的「字号 / 和弦缩放」，本系数与它相乘）。
 *
 * 两个消费方必须吃同一个系数：字走 CSS（容器上的 `--score-font-scale`），指板是画布、尺寸走 JS
 * （`ChordSlot` 的 `scale` prop）—— 故这里算一次，一处进样式、一处当 prop 传下去。
 * 行间 gap 也属同一套纵向节奏，但它落在 CSS 上（容器类的 `max-md:gap-3xs`），不经过本系数。
 *
 * 这是**叠加在用户设置之上**的视口系数，不写进 store：`arrangeFontScale` 是用户偏好（换设备也该保留），
 * 本系数是同一份偏好在窄屏上的呈现，两者相乘。
 */
const NARROW_VIEW_SCALE = 0.7;
const viewScale = computed(() => (isMobile.value ? NARROW_VIEW_SCALE : 1));

/**
 * 行内三枚图标钮（行首「+」/ 行尾「+」/ 行末删除）共用的控件尺寸档：移动端整体小一档。
 *
 * 为什么走 prop 而不是像「+」的常驻那样写成 CSS 变体：尺寸档是控件标尺里的字面量
 * （lg 方形 2.3rem / md 1.9rem，见 platform/ui/controlSizes），没有等价的媒体查询写法 ——
 * 硬写 `max-md:h-[1.9rem]` 等于把标尺字典抄了第二份，改一档要满仓找。
 * 代价是本行的 v-memo 依赖表里多了 `isMobile`（跨断点那一瞬让已渲染行各重渲一次）；
 * 反过来这也顺手补上了 `viewScale` 此前没进依赖表留下的同一个缺口。
 *
 * 三枚钮共用同一个值、由宿主统一下发：它们是同一行里并列的三枚，各组件自己读断点迟早走散。
 */
const actionButtonSize = computed<ComponentSize>(() => (isMobile.value ? 'md' : 'lg'));

const scoreZoneAreaRef = useTemplateRef<ScrollAreaHandle>('scoreZoneAreaRef');
/** 谱面滚动容器元素（虚拟化预加载 / 拖拽自动滚动 / 边缘滚动入口 / 滚动位置存档都需要元素本身） */
const scoreZoneRef = useScrollAreaElement(scoreZoneAreaRef);

/** 边缘滚动入口：顶部/底部浮动按钮。内容可滚且未贴该边时可见，点击平滑滚至对应边 */
const {
  visible: edgeVisible,
  refresh: refreshEdgeVisibility,
  scrollToTop,
  scrollToBottom,
} = useEdgeScroll(scoreZoneRef, {
  edges: ['top', 'bottom'],
});
const scrollTopVisible = computed(() => edgeVisible.top);
const scrollBottomVisible = computed(() => edgeVisible.bottom);

const hoveredLineKey = ref<string | null>(null);
/** 选器和弦浮动面板开关（非模态：不占布局、不作遮罩，支持拖拽和弦到字符槽） */
const isPickerPanelOpen = ref(false);
/** 删除行按钮的无障碍文本与悬停提示 */
const deleteLineButtonTitle = '删除此行';
/** 瘦槽位（未绑和弦的普通字符）的原生悬停提示；有和弦的槽由 ChordSlot 自己按「能不能拖」给两档 */
const openPickerSlotTitle = '点击打开和弦面板';

const { lyricsLinesWithEdges, chordsLookupMap } = useScoreLinesData();

/** 行级和弦绑定签名与「本行有没有和弦」（口径见 useLineChordSignatures） */
const { lineChordSignatures, lineHasChord } = useLineChordSignatures({
  chordsLookupMap,
  getChordMap: () => scoreEditor.activeSong?.chordMap,
});

/**
 * 手势缩放（双指捏合 / 触控板捏合 / Ctrl+滚轮）与它的预览 / 提交两段式收口
 * —— 不变量与代价见 useViewZoomSettle 的文件头。
 *
 * `onGestureStart` 里取消拖拽：第一根手指可能已压在某个和弦上起了长按计时（LONG_PRESS_DELAY），
 * 不取消就会在捏合途中起拖、松手时把和弦丢到别处。
 * `onSettleExpand` 是沉降窗口收口之后的那一次补挂（提交会改内容总高，故必须按新几何算）。
 */
const { viewZoomStyle, toContainerPx, toVisualPx, isSettling, cancelViewZoomSettling } = useViewZoomSettle({
  scoreZoneRef,
  onSettleExpand: el => expandAtViewport(el),
  refreshEdgeVisibility,
  onGestureStart: () => cancelDrag(),
});

/**
 * 渐进式视口渲染：哪些行真正挂进 DOM、其余行怎么以占位高度参与布局，以及三条补挂路径
 * —— 分段模型、空档冻结、沉降让路三条不变量见 useScoreViewportRender 的文件头。
 */
const {
  renderedLineCount,
  lineRowHeights,
  visibleLines,
  gapMarginOf,
  hasGap,
  handleScroll,
  handleScrollToBottom,
  expandNextBatch,
  expandAtViewport,
  ensureSufficientRenderedLines,
  setupSentinelObserver,
  disposeSentinelObserver,
  cancelPendingExpansion,
  syncSongState,
} = useScoreViewportRender({
  scoreZoneRef,
  lyricsLinesWithEdges,
  lineHasChord,
  toContainerPx,
  toVisualPx,
  isZoomSettling: isSettling,
  refreshEdgeVisibility,
  scrollToBottom,
  getActiveSongId: () => scoreEditor.activeSongId,
});

/** 行号展示为两位数字（01、02…） */
const formatLineIndex = (index: number) => String(index + 1).padStart(2, '0');

/** 按槽位键实时查找当前绑定的和弦 */
const getCharChord = (slotKey: SlotKey): Chord | null => {
  const song = scoreEditor.activeSong;
  if (!song) return null;
  const parsed = parseSlotKey(slotKey);
  if (!parsed || parsed.type !== 'char') return null;
  const chordId = lineCharChord(song.chordMap, parsed.lineId, parsed.index);
  if (!chordId) return null;
  return chordsLookupMap.value.get(chordId) ?? null;
};

/** 按槽位键实时查找当前绑定的和弦（字符槽与行首 / 行尾边槽通用；无绑定返回 null） */
const slotChordOf = (slotKey: SlotKey): Chord | null => {
  const song = scoreEditor.activeSong;
  if (!song) return null;
  const parsed = parseSlotKey(slotKey);
  if (!parsed) return null;
  // 字符槽与 getCharChord 同源（都走 lineCharChord）；边槽是行级密列表，按下标直取
  const chordId =
    parsed.type === 'char'
      ? lineCharChord(song.chordMap, parsed.lineId, parsed.index)
      : (lineSlots(song.chordMap, parsed.lineId)[parsed.type][parsed.index] ?? null);
  return chordId ? (chordsLookupMap.value.get(chordId) ?? null) : null;
};

/**
 * 撤销并回报结果：撤销栈空（historyIndex 已到初始快照）时 `undo` 是空操作，
 * 不能再谎报「已恢复」。回报文案在删行 / 清槽和弦两条路径上必须一致，
 * 否则同一颗「撤销」按钮会按发起处给出两种说法。
 *
 * @param rowEl 本次撤销会复原的那一行（清槽和弦传得进来）：撤销同样要让行高走过渡，
 *              否则「删掉时滑一下、撤销时直接弹回」——同一条路径两种手感。
 */
const undoWithFeedback = async (rowEl?: HTMLElement | null) => {
  // 旧高必须在 undo **之前**量并当场钉住，不能等它回来再钉：`undo` 内部要让出一个宏任务
  // 结算响应式传播，而复原后的那一帧已经按自然高排出来并画上去了 —— 事后再钉，用户看到的是
  // 「先弹回满高、再缩回去重放一遍动画」。钉住之后整个等待期行高都停在旧值上，一帧都不露。
  const fromHeight = rowEl ? pinRowHeight(rowEl) : 0;
  let restored: boolean;
  try {
    restored = await scoreEditor.undo();
  } catch (error) {
    // 复原抛错时不能把行留在钉住状态（此后内容再变也不动），交回 auto 后原样抛出
    if (rowEl) releaseRowHeight(rowEl);
    throw error;
  }
  if (restored) uiStore.message.success('已恢复数据');
  else uiStore.message.info('没有可撤销的操作');
  if (!rowEl) return;
  // 复原成功 → 从旧高过渡到复原后的新高；没有可撤销的操作（或复原根本没动这一行）→ 直接交回 auto
  if (restored) animateLineRowHeight(rowEl, fromHeight);
  else releaseRowHeight(rowEl);
};

/**
 * 「可撤销的删除」通知：通知而非常驻 Message —— 撤销入口随 toast 飘走就没了，
 * 用户必须能回看并补做（与删指法 / 删分组 / 删乐谱三处同款）。
 */
const notifyUndoableDeletion = (title: string, undoRowEl?: HTMLElement | null) =>
  // 必须包一层：onAction 会把点击事件作为首参传进来，直接把 undoWithFeedback 交出去
  // 等于让事件对象冒充 rowEl（见其签名）
  void uiStore.notice.info({ title, actionText: '撤销', onAction: () => undoWithFeedback(undoRowEl) });

/** 行高的钉住 / 过渡 / 交回 auto（三条不变量见 useLineRowHeightTransition） */
const { pinRowHeight, releaseRowHeight, animateLineRowHeight, lineRowElOf } = useLineRowHeightTransition({
  scoreZoneRef,
  toContainerPx,
});

/**
 * 清除某槽位上的和弦（悬停删除钮与 Delete / Backspace 两条入口共用）。
 *
 * 此前这条路径**完全静默**：两条入口都直连 store，槽上的和弦凭空消失、既无提示也无撤销入口
 * （撤销只能靠用户自己想起来去点工具栏那颗按钮）。现按「可撤销的删除」统一处理。
 *
 * 和弦名必须在清除**之前**取：store 一落库，slotChordOf 就查不到了。
 * 槽位本就没有绑定（重复 Delete 等）时早退：既不空推一次撤销栈，也不弹「已清除」的假提示。
 */
const handleRemoveSlotChord = (slotKey: SlotKey) => {
  const chord = slotChordOf(slotKey);
  if (!chord) return;
  // 行高与旧高都要在改数据之前拿：清掉本行最后一个和弦时整行会矮一大截，
  // 而那次高度变化没有过渡（CSS 对 auto ↔ auto 无法插值），要手动补一次（见 animateLineRowHeight）。
  // 旧高换算成容器局部 px —— animateLineRowHeight 写的是容器内长度，两个口径必须一致
  const rowEl = lineRowElOf(slotKey);
  const fromHeight = rowEl ? toContainerPx(rowEl.getBoundingClientRect().height) : 0;
  scoreEditor.removeSlotChord(slotKey);
  notifyUndoableDeletion(`已清除和弦「${getChordName(chord)}」`, rowEl);
  // 等 DOM 换完再钉：animateLineRowHeight 量的是**此刻已排好版**的高度，而数据刚落库时
  // 新行高还没上屏。nextTick 的回调在微任务里跑、绘制之前跑完，故中间不会露出「还没钉住」的一帧
  if (rowEl) void nextTick().then(() => animateLineRowHeight(rowEl, fromHeight));
};

/**
 * 本行有没有内容（字符或和弦）：决定行尾那枚「+」挂不挂。
 *
 * 纯空行只留行首一枚 —— 两端各一枚「+」在空行上是同一个入口的两份拷贝（同一行、同一个面板、
 * 落点也都是这一行），而空行只有一行高，两枚挤在一起只是噪声。留行首那枚：它紧挨行号，
 * 读作「给这一行加」。有任何一个字符或任何一侧的边和弦就算「有内容」，两端都留 ——
 * 字符层与两侧边和弦各是一个独立的落点序列，少一端就等于少一条入口。
 * 判据与行容器的 .is-empty-line 同源（都以 chars 为空为「空」），两处不会对「空行」各执一词。
 */
const lineHasContent = (lineData: LineData): boolean =>
  lineData.chars.length > 0 || lineData.startChords.length > 0 || lineData.endChords.length > 0;

/** 字符槽左侧（前一个字符或行首边）是否紧邻和弦，用于渲染与和弦的间距 */
const isLeftAdjacentChord = (lineData: LineData, currentIndex: number): boolean => {
  const currentSlotKey = lineData.chars[currentIndex]?.slotKey;
  if (!currentSlotKey || !getCharChord(currentSlotKey)) return false;

  if (currentIndex > 0) {
    const prevCharSlotKey = lineData.chars[currentIndex - 1]?.slotKey;
    if (prevCharSlotKey && getCharChord(prevCharSlotKey)) return true;
  } else if (lineData.startChords.length > 0) return true;

  return false;
};

/** 行尾边槽左侧（末字符或前一边槽）是否为和弦，用于渲染间距 */
const isEndEdgeGap = (lineData: LineData, index: number): boolean => {
  const edge = lineData.endChords[index];
  if (!edge || !edge.chord) return false;
  if (index === 0) {
    const lastChar = lineData.chars.at(-1);
    return Boolean(lastChar && getCharChord(lastChar.slotKey));
  }
  return Boolean(lineData.endChords[index - 1]?.chord);
};

/** 删除歌词行：按 lineId 实时反查索引，避免 v-memo 缓存 vnode 中陈旧 lineIdx 闭包删错行 */
const deleteLine = (lineData: LineData) => {
  const song = scoreEditor.activeSong;
  if (!song) return;
  const lines = song.lyrics.split('\n');
  const lineIdx = song.lineIds.indexOf(lineData.lineId as LineId);
  if (lineIdx < 0 || lineIdx >= lines.length) return;
  lines.splice(lineIdx, 1);
  scoreEditor.updateLyrics(lines.join('\n'));
  notifyUndoableDeletion(`已删除第 ${lineIdx + 1} 行`);
};

const {
  isDragging,
  isSuppressingClick,
  isOverCancelZone,
  draggingSlotKey,
  dragOverSlotKey,
  activeDropLineId,
  ghostChordName,
  setGhostEl,
  setCancelZoneEl,
  handlePointerDown,
  startExternalChordDrag,
  cancelDrag,
} = useLyricsDragDrop(scoreZoneRef);

/** 本槽位是否为当前拖拽落点（决定是否渲染落点边框提示）；
 *  拖拽经过任意槽位（含外部拖拽源、无源槽位）都给提示，唯独拖拽源自身除外 */
const isSlotDropTarget = (slotKey: string): boolean =>
  isDragging.value && dragOverSlotKey.value === slotKey && draggingSlotKey.value !== slotKey;

/** 落点按行归约：slotKey 前缀判定本行是否含当前落点（供 v-memo 按行粒度失效）。
 *  前缀走 slotKeyLinePrefix（槽位键形态的唯一真相源），不在模板里手写 `line_${lineId}_` */
const lineDropTargetKey = (lineId: string): string | null =>
  isDragging.value && dragOverSlotKey.value?.startsWith(slotKeyLinePrefix(lineId)) ? dragOverSlotKey.value : null;

// 拖拽中的落地规则提示：neutral message 常驻不自动消失、无转圈（非后台任务），拖拽结束手动移除
let dragHintMessageId: number | null = null;
watch(isDragging, dragging => {
  if (dragging)
    dragHintMessageId = uiStore.message.neutral('拖到空槽：移动  拖到和弦：替换', {
      closable: false,
      customClass: 'drag-hint-toast',
    });
  else if (dragHintMessageId !== null) {
    uiStore.removeMessage(dragHintMessageId);
    dragHintMessageId = null;
  }
});

const clearDragHintMessage = () => {
  if (dragHintMessageId !== null) {
    uiStore.removeMessage(dragHintMessageId);
    dragHintMessageId = null;
  }
};

let isAreaActive = true;

onDeactivated(() => {
  isAreaActive = false;
  // 离开本区（切路由 / 切页签被 KeepAlive 缓存）时收起选器和弦面板：
  // 面板与其中的编辑抽屉都 Teleport 到 body，而渲染器对 Teleport 一律按 REORDER 搬移
  // （只挪锚点、不动已被传送的内容），宿主停用时它们不会随组件树一起摘除，
  // 结果就是切到别的页面后浮层仍挂在 body 上继续显示。故此处主动闭合成关闭态。
  isPickerPanelOpen.value = false;
  cancelPendingExpansion();
  cancelViewZoomSettling();
  clearDragHintMessage();
  disposeSentinelObserver();
  const el = scoreZoneRef.value;
  if (el) {
    savedScroll.top = el.scrollTop;
    savedScroll.left = el.scrollLeft;
  }
});

onBeforeUnmount(() => {
  cancelPendingExpansion();
  cancelViewZoomSettling();
  clearDragHintMessage();
  disposeSentinelObserver();
});

// —— 排列区滚动位置保持 ——
// 打点实证：KeepAlive 缓存本已命中（切回仅触发 onActivated、不重建），但浏览器会在元素 detach 后再
// attach 时把其 scrollTop/scrollLeft 清零。故在 deactivate 时保存偏移，activate 时显式恢复；
// 采用固定 key="interactive-area" 实例复用后，切歌（activeSongId 变化）需主动重置滚动偏移。
const savedScroll = { top: 0, left: 0 };

onActivated(async () => {
  isAreaActive = true;
  setupSentinelObserver();
  // 渲染窗口锚在行下标上，切歌即失效（见 syncSongState）：重置之后滚动偏移与视口一并归零
  if (syncSongState()) {
    savedScroll.top = 0;
    savedScroll.left = 0;
    const el = scoreZoneRef.value;
    if (el) {
      el.scrollTop = 0;
      el.scrollLeft = 0;
    }
  }
  void ensureSufficientRenderedLines();
  const el = scoreZoneRef.value;
  if (!el || (savedScroll.top === 0 && savedScroll.left === 0)) return;
  await nextTick();
  el.scrollTo({ top: savedScroll.top, left: savedScroll.left, behavior: 'auto' });
});

// 切歌时清空保存的滚动位置，重置渐进渲染行数（含尾部窗口），并将视口滚回顶部（由于复用了固定 key 的组件实例）
watch(
  () => scoreEditor.activeSongId,
  () => {
    if (!isAreaActive) return;
    cancelPendingExpansion();
    cancelViewZoomSettling();
    syncSongState();
    hoveredLineKey.value = null;
    savedScroll.top = 0;
    savedScroll.left = 0;
    const el = scoreZoneRef.value;
    if (el) {
      el.scrollTop = 0;
      el.scrollLeft = 0;
    }
    void ensureSufficientRenderedLines();
  }
);

/**
 * 打开面板时点中的目标槽位：面板内点击卡片即把和弦落到这里。
 * 面板仍是拖拽落位的主路径（可拖到任意槽），这里补的是「点一下就填」的直给路径——
 * 此前点击卡片在本宿主下完全没有反应（只注入了 drag-chord-starter，从未接 select），
 * 新用户面对「点开一个面板、然后要去拖东西」的两步操作无从下手。
 * 置 null 表示面板不是由槽位点击打开的，此时点卡片不落位。
 */
const pickerTargetSlotKey = ref<SlotKey | null>(null);

/** 面板关闭（关闭按钮 / Escape / 离开本区）即清空目标高亮：避免面板已收、字符仍高亮的残留状态 */
watch(isPickerPanelOpen, open => {
  if (!open) pickerTargetSlotKey.value = null;
});

/** 面板目标按行归约（供 v-memo 按行粒度失效）：目标槽位属于本行时给出该槽位键，否则 null。
 *  与 lineDropTargetKey 同构，但**必须带上槽位键本身、不能只给行号**——面板开着时在同一行内把目标从
 *  一个字符切到另一个字符，只比行号会让本行 memo 继续命中，高亮不跟着挪窝。
 *  前缀判定不精确时最多让本行多失效一次（真正决定高亮落哪一格的是 isPickerTarget 的精确相等），无害。 */
const linePickerTargetKey = (lineId: string): string | null =>
  pickerTargetSlotKey.value?.startsWith(slotKeyLinePrefix(lineId)) ? pickerTargetSlotKey.value : null;

/** 用户点击字符槽：打开选器和弦浮动面板并记住本次点中的槽位。
 *  面板已开时再点槽位只把目标切到新槽、不切换开关；关闭走手动（外壳关闭按钮 / Escape）。
 *  拖拽中或点击抑制期忽略，避免拖拽松手误触发 */
const handleOpenPicker = (slotKey?: SlotKey) => {
  if (isDragging.value || isSuppressingClick.value) return;
  isPickerPanelOpen.value = true;
  pickerTargetSlotKey.value = slotKey ?? null;
};

/**
 * 槽位事件委托：从事件源向上找最近的槽根元素。
 * 槽根是谱面里唯一带 `data-slot-key` 的节点（拖拽系统也按它寻址），故该属性本身就是寻址契约；
 * 落在槽外的目标（行删除钮、FAB、面板等）一律返回 null，天然被排除。
 */
const slotKeyFromEvent = (e: Event): SlotKey | null => {
  const el = (e.target as HTMLElement | null)?.closest<HTMLElement>('[data-slot-key]');
  const key = el?.dataset['slotKey'];
  return key ? (key as SlotKey) : null;
};

/** 槽位点击：拦下冒泡与默认行为后打开选器和弦面板（v-action-card 把 Enter / Space 转成的 click 同走此路） */
const handleDelegatedClick = (e: MouseEvent) => {
  const slotKey = slotKeyFromEvent(e);
  if (!slotKey) return;
  e.stopPropagation();
  e.preventDefault();
  handleOpenPicker(slotKey);
};

/** 槽位按下：仅当该槽确实绑定了和弦时登记「移动」拖拽会话（空槽没有可拖动的内容） */
const handleDelegatedPointerDown = (e: PointerEvent) => {
  const slotKey = slotKeyFromEvent(e);
  if (!slotKey) return;
  // 按下的是真实按钮（悬停删除钮等）：不登记拖拽意图，避免「点删除」被当成拖动起点
  if ((e.target as HTMLElement).closest('button')) return;
  const chord = slotChordOf(slotKey);
  if (!chord) return;
  handlePointerDown({ event: e, slotKey, chord });
};

/** Delete / Backspace：仅当该槽确实绑定了和弦时清除（空槽不拦截该键，交回上层） */
const handleDelegatedDelete = (e: KeyboardEvent) => {
  const slotKey = slotKeyFromEvent(e);
  if (!slotKey || !slotChordOf(slotKey)) return;
  e.stopPropagation();
  e.preventDefault();
  handleRemoveSlotChord(slotKey);
};

/** 本槽位是否为当前选器和弦面板的目标（驱动其高亮提示「卡片会写进哪一格」） */
const isPickerTarget = (slotKey: SlotKey): boolean => pickerTargetSlotKey.value === slotKey;

/**
 * 面板内点击 / 回车选中卡片：把和弦落到当前目标槽位，然后保持面板打开。
 * 目标槽位（高亮的字符）不随填充移动，再点卡片会覆盖它；要换填别的字符需先点对应字符把高亮切过去。
 * 全靠高亮告诉用户「现在会写进哪一格」，配合新的"点击字符不关面板"，覆盖是显式可见、非静默的。
 */
const handlePickerSelect = (chord: Chord) => {
  const slotKey = pickerTargetSlotKey.value;
  if (!slotKey) return;
  scoreEditor.setSlotChord(slotKey, chord);
};

/** 本行是否为当前拖拽落点所在的行（由稳定的 activeDropLineId 驱动，跨越字符间隙时恒定为 true，绝无间距闪烁） */
const isLineActiveDrop = (lineId: string): boolean =>
  isDragging.value &&
  (activeDropLineId.value === lineId ||
    (dragOverSlotKey.value !== null && parseSlotKey(dragOverSlotKey.value)?.lineId === lineId));

defineExpose({ scoreZoneRef, expandNextBatch, handleScrollToBottom });
</script>

<style scoped lang="scss">
/* 视口外歌词行跳过样式计算 / 文字排版 / Canvas 绘制，零 JS 介入实现准虚拟化，
   消除长乐谱切歌时主线程同步挂载数万节点的卡顿。contain-intrinsic-size 给出离屏占位高度。

   占位高度必须贴近真实行高：它是「跳过态」下唯一参与布局的数字，而内容总高（scrollHeight）
   直接决定「滚动到底部」的落点。占位偏小则总高偏小 —— scrollTo 的目标算不到真实底部，
   且滚动本身会把沿途的行「点亮」成实测高度继续把总高顶上去，动画必然停在半路；
   占位偏大则行进入视口时会反向缩回，同样是一次布局跳动。
   行高几乎只由「有没有指板图卡」决定（有卡行 ≈ 一个指板图的高度 + 字符行，无卡行只剩字符行），
   两档差着数倍，故分两档取实测最大值，由宿主在量到之后经 --score-line-height-* 下发（见
   measureLineRowHeights）；量到之前退回 120px 兜底。
   ⚠️ 下发来的这两个值是**容器局部 px**（宿主按局部 px 记、也按局部 px 下发）：本属性落在容器内，
   浏览器会再乘一次倍率，正好等于真实行高；若改下发量到的视觉 px，占位高度就会被放大 zoom 倍
   （见 toContainerPx）。反过来说，这两个值**不含**倍率 —— 捏合改倍率时它们不变，继承给整棵子树的
   变量才不会每帧失效一次（那正是「捏合很卡」的一大来源）。

   两个长度值分别是「宽 | 高」两个轴的占位：宽轴保持 120px 不动（行有 min-w-full，
   实际由容器宽度决定），只把高轴换成实测值。

   auto 前缀：记住该行上次渲染的实际尺寸，离屏占位不再退回 0×120 兜底值，
   避免 KeepAlive 重挂载/滚动到行时的二次布局跳动（宽度按真实内容算，滚动条不闪跳）。 */
.line-row {
  content-visibility: auto;
  contain-intrinsic-size: auto 120px auto var(--score-line-height-plain, 120px);
}

/* 行内绑了和弦（会渲染指板图卡）：占位高度改用「有卡行」那一档的实测值 */
.line-row.is-chord-row {
  contain-intrinsic-size: auto 120px auto var(--score-line-height-chord, 120px);
}

/* 拖拽期间这里曾有一条「所有纯空行同时撑高到 116px」的规则，为的是让空行行首 / 行尾也有落点高度。
   现已移除：它要求整篇空行一起撑高，代价是拖拽起手瞬间全篇布局失效（长谱面一次几十毫秒），
   而它要解决的问题已经由槽级的 .is-drop-line 覆盖 —— 落点行（且只有落点行）的槽撑开成
   min-h-[108px] 的落位目标，空行因此同样有落点高度，且撑开范围严格按行归约。
   行的 min-h-0 与过渡保留：前者是行内 flex 子项能收缩的前提，后者承担行自身的 hover 边框 / 底色过渡。
   注：原规则的写法本身也是坏的 —— 「:global(前缀) + 后缀选择器」会让 scoped 插件把后缀整段丢掉，
   min-height 实际落在 body 上，即「全篇空行撑高」从未真正生效过（见 ChordSlot 的样式注释）。 */

/* 槽级样式（.char-box 基线、.is-drop-line*、.is-picker-target、拖拽源 / 按压态）与字形样式
   （.char-text）都不在本文件：类串的单一来源是 `slot/slotStyles.ts`，由 SlotShell / SlotGlyph
   与下面模板里**内联的瘦槽位**共用；字形的 hover 染色是 SlotGlyph 的 `:global()` 规则（整条不带
   scoped 属性，内联字形同样命中）。故这里没有任何槽级定义需要维护。 */
</style>
