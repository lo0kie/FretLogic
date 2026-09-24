// Lucide Icons
import AlertCircle from '~icons/lucide/alert-circle';
import AlertTriangle from '~icons/lucide/alert-triangle';
import ArrowUpDown from '~icons/lucide/arrow-up-down';
import AudioLines from '~icons/lucide/audio-lines';
import AudioWaveform from '~icons/lucide/audio-waveform';
import ChartColumn from '~icons/lucide/chart-column';
import Check from '~icons/lucide/check';
import CheckCircle2 from '~icons/lucide/check-circle-2';
import ChevronDown from '~icons/lucide/chevron-down';
import ChevronRight from '~icons/lucide/chevron-right';
import ChevronUp from '~icons/lucide/chevron-up';
import ClipboardPaste from '~icons/lucide/clipboard-paste';
import Clock from '~icons/lucide/clock';
import Cloud from '~icons/lucide/cloud';
import CloudDownload from '~icons/lucide/cloud-download';
import CloudUpload from '~icons/lucide/cloud-upload';
import Copy from '~icons/lucide/copy';
import Download from '~icons/lucide/download';
import Eraser from '~icons/lucide/eraser';
import Eye from '~icons/lucide/eye';
import EyeOff from '~icons/lucide/eye-off';
import FileArchive from '~icons/lucide/file-archive';
import FileQuestion from '~icons/lucide/file-question';
import FileText from '~icons/lucide/file-text';
import Filter from '~icons/lucide/filter';
import FolderOpen from '~icons/lucide/folder-open';
import FolderSync from '~icons/lucide/folder-sync';
import GitBranch from '~icons/lucide/git-branch';
import Github from '~icons/lucide/github';
import GripVertical from '~icons/lucide/grip-vertical';
import Guitar from '~icons/lucide/guitar';
import Image from '~icons/lucide/image';
import ImageDown from '~icons/lucide/image-down';
import Inbox from '~icons/lucide/inbox';
import Info from '~icons/lucide/info';
import Laptop from '~icons/lucide/laptop';
import LayoutGrid from '~icons/lucide/layout-grid';
import LayoutTemplate from '~icons/lucide/layout-template';
import Link2 from '~icons/lucide/link-2';
import List from '~icons/lucide/list';
import Loader2 from '~icons/lucide/loader-2';
import Maximize2 from '~icons/lucide/maximize-2';
import Mic from '~icons/lucide/mic';
import Minus from '~icons/lucide/minus';
import Moon from '~icons/lucide/moon';
import Move from '~icons/lucide/move';
import Music from '~icons/lucide/music';
import PanelLeft from '~icons/lucide/panel-left';
import Pencil from '~icons/lucide/pencil';
import Play from '~icons/lucide/play';
import PlugZap from '~icons/lucide/plug-zap';
import Plus from '~icons/lucide/plus';
import Printer from '~icons/lucide/printer';
import RefreshCw from '~icons/lucide/refresh-cw';
import Scan from '~icons/lucide/scan';
import Search from '~icons/lucide/search';
import SearchX from '~icons/lucide/search-x';
import Server from '~icons/lucide/server';
import Settings from '~icons/lucide/settings';
import Share2 from '~icons/lucide/share-2';
import SlidersHorizontal from '~icons/lucide/sliders-horizontal';
import Sparkles from '~icons/lucide/sparkles';
import Square from '~icons/lucide/square';
import SquarePen from '~icons/lucide/square-pen';
import Sun from '~icons/lucide/sun';
import Trash2 from '~icons/lucide/trash-2';
import Type from '~icons/lucide/type';
import Upload from '~icons/lucide/upload';
import WifiOff from '~icons/lucide/wifi-off';
import Wrench from '~icons/lucide/wrench';
import X from '~icons/lucide/x';

import type { Component } from 'vue';

