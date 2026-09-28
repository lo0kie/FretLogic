<template>
  <!-- 紧凑档（< lg）改为可换行：左右两组各自不再收缩、放不下就整组落到下一行。
       乐谱 Tab 栏只在「顶栏装不下它」时独占一行（实测判据，见下方注释），否则是绝对铺满居中的一层 ——
       「装不装得下」按实测宽度判而非写死的断点，宽屏也逐帧响应式：右组图标变多（dev 构建多两枚）
       或临界宽度下估算失真时，宁落一行也不把 Tab 压到图标上。
       右组在极窄档（< 480px）只留「页内主操作 + 设置 + 更多」，其余动作并入「更多」菜单 ——
       否则「左组 + 右组」这一行装不下，两组会各占一行、连 Tab 栏一起变成三层（见 isActionFold）。
       第一行的两组各自带 `min-h-10`：`<header>` 上那条 `min-h-10` 只保证**盒子**不小于 2.5rem，
       而多行容器的行高由内容决定 —— 乐谱路由多一行 Tab 栏时整盒早已超过它，第一行于是塌到内容高
       （≈42.3px），比工作台路由（单行、整盒 55.6px）矮一截，切换路由看得见跳动；挂在两组上之后，
       第一行在任何行数下都与工作台路由的顶栏等高。
       不做媒体查询之外的取舍 —— 其余判据见脚本里的 isNarrow / isActionFold。 -->
  <header
    :class="[isTabRowOwnLine ? 'flex-wrap' : '', isNarrow ? 'px-md' : 'px-4']"
    class="relative z-header flex min-h-10 w-full shrink-0 items-center justify-between border-b border-glass-border bg-surface-panel select-none wco:min-h-[max(2.5rem,env(titlebar-area-height,2.5rem))] wco:pr-[max(env(titlebar-area-inset-right,0px),1rem)] wco:pl-[max(env(titlebar-area-inset-left,0px),1rem)] wco:[-webkit-app-region:drag] wco:[app-region:drag]"
    ref="headerRef"
  >
    <!-- 两组的宽度档：窄屏 `flex-none`（不参与收缩，装不下就整组换行），宽档 `basis-1/2`。
         窄屏那个档位的理由：`min-w-0 flex-1` 会让它被压到内容溢出，而它里面的分段导航是定宽控件，
         压不出「更窄」的样子，只会互相盖住。
         间距也从 gap-sm 收到 gap-xs：窄屏每像素都要省，而分隔线已由间距代替。
         `min-h-10`：本组是第一行的成员，高度必须恒等于工作台路由的顶栏（理由见文件头注释）。

         宽档**不能写 `flex-1`**：`flex-1` 的 flex-basis 是 0%，而「独占一行」档下 Tab 栏是
         `basis-full`（100%）—— 0% + 0% + 100% 正好等于容器宽，flex 的换行判定认为「装得下」，
         于是三者挤在同一行、两个组各被压成 0 宽：右组 `justify-end` 把内容整片溢出到屏幕外
         （按钮区消失），左组 `justify-start` 的内容向右溢出、正好被 Tab 栏压住（重叠）。
         `basis-1/2` 把两组的 flex-basis 抬到 50%：50% + 50% + 100% > 100%，Tab 栏这才真的落到第二行；
         而 50% + 50% = 100% 无剩余空间可分配，宽档下两组仍各占半幅 —— 与 `flex-1` 的几何逐像素相同。
         `min-w-0` 保留：内容比半幅宽时仍要能收缩。 -->
    <div
      :class="[NO_DRAG_REGION_CLASS, isNarrow ? 'flex-none gap-xs' : 'min-w-0 basis-1/2']"
      class="flex min-h-10 items-center justify-start"
      ref="leftGroupRef"
    >
      <BaseCheckbox
        v-model="uiStore.isLeftOpen"
        v-tooltip="uiStore.isLeftOpen ? '收起侧边栏' : '展开侧边栏'"
        buttonized
        icon-only
        aria-label="切换侧边栏"
        icon="panel-left"
      />

      <!-- 分隔线的左右 inset（1rem）比它自己那 2px 宽得多：窄屏每像素都要省，改用左组的 gap-xs 拉开间距 -->
      <BaseDivider
        v-if="!isNarrow"
        :thickness="2"
        class="opacity-80"
        color="glass"
        inset="1rem"
        length="0.875rem"
        orientation="vertical"
      />

      <div class="flex items-center gap-md">
        <!-- 品牌文字恒为纯展示：右侧分段导航已常驻「和弦 / 乐谱」两个入口，
             再让 logo 可点去工作台就与导航项完全重复（同一个目的地两套入口）。
             纯展示也顺带去掉了它自己那层焦点环与 aria 语义（不再是一个可操作控件）。
             窄屏收起：它是装饰性文字，而导航项本身（图标 + title/aria）已能自证身份。 -->
        <span
          v-if="!isNarrow"
          class="font-features-['ss01'_1] text-xs font-extrabold tracking-tight whitespace-nowrap text-fg-title select-none"
        >
          Fret Logic
        </span>
        <!-- 窄屏转 icon-only + 紧凑内边距：标签宽度（「和弦」「乐谱」各 24px）与左右内边距是这一段
             最大的一块（两项合计 ~99px → ~65px），而 title / aria-label 仍由选项的 label 提供，语义不丢 -->
        <BaseSegmentedControl
          :compacted="isNarrow"
          :icon-only="isNarrow"
          :model-value="activeNavPath"
          :options="NAV_OPTIONS"
          @change="router.push(navTarget($event))"
          width="auto"
        />
      </div>
    </div>

    <!-- 居中 Tab 栏：整行绝对铺满 + 内部 justify-center —— 居中锚点只取决于 header 自己的盒宽，
         与左右两组节点的宽窄 / 内容增减完全无关（既不占 flex 流，也不靠左右分栏均分来「凑」居中，
         所以两侧节点怎么变都不会把它顶偏，也不需要 -translate-x-1/2 那层位移）。
         整行铺满故自身不吃指针事件（pointer-events-none），交互与 PWA 拖拽豁免都交给其上的 Tab 栏控件；
         titlebar 左右留白以 padding 让出，居中落在窗口按钮之外的可用区内 -->
    <!-- items-stretch 无条件给：本节点只在乐谱路由渲染（见上方 v-if），
         原先写成 `v-if` 与三元共用同一条件的 `:class`，三元恒取真分支、假分支永不可达 -->
    <!-- 宽档（居中装得下时）绝对铺满居中、**不占流内行**；装不下时改流内 `basis-full` 独占一行。
         判据见 isTabRowOwnLine（实测宽度、非断点）：本栏居中要求左右两组都退到它两侧之外，
         曾按三段自然宽估算取「< lg」作阈值，但估算与真实渲染对不上 —— dev 构建右侧多两枚图标，
         1024~1100px 一段居中就会把 Tab 压在图标上，故改为量出来再定（宽屏也逐帧响应式）。
         更早前该判据错用了「视口 < md」，而顶栏宽度当时恒为 1024px（body 的
         min-width），于是它在并不缺空间的顶栏上凭空多加一层；2026-09-27 把 min-width 放开到 320 后，
         视口宽度才真的等于顶栏宽度。
         独占一行时必须给死高度（非紧凑档 `h-8`、紧凑档 `h-7`）—— 里面的分段控件是 `full-height`，
         父级高度不确定时 `h-full` 会退化成 auto，下划线随之贴到文字底边；独占一行时另加一条顶部分割线
         （本行与顶栏第一行同底色，不加线分不开）。两处理由都见 scoreTabRowClass 的注释。 -->
    <div
      v-if="route.path === ROUTE_PATHS.SCORE"
      :class="scoreTabRowClass"
      class="wco:pr-[env(titlebar-area-inset-right,0px)] wco:pl-[env(titlebar-area-inset-left,0px)]"
      ref="tabRowRef"
    >
      <!-- 尺寸档：紧凑档降一档（lg → md），项内边距不变、字号 text-xs → text-2xs、图标档 xl → md。
           本控件的 size **管不到高度**：它是 `full-height`，高度走 `h-full` 由父级给死（见 scoreTabRowClass），
           所以「紧凑档下三个 tab 小一档」是**两处一起降**——档位降项的字号/内边距，行高降 tab 自身的高度
           （下划线贴的是行底，行高不动则 tab 看上去仍是原来那么大）。
           行高（h-7 / h-8）落在两个档位自身高度（md 1.9rem / lg 2.3rem）之下：项只有横向内边距（`px-3`）、
           没有纵向内边距，被 `h-full` 压扁只缩小下划线到文字的距离，不挤压内容。 -->
      <BaseSegmentedControl
        :class="[NO_DRAG_REGION_CLASS, 'pointer-events-auto']"
        :disabled="!scoreEditor.activeSong"
        :model-value="scoreEditor.activeTab"
        :options="scoreModeOptions"
        :size="isNarrow ? 'md' : 'lg'"
        @change="handleScoreTabChange($event)"
        full-height
        tabbed
        width="auto"
      />
    </div>

    <!-- 窄屏下本组 `ml-auto flex-none`：不收缩、放不下就整组换行；`ml-auto` 保证换行后仍贴右缘
         （换行成独占一行时 `justify-between` 会把单个子项摆在行首，那会让图标跑到左边去）。
         间距同时收到 gap-2xs：图标钮自身是 1.9rem ≈ 42.3px 方块、图标只有 20px，两侧本就各留 11px
         内边距，再叠 gap-xs 就显得松 —— 而窄屏这一行正缺这十几个像素。
         极窄档（< 480px）再折叠一次：只留「页内主操作 + 设置 + 更多」3 枚，其余进「更多」菜单
         （见 isActionFold 与 foldedRouteActions）—— 否则这一行装不下，两组各占一行、顶栏变三层。
         `min-h-10`：本组是第一行的成员，高度必须恒等于工作台路由的顶栏（理由见文件头注释）。
         宽度档与左组同源（`basis-1/2` 而非 `flex-1`，理由见左组注释）。 -->
    <div
      :class="[NO_DRAG_REGION_CLASS, isNarrow ? 'ml-auto flex-none gap-2xs' : 'min-w-0 basis-1/2 gap-xs']"
      class="flex min-h-10 items-center justify-end"
      ref="rightGroupRef"
    >
      <!-- 文档操作区：工作台与乐谱页各由一块独立 template 承载，用 v-if / v-else-if 显式切换。
           两侧的按钮数量、顺序、禁用判据互不相干 —— 增删任一侧不必去读另一侧的条件，
           也不再需要「一份配置数组 + 插入位 + 按 key 把菜单插进 v-for」那套间接层。

           两条贯穿本区的约定：
           1) 一个按钮只做一件事、只用一个图标 —— 「复制文字」与「复制长图」是两个独立按钮，
              不按 tab 改派同一个按钮的动作；
           2) tooltip 是按钮的**唯一说明位**，可用时说「点下去会做什么」、禁用时说「为什么做不了」
              —— 禁用不是把提示摘掉，而是换成原因。此前只有 SyncModalContainer 这么做，现为本区通例；
              原因按判据的先后顺序逐条列出、只报**当前真正触发**的那一条，故不会出现
              「按钮已禁用、提示还写着点它会怎样」的自相矛盾。 -->

      <!-- 工作台：试听当前和弦（置于本区最左侧），随后复制 / 粘贴当前和弦 -->
      <template v-if="route.path === ROUTE_PATHS.WORKBENCH">
        <ActionButton
          v-tooltip="playChordTooltip"
          :disabled="isPlayDisabled"
          :hold-delay="300"
          :icon="isPlayActive ? 'square' : 'play'"
          @click="playCurrentChord()"
          @hold-end="stopChordSustain()"
          @hold-start="void startChordSustain(editorStore.draftChord)"
          holdable
          icon-only
          aria-label="播放/试听当前和弦（长按持续发声）"
          color="primary"
          icon-size="xl"
          variant="ghost"
        />

        <!-- 极窄档（< 480px）折叠：本页只留「试听」这一枚主操作。顶栏这一行要同时装下左组
             （侧栏开关 + 导航）与右组 —— 本页 3 枚页内操作 + 设置 + 更多合计 5 枚图标，
             要 ≈ 405px 才装得下；只留主操作则降到 3 枚、≈ 309px，320px 也够。
             复制 / 粘贴 一并进「更多」菜单，禁用判据与提示同源（见 foldedRouteActions）。 -->
        <template v-if="!isActionFold">
          <ActionButton
            v-tooltip="copyChordTooltip"
            :disabled="isCopyChordDisabled"
            @click="handleCopyChord()"
            icon-only
            aria-label="复制当前和弦"
            icon="copy"
            icon-size="xl"
            variant="ghost"
          />

          <ActionButton
            v-tooltip="pasteChordTooltip"
            :disabled="isPasteChordDisabled"
            @click="handlePasteChord()"
            icon-only
            aria-label="从剪切板粘贴"
            icon="clipboard-paste"
            icon-size="xl"
            variant="ghost"
          />
        </template>
      </template>

      <template v-else-if="route.path === ROUTE_PATHS.SCORE">
        <!-- 乐谱页：文本进出（复制文字 / 粘贴）在前，导出产物（复制长图 / 下载）在后 ——
             同组动作相邻、中间不夹异类按钮。
             四个按钮在三个 tab 都常驻显示，用「互斥的禁用态」表达当前 tab 支持哪一种，
             不做 tab 级显隐 —— 切 tab 时按钮不会左右横跳（极窄档的折叠只按宽度取舍、与 tab 无关，
             见下方注释） -->
        <!-- 复制文字：读写的是乐谱文本本身，与当前看的是编辑视图还是导出预览无关，故三个 tab 常驻可用。
             唯一例外是「预览正在渲染」时暂禁 —— 与粘贴同源（isPreviewBusy），避免与导出链路竞态。
             （历史：拆分前曾按 tab 禁用，注释留了「删掉 isPreviewExportMode 即可放开」的说明；
             该项已按此说明移除，现改为按渲染态禁用，避免注释与 isCopyScoreTextDisabled 的实际判据矛盾） -->
        <ActionButton
          v-tooltip="copyScoreTextTooltip"
          :disabled="isCopyScoreTextDisabled"
          @click="handleCopySong()"
          icon-only
          aria-label="复制乐谱文字"
          icon="copy"
          icon-size="xl"
          variant="ghost"
        />

        <!-- 极窄档（< 480px）折叠：本页只留「复制文字」这一枚，粘贴 / 复制长图 / 下载 进「更多」菜单。
             同上的理由：三枚以上图标就撑破「左组 + 右组」这一行、让顶栏变成三层。
             折叠后菜单项与这里同源 —— 同一个禁用判据、同一份提示文案、同一个 handler（见 moreMenuItems）。 -->
        <template v-if="!isActionFold">
          <!-- 粘贴：紧邻复制文字 —— 文本进出是同一组动作。
               导入乐谱与当前 tab 无关，全 tab 可用；仅「预览渲染中」（分页图尚未出全）暂禁，
               避免与导出链路竞态 -->
          <ActionButton
            v-tooltip="pasteScoreTooltip"
            :disabled="isPasteScoreDisabled"
            @click="handlePasteSong()"
            icon-only
            aria-label="从剪切板粘贴"
            icon="clipboard-paste"
            icon-size="xl"
            variant="ghost"
          />

          <!-- 复制长图：走预览导出链路，依赖预览渲染产物，故仅「预览」tab 且产物就绪时可用。
               判据与下载菜单同源（canExportScore）—— 两者依赖同一份产物，
               分开写才会冒出「长图能复制、下载却禁用」这类不一致 -->
          <ActionButton
            v-tooltip="copyScoreImageTooltip"
            :disabled="!canExportScore"
            @click="void handleScoreExport('copy')"
            icon-only
            aria-label="复制整曲长图"
            icon="image"
            icon-size="xl"
            variant="ghost"
          />

          <!-- 下载：菜单与触发按钮必须共用 canExportScore。只禁按钮不禁菜单时，hover 仍会展开面板
               并给按钮套上「打开中」的强调样式（禁用元素却表现成可交互）。
               提示只在禁用时挂原因 —— 该菜单是 hover 展开的，可用时再弹一层提示会与面板叠在一起 -->
          <BaseMenu :disabled="!canExportScore" :items="downloadExportMenuItems" :title="downloadMenuTitle">
            <template #trigger="{ isOpen, pinToggle }">
              <ActionButton
                v-tooltip="downloadScoreTooltip"
                :aria-expanded="isOpen"
                :color="isOpen ? 'primary' : 'default'"
                :disabled="!canExportScore"
                :variant="isOpen ? 'subtle' : 'ghost'"
                @click="pinToggle()"
                icon-only
                aria-haspopup="menu"
                aria-label="导出下载"
                icon="download"
                icon-size="xl"
                icon-stroke="regular"
              />
            </template>
          </BaseMenu>
        </template>
      </template>

      <!-- 分组分隔线：左侧为文档操作（工作台：试听 / 复制 / 粘贴；乐谱：复制文字 / 粘贴 / 复制长图 / 下载），
           右侧为应用偏好（设置 / 同步 / 主题 / 仓库）。
           窄屏收起：它左右各留 0.25rem，而窄屏这一行只剩个位数像素的余量（见下方「更多」菜单） -->
      <BaseDivider
        v-if="!isNarrow"
        :thickness="2"
        class="opacity-80"
        color="glass"
        inset="0.25rem"
        length="0.875rem"
        orientation="vertical"
      />

      <!-- 偏好设置：两种形态都保留常驻按钮 —— 它挂的是 `HeaderConfigPopover`（360px 宽的表单浮层），
           不是一组菜单项，塞不进下面的「更多」菜单里，且它本身就是最常用的偏好入口 -->
      <BasePopover
        :disabled="!canUseHeaderSettings"
        :trigger="canHover ? 'hover' : 'click'"
        placement="bottom-end"
        ref="settingsPopoverRef"
      >
        <template #trigger="{ isOpen, pinToggle }">
          <ActionButton
            :aria-expanded="isOpen"
            :color="isOpen ? 'primary' : 'default'"
            :disabled="!canUseHeaderSettings"
            :variant="isOpen ? 'subtle' : 'ghost'"
            @click="canHover && pinToggle()"
            icon-only
            aria-haspopup="true"
            aria-label="偏好设置"
            icon="settings"
            icon-size="xl"
            icon-stroke="regular"
            ref="triggerBtnRef"
          />
        </template>

        <HeaderConfigPopover />
      </BasePopover>

      <!-- 窄屏：同步 / 外观 / 仓库 / 开发面板并入一个「更多」菜单。
           这四项都是低频入口（各自进一次就很久不动），却和文档操作抢同一条 375px 的行 ——
           合并后右侧从 4~5 个图标降到 2 个（设置 + 更多），余量才够文档操作常驻。
           极窄档（< 480px）连文档操作也折进来（见 foldedRouteActions），右侧只剩 3 枚。
           菜单内的分组、勾选态、禁用态与宽屏下那三个菜单完全同源（同步用 syncMenuItems 的语义重排、
           外观用 themeMenuItems 原样挂进子菜单），不在窄屏另造一套偏好逻辑。
           触发方式与设置浮层同一条口径：触屏没有 hover，靠合成的 mouseenter 不可靠，
           故 `canHover ? 'hover' : 'click'`；同理 pinToggle 只在 hover 档接（click 档由浮层自己开关）。 -->
      <!-- max-visible-items：窄屏「更多」的项数可达 10 条（折叠进来的页内动作 + 偏好入口 + 开发面板），
           整条铺开会盖住整页内容，故限高到 7 行、超出滚动（滚动条由 BaseMenu 自动开启）。
           限高只压高度、不裁剪项：所有入口照旧可达，只是要滚一下 -->
      <BaseMenu
        v-if="isNarrow"
        :items="moreMenuItems"
        :max-visible-items="MORE_MENU_MAX_VISIBLE_ITEMS"
        :trigger="canHover ? 'hover' : 'click'"
        title="更多"
      >
        <template #trigger="{ isOpen, pinToggle }">
          <ActionButton
            :aria-expanded="isOpen"
            :color="isOpen ? 'primary' : 'default'"
            :variant="isOpen ? 'subtle' : 'ghost'"
            @click="canHover && pinToggle()"
            icon-only
            aria-haspopup="menu"
            aria-label="更多操作"
            icon="ellipsis"
            icon-size="xl"
            icon-stroke="regular"
          />
        </template>
      </BaseMenu>

      <template v-if="!isNarrow">
        <BaseMenu :items="syncMenuItems" :title="`当前选择 ${currentSchemeName}`">
          <template #trigger="{ isOpen, pinToggle }">
            <ActionButton
              :aria-expanded="isOpen"
              :color="isOpen ? 'primary' : 'default'"
              :variant="isOpen ? 'subtle' : 'ghost'"
              @click="pinToggle()"
              icon-only
              aria-haspopup="menu"
              aria-label="云端同步"
              icon="cloud"
              icon-size="xl"
              icon-stroke="regular"
            />
          </template>
        </BaseMenu>

        <BaseMenu :items="themeMenuItems" :model="themePreference" @pick="pickTheme($event)">
          <template #trigger="{ isOpen, pinToggle }">
            <ActionButton
              :aria-expanded="isOpen"
              :color="isOpen ? 'primary' : 'default'"
              :variant="isOpen ? 'subtle' : 'ghost'"
              @click="pinToggle()"
              icon-only
              aria-haspopup="menu"
              aria-label="外观设置"
              icon-size="xl"
              icon-stroke="regular"
            >
              <BaseIcon :class="themeTriggerIconClass" :name="themeTriggerIcon" icon-size="xl" icon-stroke="regular" />
            </ActionButton>
          </template>
        </BaseMenu>

        <ActionButton
          v-tooltip.interactive="buildRepoTooltip"
          @click="openSourceRepository()"
          icon-only
          aria-label="GitHub 仓库与构建信息"
          icon="github"
          icon-size="xl"
          variant="ghost"
        />

        <template v-if="IS_DEV">
          <BaseDivider
            :thickness="2"
            class="opacity-80"
            color="glass"
            inset="0.25rem"
            length="0.875rem"
            orientation="vertical"
          />

          <!-- 开发面板：仅开发构建渲染，线上产物不含此按钮 -->
          <ActionButton
            v-tooltip="'打开开发面板'"
            @click="isDevPanelOpen = true"
            icon-only
            aria-label="打开开发面板"
            icon="wrench"
            icon-size="xl"
            variant="ghost"
          />
        </template>
      </template>
    </div>
  </header>

  <!-- 判据用 DevPanel 而非 IS_DEV：该绑定在生产构建被摇成 undefined，两者等价（见脚本内注释） -->
  <DevPanel v-if="DevPanel" v-model:visible="isDevPanelOpen" />

  <BaseModal
    v-model:visible="isSyncConfirmOpen"
    :close-locked="isSyncing"
    :confirm-loading="isSyncing"
    @confirm="handleConfirmSync()"
    cancel-text="取消"
    confirm-text="确认上传"
    title="确认上传至云端"
  >
    <p class="m-0 py-xs text-xs/relaxed text-fg-body">
      确定要将本地数据（和弦库、乐谱库与设置）上传至
      <strong class="text-fg-title">{{ currentSchemeName }}</strong> 吗？
    </p>
  </BaseModal>

  <BaseModal
    v-model:visible="isPullConfirmOpen"
    :close-locked="isPulling"
    :confirm-loading="isPulling"
    @confirm="handleConfirmPull()"
    cancel-text="取消"
    confirm-text="确认拉取"
    title="确认从云端拉取"
  >
    <p class="m-0 py-xs text-xs/relaxed text-fg-body">
      确定要从
      <strong class="text-fg-title">{{ currentSchemeName }}</strong>
      拉取云端备份数据吗？拉取完成后将进入导入面板供您勾选应用。
    </p>
    <p v-if="pullAuthorNotice" class="m-0 py-xs text-xs/relaxed text-fg-muted">{{ pullAuthorNotice }}</p>
  </BaseModal>

  <BaseModal
    v-model:visible="isLyricsImportConfirmOpen"
    @confirm="handleConfirmLyricsImport()"
    cancel-text="取消"
    confirm-text="仍要导入"
    title="导入确认"
  >
    <p class="m-0 py-xs text-xs/relaxed text-fg-body">
      这段文字未包含可识别的和弦或标题结构，确定仍按
      <strong class="text-fg-title">纯歌词</strong>新建乐谱吗？
    </p>
  </BaseModal>

  <SyncModalContainer v-model:is-sync-modal-open="isSyncModalOpen" />
