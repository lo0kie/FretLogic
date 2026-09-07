import { watch } from 'vue';

import {
  formatAccidental as formatAccidentalTheory,
  formatChordQuality,
  getChordName,
  nameToSegments,
} from '@/domains/chord/theory/theory';
import { useSettingsStore } from '@/platform/store/settingsStore';
import { ROUTE_PATHS } from '@/platform/utils/constants';

import type { AccidentalType, Chord, ChordNameSegments, ExtensionSegment } from '@/domains/chord/types';
import type { Directive } from 'vue';
import type { RouteLocationNormalizedLoaded } from 'vue-router';

/**
 * v-chord-name 指令：将和弦名结构化分片渲染为带样式的行内标记。
 * 由原 ChordNameDisplay 组件迁移而来（纯展示、无交互状态，指令化省去组件实例开销）。
 *
 * 用法：<span v-chord-name="{ chord, shorthand: true }" /> 或 <span v-chord-name="'Cm7'" />（字符串等价于 { name }）
 * 绑定值为普通对象；宿主组件重渲染时经 updated 钩子自动重绘，
 * 输入快照未变化时跳过 DOM 写入。
 */

export interface ChordNameValue {
  chord?: Chord | null;
  segments?: ChordNameSegments | null;
  name?: string | null;
  /** 纯度数渲染（无根音/低音）：如构成音面板的度数徽章，多度数间以 "/" 分隔 */
  degrees?: ExtensionSegment[] | null;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'inherit';
  useUnicode?: boolean;
  /** 显式指定简写开关；不传时按当前路由（乐谱/工作台）与设置推断 */
  shorthand?: boolean;
}

/** 指令绑定值：对象形式见 ChordNameValue；字符串形式等价于 { name: value }，走完整解析链 */
export type ChordNameBinding = ChordNameValue | string | null | undefined;

const DISPLAY_CLASS =
  'chord-name-display inline-flex max-w-full items-baseline align-middle leading-normal whitespace-nowrap tabular-nums select-none';
const FALLBACK_CLASS = 'chord-name-display-fallback inline leading-[inherit]';
const ACCIDENTAL_CLASS =
  'chord-accidental relative top-[-0.32em] mr-[0.04em] ml-[0.06em] inline-block align-baseline font-[inherit] text-[0.72em] leading-none font-bold';

const SIZE_CLASS_MAP: Record<NonNullable<ChordNameValue['size']>, string> = {
  xs: 'text-[11px]',
  sm: 'text-[13px]',
  md: 'text-[15px]',
  lg: 'text-[18px]',
  inherit: '',
};

/** 解析后的完整渲染输入，作为跨 updated 钩子的变化检测快照 */
interface ResolvedInput {
  segments: ChordNameSegments | null;
  degrees: ExtensionSegment[] | null;
  fallback: string;
  shorthand: boolean;
  useUnicode: boolean;
  sizeClass: string;
}

/** 上次渲染快照键，避免无效 DOM 写入 */
const stateMap = new WeakMap<HTMLElement, string>();
/** 上次由本指令添加的 class，更新时只增删自己的 class，不覆盖消费方的 class */
const appliedClassMap = new WeakMap<HTMLElement, string>();
/** 简写设置监听的停止句柄，随元素卸载清理，避免内存泄漏 */
const stopMap = new WeakMap<HTMLElement, () => void>();

/** 同步"本指令拥有"的 class：更新时只增删自己上次写入的 class，不覆盖宿主其他 class。 */
const syncOwnClasses = (el: HTMLElement, target: string): void => {
  const prev = appliedClassMap.get(el) ?? '';
  if (prev === target) return;
  if (prev) el.classList.remove(...prev.split(/\s+/).filter(Boolean));
  el.classList.add(...target.split(/\s+/).filter(Boolean));
  appliedClassMap.set(el, target);
};

/** HTML 特殊字符转义（innerHTML 拼接前的防注入处理）。 */
const escapeHtml = (text: string): string =>
  text.replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch] ?? ch);

/** 格式化升降号的理论层透传别名。 */
const formatAccidental = (acc: AccidentalType, useUnicode: boolean) => formatAccidentalTheory(acc, useUnicode);

/** 将升降号渲染为上标 span；无升降号返回空串。 */
const formatAccidentalSpan = (acc: AccidentalType | undefined, useUnicode: boolean): string =>
  acc ? `<span class="${ACCIDENTAL_CLASS}">${escapeHtml(formatAccidental(acc, useUnicode))}</span>` : '';

/** 质量标记展示值：简写模式下做 m7b5→ø7 特判与标准简写映射（与原组件行为一致） */
const resolveQualityText = (
  segments: ChordNameSegments,
  extensions: NonNullable<ChordNameSegments['extensions']>,
  shorthand: boolean
): string => {
  const quality = segments.quality ?? segments.unknownQuality ?? '';
  if (!shorthand) return quality;
  const b5Idx = extensions.findIndex(([deg, acc]) => (deg === 5 || deg === '5') && acc === -1);
  if ((quality === 'm7' || quality === 'm') && b5Idx >= 0) return 'ø7';
  return formatChordQuality(quality, true);
};