export const ICON_REGISTRY = {
  'alert-circle': AlertCircle,
  'alert-triangle': AlertTriangle,
  'arrow-up-down': ArrowUpDown,
  'audio-lines': AudioLines,
  'audio-waveform': AudioWaveform,
  'chart-column': ChartColumn,
  'check': Check,
  'check-circle-2': CheckCircle2,
  'chevron-down': ChevronDown,
  'chevron-right': ChevronRight,
  'chevron-up': ChevronUp,
  'clipboard-paste': ClipboardPaste,
  'clock': Clock,
  'cloud': Cloud,
  'cloud-download': CloudDownload,
  'cloud-upload': CloudUpload,
  'copy': Copy,
  'download': Download,
  'eraser': Eraser,
  'eye': Eye,
  'eye-off': EyeOff,
  'file-archive': FileArchive,
  'file-question': FileQuestion,
  'file-text': FileText,
  'filter': Filter,
  'folder-open': FolderOpen,
  'folder-sync': FolderSync,
  'git-branch': GitBranch,
  'grip-vertical': GripVertical,
  'guitar': Guitar,
  'image': Image,
  'image-down': ImageDown,
  'inbox': Inbox,
  'info': Info,
  'laptop': Laptop,
  'layout-grid': LayoutGrid,
  'layout-template': LayoutTemplate,
  'link-2': Link2,
  'list': List,
  'loader-2': Loader2,
  'maximize-2': Maximize2,
  'mic': Mic,
  'minus': Minus,
  'moon': Moon,
  'move': Move,
  'music': Music,
  'panel-left': PanelLeft,
  'pencil': Pencil,
  'play': Play,
  'plug-zap': PlugZap,
  'plus': Plus,
  'printer': Printer,
  'refresh-cw': RefreshCw,
  'scan': Scan,
  'search': Search,
  'search-x': SearchX,
  'server': Server,
  'settings': Settings,
  'share-2': Share2,
  'sliders-horizontal': SlidersHorizontal,
  'sparkles': Sparkles,
  'square': Square,
  'square-pen': SquarePen,
  'sun': Sun,
  'trash-2': Trash2,
  'type': Type,
  'upload': Upload,
  'wifi-off': WifiOff,
  'wrench': Wrench,
  'x': X,
  'github': Github,
} as const satisfies Record<string, Component>;

export type IconName = keyof typeof ICON_REGISTRY;

/**
 * 支持**通用线条级形变**（flubber 引擎，见 `iconMorphFlubber.ts`）的图标名。
 *
 * 与 `iconMorph.ts` 的线段登记表是两档：登记表是手写的段级配对、几何精确但只覆盖少数几对；
 * 这里是通用兜底，任何两个**在本表内**的图标都能互相补间。
 *
 * 为什么要显式列一份（而不是让引擎自行判断）：形变引擎与图标原始 SVG 都在异步 chunk 里，
 * 而「这个图标是否值得提前预热该 chunk」必须在**首屏就能同步回答** —— 于是留这一份极小的名表。
 * ⚠️ 必须与 `iconMorphBodies.ts` 的键集完全一致：两边错位只会表现成「某些图标永远不形变」，不会有任何报错。
 *
 * 名单口径：与同步目标 / 状态切换直接相关的图标；`filled` 图标无描边轮廓、与描边图标形变会风格跳变，
 * 故一律不收（`github` 曾用 simple-icons 的实心标、因此长期落在名表外，2026-09-25 换成 Lucide 的
 * **描边版**后并入 —— 同名的实心/描边两个版本不是同一画法，登记前先确认取到的是描边那一版）。
 *
 * `clock` / `list` / `pencil` / `type` 是**同一处控件的四种状态**（乐谱列表的排序方式，见
 * `SidebarLeft.vue` 的排序菜单）：它们的切换发生在同一个 `<BaseIcon>` 上，没有形变就是硬切。
 * 这四个含曲线（`clock` 的圆、`pencil` 的笔身、`type` 的横杠圆角）⇒ 依赖 `<path>.getTotalLength()`
 * 做弧长采样，**无该测量的环境（jsdom）里建不出通道、退化为直接切换**，只有真机才看得到补间。
 *
 * `sun` / `moon` / `laptop` 同理，是外观设置那处控件的三种状态（`TopHeader.vue` 的主题菜单，
 * 触发器在 `sun` ↔ `moon` 之间换、菜单项里还会与勾选态的 `check` 互相切换），三个都含曲线。
 *
 * `eye` / `eye-off` 是密码框明文/密文切换（`BaseInput.vue` 的眼睛按钮），`play` / `square` 是
 * 顶栏工作台的试听/停止（`TopHeader.vue` 的 `:icon`）。四者都是同一枚 `<BaseIcon>` 换 name，
 * 且都含曲线（前两个是眼形 + 瞳孔圆，后两个是圆角闭合环），同样只有真机看得到补间。
 */
export const MORPHABLE_ICON_NAMES = [
  'check',
  'chevron-down',
  'clock',
  'eye',
  'eye-off',
  'folder-sync',
  'git-branch',
  'github',
  'laptop',
  'list',
  'moon',
  'pencil',
  'play',
  'plus',
  'server',
  'square',
  'sun',
  'type',
  'x',
] as const satisfies readonly IconName[];