</template>

<script setup lang="ts">
import { computed, defineAsyncComponent, onBeforeUnmount, onMounted, ref, useTemplateRef, watch } from 'vue';

import { useMediaQuery } from '@vueuse/core';
import { useRoute, useRouter } from 'vue-router';

import ActionButton from '@/platform/ui/button/ActionButton.vue';
import BaseCheckbox from '@/platform/ui/checkbox/BaseCheckbox.vue';
import BaseDivider from '@/platform/ui/divider/BaseDivider.vue';
import BaseIcon from '@/platform/ui/icons/BaseIcon.vue';
import BaseMenu from '@/platform/ui/menu/BaseMenu.vue';
import BaseModal from '@/platform/ui/modal/BaseModal.vue';
import BasePopover from '@/platform/ui/popover/BasePopover.vue';
import BaseSegmentedControl from '@/platform/ui/segmented/BaseSegmentedControl.vue';
import { preloadExportActions, useScoreExport } from '@/app/layouts/useScoreExport';
import { useBackupModals } from '@/app/modals/useBackupModals';
import { preloadAudioPlayback, useAudioPlayer } from '@/app/services/audio/useAudioPlayer';
import {
  getSyncProviderLabel,
  getSyncProviderMeta,
  SYNC_PROVIDER_META,
  SYNC_PROVIDER_ORDER,
} from '@/app/services/sync/providerMeta';
import { getBuiltinAuthorTargetNotice } from '@/app/services/sync/syncTargetConfig';
import { preloadSyncActions, useSyncService } from '@/app/services/sync/useSyncService';
import { useChordEditorStore } from '@/domains/chord/store/chordEditorStore';
import { getChordName } from '@/domains/chord/theory/theory';
import { buildScoreQuery, useScoreRouteSync } from '@/domains/score/editor/composables/useScoreRouteSync';
import { useScoreEditorStore } from '@/domains/score/editor/store/scoreEditorStore';
import { isPreviewRendering } from '@/domains/score/preview/scorePreviewCache';
import { preloadTextTransferActions, useTextTransfer } from '@/domains/score/transfer/useTextTransfer';
import { useResponsive } from '@/platform/composables/useResponsive';
import { useTheme } from '@/platform/composables/useTheme';
import { useSettingsStore } from '@/platform/store/settingsStore';
import { useUiStore } from '@/platform/store/uiStore';
import { MENU_COLOR_PRIMARY, MENU_COLOR_TITLE, MENU_COLOR_WARNING } from '@/platform/ui/menu/menuRowStyle';
import { ROUTE_PATHS } from '@/platform/utils/constants';
import { observeResizeTree } from '@/platform/utils/dom';
import { prefetch } from '@/platform/utils/prefetch';