/** 将结构化分片拼装为和弦名 HTML：根音（含升降号）→ 性质 → 扩展音 → 斜杠低音。 */
const buildNameHtml = (segments: ChordNameSegments, shorthand: boolean, useUnicode: boolean): string => {
  const extensions = segments.extensions ?? [];
  const accidental = (acc: AccidentalType | undefined) => formatAccidentalSpan(acc, useUnicode);

  let html = `<span class="chord-root-group whitespace-nowrap"><span inline align-baseline class="chord-root-letter">${escapeHtml(segments.root[0])}</span>${accidental(segments.root[1])}</span>`;

  const qualityText = resolveQualityText(segments, extensions, shorthand);
  if (qualityText) html += `<span class="chord-quality font-[inherit]">${escapeHtml(qualityText)}</span>`;

  for (const ext of extensions) {
    html += `<span class="chord-ext-item inline align-baseline whitespace-nowrap">${accidental(ext[1])}<span class="chord-ext-degree">${escapeHtml(String(ext[0]))}</span></span>`;
  }

  if (segments.bass) {
    html += `<span class="chord-slash mx-px opacity-85">/</span><span class="chord-bass-group inline align-baseline whitespace-nowrap"><span class="chord-bass-letter">${escapeHtml(segments.bass[0])}</span>${accidental(segments.bass[1])}</span>`;
  }
  return html;
};

/** 纯度数渲染：多项间以 "/" 分隔（复用低音 slash 样式）。
 * 每项必须与 buildNameHtml 的 extension 结构同构（chord-ext-item 行内包裹 + align-baseline）：
 * 升降号若直接作为宿主 inline-flex 的弹性子项，基线对齐行为不同，上标偏移会不一致 */
const buildDegreesHtml = (degrees: ExtensionSegment[], useUnicode: boolean): string =>
  degrees
    .map(
      ext =>
        `<span class="chord-ext-item inline align-baseline whitespace-nowrap">${formatAccidentalSpan(ext[1], useUnicode)}<span class="chord-ext-degree">${escapeHtml(String(ext[0]))}</span></span>`
    )
    .join('<span class="chord-slash mx-px opacity-85">/</span>');

/** 从组件实例上取当前路由对象；取不到（非组件上下文/异常）返回 null。 */
const resolveRoute = (instance: unknown): RouteLocationNormalizedLoaded | null => {
  try {
    const globalProps = (
      instance as {
        appContext?: { config?: { globalProperties?: { $route?: RouteLocationNormalizedLoaded } } };
      } | null
    )?.appContext?.config?.globalProperties;
    return globalProps?.$route ?? null;
  } catch {
    return null;
  }
};

/** 归一化渲染输入：解析分片/兜底文本，简写开关按显式值 > 路由场景（乐谱/工作台）设置推断。 */
const resolveInput = (instance: unknown, value: ChordNameBinding): ResolvedInput => {
  // 字符串绑定：等价于传入 { name: value }，走完整解析链（分片 → 简写联动 → 兜底）
  if (typeof value === 'string') return resolveInput(instance, { name: value });
  const isScoreMode = resolveRoute(instance)?.path === ROUTE_PATHS.SCORE;
  const settingsStore = useSettingsStore();
  const shorthand =
    value?.shorthand !== undefined
      ? value.shorthand
      : isScoreMode
        ? settingsStore.scoreChordShorthand
        : settingsStore.workbenchChordShorthand;
  const useUnicode = value?.useUnicode ?? true;
  const sizeClass = SIZE_CLASS_MAP[value?.size ?? 'inherit'] ?? '';

  const segments =
    value?.segments ??
    value?.chord?.nameSegments ??
    nameToSegments(value?.name ?? '') ??
    (value?.chord ? nameToSegments(getChordName(value.chord)) : null);
  const fallback = value?.name || (value?.chord ? getChordName(value.chord, { shorthand }) : '');

  return {
    segments,
    degrees: value?.degrees ?? null,
    fallback,
    shorthand,
    useUnicode,
    sizeClass,
  };
};

/** 渲染入口（mounted/updated 共用）：输入快照未变化时跳过；按分片/度数/兜底文本三档写入 DOM。 */
const renderChordName = (el: HTMLElement, binding: { value: ChordNameBinding; instance: unknown }): void => {
  const input = resolveInput(binding.instance, binding.value);
  const snapshotKey = JSON.stringify(input);
  if (stateMap.get(el) === snapshotKey) return;
  stateMap.set(el, snapshotKey);

  if (input.segments) {
    syncOwnClasses(el, `${DISPLAY_CLASS}${input.sizeClass ? ` ${input.sizeClass}` : ''}`);
    el.innerHTML = buildNameHtml(input.segments, input.shorthand, input.useUnicode);
  } else if (input.degrees && input.degrees.length > 0) {
    syncOwnClasses(el, `${DISPLAY_CLASS}${input.sizeClass ? ` ${input.sizeClass}` : ''}`);
    el.innerHTML = buildDegreesHtml(input.degrees, input.useUnicode);
  } else {
    syncOwnClasses(el, `${FALLBACK_CLASS}${input.sizeClass ? ` ${input.sizeClass}` : ''}`);
    el.textContent = input.fallback;
  }
};

export const vChordName: Directive<HTMLElement, ChordNameBinding> = {
  mounted(el, binding) {
    renderChordName(el, binding);
    // 简写开关取自设置 store，而指令仅在宿主组件重渲染时重绘；
    // 切简写开关不会触发宿主重渲染，故在此监听设置变化、主动重绘，
    // 否则会出现“切了简写需再点一下/改动和弦才生效”的延迟
    const settingsStore = useSettingsStore();
    const stop = watch(
      () => [settingsStore.workbenchChordShorthand, settingsStore.scoreChordShorthand],
      () => renderChordName(el, binding)
    );
    stopMap.set(el, stop);
  },
  updated: renderChordName,
  unmounted(el) {
    stopMap.get(el)?.();
    stopMap.delete(el);
  },
};
