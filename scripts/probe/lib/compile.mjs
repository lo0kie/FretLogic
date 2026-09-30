/**
 * 非浏览器两档探针的小工具 —— 都是「不需要起浏览器就能回答的问题」。
 *
 * 为什么单独放一份：这两件事（模板能不能编译、某个类编译成了什么）此前也是每次现写，而它们的
 * 样板比浏览器档更碎（各自的入口、参数、错误形状都不同），抄错一次同样会得到一个假绿。
 * 这里只固化「怎么调用」，判断留在 case 里 —— 工具不替调用方下结论，只把原始结果交出来。
 */
import path from 'node:path';
import { readFile } from 'node:fs/promises';

import { compileTemplate, parse } from 'vue/compiler-sfc';

/**
 * 编译一个 `.vue` 的**模板**，返回错误清单（空数组 = 模板可编译）。
 *
 * 用途：改完模板后想立刻知道「编不编得过」，而不必跑全量的 `vue-tsc`（那个还含跨文件类型，
 * 且在本环境属被禁的全量命令）。它**只覆盖模板语法与指令用法**：`<script setup>` 里的类型错误
 * 它看不见，那是 `vue-tsc` 的活 —— 探针报「模板 OK」不等于整个 SFC 没问题。
 *
 * @param file 相对仓库根或绝对路径的 `.vue` 文件
 * @returns `{ errors, warnings }`：`errors` 里是编译期错误的文本（含位置）
 */
export const compileSfcTemplate = async file => {
  const abs = path.resolve(process.cwd(), file);
  const source = await readFile(abs, 'utf8');
  const { descriptor, errors: parseErrors } = parse(source, { filename: abs });

  if (parseErrors.length > 0) return { errors: parseErrors.map(String), warnings: [] };
  if (!descriptor.template) return { errors: [`${file} 没有 <template> 块（这个探针只管模板）`], warnings: [] };

  const result = compileTemplate({
    source: descriptor.template.content,
    filename: abs,
    id: 'pp-probe',
    // 模板里可能引用 <script setup> 的绑定：探针不解析脚本，故按「未知绑定即外部变量」放行，
    // 否则每个 props / 局部变量都会被报成 undefined（那是 vue-tsc 的判据，不是模板编译器的）
    compilerOptions: { bindingMetadata: undefined },
  });

  return {
    errors: result.errors.map(err => (typeof err === 'string' ? err : String(err.message ?? err))),
    warnings: (result.tips ?? []).map(tip => (typeof tip === 'string' ? tip : String(tip.message ?? tip))),
  };
};