import HeaderConfigPopover from './HeaderConfigPopover.vue';

import type { ScoreActiveTab } from '@/domains/score/editor/store/scoreEditorStore';
import type { PortableSong } from '@/domains/score/transfer/textCodec';
import type { PasteSongOutcome } from '@/domains/score/transfer/useTextTransfer';
import type { ThemePreference } from '@/platform/composables/useTheme';
import type { MenuItem } from '@/platform/ui/menu/types';
import type { SegmentOption } from '@/platform/ui/segmented/segmentOption';

const route = useRoute();
const router = useRouter();

/**
 * 设置浮层的触发方式：仅在设备**有悬停能力**时才用 hover。
 * 触屏上不存在 hover 态，hover 触发只能靠浏览器在 tap 时合成的 mouseenter 侥幸生效，
 * 而"钉住/关闭"还依赖合成的 mouseleave——不同内核表现不一致，设置入口可能根本进不去。
 * 用 (hover: hover) 而不是 (pointer: coarse)：二合一设备接上鼠标后是 hover，不会误降级。
 */
const canHover = useMediaQuery('(hover: hover)');

/**
 * 顶栏**紧凑档**判据（< lg，1024px）：顶栏收起装饰与低频入口 —— 品牌文字、左右两条分隔线、导航转 icon-only、
 * 右侧偏好图标并入「更多」菜单。
 *
 * 取 lg，而**不是** `useResponsive` 的 `isMobile`（< md，768px）：装不装得下是**几何结果**，与「是不是移动端」
 * 无关。宽档（品牌文字 + 导航文字标签 + 右组 8 枚图标 + 两条分隔线）下两组各占半幅（`basis-1/2`，
 * 理由见模板里那两处宽度档的注释），而右组内容实测 **490px**（8 × 42.3 图标 + 2 条分隔线 + 9 × `gap-xs` 16.4）、
 * 左组 374px —— 半幅只给（视口 − 2 × `px-4`）/ 2，于是 768~900px 这一段两组各自越出半幅、正面压在一起：
 * 2026-09-28 逐宽度实测「左组内容右缘 − 右组内容左缘」= 768px **+140.2**、800px +108.2、850px +58.2、
 * 880px +28.2、900px 仍 +8.2，≈910px 才归零（截图即用户报的「按钮和分段控制重叠」）。
 * 半幅 ≥ 490 要到 ≈1025px 才成立，故宽档真正安全的起点就是 lg；1024px 时两组内容间距实测余量 115.8px。
 * 与 `isDrawerMode`（< lg 切侧栏抽屉）同档也是好事：这一段的侧栏已是浮层、整体本就是移动式布局，
 * 导航转 icon-only 与之一致，不必再引第二个魔法数。
 * 紧凑档下两组内容合计 ≈ 416px（左 134.7 + 右 281.4），到 320px（`$app-min-width`）都装得下。
 *
 * 判据取**视口**宽度即可：`body` 的最小宽度已放开到 320px（src/assets/token-vars.scss 的
 * $app-min-width），故视口 ≥ 320 时应用宽度就等于视口宽度，顶栏亦然（它横跨应用宽、不受侧栏占位影响）。
 */
