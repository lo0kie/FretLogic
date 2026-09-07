// Lucide Icons
import AlertCircle from '~icons/lucide/alert-circle';
import AlertTriangle from '~icons/lucide/alert-triangle';
import ArrowUpDown from '~icons/lucide/arrow-up-down';
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
import FileQuestion from '~icons/lucide/file-question';
import FileText from '~icons/lucide/file-text';
import FolderOpen from '~icons/lucide/folder-open';
import FolderSync from '~icons/lucide/folder-sync';
import GitBranch from '~icons/lucide/git-branch';
import GripVertical from '~icons/lucide/grip-vertical';
import Guitar from '~icons/lucide/guitar';
import Image from '~icons/lucide/image';
import Inbox from '~icons/lucide/inbox';
import Info from '~icons/lucide/info';
import Laptop from '~icons/lucide/laptop';
import LayoutGrid from '~icons/lucide/layout-grid';
import Link2 from '~icons/lucide/link-2';
import List from '~icons/lucide/list';
import Loader2 from '~icons/lucide/loader-2';
import Maximize2 from '~icons/lucide/maximize-2';
import Minus from '~icons/lucide/minus';
import Moon from '~icons/lucide/moon';
import Move from '~icons/lucide/move';
import Music from '~icons/lucide/music';
import PanelLeft from '~icons/lucide/panel-left';
import Pencil from '~icons/lucide/pencil';
import Play from '~icons/lucide/play';
import PlugZap from '~icons/lucide/plug-zap';
import Plus from '~icons/lucide/plus';
import RefreshCw from '~icons/lucide/refresh-cw';
import Scan from '~icons/lucide/scan';
import Search from '~icons/lucide/search';
import SearchX from '~icons/lucide/search-x';
import Server from '~icons/lucide/server';
import Settings from '~icons/lucide/settings';
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
// Simple Icons
import SimpleIconsGithub from '~icons/simple-icons/github';

import type { Component } from 'vue';

export const ICON_REGISTRY = {
  'alert-circle': AlertCircle,
  'alert-triangle': AlertTriangle,
  'arrow-up-down': ArrowUpDown,
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
  'file-question': FileQuestion,
  'file-text': FileText,
  'folder-open': FolderOpen,
  'folder-sync': FolderSync,
  'git-branch': GitBranch,
  'grip-vertical': GripVertical,
  'guitar': Guitar,
  'image': Image,
  'inbox': Inbox,
  'info': Info,
  'laptop': Laptop,
  'layout-grid': LayoutGrid,
  'link-2': Link2,
  'list': List,
  'loader-2': Loader2,
  'maximize-2': Maximize2,
  'minus': Minus,
  'moon': Moon,
  'move': Move,
  'music': Music,
  'panel-left': PanelLeft,
  'pencil': Pencil,
  'play': Play,
  'plug-zap': PlugZap,
  'plus': Plus,
  'refresh-cw': RefreshCw,
  'scan': Scan,
  'search': Search,
  'search-x': SearchX,
  'server': Server,
  'settings': Settings,
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
  'github': SimpleIconsGithub,
} as const satisfies Record<string, Component>;

export type IconName = keyof typeof ICON_REGISTRY;
