/**
 * 拼音分组工具：乐谱「拼音分组」排序与分组标题使用。
 * pinyin-pro 通过动态 import 按需加载（独立 chunk，首次进入拼音分组时才请求，不阻塞首屏）；
 * 加载完成前退化为兜底逻辑（浏览器 zh-Hans-CN 排序 / 非字母归 '#'），
 * 就绪后 pinyinReady 翻转，依赖它的 computed（sortedSongs、songRows 等）自动重算。
 */
import type * as PinyinNs from 'pinyin-pro';
import { ref } from 'vue';

const ASCII_LETTER_RE = /^[a-zA-Z]/;
const CJK_RE = /^[\u4e00-\u9fff]/;
const DIGIT_RE = /^[0-9]/;

type PinyinModule = typeof PinyinNs;

let pinyinModule: PinyinModule | null = null;
let pinyinPromise: Promise<PinyinModule> | null = null;

/** pinyin-pro 是否已加载完成（响应式：就绪后依赖方 computed 自动重算） */
export const pinyinReady = ref(false);

/** 动态加载 pinyin-pro（幂等，可重复调用） */
export const preloadPinyin = (): Promise<PinyinModule> => {
  if (!pinyinPromise) {
    pinyinPromise = import('pinyin-pro').then(mod => {
      pinyinModule = mod;
      pinyinReady.value = true;
      return mod;
    });
  }
  return pinyinPromise;
};

/** 计算单个汉字的分组字母（pinyin-pro 首选拼音首字母），未就绪时归 '#'。 */
const cjkGroupKey = (ch: string): string => {
  if (pinyinModule) {
    const py = pinyinModule.pinyin(ch, { toneType: 'none', type: 'array' })[0] ?? '';
    const m = ASCII_LETTER_RE.exec(py);
    if (m) return m[0].toUpperCase();
  }
  // 未加载完成时无精确拼音：非拉丁字母一律先归 '#'，加载完成后自动重算为 A-Z
  return '#';
};

/** 标题首字母分组键：A-Z；非字母开头（数字/符号/生僻字等）统一归 '#' */
export const pinyinGroupKey = (title: string): string => {
  void pinyinReady.value; // 订阅就绪状态：加载完成后依赖方（songRows 等）会重算
  const ch = title.trim().charAt(0);
  if (!ch) return '#';
  const code = ch.charCodeAt(0);
  if ((code >= 65 && code <= 90) || (code >= 97 && code <= 122)) return ch.toUpperCase();
  if (DIGIT_RE.test(ch)) return '#';
  if (CJK_RE.test(ch)) return cjkGroupKey(ch);
  return '#';
};

/** 标题的拼音全拼（小写），用于组内排序；pinyin-pro 未就绪/转换失败时回退原文小写 */
export const pinyinTitleKey = (title: string): string => {
  void pinyinReady.value;
  if (pinyinModule) {
    try {
      return pinyinModule.pinyin(title, { toneType: 'none' }).toLowerCase();
    } catch {
      return title.toLowerCase();
    }
  }
  return title.toLowerCase();
};

/** 拼音分组排序比较器：# 组置后，其余按拼音全拼升序 */
export const compareByPinyin = (a: string, b: string): number => {
  const ka = pinyinGroupKey(a);
  const kb = pinyinGroupKey(b);
  if (ka === '#' && kb !== '#') return 1;
  if (ka !== '#' && kb === '#') return -1;
  return pinyinTitleKey(a).localeCompare(pinyinTitleKey(b));
};
