import {
  formatAccidental as formatAccidentalTheory,
  formatChordQuality,
  getChordName,
  nameToSegments,
} from '@/domains/chord/theory/theory';
import { createLruCache } from '@/platform/utils/lruCache';

import type { AccidentalType, Chord, ChordNameSegments, ExtensionSegment } from '@/domains/chord/types';
import type { Directive } from 'vue';

/**
 * v-chord-name 指令：将和弦名结构化分片渲染为带样式的行内标记。
 * 由原 ChordNameDisplay 组件迁移而来（纯展示、无交互状态，指令化省去组件实例开销）。
 *
 * 用法：<span v-chord-name="{ chord, shorthand: true }" /> 或 <span v-chord-name="'Cm7'" />（字符串等价于 { name }）
 * 绑定值为普通对象；宿主组件重渲染时经 updated 钩子自动重绘，
 * 输入快照未变化时跳过 DOM 写入。
 *
 * 契约：指令不推断业务场景（不读设置、不读路由），简写与否完全由调用方在绑定值里显式声明；
 * 简写开关变化由宿主自身的响应式渲染驱动重绘。
 */

export interface ChordNameValue {
  chord?: Chord | null;
  segments?: ChordNameSegments | null;
  name?: string | null;
  /** 纯度数渲染（无根音/低音）：如构成音面板的度数徽章，多度数间以 "/" 分隔 */
  degrees?: ExtensionSegment[] | null;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'inherit';
  useUnicode?: boolean;
  /** 是否使用简写符号；不传一律 false（完整和弦名）。
   *  简写只对「工作台 / 乐谱」两个场景开放，由调用方把对应偏好值显式传进来，指令不自行推断 */
  shorthand?: boolean;
  /** 结构化名前后的附加文本（如「和弦引用 」「调」）：由调用方显式声明后结构化渲染仍生效
   *  （直接拼进 name 会让整串解析失败、退化为纯文本，升降号失去上标样式），指令不做任何文本切分推断 */
  prefix?: string;
  suffix?: string;
}

/** 指令绑定值：对象形式见 ChordNameValue；字符串形式等价于 { name: value }，走完整解析链 */
export type ChordNameBinding = ChordNameValue | string | null | undefined;

const DISPLAY_CLASS =
  'chord-name-display inline-flex max-w-full items-baseline align-middle leading-normal whitespace-nowrap tabular-nums select-none';
const FALLBACK_CLASS = 'chord-name-display-fallback inline leading-[inherit]';
/** 附加文本（prefix/suffix）包裹层：inline 参与基线对齐，whitespace-pre 保住首尾空格 */
const AFFIX_CLASS = 'chord-affix inline align-baseline whitespace-pre';
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
  prefix: string;
  suffix: string;
  shorthand: boolean;
  useUnicode: boolean;
  sizeClass: string;
}

/** 一次结构化渲染的可复用产物：class 串 + 待写入的 HTML */
interface RenderedChordName {
  classes: string;
  html: string;
}

/** 渲染结果缓存：同一份渲染输入（快照键）在多个元素上出现时复用已构建的 HTML。
 *  乐库 / 侧栏里同名和弦（尤其调号）会成百上千次重复，逐元素重拼字符串是纯浪费；
 *  上限与 theory 层解析缓存同量级——常用和弦名远少于 512，重复输入基本都能命中 */
const renderCache = createLruCache<RenderedChordName>(512);

/** 上次渲染快照键，避免无效 DOM 写入 */
const stateMap = new WeakMap<HTMLElement, string>();
/** 上次由本指令添加的 class，更新时只增删自己的 class，不覆盖消费方的 class */
const appliedClassMap = new WeakMap<HTMLElement, string>();

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

/** 归一化渲染输入：解析分片/兜底文本，简写开关只取绑定里的显式值（缺省 false）。 */
const resolveInput = (value: ChordNameBinding): ResolvedInput => {
  // 字符串绑定：等价于传入 { name: value }，走完整解析链（分片 → 简写联动 → 兜底）
  if (typeof value === 'string') return resolveInput({ name: value });
  const shorthand = value?.shorthand ?? false;
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
    prefix: value?.prefix ?? '',
    suffix: value?.suffix ?? '',
    shorthand,
    useUnicode,
    sizeClass,
  };
};

/** 附加文本（前缀/后缀）转义为独立行内 span：宿主是 inline-flex，
 *  纯文本节点会成为匿名 flex 项且首尾空格会被折叠，故包一层 whitespace-pre 保序 */
const buildAffixHtml = (text: string): string => `<span class="${AFFIX_CLASS}">${escapeHtml(text)}</span>`;

/** 结构化内容外套附加文本：无附加文本时原样返回 */
const withAffixes = (inner: string, prefix: string, suffix: string): string =>
  `${prefix ? buildAffixHtml(prefix) : ''}${inner}${suffix ? buildAffixHtml(suffix) : ''}`;

/** 写入一次结构化渲染产物：同步"本指令拥有"的 class 后覆写 innerHTML */
const applyStructured = (el: HTMLElement, classes: string, html: string): void => {
  syncOwnClasses(el, classes);
  el.innerHTML = html;
};

/** 渲染入口（mounted/updated 共用）：输入快照未变化时跳过；
 *  结构化内容先查渲染缓存（跨元素复用结果），未命中才拼串；纯文本兜底不缓存。 */
const renderChordName = (el: HTMLElement, binding: { value: ChordNameBinding }): void => {
  const input = resolveInput(binding.value);
  const snapshotKey = JSON.stringify(input);
  if (stateMap.get(el) === snapshotKey) return;

  const structuredClasses = `${DISPLAY_CLASS}${input.sizeClass ? ` ${input.sizeClass}` : ''}`;

  const cached = renderCache.get(snapshotKey);
  if (cached) {
    stateMap.set(el, snapshotKey);
    applyStructured(el, cached.classes, cached.html);
    return;
  }

  const html = input.segments
    ? withAffixes(buildNameHtml(input.segments, input.shorthand, input.useUnicode), input.prefix, input.suffix)
    : input.degrees && input.degrees.length > 0
      ? withAffixes(buildDegreesHtml(input.degrees, input.useUnicode), input.prefix, input.suffix)
      : null;

  stateMap.set(el, snapshotKey);
  if (html !== null) {
    renderCache.set(snapshotKey, { classes: structuredClasses, html });
    applyStructured(el, structuredClasses, html);
    return;
  }

  syncOwnClasses(el, `${FALLBACK_CLASS}${input.sizeClass ? ` ${input.sizeClass}` : ''}`);
  el.textContent = `${input.prefix}${input.fallback}${input.suffix}`;
};

export const vChordName: Directive<HTMLElement, ChordNameBinding> = {
  mounted: renderChordName,
  updated: renderChordName,
};
