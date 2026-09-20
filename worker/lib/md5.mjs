/**
 * 极简 MD5（RFC 1321，输入按 UTF-8 编码）——仅供 Worker 侧重算同步载荷校验和。
 *
 * 为什么内联而不直接 import js-md5：后者的 src/md5.js 顶层含 `require('crypto')` /
 * `require('buffer')`（虽在 NODE_JS 分支内不会被 Workers 执行，但会被 esbuild 静态解析），
 * 而 worker 用 `esbuild --platform=neutral` 打包、不套用 package.json 的 `browser` 字段，
 * 解析 node 内置模块会直接让 worker 打包失败。内联后无任何依赖，产物可正常 bundle。
 *
 * 与前端 js-md5 行为对齐：`md5(UTF-8 文本)` → 32 位小写十六进制字符串。
 */

/** 每轮的左移位数 */
const SHIFTS = new Uint8Array([
  7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 4,
  11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
]);

/** 常量表 K[i] = floor(abs(sin(i + 1)) * 2^32) */
const K = new Uint32Array(64);
for (let i = 0; i < 64; i += 1) {
  K[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 2 ** 32) >>> 0;
}

/** 32 位循环左移 */
const rotl = (x, c) => ((x << c) | (x >>> (32 - c))) >>> 0;

/** 计算字符串（或字节数组）的 MD5，返回 32 位小写十六进制 */
export const md5 = input => {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : new Uint8Array(input);
  const len = bytes.length;
  // 补位：原始数据 + 0x80 + 填充 0，末尾附 8 字节小端比特长度；总长为 64 的倍数
  const totalLen = Math.ceil((len + 9) / 64) * 64;
  const msg = new Uint8Array(totalLen);
  msg.set(bytes);
  msg[len] = 0x80;
  const bitLenLo = (len * 8) >>> 0;
  const bitLenHi = Math.floor((len * 8) / 2 ** 32) >>> 0;
  msg[totalLen - 8] = bitLenLo & 0xff;
  msg[totalLen - 7] = (bitLenLo >>> 8) & 0xff;
  msg[totalLen - 6] = (bitLenLo >>> 16) & 0xff;
  msg[totalLen - 5] = (bitLenLo >>> 24) & 0xff;
  msg[totalLen - 4] = bitLenHi & 0xff;
  msg[totalLen - 3] = (bitLenHi >>> 8) & 0xff;
  msg[totalLen - 2] = (bitLenHi >>> 16) & 0xff;
  msg[totalLen - 1] = (bitLenHi >>> 24) & 0xff;

  let a0 = 0x67452301;
  let b0 = 0xefcdab89;
  let c0 = 0x98badcfe;
  let d0 = 0x10325476;
  const m = new Uint32Array(16);

  for (let off = 0; off < totalLen; off += 64) {
    for (let i = 0; i < 16; i += 1) {
      const j = off + i * 4;
      m[i] = (msg[j] | (msg[j + 1] << 8) | (msg[j + 2] << 16) | (msg[j + 3] << 24)) >>> 0;
    }
    let a = a0;
    let b = b0;
    let c = c0;
    let d = d0;
    for (let i = 0; i < 64; i += 1) {
      let f;
      let g;
      if (i < 16) {
        f = (b & c) | (~b & d);
        g = i;
      } else if (i < 32) {
        f = (d & b) | (~d & c);
        g = (5 * i + 1) % 16;
      } else if (i < 48) {
        f = b ^ c ^ d;
        g = (3 * i + 5) % 16;
      } else {
        f = c ^ (b | ~d);
        g = (7 * i) % 16;
      }
      f = (f + a + K[i] + m[g]) >>> 0;
      a = d;
      d = c;
      c = b;
      b = (b + rotl(f, SHIFTS[i])) >>> 0;
    }
    a0 = (a0 + a) >>> 0;
    b0 = (b0 + b) >>> 0;
    c0 = (c0 + c) >>> 0;
    d0 = (d0 + d) >>> 0;
  }

  const words = [a0, b0, c0, d0];
  let hex = '';
  for (let i = 0; i < 4; i += 1) {
    const w = words[i];
    for (let j = 0; j < 4; j += 1) {
      hex += ((w >>> (8 * j)) & 0xff).toString(16).padStart(2, '0');
    }
  }
  return hex;
};
