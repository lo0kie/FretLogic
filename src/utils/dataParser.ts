import type { ImportExportPayload } from '@/types';
import { ImportExportPayloadSchema } from '@/types';

export const cleanAndValidateData = (
  data: unknown,
  mode: 'import' | 'export' = 'import'
): data is ImportExportPayload => {
  const logPrefix = mode === 'import' ? '📥 Zod 导入校验' : '📤 Zod 导出清洗';

  const result = ImportExportPayloadSchema.safeParse(data);

  if (!result.success) {
    console.error(`❌ ${logPrefix}失败！检测到核心物理资产结构严重破损。`);
    console.group(`详细错误报告 (共 ${result.error.issues.length} 项违规):`);
    result.error.issues.forEach(issue => {
      console.warn(`路径 [${issue.path.join(' -> ')}]: ${issue.message}`);
    });
    console.groupEnd();
    return false;
  }

  const validatedData = result.data;
  const validGroupIds = new Set<string>(validatedData.groups.map(g => g.id));

  const legalChords = validatedData.chords.filter(chord => {
    if (!validGroupIds.has(chord.groupId)) {
      console.warn(`⚠️ ${logPrefix} -> 和弦 "${chord.chordName}" (${chord.id}) 外键关联失效，执行物理拦截脱离`);
      return false;
    }
    return true;
  });

  const d = data as Record<string, unknown>;
  d.groups = validatedData.groups;
  d.chords = legalChords;

  return true;
};
