/**
 * base64DecodeUtf8 的边界口径：输入来自云端响应 / 剪贴板等外部边界，非法 base64 返回 null
 * 而不是抛 InvalidCharacterError —— 与 transfer.ts 的 decodeShareToken 同一口径。
 */
import { describe, expect, it } from 'vitest';

import { base64DecodeUtf8, base64EncodeUtf8 } from '@/platform/utils/common';

describe('base64DecodeUtf8', () => {
  it('合法输入原样往返（含多字节字符）', () => {
    const text = '歌词 Lyrics 123 🎸';
    expect(base64DecodeUtf8(base64EncodeUtf8(text))).toBe(text);
  });

  it('非法 base64 返回 null（修复前抛 InvalidCharacterError）', () => {
    expect(base64DecodeUtf8('!!!not-base64!!!')).toBeNull();
    expect(base64DecodeUtf8('abc def=?')).toBeNull();
  });

  it('空串与合法输入不抛错', () => {
    expect(base64DecodeUtf8('')).toBe('');
    expect(base64DecodeUtf8('YWJj')).toBe('abc');
  });
});