const { breakpoints } = useResponsive();

const isNarrow = breakpoints.smaller('lg');

/**
 * 乐谱 Tab 栏**独占一行**的判据：顶栏装不下「左组 + 居中 Tab 栏 + 右组」时。
 *
 * 判据是**量出来的**，不是断点。历史上这里取 `lg`（1024px），依据是三段自然宽的估算
 * （左组 279px、右组 312px（dev 构建多两枚图标 ≈ 359px）、Tab 栏 284px → 阈值 ≈ 952~1000px，
 * 正好落在 lg 上）；但估算与真实渲染对不上 —— dev 构建 1024~1100px 这一段居中就会把 Tab 压在图标上，
 * 而右组的宽度还会随路由（工作台 / 乐谱的动作按钮不同）与构建档变化，断点看不见这些。
 * 故改为量出来再定：**宽屏也逐帧响应式**，宁落一行也不把 Tab 压到图标上。
 *
 * 量的是「Tab 控件实际占的横向区间」与「左右两组各自**内容**的边缘」——量内容而不是组的盒：
 * 宽档下两组都是 `basis-1/2`、各占半幅，盒宽与内容宽无关，量盒宽得不出「装得下装不下」。
 * 控件取它自己的 rect 而不是本栏的：本栏居中态是绝对铺满、独占一行时是 `basis-full`，量它没有意义；
 * 而控件两态都由 `justify-center` 居中、锚点相同，故判据在两种布局之间自洽
 * （不会「落一行之后又觉得自己装得下」来回翻）。
 *
 * 初值仍取 `lg`：首帧在测量之前先按它铺一帧，而 `lg` 是标准断点里最接近真实阈值（dev 构建实测
 * 约 1341px）的一档；`onMounted` 里同步量一次并在同一批微任务内落定 —— 首屏不会闪一次错布局。
 *
 * **初值必须显式取 `.value`**：`breakpoints.smaller('lg')` 返回的是只读 `ComputedRef`，
 * 而 `ref()` 收到一个 ref 时**原样返回它**（不另包装）—— 写成 `ref(breakpoints.smaller('lg'))`
 * 拿到的仍是那个只读 computed，`measureTabRow` 的赋值会被 Vue 静默拒绝（控制台只留一条
 * 「Write operation failed: computed value is readonly」），判据于是永远停在 `lg` 上、实测形同虚设。
 * 这条坑没有类型错误、没有运行时报错，只有那一行 warning —— 改这里时别把 `.value` 去掉。
 */
const TAB_ROW_MIN_GAP = 16;

const headerRef = useTemplateRef<HTMLElement>('headerRef');
const leftGroupRef = useTemplateRef<HTMLElement>('leftGroupRef');
const rightGroupRef = useTemplateRef<HTMLElement>('rightGroupRef');
const tabRowRef = useTemplateRef<HTMLElement>('tabRowRef');

const isTabRowOwnLine = ref(breakpoints.smaller('lg').value);

/**
 * 一组**内容**在横向上的边缘（视口坐标 px）：取它最靠边那个成员的边，跳过零尺寸成员
 * （`v-if` 关掉的分隔线会留在 children 里）。返回 null 表示这一组量不出内容。
 */
