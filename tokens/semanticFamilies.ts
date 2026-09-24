/**
 * 语义强调色族：tint / shade / lift 三支派生族共用的「族名 → 源色令牌」映射。
 *
 * 单独成文件，是因为这份映射要被三支派生器一起引用：抄成三份的后果是新增一个语义色时
 * 只改了一处、另两族静默缺档（守卫能拦下症状，但拦不下抄写这个动作本身）。
 *
 * 族名按字母序给出；三支族各自的**输出顺序**由各自档位表的键序决定，与本文件无关。
 * 非语义族（borderbase / current / panelhover / texttitle）只在 tint 族里出现 ——
 * 它们服务的是「中性填充」而非语义色梯度，故不在此列。
 */
export type SemanticFamily = 'danger' | 'info' | 'primary' | 'success' | 'warning';

/** 族 → 源色令牌。令牌名三主题一致（各主题在自己的调色板里给不同取值）。 */
export const SEMANTIC_FAMILY_SOURCE: Record<SemanticFamily, string> = {
  danger: '--color-danger',
  info: '--color-info',
  primary: '--color-primary',
  success: '--color-success',
  warning: '--color-warning',
};
