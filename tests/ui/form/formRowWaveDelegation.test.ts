/**
 * 波形委托的回归锚点 —— 「同一个动作有两条入口，只有一条有波纹反馈」的全部已知形态。
 *
 * 缺口成因：波纹指令只监听**自己所在元素**上的指针事件，而「激活控件」的入口往往不在那个元素上：
 *
 *  1. **行标签**（`BaseFormRow`）：标签与控件是兄弟节点。`BaseSwitch` 的波纹在按钮**内部**的轨道上
 *     —— 标签的激活行为只在按钮上派发一次合成 click，事件自按钮向上冒泡、到不了内部；`BaseCheckbox`
 *     的波纹是与 `<input>` **兄弟**的勾选框，同理。
 *  2. **控件自身的文字标签**（`BaseCheckbox` 的 `label` prop，如弹窗头部的「全选」）：它与勾选框同在
 *     组件的 `<label>` 内，点文字即可勾选，但波纹元素只有勾选框那一小块。
 *  3. **不可标签化控件所在的行标签**（`BaseSelector`）：触发器是 `role=combobox` 的 div，行标签的
 *     `for` 指不到它，标签因此退化为 `<span>`、浏览器那套激活行为压根不存在 —— 缺口不止少了波纹，
 *     而是整个激活动作都没有。控件登记 `press` 时声明 `selfActivating`，行才把这条委托交过来。
 *
 * 补法统一是**复用指令给键盘 / 合成激活预留的那条分支**：往波纹元素派发一个 `detail=0` 且**不冒泡**的
 * click（指令的 click 监听只认 `detail === 0`；真指针点击走 pointerdown，不进这条）。本文件钉住三件会
 * 静默退化的事：
 *
 *  - `bubbles: false` —— 一旦冒泡，合成 click 会撞上开关自己的 `@click`，替用户多点一次，表现为
 *    「点标签没反应」（切两次，值回到原处）；断言模型只写回一次即锁死它；
 *  - `detail: 0` —— 指令的 click 监听只认它，改了波纹会静默消失且页面不报任何错；
 *  - **落在波纹元素上的按压不得补发** —— 那条路径归指令自己，补了就成两圈波纹。
 *
 * 边界说明：全局 setup 把 wave 指令换成了空实现（tests/setup.ts），故此处断言的是**委托出去的那个事件
 * 本身**（我们拥有的协议边界），而非库内部的波纹 DOM —— 后者对键盘 / 合成激活早就是同一条分支。
 *
 * jsdom 未实现 PointerEvent，而处理器只读 `button`，故直接用「带 pointerdown 类型的 MouseEvent」，
 * 无需仿 PointerEvent 的垫片（对比 useLyricsDragDrop.test.ts：那条链路要的是 pointerId / pointerType）。
 */
import { h, nextTick } from 'vue';

import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';

import BaseCheckbox from '@/platform/ui/checkbox/BaseCheckbox.vue';
import BaseFormRow from '@/platform/ui/form/BaseFormRow.vue';
import BaseSelector from '@/platform/ui/selector/BaseSelector.vue';
import BaseSwitch from '@/platform/ui/switch/BaseSwitch.vue';

import type { VNode } from 'vue';

/** 记录某元素收到的合成波纹点击，记下形态的两个关键维度（detail 决定指令认不认，bubbles 决定会不会多切一次） */
const spyWaveClicks = (element: HTMLElement) => {
  const clicks: { bubbles: boolean; detail: number }[] = [];
  element.addEventListener('click', event =>
    clicks.push({ bubbles: event.bubbles, detail: (event as MouseEvent).detail })
  );
  return clicks;
};

/** 真实手势的第一步：标签 / 文字上的主键按下（委托在此放波纹） */
const pressPrimary = (element: HTMLElement) =>
  void element.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 }));

/**
 * 挂一行「行标签 + 控件」。
 * 必须等一次刷新再找元素：控件在 setup 里上报自身 id，行据此把标签从 <span> 换成 <label>，
 * 标签名变了意味着 DOM 节点被整体替换 —— 刷前拿到的句柄会指向已被丢弃的那个 <span>。
 */
