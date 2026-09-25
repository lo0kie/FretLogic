import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';

import { NOTICE_MAX_COUNT, useUiStore } from '@/platform/store/uiStore';

describe('useUiStore 通知中心持久消息队列', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('推送后入队：最新在前、默认未读，各等级快捷入口可写', () => {
    const ui = useUiStore();
    const id = ui.notice.success({ title: '已同步', message: '数据已上传' });
    expect(ui.notices[0]).toMatchObject({ id, type: 'success', title: '已同步', read: false });
    // 原为 `typeof ts === 'number'`（NaN 也是 number，这条几乎不可能失败）——改为钉住取值本身：
    // 通知列表按它排序、也按它判过期，取值形态错了排序与过期都不成立
    const ts = ui.notices[0]!.ts;
    expect(Number.isFinite(ts)).toBe(true);
    expect(Math.abs(ts - Date.now())).toBeLessThan(60_000);

    const infoId = ui.notice.info({ title: '提醒' });
    expect(ui.notices[0]!.id).toBe(infoId); // 最新在前
    expect(ui.notices[0]!.type).toBe('info');
  });

  it('dismissNotice 移除、dismissAllNotices 清空、markNoticeRead 标记已读', () => {
    const ui = useUiStore();
    const id = ui.notice.warning({ title: 'w' });
    ui.dismissNotice(id);
    expect(ui.notices).toHaveLength(0);

    const a = ui.notice.error({ title: 'a' });
    const b = ui.notice.info({ title: 'b' });
    ui.markNoticeRead(a);
    expect(ui.notices.find(n => n.id === a)?.read).toBe(true);
    expect(ui.notices.find(n => n.id === b)?.read).toBe(false);
    ui.markAllNoticesRead();
    expect(ui.notices.every(n => n.read)).toBe(true);

    ui.dismissAllNotices();
    expect(ui.notices).toHaveLength(0);
  });

  it('超出上限丢弃最旧通知，队列长度受 NOTICE_MAX_COUNT 约束', () => {
    const ui = useUiStore();
    for (let i = 0; i < NOTICE_MAX_COUNT + 5; i++) {
      ui.addNotice({ title: `n${i}` });
    }
    expect(ui.notices).toHaveLength(NOTICE_MAX_COUNT);
    // 最新保留在前，最旧的被淘汰
    expect(ui.notices[0]!.title).toBe(`n${NOTICE_MAX_COUNT + 4}`);
  });
});