const groupContentEdge = (group: HTMLElement, side: 'start' | 'end'): number | null => {
  let edge: number | null = null;
  for (const child of group.children) {
    const rect = child.getBoundingClientRect();
    if (rect.width <= 0 && rect.height <= 0) continue;
    const value = side === 'start' ? rect.right : rect.left;
    edge = edge === null ? value : side === 'start' ? Math.max(edge, value) : Math.min(edge, value);
  }
  return edge;
};

/**
 * 重测「Tab 栏该不该独占一行」。
 *
 * Tab 栏不在本路由（非乐谱页）时直接返回，**保留上一次的判定**：那几帧里量不到 Tab 宽度，
 * 若按「量不出 = 装得下」落定，切回乐谱页的首帧就会先按居中铺一帧再翻。
 */
const measureTabRow = () => {
  const header = headerRef.value;
  const left = leftGroupRef.value;
  const right = rightGroupRef.value;
  const row = tabRowRef.value;
  // 控件是本栏唯一的流内子项：量它才是量 Tab 本身
  const control = row?.firstElementChild as HTMLElement | null | undefined;
  if (!header || !left || !right || !control) return;

  const controlRect = control.getBoundingClientRect();
  const leftEdge = groupContentEdge(left, 'start');
  const rightEdge = groupContentEdge(right, 'end');
  if (controlRect.width <= 0 || leftEdge === null || rightEdge === null) return;

  const center = controlRect.left + controlRect.width / 2;
  const half = controlRect.width / 2 + TAB_ROW_MIN_GAP;
  isTabRowOwnLine.value = center - leftEdge < half || rightEdge - center < half;
};

// 重测时机：`observeResizeTree(header)` —— 顶栏盒宽（窗口缩放、侧栏让位）、三个直接子元素（两组 + Tab 栏）
// 的盒尺寸，以及子树里的增删 / 文本变化。后两者覆盖「路由切换换了动作按钮」「dev 构建多两枚图标」这类
// **不改顶栏宽度**的变化 —— 只观察顶栏会漏掉它们（组的盒宽由 flex-basis 定死、不随内容动）。
// 另补一次 `document.fonts.ready`：Tab 控件与导航标签的宽度都随字体变（首帧可能还在用回退字体），
// 而控件是「组的孙元素」、不在观察集里（observeResizeTree 只到直接子元素一层），字体到位不会自动触发。
// 收敛性：翻转只改类名（不产生 childList / 盒尺寸之外的新信号），且判据在两种布局间自洽，
// 故顶栏高度变化带来的那一次复测会得到同一结论，不会来回翻。
let stopHeaderObserve: (() => void) | null = null;

onMounted(() => {
  const header = headerRef.value;
  if (!header) return;
  // 同步量一次：此刻 DOM 已落定、浏览器尚未绘制，写回的值与首帧渲染在同一批微任务里生效
  measureTabRow();
  stopHeaderObserve = observeResizeTree(header, measureTabRow);
  // 字体到位后补测一次（理由见上）；组件已卸载时 measureTabRow 会因 ref 为 null 直接返回
  void document.fonts?.ready.then(() => measureTabRow());
});

onBeforeUnmount(() => {
  stopHeaderObserve?.();
  stopHeaderObserve = null;
});

/**
 * 右组**折叠**的判据（< 480px）：顶栏「左组 + 右组」这一行装不下时，把右组里非主操作的动作
 * 收进「更多」菜单 —— 否则两组会各自占一行，连乐谱 Tab 栏一起把顶栏撑成三层（2026-09-27 的现象）。
 *
 * 阈值同样是算出来的，不是随手取的断点：左组（侧栏开关 1.9rem + gap-xs + 导航分段器，
 * 分段器自带 `p-1` 与 1px 描边）≈ 138px，顶栏左右留白 `px-md` × 2 ≈ 33px，
 * 右组每枚图标钮 1.9rem ≈ 42.3px、项间 `gap-2xs` ≈ 5.6px。
 * 未折叠时右组最多 6 枚（乐谱路由）→ 6 × 42.3 + 5 × 5.6 ≈ 281px，合计 ≈ 452px；工作台 5 枚 ≈ 405px。
 * 取 480px 作阈值，给最宽的那一档留 ~28px 余量。
 * 折叠后右组恒为 3 枚（页内主操作 + 设置 + 更多）→ ≈ 309px，于是到 320px（`$app-min-width`）都装得下。
 *
 * 不走 useResponsive：Tailwind 标准断点里 640(sm) 之下没有更窄的档，而 480 是「这一行装不下」
 * 的几何结果、不是布局断点 —— 与 isTabRowOwnLine 同理，都留在本组件内，不去扩 useResponsive 的契约。
 * 也不写成 rem：媒体查询里的 rem 认的是浏览器初始字号（16px），与项目根字号 22.25px 无关，写 px 更直白。
 */
const isActionFold = useMediaQuery('(max-width: 480px)');

const editorStore = useChordEditorStore();
const scoreEditor = useScoreEditorStore();
const uiStore = useUiStore();
const { isPlaying, isSustaining, isAudioPreparing, playCurrentChord, startChordSustain, stopChordSustain } =
  useAudioPlayer();

const { copyChordText, pasteChordFromClipboard, copySongText, pasteSongFromClipboard, importPortableSong } =
  useTextTransfer();
const scoreRouteSync = useScoreRouteSync();

/** 乐谱「预览」导出动作与下载菜单标题（长图/PDF/Zip + 尺寸预估），逻辑见 useScoreExport.ts */
const { isPreviewExportMode, handleScoreExport, downloadExportMenuItems, downloadMenuTitle } = useScoreExport();

/** 「预览导出产物已就绪」判据：预览 tab、非渲染中 / 复制中、有歌词。
 *  由乐谱页三个出口共用 —— 复制长图按钮、下载菜单、下载触发按钮：三者依赖的是同一份产物，
 *  判据分开写迟早会出现「长图能复制、下载却禁用」这类不一致。
 *  菜单侧漏禁更糟：按钮已禁用而菜单仍可 hover 展开时，会弹出面板并给按钮套上「打开中」的强调样式 */
const canExportScore = computed(
  () => isPreviewExportMode.value && !uiStore.isCopying && !isPreviewRendering.value && scoreEditor.hasLyrics
);

/**
 * 预览渲染中（且当前就在预览 tab）：复制乐谱文字 / 粘贴乐谱都与导出链路共用同一条渲染线程，
 * 分页图尚未出全时暂禁，避免与导出竞态。
 * 判据只在此处写一份、两个按钮共用 —— 分开写迟早冒出「粘贴能用、复制却禁用」这类不一致。
 * 注意渲染标记只在预览 tab 参与判断：后台残留的渲染不该禁用其他 tab 的动作。
 */
const isPreviewBusy = computed(() => isPreviewExportMode.value && isPreviewRendering.value);

/** 无结构纯歌词「确认兜底」：待确认的载荷 + 确认弹窗开关 */
const pendingLyricsImport = ref<PortableSong | null>(null);
const isLyricsImportConfirmOpen = ref(false);

/** 工作台可复制条件：指板非空且已解析出和弦名 */
const canCopyChord = computed(() => !editorStore.isFretBoardEmpty && Boolean(getChordName(editorStore.draftChord)));

// ===== 文档操作区各按钮的禁用判据与提示 =====
// 每个按钮一对 computed：禁用判据（驱动 :disabled）+ 提示（驱动 v-tooltip）。
// 提示按「原因 → 动作」两段写，原因分支与判据的分支**同序同数** —— 判据加一条、提示就跟着加一条，
// 两处永远对得上，不会出现「按钮已经禁用、提示还写着点它会怎样」的自相矛盾。

/** 试听按钮的图标判据：已受理 / 正在播放 / 正在持续发声都显示「停止」形。
 *  受理窗口（isAudioPreparing）必须在内 —— 首次点击要等懒加载的音频实现 chunk 到位才翻转
 *  isPlaying，不含它则点击后按钮毫无变化，整段等待看起来就像页面卡住。 */
const isPlayActive = computed(() => isPlaying.value || isSustaining.value || isAudioPreparing.value);

/** 工作台·试听：指板为空（无可试听的内容）或已进入播放态。
 *  「已受理但尚未起音」的那一小段窗口按播放态处理，不给中间文案 —— 点击当刻就是播放态的样子。
 *  禁用判据刻意**不含 isSustaining**：长按持续发声期间按钮必须保持可用 —— 一旦被禁用，
 *  ActionButton 的「禁用即中止长按」会当场补发 hold-end，持续发声刚起就被自己掐掉。
 *  同理 isAudioPreparing 只由点击路径置位、延音路径不碰它（见 useAudioPlayer 的 runPlayback）。 */