const mountRow = async (label: string, control: () => VNode) => {
  const wrapper = mount(BaseFormRow, { props: { label }, slots: { default: control } });
  await nextTick();
  return wrapper;
};

describe('BaseFormRow 波形委托（行标签）', () => {
  it('点行标签：勾选框收到一次 detail=0 且不冒泡的合成点击', async () => {
    const wrapper = await mountRow('全选', () =>
      h(BaseCheckbox, { 'modelValue': false, 'onUpdate:modelValue': () => {} })
    );
    const label = wrapper.find<HTMLLabelElement>('.form-row-label');
    const clicks = spyWaveClicks(wrapper.find<HTMLElement>('.checkbox-box').element);

    // 非空跑前提：标签确实关联到了控件（退化为 span 的行不走委托通道，那样本断言等于没测）
    expect(label.element.tagName).toBe('LABEL');

    pressPrimary(label.element);

    expect(clicks).toEqual([{ bubbles: false, detail: 0 }]);
  });

  it('点行标签：轨道收到一次合成点击，且开关只切换一次', async () => {
    const updates: unknown[] = [];
    const wrapper = await mountRow('自动横按', () =>
      h(BaseSwitch, {
        'ariaLabel': '自动横按',
        'modelValue': false,
        'onUpdate:modelValue': (value: unknown) => updates.push(value),
      })
    );
    const label = wrapper.find<HTMLLabelElement>('.form-row-label');
    const clicks = spyWaveClicks(wrapper.find<HTMLElement>('.switch-track').element);

    expect(label.element.tagName).toBe('LABEL');

    // 完整手势：标签 pointerdown（委托）→ 浏览器随后的激活行为（把 click 转发给开关）
    pressPrimary(label.element);
    label.element.click();

    // 先断用户可感知的后果：合成点击一旦冒泡，就会撞上开关自己的 @click 多切一次（值回到原处，
    // 表现为「点标签没反应」）。这一步先于形态断言，好处是两条锚点各自独立成立。
    expect(updates).toHaveLength(1);
    expect(clicks).toEqual([{ bubbles: false, detail: 0 }]);
  });

  it('右键按下行标签不放波纹（只有主键才算「按下」）', async () => {
    const wrapper = await mountRow('自动横按', () => h(BaseSwitch, { ariaLabel: '自动横按', modelValue: false }));
    const clicks = spyWaveClicks(wrapper.find<HTMLElement>('.switch-track').element);

    wrapper
      .find<HTMLLabelElement>('.form-row-label')
      .element.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 2 }));

    expect(clicks).toEqual([]);
  });
});

describe('BaseCheckbox 波形委托（自身文字标签）', () => {
  const mountLabelledCheckbox = () =>
    mount(BaseCheckbox, {
      props: { 'label': '全选', 'modelValue': false, 'onUpdate:modelValue': () => {} },
    });

  it('点自身的文字标签：勾选框收到一次 detail=0 且不冒泡的合成点击', () => {
    const wrapper = mountLabelledCheckbox();
    const clicks = spyWaveClicks(wrapper.find<HTMLElement>('.checkbox-box').element);

    pressPrimary(wrapper.find<HTMLElement>('.checkbox-label').element);

    expect(clicks).toEqual([{ bubbles: false, detail: 0 }]);
  });

  it('直接按在勾选框上不补发：那条路径归指令自己，补了就成两圈波纹', () => {
    const wrapper = mountLabelledCheckbox();
    const box = wrapper.find<HTMLElement>('.checkbox-box');
    const clicks = spyWaveClicks(box.element);

    pressPrimary(box.element);

    expect(clicks).toEqual([]);
  });
});

