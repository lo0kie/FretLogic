import { describe, expect, it, vi } from 'vitest';

import { useOverlayMaskClose } from '@/platform/ui/overlay/overlayGuards';

/**
 * 遮罩点击关闭的手势判定。
 *
 * 值得单测的原因：这是一段有内部状态（按下点 / 松开点）的手势判定，且**它唯一防的那件事看不见** ——
 * 遮罩是面板的父元素，click 的目标是按下点与松开点的最近公共祖先，「从遮罩按下、拖进卡片松开」
 * 与「从卡片按下、拖到遮罩松开」的 click.target 都是遮罩本身，只有按下点不同。断言必须按
 * 「三连事件各自的 target/currentTarget」写，不能按「点没点到遮罩」写 —— 后者两种情况都成立。
 */
describe('useOverlayMaskClose 手势判定', () => {
  /** 两个占位节点：只需要能作身份比较，不必是真实 DOM */
  const mask = { name: 'mask' };
  const card = { name: 'card' };

  /** 只造出 handler 实际读取的两个字段，避免依赖 jsdom 的 MouseEvent 构造差异 */
  const evt = (target: unknown, currentTarget: unknown) => ({ target, currentTarget }) as unknown as MouseEvent;

  const setup = (initialCanClose = true) => {
    let canClose = initialCanClose;
    const close = vi.fn();
    const guard = useOverlayMaskClose({ canClose: () => canClose, close });
    return { ...guard, close, setCanClose: (v: boolean) => (canClose = v) };
  };

  it('按下与松开都在遮罩上：判定为点击遮罩', () => {
    const g = setup();
    g.handleMaskMousedown(evt(mask, mask));
    g.handleMaskMouseup(evt(mask, mask));
    g.handleMaskClick(evt(mask, mask));

    expect(g.close).toHaveBeenCalledWith('mask');
  });

  it('从遮罩按下、拖进卡片再松开：click 目标仍是遮罩，但不得关闭', () => {
    const g = setup();
    g.handleMaskMousedown(evt(mask, mask));
    // 松开点落在卡片上（事件冒泡到遮罩，故 currentTarget 仍是遮罩）
    g.handleMaskMouseup(evt(card, mask));
    // 最近公共祖先是遮罩 ⇒ 只看 click 的 .self 判定会误判成「点了遮罩」
    g.handleMaskClick(evt(mask, mask));

    expect(g.close).not.toHaveBeenCalled();
  });

  it('从卡片内按下、拖到遮罩上松开：不关闭（按下点已在卡片上）', () => {
    const g = setup();
    g.handleMaskMousedown(evt(card, mask));
    g.handleMaskMouseup(evt(mask, mask));
    g.handleMaskClick(evt(mask, mask));

    expect(g.close).not.toHaveBeenCalled();
  });

  it('门禁为假时不关闭，且手势状态已复位：放开后单补一次 click 也不会关闭', () => {
    const g = setup(false);
    g.handleMaskMousedown(evt(mask, mask));
    g.handleMaskMouseup(evt(mask, mask));
    g.handleMaskClick(evt(mask, mask));
    expect(g.close).not.toHaveBeenCalled();

    g.setCanClose(true);
    g.handleMaskClick(evt(mask, mask));

    expect(g.close).not.toHaveBeenCalled();
  });

  it('新一轮按下会作废上一轮的松开点：残留的「松开在遮罩上」不能替这一轮作证', () => {
    const g = setup();
    // 上一轮：按下与松开都在遮罩上，但没有等到 click（元素在两者之间被摘掉）
    g.handleMaskMousedown(evt(mask, mask));
    g.handleMaskMouseup(evt(mask, mask));

    // 新一轮：按下在遮罩上，但松开没有落到遮罩（未记录），click 由祖先兜住
    g.handleMaskMousedown(evt(mask, mask));
    g.handleMaskClick(evt(mask, mask));

    expect(g.close).not.toHaveBeenCalled();
  });
});
