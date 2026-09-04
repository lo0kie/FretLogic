import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { validateImportExportPayload } from '@/app/services/validation/payload';

describe('示例备份数据', () => {
  it('通过结构校验，可被导入', () => {
    const raw = readFileSync(resolve(__dirname, '../../examples/sample-backup.json'), 'utf-8');
    const data = JSON.parse(raw) as unknown;
    const result = validateImportExportPayload(data);
    expect(result.isValid).toBe(true);
    expect(result.payload?.groups).toHaveLength(3);
    expect(result.payload?.chords).toHaveLength(10);
    expect(result.payload?.songs).toHaveLength(1);
    expect(result.payload?.version).toBe(6);
  });
});
