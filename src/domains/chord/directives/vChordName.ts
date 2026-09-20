import { parseChordNameTokens } from '@/domains/chord/theory/chordNameTokens';
import {
  formatAccidental as formatAccidentalTheory,
  getChordName,
  nameToSegments,
  toShorthandQuality,
} from '@/domains/chord/theory/theory';
import { estimateValueBytes } from '@/platform/utils/common';
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
 *  值为 class 串 + HTML 片段（几十~几百字节），上限与 theory 层解析缓存同量级放宽到 4096，
 *  整库渲染时不再击穿（键含 sizeClass 等呈现参数，实际键空间比和弦名数量还多一档） */
const renderCache = createLruCache<RenderedChordName>(4096, {
  name: '和弦名渲染',
  weigh: (_, value) => estimateValueBytes(value),
});

/** 上次渲染快照键，避免无效 DOM 写入 */
const stateMap = new WeakMap<HTMLElement, string>();
/** 上次由本指令添加的 class，更新时只增删自己的 class，不覆盖消费方的 class */
const appliedClassMap = new WeakMap<HTMLElement, string>();

/** 同步"本指令拥有"的 class：更新时只增删自己上次写入的 class，不覆盖宿主其他 class。 */
const syncOwnClasses = (el: HTMLElement, target: string): void => {
  const prev = appliedClassMap.get(el) ?? '';
  if (prev === target) {
    // 快照未变不代表类还在 DOM 上：消费方 :class 变化会让 Vue patchClass 整体覆写 className，
    // 把本指令写入的类一并抹掉；缺失时补回
    const missing = target
      .split(/\s+/)
      .filter(Boolean)
      .filter(cls => !el.classList.contains(cls));
    if (missing.length > 0) el.classList.add(...missing);
    return;
  }
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

/**
 * 质量标记展示值：简写模式下走理论层的统一实现 `toShorthandQuality`。
 *
 * 历史特判已删除：`(quality === 'm7' || 'm') && extensions 里有 b5 → 'ø7'`。
 * 那是第二处「救旧持久化分片」的正则补丁——它是 `nameToSegments` 合成补丁的下游镜像，
 * 上游一删，这里也随之失效（新分片里半减七是完整的 `'m7b5'`，直接命中简写映射即可）。
 *
 * 现在本函数只是理论层 `toShorthandQuality` 的薄封装：简写规则只有一份实现，
 * 由 token 表驱动（`m7b5` / `m7(b5)` / `ø7` / `min7b5` 收敛到同一展示形态）。
 */
const resolveQualityText = (segments: ChordNameSegments, shorthand: boolean): string => {
  const quality = segments.quality ?? segments.unknownQuality ?? '';
  return shorthand ? toShorthandQuality(quality) : quality;
};

/** 质量段渲染：整质量名里自带的变音（`m7b5` / `7b9` / `7#9`…）与根音、延伸音同口径——
 *  复用理论层唯一的 token 解析器 `parseChordNameTokens`（fretboard 画布与导出 worker
 *  也在用它）,把变音 token 包上标 span,其余文本原样输出。token 的 text 已规整为
 *  ♯/♭,此处映射回升降号数值再走 `formatAccidentalSpan`,以保留 useUnicode 开关。 */
const buildQualityHtml = (qualityText: string, useUnicode: boolean): string =>
  parseChordNameTokens(qualityText)
    .map(token => {
      if (!token.isAccidental) return escapeHtml(token.text);
      return formatAccidentalSpan(token.text === '♯' ? 1 : -1, useUnicode);
    })
    .join('');

/** 将结构化分片拼装为和弦名 HTML：根音（含升降号）→ 性质 → 扩展音 → 斜杠低音。 */
const buildNameHtml = (segments: ChordNameSegments, shorthand: boolean, useUnicode: boolean): string => {
  const extensions = segments.extensions ?? [];
  const accidental = (acc: AccidentalType | undefined) => formatAccidentalSpan(acc, useUnicode);

  let html = `<span class="chord-root-group whitespace-nowrap"><span inline align-baseline class="chord-root-letter">${escapeHtml(segments.root[0])}</span>${accidental(segments.root[1])}</span>`;

  const qualityText = resolveQualityText(segments, shorthand);
  if (qualityText)
    html += `<span class="chord-quality font-[inherit]">${buildQualityHtml(qualityText, useUnicode)}</span>`;

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

/** 渲染内容键：只拼「真正决定 HTML 输出」的字段，替代原先的 JSON.stringify(input)。
 *  逐项与下游一致：
 *  - segments ←→ buildNameHtml 的入参（根音 / 性质 / 扩展音 / 斜杠低音），升降号经 formatAccidental
 *    归一，故 '#'、'1'、'♯' 这些等价写法收敛成同一个键；
 *  - degrees ←→ buildDegreesHtml 同构；fallback 覆盖纯文本兜底分支，prefix/suffix 覆盖附加文本；
 *  - shorthand / useUnicode / sizeClass 即三个呈现开关。
 *  收益：键长从上百字节降到几十字节，且构造只遍历分片数组、不再对嵌套对象做深序列化——
 *  updated 钩子是整库渲染里最热的路径；同语义输入恒得同键（不依赖属性书写顺序），命中率不低于原先。 */
const buildRenderKey = (input: ResolvedInput): string => {
  const seg = input.segments;
  const segKey = seg
    ? [
        `${seg.root[0]}${formatAccidentalTheory(seg.root[1], false)}`,
        seg.quality ?? seg.unknownQuality ?? '',
        (seg.extensions ?? []).map(([deg, acc]) => `${deg}${formatAccidentalTheory(acc, false)}`).join(','),
        seg.bass ? `${seg.bass[0]}${formatAccidentalTheory(seg.bass[1], false)}` : '',
      ].join('|')
    : '';
  const degKey = input.degrees?.map(([deg, acc]) => `${deg}${formatAccidentalTheory(acc, false)}`).join(',') ?? '';
  return `${segKey}#${degKey}#${input.fallback}#${input.prefix}#${input.suffix}#${input.shorthand ? 1 : 0}${input.useUnicode ? 1 : 0}#${input.sizeClass}`;
};

/** 渲染入口（mounted/updated 共用）：输入快照未变化时跳过；
 *  结构化内容先查渲染缓存（跨元素复用结果），未命中才拼串；纯文本兜底不缓存。 */
const renderChordName = (el: HTMLElement, binding: { value: ChordNameBinding }): void => {
  const input = resolveInput(binding.value);
  const snapshotKey = buildRenderKey(input);
  if (stateMap.get(el) === snapshotKey) {
    // 渲染输入未变也可能需要补类：消费方 :class 变化触发的 patchClass 会整体覆写 className
    const prev = appliedClassMap.get(el);
    if (prev) syncOwnClasses(el, prev);
    return;
  }

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
