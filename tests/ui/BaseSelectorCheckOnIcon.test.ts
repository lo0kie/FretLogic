/**
 * `BaseSelector` 选项勾选标记的**落点**回归锚点：条目带图标时，对勾顶到前导图标位。
 *
 * 钉住三件事 —— 三件都会静默退化成「看着像、其实不对」：
 *
 *  1. **默认档**：条目带图标且被选中时，对勾**顶替该条目图标**出现在前导槽，行尾不再重复出对勾。
 *     最容易出的反例是「两处都画」：肉眼只是多了一个勾，读起来却像两个状态；
 *     另一个反例是对勾干脆消失（前导槽仍画条目图标、行尾空着）——故两档都要同时钉住。
 *  2. **`noCheckOnIcon` 档**：条目图标留在前导槽、对勾回到行尾，即旧观感原样保留。
 *  3. **无图标的条目不受该属性影响**：前导槽本就空着，对勾挪过去等于在行首凭空冒出来，
 *     故这类条目恒走行尾 —— 这条同时挡住「同一份选项列表里勾选位置各不相同」的退化。
 *
 * 断言对象是**行的 DOM 结构**（哪一端是图标、行里共几枚图标）与**图标的几何指纹**，
 * 不是类名或内联样式：「在图标位」在结构上就是「成了行的第一个元素」，无需碰视觉实现细节。
 * 指纹（各 `<path>` 的 `d`）取自「同一个图标名单独渲染」的产物，不写死坐标 —— 期望值与实现不同源。
 *
 * ⚠️ 不要用 `findAllComponents(BaseIcon)[i].element` 找图标元素：`BaseIcon` 的模板在根元素之前有一行
 * 注释，dev 编译会把根退化成 **Fragment**，那个 `element` 于是解析到整行按钮上（实测），
 * 拿它做元素身份比较必然失败。要从**行**这一侧看结构。
 *
 * ⚠️ 刻意**不**断言「选中那一下是否补间」：单选默认选中即关面板（`handleSelect` 里的 `close()`），
 * 补间会被关场动画切掉；能看到它的是 `multiple` / `keepOpenOnSelect` 的用法。补间本身由
 * `tests/ui/BaseIconMorph.test.ts` 在图标层覆盖，此处重复一遍只会多一份要维护的脆弱断言。
 */
import { nextTick } from 'vue';

import { mount } from '@vue/test-utils';
import { afterEach, describe, expect, it } from 'vitest';

import BaseDropdownItem from '@/platform/ui/dropdown/BaseDropdownItem.vue';
import BaseIcon from '@/platform/ui/icons/BaseIcon.vue';
import BaseSelector from '@/platform/ui/selector/BaseSelector.vue';

import type { IconName } from '@/platform/ui/icons/icons.registry';
import type { VueWrapper } from '@vue/test-utils';

/** 三档条目：带图标（被选中）、带图标（未选中）、无图标 —— 覆盖本属性全部分支 */
const OPTIONS = [
  { label: '线上服务器', value: 'server', icon: 'server' },
  { label: 'WebDAV', value: 'webdav', icon: 'folder-sync' },
  { label: '纯文本项', value: 'plain' },
] as const;

const wrappers: VueWrapper[] = [];

afterEach(() => {
  wrappers.splice(0).forEach(wrapper => wrapper.unmount());
});

/** 某个图标单独渲染时的几何指纹（各 `<path>` 的 `d`）—— 期望值的来源是组件自己的产物 */
const fingerprintOf = (name: IconName): string[] =>
  mount(BaseIcon, { props: { name } })
    .findAll('path')
    .map(node => node.attributes('d') ?? '');

const CHECK = fingerprintOf('check');
const SERVER = fingerprintOf('server');

/** 行内的图标元素（按文档顺序：`[0]` 是前导槽那一枚，末尾那个是行尾槽那一枚） */
const svgsIn = (row: Element): Element[] => [...row.querySelectorAll('svg')];

/** 行内全部图标的几何指纹（与图标名无关，只反映画出来的形状） */
const fingerprintsIn = (row: Element): string[][] =>
  svgsIn(row).map(svg => [...svg.querySelectorAll('path')].map(node => node.getAttribute('d') ?? ''));

/** 打开面板（选项行只在面板打开后存在），返回挂载好的选择器 */
const openPanel = async (modelValue: string, extraProps: Record<string, unknown> = {}) => {
  const wrapper = mount(BaseSelector, {
    attachTo: document.body,
    props: { options: OPTIONS, modelValue, ...extraProps },
  });
  wrappers.push(wrapper);

  await wrapper.get('[role="combobox"]').trigger('click');
  await nextTick();
  return wrapper;
};

/** 取第 index 行的根元素（`BaseDropdownItem` 的根是单个 `<button>`，故 `.element` 就是行本身） */
const rowOf = (wrapper: VueWrapper, index: number): Element =>
  wrapper.findAllComponents(BaseDropdownItem)[index]!.element;

describe('BaseSelector 选项勾选标记的落点', () => {
  it('条目带图标且被选中：对勾顶到前导图标位，行尾不再重复出', async () => {
    const row = rowOf(await openPanel('server'), 0);
    const svgs = svgsIn(row);

    // 顶替得很干净：这一行只剩一枚图标，且是对勾
    expect(fingerprintsIn(row), '选中行应当只剩顶替上来的那一枚图标').toEqual([CHECK]);
    expect(svgs[0] === row.firstElementChild, '对勾应当落在行的最前（前导图标位）').toBe(true);
  });

  it('noCheckOnIcon：条目图标留在前导槽，对勾回到行尾', async () => {
    const row = rowOf(await openPanel('server', { noCheckOnIcon: true }), 0);
    const svgs = svgsIn(row);

    // 两枚图标各就其位：条目图标在最前、对勾在最后
    expect(fingerprintsIn(row)).toEqual([SERVER, CHECK]);
    expect(svgs[0] === row.firstElementChild, '条目图标应当仍在行的最前').toBe(true);
    expect(svgs[1] === row.lastElementChild, '关掉该属性后对勾应当回到行的最后').toBe(true);
  });

  it('无图标的条目不受该属性影响：对勾仍走行尾', async () => {
    const row = rowOf(await openPanel('plain'), 2);

    expect(fingerprintsIn(row)).toEqual([CHECK]);
    expect(svgsIn(row)[0] !== row.firstElementChild, '无图标的条目前导槽本就空着，对勾不该挪到行首').toBe(true);
    expect(svgsIn(row)[0] === row.lastElementChild, '对勾仍应落在行尾').toBe(true);
  });
});
