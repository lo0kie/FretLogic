/**
 * Worker 侧内联 MD5 与前端 js-md5 的**协议一致性**测试。
 *
 * 为什么值得单测（AGENTS 第七节 3 点名的「跨实例文本编解码协议」）：这是两份**各自独立**的实现
 * ——前端 `import 'js-md5'`，worker 侧为绕开 esbuild `--platform=neutral` 解析 node 内置模块的问题
 * 而内联了一份（见 worker/lib/md5.mjs 文件头）。而 md5 是前后端之间的校验和协议：前端上传时算的
 * 值与 worker 落库时**现场重算**的值必须逐字符相同，否则 `/meta` 回读的校验和与本地永远对不上，
 * 启动一致性比对永久短路（worker/index.mjs 第 194 行记的正是这个事故）。
 * 该模块此前零测试，两侧不一致只在运行期 console.warn 一声，没有任何关卡拦得住。
 */
import { md5 as jsMd5 } from 'js-md5';
import { describe, expect, it } from 'vitest';

import { md5 as workerMd5 } from '../../worker/lib/md5.mjs';

/** RFC 1321 附录 A.5 的标准测试向量：公开规范里的固定值，不是可调配置（AGENTS 第七节 2） */
const RFC_VECTORS: readonly (readonly [string, string])[] = [
  ['', 'd41d8cd98f00b204e9800998ecf8427e'],
  ['a', '0cc175b9c0f1b6a831c399e269772661'],
  ['abc', '900150983cd24fb0d6963f7d28e17f72'],
  ['message digest', 'f96b697d7cb7938d525a2f31aaf161d0'],
  ['abcdefghijklmnopqrstuvwxyz', 'c3fcd3d76192e4007dfb496cca67e13b'],
  ['ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789', 'd174ab98d277d9f5a5611c2c9f419d9f'],
  [
    '12345678901234567890123456789012345678901234567890123456789012345678901234567890',
    '57edf4a22be3c955ac49da2e2107b67a',
  ],
];

describe('worker/lib/md5 与 js-md5 的一致性', () => {
  it('与 RFC 1321 的标准测试向量逐条一致', () => {
    for (const [input, expected] of RFC_VECTORS) {
      expect(workerMd5(input)).toBe(expected);
    }
  });

  // 补位边界：MD5 按 64 字节分组，输入长度 mod 64 落在 55/56 两侧时，末尾那 8 字节比特长度字段
  // 分别「放得下」与「需另起一组」，是最容易写错的一档。0~130 覆盖全部 mod 64 取值与多分组情形。
  it('长度 0~130 的输入与 js-md5 输出逐字符相同', () => {
    const mismatched: number[] = [];
    for (let length = 0; length <= 130; length += 1) {
      const input = 'a'.repeat(length);
      if (workerMd5(input) !== jsMd5(input)) mismatched.push(length);
    }
    expect(mismatched).toEqual([]);
  });

  // 非 ASCII 走的是「UTF-8 字节」而不是「UTF-16 码元」：中文 3 字节、emoji 是代理对（4 字节），
  // 组合字符与全角字符又各是一种边界，两侧任一按码元算都会在这组上分叉。
  it('多字节输入（中文 / emoji / 组合字符）与 js-md5 一致', () => {
    const inputs = ['吉他指板 · 和弦库', '🎸🎵 Cmaj7', 'e\u0301', 'ｆｕｌｌｗｉｄｔｈ', 'ßΩ中'];
    for (const input of inputs) {
      expect(workerMd5(input)).toBe(jsMd5(input));
    }
  });

  it('接受 UTF-8 字节数组，结果与同内容的字符串一致', () => {
    const text = '{"version":7,"chords":[{"id":"c-c","strings":[{"fret":-1}]}]}';
    expect(workerMd5(new TextEncoder().encode(text))).toBe(workerMd5(text));
  });

  // 真实调用口径：worker 重算的是 JSON.stringify(parsedPayload)，前端算的是同一份对象的序列化结果。
  // 这条锁「同一份载荷文本两侧同值」，是上面所有等长/字符集用例的收口。
  it('对序列化后的载荷文本与 js-md5 一致', () => {
    const payloadText = JSON.stringify({
      version: 7,
      groups: [{ id: 'g-major', name: '大和弦' }],
      chords: [{ id: 'c-c', strings: [{ fret: -1, preferFlat: false }] }],
      songs: [],
    });
    expect(workerMd5(payloadText)).toBe(jsMd5(payloadText));
  });
});