const isPlayDisabled = computed(() => editorStore.isFretBoardEmpty || isAudioPreparing.value || isPlaying.value);

/** 工作台·试听提示（原因分支与禁用判据同序同数：指板为空 → 播放中） */
const playChordTooltip = computed(() => {
  if (editorStore.isFretBoardEmpty) return '指板为空，暂无可试听的和弦';
  if (isAudioPreparing.value || isPlaying.value) return '正在播放中';
  return '播放/试听当前和弦（长按持续发声）';
});

/** 工作台·复制当前和弦：防重入锁期间，或指板为空 / 解不出和弦名 */
const isCopyChordDisabled = computed(() => uiStore.isCopying || !canCopyChord.value);

/** 工作台·复制当前和弦提示（`!canCopyChord` 的两种情形各自给原因） */
const copyChordTooltip = computed(() => {
  if (uiStore.isCopying) return '正在复制中';
  if (editorStore.isFretBoardEmpty) return '指板为空，没有可复制的和弦';
  if (!getChordName(editorStore.draftChord)) return '当前指板识别不出和弦名';
  return '复制当前和弦';
});

/** 工作台·粘贴和弦：仅防重入锁（剪贴板内容在读取时才知道是否可用，不预先禁用） */
const isPasteChordDisabled = computed(() => uiStore.isCopying);

/** 工作台·粘贴和弦提示 */
const pasteChordTooltip = computed(() => (uiStore.isCopying ? '正在复制中' : '从剪切板粘贴'));

/** 乐谱·复制文字：防重入锁 + 未打开乐谱 + 预览渲染中（与粘贴同源，见 isPreviewBusy）。
 *  判据与 tab 无关（含「预览」tab 也可用），只有「正在渲染」这一条临时禁用 */
const isCopyScoreTextDisabled = computed(() => uiStore.isCopying || !scoreEditor.activeSong || isPreviewBusy.value);

/** 乐谱·复制文字提示 */
const copyScoreTextTooltip = computed(() => {
  if (uiStore.isCopying) return '正在复制中';
  if (!scoreEditor.activeSong) return '请先打开一首乐谱';
  if (isPreviewBusy.value) return '预览渲染中，暂不可复制';
  return '复制乐谱文字';
});

/** 乐谱·粘贴乐谱：防重入锁 + 预览渲染中（与复制文字同源，见 isPreviewBusy） */
const isPasteScoreDisabled = computed(() => uiStore.isCopying || isPreviewBusy.value);

/** 乐谱·粘贴乐谱提示 */
const pasteScoreTooltip = computed(() => {
  if (uiStore.isCopying) return '正在复制中';
  if (isPreviewBusy.value) return '预览渲染中，暂不可粘贴';
  return '从剪切板粘贴';
});

/** 乐谱·导出产物不可用的原因（空串 = 可用）。
 *  复制长图与下载依赖同一份产物、共用同一条判据 canExportScore，故原因文案也只写一份 ——
 *  分开写迟早冒出「长图能复制、下载却禁用」时两处提示各说各话。
 *  原因分支与 canExportScore 的四项同序同数。 */
const exportScoreBlockReason = computed(() => {
  if (!isPreviewExportMode.value) return '切换到「预览」标签页后可用';
  if (uiStore.isCopying) return '正在复制中';
  if (isPreviewRendering.value) return '预览渲染中，请稍候';
  if (!scoreEditor.hasLyrics) return '乐谱暂无歌词，无可导出的内容';
  return '';
});

/** 乐谱·复制长图提示 */
const copyScoreImageTooltip = computed(() => exportScoreBlockReason.value || '复制整曲长图');

/** 乐谱·下载提示：**仅在禁用时**给原因 —— 该菜单 hover 即展开面板，
 *  可用时再弹一层提示会与面板叠在一起（其余按钮没有这层顾虑，可用时照常说明动作） */
const downloadScoreTooltip = computed(() => (canExportScore.value ? '' : exportScoreBlockReason.value));

/** 工作台：复制当前编辑的和弦文字到剪贴板 */
const handleCopyChord = () => void copyChordText(editorStore.draftChord);

/** 工作台：从剪贴板文字载入编辑器草稿（切「新建」态） */
const handlePasteChord = () => void pasteChordFromClipboard();

/** 乐谱：复制当前乐谱文字到剪贴板 */
const handleCopySong = () => void copySongText(scoreEditor.activeSong);

/** 乐谱：从剪贴板文字导入（始终新建一首乐谱）；无结构纯歌词先弹「确认兜底」交给用户决定。
 *  互斥由动作实现负责（重入时返回 none，不会落地也不会确认） */
const handlePasteSong = async (): Promise<void> => {
  const outcome: PasteSongOutcome = await pasteSongFromClipboard();
  if (outcome.status !== 'needsConfirm') return;
  pendingLyricsImport.value = outcome.portable;
  isLyricsImportConfirmOpen.value = true;
};

/** 用户确认「仍按纯歌词导入」后落地建谱 */
const handleConfirmLyricsImport = () => {
  const portable = pendingLyricsImport.value;
  if (portable) importPortableSong(portable);
  isLyricsImportConfirmOpen.value = false;
  pendingLyricsImport.value = null;
};

/** 打开开源仓库主页（GitHub），使用 noopener 安全新标签页 */
const openSourceRepository = () =>
  void window.open('https://github.com/lo0kie/FretLogic', '_blank', 'noopener,noreferrer');

const activeNavPath = computed(() => {
  const matched = NAV_OPTIONS.find(opt => opt.value === route.path);
  return matched?.value ?? '';
});

/**
 * 顶栏导航目标：进乐谱页时直接落到带参完整 URL（选中乐谱 + 主 Tab），而不是推裸路径。
 *
 * 裸路径会让乐谱页的镜像 watcher 立刻回写补参数，产生一次多余导航；更糟的是「已在乐谱页时
 * 再点乐谱」会先把 URL 打回裸路径（丢掉 id/tab）再由镜像恢复，等于自己把可寻址状态抖掉一次。
 * URL 形状规则与镜像共用 buildScoreQuery，避免两处各写一遍「edit 省略」逻辑而漂移。
 */
const navTarget = (path: string) =>
  path === ROUTE_PATHS.SCORE && scoreEditor.activeSongId
    ? { path, query: buildScoreQuery(scoreEditor.activeSongId, scoreEditor.activeTab) }
    : path;

const NAV_OPTIONS: SegmentOption<string>[] = [
  { label: '和弦', value: ROUTE_PATHS.WORKBENCH, icon: 'layout-grid' },
  { label: '乐谱', value: ROUTE_PATHS.SCORE, icon: 'music' },
];

const { isDark, setTheme, preference: themePreference } = useTheme();

/** 主题按钮触发图标：暗色显示月亮（primary），亮色显示太阳（warning） */
const themeTriggerIcon = computed(() => (isDark.value ? 'moon' : 'sun'));
const themeTriggerIconClass = computed(() => (isDark.value ? 'text-primary' : 'text-warning'));

/** 主题菜单：勾选态与点击都由菜单层的 `model` / `pick` 派生，这里只描述「有哪些项」 */
const themeMenuItems: MenuItem[] = [
  { label: '浅色模式', icon: 'sun', color: MENU_COLOR_WARNING, value: 'light' },
  { label: '深色模式', icon: 'moon', color: MENU_COLOR_PRIMARY, value: 'dark' },
  { label: '跟随系统', icon: 'laptop', color: MENU_COLOR_TITLE, value: 'auto' },
];

/** 菜单项 value 是 string，这里收窄回主题偏好联合类型 */
const pickTheme = (value: string): void => void setTheme(value as ThemePreference);

const { triggerGlobalSync, pullFromRemote, resolvePushCredentialIssue, isSyncing, isPulling } = useSyncService();
// 空闲时预取各懒加载动作链的 chunk（同步/导出/试听/复制粘贴）：
// 首次点击不再经历「chunk 下载 → 模块求值」的反馈死区，busy/loading 状态立即翻转。
// 经 prefetch 统一吞掉失败：弱网/断网下 chunk 拉不到是常态，不能让它变成未处理 rejection，
// 也不能让上面这句承诺在失败时静默失真（详见 platform/utils/prefetch）。
onMounted(() => {
  const idle = (cb: () => void): void => {
    if ('requestIdleCallback' in window) requestIdleCallback(cb, { timeout: 5000 });
    else setTimeout(cb, 2000);
  };
  idle(() => {
    prefetch(preloadSyncActions, 'TopHeader');
    prefetch(preloadExportActions, 'TopHeader');
    prefetch(preloadAudioPlayback, 'TopHeader');
    prefetch(preloadTextTransferActions, 'TopHeader');
  });
});
const backupModals = useBackupModals();
const settingsStore = useSettingsStore();

