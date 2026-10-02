/**
 * 和弦领域指令的注册入口。与 `platform/directives/register.ts` 同一口径：注册名逐条手写，
 * 因为它是模板里实际敲的那个词，必须可 grep。
 *
 * 为什么与平台指令分开注册：`v-chord-name` 依赖本域的乐理内核，而 zone ① 明令 platform 不得
 * 反向依赖 domains（含 type-only 导入），平台的注册器收不了它 —— 各层注册各自的指令，
 * 装配层（`main.ts`）按层各调一次。
 */
import { vChordName } from './vChordName';

import type { App } from 'vue';

/** 把和弦领域指令注册到 app 上 */
export const registerChordDirectives = (app: App): void => void app.directive('chord-name', vChordName);