describe('BaseSwitch 波形委托（自身文字标签）', () => {
  it('点自身的文字标签：轨道收到一次合成点击，且开关只切换一次', () => {
    const updates: unknown[] = [];
    const wrapper = mount(BaseSwitch, {
      props: {
        'label': '自动横按',
        'modelValue': false,
        'onUpdate:modelValue': (value: unknown) => updates.push(value),
      },
    });
    const clicks = spyWaveClicks(wrapper.find<HTMLElement>('.switch-track').element);
    const label = wrapper.find<HTMLElement>('.switch-label');

    // 完整手势：标签 pointerdown（委托）→ 浏览器随后的激活行为（label 在按钮内，click 冒泡到按钮）
    pressPrimary(label.element);
    label.element.click();

    // 先断用户可感知的后果：合成点击一旦冒泡，就会撞上按钮自己的 @click 多切一次（值回到原处，
    // 表现为「点标签没反应」）。这一步先于形态断言，两条锚点各自独立成立。
    expect(updates).toHaveLength(1);
    expect(clicks).toEqual([{ bubbles: false, detail: 0 }]);
  });
});

describe('BaseSelector 标签按下委托（自激活）', () => {
  /**
   * 挂一行「行标签 + 选择器」。
   *
   * `disabled` 直接给控件（而非行）—— 行的 disabled 只管置灰标签与向插槽透传，本用例要钉的是控件自己
   * 那道闸（登记在 press 里，见 BaseSelector 的 ③ 说明）。
   *
   * 触发器用 `[aria-haspopup="listbox"]` 定位：`role="combobox"` 在面板的搜索框上还会再出现一次
   * （面板被 Teleport 到 body，`wrapper.find` 找不到它，但换个名字更省心）。也**不能**用
   * `document.querySelector` —— mount 未 attachTo 时整棵树是游离的，document 里查不到。
   */
  const mountSelectorRow = async (disabled = false) => {
    const wrapper = await mountRow('调式', () =>
      h(BaseSelector, {
        disabled,
        'modelValue': 'ionian',
        'onUpdate:modelValue': () => {},
        'options': ['ionian', 'dorian'],
      })
    );
    return {
      label: wrapper.find<HTMLElement>('.form-row-label'),
      trigger: wrapper.find<HTMLElement>('[aria-haspopup="listbox"]'),
    };
  };

  it('点退化为 span 的行标签：按下补波纹，松手（click）才开面板', async () => {
    const { label, trigger } = await mountSelectorRow();

    // 结构前提：selfActivating 要绕过的正是「标签不是 <label>」这道闸，前提不成立则本用例无意义
    expect(label.element.tagName).toBe('SPAN');
    expect(trigger.attributes('aria-expanded')).toBe('false');

    const clicks = spyWaveClicks(trigger.element);

    // 按下：波纹立刻补上（墨水要在指针落下那刻就晕开，与直接按触发器一致）
    pressPrimary(label.element);
    await nextTick();
    expect(clicks).toEqual([{ bubbles: false, detail: 0 }]);
    // ……但**不**开面板：激活跟的是 click，与直接点触发器的时机一致 —— 按住标签往外一拖再松手，
    // 面板不该弹出来（这正是「一按就开」那个缺陷的回归锚点）
    expect(trigger.attributes('aria-expanded')).toBe('false');

    // 松手（同点按下并松开 ⇒ 浏览器派发 click）
    label.element.click();
    await nextTick();
    expect(trigger.attributes('aria-expanded')).toBe('true');
    // 且不会因这次 click 再补一圈波纹：分工是「按下＝墨水、点击＝激活」，互不兼任
    expect(clicks).toHaveLength(1);
  });

  it('禁用时点行标签：不开面板', async () => {
    const { label, trigger } = await mountSelectorRow(true);
    const clicks = spyWaveClicks(trigger.element);

    pressPrimary(label.element);
    label.element.click();
    await nextTick();

    expect(trigger.attributes('aria-expanded')).toBe('false');
    // 波纹不在断言范围：该不该出由指令内部的 wave() 裁决（`v-wave="{ disabled }"`），而全局 setup 把
    // wave 换成了空实现 —— 此处只能看到「我们派发了事件」这件事，看不到指令最后有没有画，断言必假。
    // 所以按下那半条只断言「委托仍照常派发」，真正的防漏在 activate 一侧（面板绝不能开）。
    expect(clicks).toEqual([{ bubbles: false, detail: 0 }]);
  });
});