const isSyncConfirmOpen = ref(false);
const isPullConfirmOpen = ref(false);

const currentSchemeName = computed(() => getSyncProviderLabel(settingsStore.syncTarget));

/**
 * 拉取确认里的数据归属提示：目标仍是出厂默认的 gitee + 作者仓库时非空。
 * 与启动检测、首访引导、同步设置弹窗共用同一判据——否则用户会把作者示例数据当成自己的基线拉进来。
 */
const pullAuthorNotice = computed(() => getBuiltinAuthorTargetNotice());

/** 用户确认上传：执行全局同步，成功后关闭确认弹窗 */
const handleConfirmSync = async () => {
  const ok = await triggerGlobalSync();
  if (ok) isSyncConfirmOpen.value = false;
};

/** 用户确认拉取：拉取成功后关闭弹窗，并携带云端数据进入导入面板供勾选应用 */
const handleConfirmPull = async () => {
  const payload = await pullFromRemote();
  isPullConfirmOpen.value = false;
  if (payload) backupModals.openImportWithPayload(payload, '云端同步数据');
};

/** 打开同步设置弹窗，并把弹窗内的方案选择器对齐到当前同步目标（保证看到的就是缺 Token 的那一项） */
const openSyncSettings = () => {
  uiStore.syncModalProvider = settingsStore.syncTarget;
  isSyncModalOpen.value = true;
};

/** 菜单「同步」入口的凭据预检：缺失时不进入确认流程、不发起请求，
 *  改为提示并提供「去配置」入口直接打开对应目标的同步设置弹窗 */
const handleSyncMenuClick = () => {
  const issue = resolvePushCredentialIssue();
  if (issue) {
    // 通知而非常驻 Message：「去配置」入口随 toast 飘走就没了，用户得记住自己去顶栏找设置
    uiStore.notice.warning({
      title: issue,
      actionText: '去配置',
      onAction: () => void openSyncSettings(),
    });
    return;
  }
  isSyncConfirmOpen.value = true;
};

const syncMenuItems = computed<MenuItem[]>(() => [
  {
    label: isSyncing.value ? '推送中...' : '推送到云端',
    icon: 'refresh-cw',
    disabled: isSyncing.value || isPulling.value,
    action: handleSyncMenuClick,
  },
  {
    label: isPulling.value ? '拉取中...' : '从云端拉取',
    icon: 'cloud-download',
    disabled: isSyncing.value || isPulling.value,
    action: () => {
      isPullConfirmOpen.value = true;
    },
  },
  {
    label: '同步目标',
    icon: getSyncProviderMeta(settingsStore.syncTarget).icon,
    // 子菜单是单选组：勾选态与点击由本层的 model / onPick 派生，子项只描述 label/icon/value。
    // 收窄用 find 而非 as 断言 —— 非法值直接忽略，不会静默写坏 syncTarget
    model: settingsStore.syncTarget,
    onPick: value => {
      const kind = SYNC_PROVIDER_ORDER.find(k => k === value);
      if (kind !== undefined) settingsStore.syncTarget = kind;
    },
    children: SYNC_PROVIDER_ORDER.map(kind => ({
      label: SYNC_PROVIDER_META[kind].label,
      icon: SYNC_PROVIDER_META[kind].icon,
      value: kind,
      keepOpen: true,
    })),
  },
  // 同步设置入口放在一级：「同步目标」子菜单只负责切换「推送 / 拉取」使用的云端方案，
  // 真正填写凭据的弹窗不该再藏进子菜单里多绕一层
  {
    label: '同步设置',
    icon: 'settings',
    divided: true,
    // 走 openSyncSettings 而非直接置位：弹窗内的方案选择器需对齐当前同步目标，
    // 保证看到的就是缺凭据的那一项
    action: openSyncSettings,
  },
]);

/**
 * 窄屏「更多」菜单的行数上限（见模板处注释）：7 行在 md 档下约 415px（含标题行与首条分割线的占位），
 * 约占 844px 高手机屏的 49%；全展开 10 条约 596px，这一刀省下约 180px。项数最多 10 条，
 * 故 7 行之外要靠滚动。这是**上限**不是裁剪：所有入口照旧可达，只是要滚一下。
 */
const MORE_MENU_MAX_VISIBLE_ITEMS = 7;

/**
 * 极窄档（< 480px）被折叠进「更多」的页内动作：顶栏上那几个按钮的等价物。
 *
 * 与顶栏按钮**完全同源**：同一个禁用判据、同一份提示文案、同一个 handler —— 折叠只是换了承载形态，
 * 不复制逻辑（判据分开写迟早冒出「顶栏上能点、菜单里却禁用」这类不一致）。
 * 乐谱路由只留「复制文字」常驻，粘贴 / 复制长图 / 下载在此；工作台只留「试听」，复制 / 粘贴在此。
 */
const foldedRouteActions = computed<MenuItem[]>(() => {
  if (!isActionFold.value) return [];

  if (route.path === ROUTE_PATHS.WORKBENCH)
    return [
      {
        label: '复制当前和弦',
        icon: 'copy',
        title: copyChordTooltip.value,
        disabled: isCopyChordDisabled.value,
        action: () => handleCopyChord(),
      },
      {
        label: '从剪切板粘贴',
        icon: 'clipboard-paste',
        title: pasteChordTooltip.value,
        disabled: isPasteChordDisabled.value,
        action: () => handlePasteChord(),
      },
    ];

  if (route.path === ROUTE_PATHS.SCORE)
    return [
      {
        label: '粘贴乐谱',
        icon: 'clipboard-paste',
        title: pasteScoreTooltip.value,
        disabled: isPasteScoreDisabled.value,
        action: () => void handlePasteSong(),
      },
      {
        label: '复制整曲长图',
        icon: 'image',
        title: copyScoreImageTooltip.value,
        disabled: !canExportScore.value,
        action: () => void handleScoreExport('copy'),
      },
      // 下载那一组（长图 / PDF / Zip / 打印）整体作子菜单挂进来，不拆平 —— 它本来就是一组动作。
      // 父项同样带 disabled：MenuSubmenu 尊重该项，禁用时既点不动也不展开子面板
      {
        label: '导出下载',
        icon: 'download',
        title: downloadMenuTitle.value,
        disabled: !canExportScore.value,
        children: downloadExportMenuItems,
      },
    ];

  return [];
});

/**
 * 窄屏「更多」菜单：宽屏右侧那三个常驻入口（同步 / 外观 / 仓库）与开发面板的等价物；
 * 极窄档下还承载被折叠的页内动作（见 foldedRouteActions，排在最前）。
 *
 * 不另造一套偏好逻辑：同步与外观的项都与宽屏同源（同一个 handleSyncMenuClick / openSyncSettings、
 * 同一份 settingsStore.syncTarget 收窄写法、同一份 themeMenuItems），只是换了承载形态。
 * 层级刻意压到两层（同步目标 / 外观各挂一层子菜单），不在手机弹层里做三层级联。
 */
