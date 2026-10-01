/**
 * 指板域的乐器模型原语已收拢至 platform/types/instrument（三域共用的乐器模型合同，
 * 由 chord / score / fretboard 及 app 校验层共同消费）。本文件保留 re-export，
 * 供域内与既有引用方（含 tests/）沿用旧路径继续编译。
 */
export type {
  BarreEntity,
  BarreFret,
  Capo,
  FretOffset,
  GuitarStringEntity,
  GuitarStringsModel,
  StringIndex,
} from '@/platform/types/instrument';