const moreMenuItems = computed<MenuItem[]>(() => {
  const prefs: MenuItem[] = [
    {
      label: isSyncing.value ? '推送中...' : '推送到云端',
      icon: 'refresh-cw',
      disabled: isSyncing.value || isPulling.value,
      action: handleSyncMenuClick,
    },
    {
      label: isPulling.value ? '拉取中...' : '从云端拉取',
      icon: 'cloud-download',
      disabled: isSyncing.value || isPulling.value,
      action: () => {
        isPullConfirmOpen.value = true;
      },
    },
    {
      label: '同步目标',
      icon: getSyncProviderMeta(settingsStore.syncTarget).icon,
      model: settingsStore.syncTarget,
      onPick: value => {
        const kind = SYNC_PROVIDER_ORDER.find(k => k === value);
        if (kind !== undefined) settingsStore.syncTarget = kind;
      },
      children: SYNC_PROVIDER_ORDER.map(kind => ({
        label: SYNC_PROVIDER_META[kind].label,
        icon: SYNC_PROVIDER_META[kind].icon,
        value: kind,
        keepOpen: true,
      })),
    },
    { label: '同步设置', icon: 'settings', action: openSyncSettings },
    {
      label: '外观',
      icon: themeTriggerIcon.value,
      divided: true,
      model: themePreference.value,
      onPick: pickTheme,
      children: themeMenuItems,
    },
    { label: 'GitHub 仓库与构建信息', icon: 'github', divided: true, action: openSourceRepository },
  ];
  // 开发面板：仅开发构建入列（与宽屏那个 `v-if="IS_DEV"` 同一判据）
  if (IS_DEV)
    prefs.push({
      label: '打开开发面板',
      icon: 'wrench',
      action: () => {
        isDevPanelOpen.value = true;
      },
    });

  const folded = foldedRouteActions.value;
  // 折叠进来的页内动作排在最前（它们本来就在顶栏上、是这一页自己的操作），与偏好入口之间补一条
  // 分割线 —— 分割线渲染在项**之前**，故挂在首个偏好项上；挂在首项会在菜单顶部多出一条悬空的线
  if (folded.length && prefs[0]) prefs[0] = { ...prefs[0], divided: true };
  return [...folded, ...prefs];
});

/** 右侧「设置面板」按钮的可用判据（按钮本身常驻显示，条件不满足时禁用而非隐藏）：
 *  工作台可用；乐谱页需已打开乐谱且处于「排列和弦」「预览」tab ——
 *  「编辑歌词」tab 及未打开乐谱时禁用（缩放/对齐等设置对纯歌词编辑无意义） */
const canUseHeaderSettings = computed(() => {
  if (route.path === ROUTE_PATHS.WORKBENCH) return true;
  if (route.path !== ROUTE_PATHS.SCORE) return false;
  return Boolean(scoreEditor.activeSong) && scoreEditor.activeTab !== 'edit';
});

/** 设置面板改为常驻后，可用性失效时要显式收起已展开的面板：
 *  原先是靠 v-if 卸载整个 BasePopover 达成的，常驻后不会再有那次卸载
 *  （例：预览 tab 上面板开着时，后退到「编辑歌词」tab） */
const settingsPopoverRef = useTemplateRef<InstanceType<typeof BasePopover>>('settingsPopoverRef');
watch(canUseHeaderSettings, canUse => {
  if (!canUse) settingsPopoverRef.value?.close('settings-unavailable');
});

const scoreModeOptions = computed<SegmentOption<ScoreActiveTab>[]>(() => [
  { label: '编辑歌词', value: 'edit' },
  {
    label: '排列和弦',
    value: 'interactive',
    disabled: !scoreEditor.hasLyrics,
  },
  {
    label: '预览',
    value: 'preview',
    disabled: !scoreEditor.hasLyrics,
  },
]);

/** 乐谱 Tab 栏容器：居中装得下时绝对铺满居中、自身不吃指针事件；装不下时流内独占一行。
 *  两态的居中锚点都是顶栏盒宽 —— 独占一行只是不再压着左右两组，视觉位置不变。判据见 isTabRowOwnLine。
 *
 *  独占一行时**必须给一个确定高度**：本栏里的分段控件走 `full-height`（`h-full`），而 `h-full` 只认父级的
 *  **确定**高度 —— 居中态下父级是 `absolute inset-0` 那一层、高度确定；独占一行时父级是流内行、高度由内容
 *  撑开，`h-full` 于是退化成 `auto`，控件高度塌成一行文字高，贴底的下划线就正好压在文字底边上
 *  （2026-09-27 的现象：移动端下划线贴住文字）。给死高度后两态的控件高度一致，下划线到文字的距离
 *  也随之一致。原独占一行那层 `py-xs` 同时去掉：高度既已给死，它只会从控件身上再切掉 12px、把下划线往上顶。
 *
 *  独占一行时的高度按「本行要明显低于顶栏第一行」取值，不按控件档位自身的高度取：**tab 的高度就是本行的高度**
 *  —— 控件是 `full-height`、项自身 `self-stretch`，下划线贴的是行底，行高不动时光降字号（见模板里
 *  `:size` 的注释）看着仍是原来那么大；而按档位自身高度取时（`lg` 2.3rem / `md` 1.9rem，原来给的
 *  `h-10` 2.5rem 更甚）本行与 `min-h-10` 的顶栏第一行几乎等高，tab 看上去跟那排图标钮一个量级。
 *  故紧凑档取 `h-7`（1.75rem ≈ 39px）、非紧凑档取 `h-8`（2rem ≈ 44.5px）：两者都明显低于 2.5rem 的顶栏行，
 *  彼此也差一档。
 *
 *  下限由「下划线到文字的距离」兜住，不会退回 2026-09-27 修过的「下划线贴住文字」：项是 `leading-none`
 *  （字高 = 字号），行高 H 下的留白 =（H − 字高）/2 − 2px（下划线 2px 贴行底）——
 *  紧凑档 13.9px 字 ⇒ ≈ 10.5px，非紧凑档 16.7px 字 ⇒ ≈ 11.9px，都还是清晰的一段间距。
 *
 *  独占一行时另加一条顶部分割线：本行已经矮于顶栏第一行，但两者底色同为 `bg-surface-panel`、
 *  中间只隔 `gap-y-xs`（6px），不加线时它看着仍像顶栏那行的下半截。线取 `border-glass-border`，与顶栏
 *  自身的 `border-b` 同料（`SidebarLeft` 的面板底栏也是这条）。线的宽度随本行 —— 顶栏有 `px-md` 内边距，
 *  故它是内缩的「内部分隔线」，不是通栏的那条；居中态下本行是 `absolute inset-0` 的一层、
 *  与左右两组同一行，没有可分隔的两行，不给线。 */
const scoreTabRowClass = computed(() => {
  if (!isTabRowOwnLine.value) return 'pointer-events-none absolute inset-0 z-inner flex items-stretch justify-center';

  return `order-last flex ${isNarrow.value ? 'h-7' : 'h-8'} basis-full items-stretch justify-center border-t border-glass-border`;
});

/** 乐谱页切 Tab：委托 useScoreRouteSync 统一写 Store 并镜像 URL（push 产生历史，可后退回放） */
const handleScoreTabChange = (val: ScoreActiveTab) => void scoreRouteSync.switchTab(val);

const isSyncModalOpen = ref(false);
/** 开发面板（仅 dev 构建挂载）：构建信息 / 数据概览 / 缓存与存储操作 */
const IS_DEV = import.meta.env.DEV;
const isDevPanelOpen = ref(false);
// DEV 判据必须落在**模块顶层**，否则这块 dev-only 代码摇不掉：`defineAsyncComponent(() => import(...))`
// 是不透明调用，Rollup 不能假设它无副作用，顶层无条件执行时那条动态 import 边必然保留 —— dist 里会
// 白多出一个永不被请求的 chunk（DevPanel + devSeedData，约 20KB）。写成下面的三元后，构建期
// `import.meta.env.DEV` 被 vite:define 换成字面量 false，整个调用连同 import 边一起被摇掉。
// （已用本项目实装的 rollup 4.60.4 + @vue/compiler-sfc 3.5.11 跑单进程探针验证：三元式不产出该 chunk，
// 无条件式产出；不必为了复核它去跑一次全量构建。）
// 代价是类型为 `DefineComponent | undefined`，故模板侧用 `v-if="DevPanel"` 而非 `v-if="IS_DEV"`：生产
// 构建下两者恒等（字面量 false 同样只剩 undefined 分支），但判据与「组件是否存在」不会再各说各话。
const DevPanel = IS_DEV ? defineAsyncComponent(() => import('@/app/modals/DevPanel.vue')) : undefined;
/** PWA 窗口控制拖拽拦截类名 */
const NO_DRAG_REGION_CLASS = 'wco:[-webkit-app-region:no-drag] wco:[app-region:no-drag]';
const SyncModalContainer = defineAsyncComponent(() => import('@/app/modals/SyncModalContainer.vue'));
/** GitHub 按钮 tooltip：构建信息 + 点击跳转仓库提示（交互式，字符串数组多行换行） */
const buildRepoTooltip = computed(() => {
  const builtAt = new Date(__BUILD_INFO__.time).toLocaleString('zh-CN', { hour12: false });
  return ['Fret Logic', `版本：${__BUILD_INFO__.commit}`, `构建时间：${builtAt}`, '点击图标打开 GitHub 查看项目源码'];
});
</script>
