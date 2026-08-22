import { describe, expect, it } from 'vitest';
import { useHistory } from '@/core/composables/useHistory';

describe('useHistory', () => {
  it('提交新快照并可撤销/重做', () => {
    const h = useHistory<number>(0);
    expect(h.current.value).toBe(0);
    expect(h.canUndo.value).toBe(false);

    h.commit(1);
    h.commit(2);
    expect(h.current.value).toBe(2);
    expect(h.canUndo.value).toBe(true);

    expect(h.undo()).toBe(1);
    expect(h.undo()).toBe(0);
    expect(h.canUndo.value).toBe(false);
    expect(h.undo()).toBeNull();

    expect(h.redo()).toBe(1);
    expect(h.redo()).toBe(2);
    expect(h.canRedo.value).toBe(false);
    expect(h.redo()).toBeNull();
  });

  it('提交新快照会清空 redo 分支', () => {
    const h = useHistory<number>(0);
    h.commit(1);
    h.commit(2);
    h.undo(); // 回到 1
    h.commit(3); // 覆盖 redo 分支
    expect(h.canRedo.value).toBe(false);
    expect(h.current.value).toBe(3);
    h.undo();
    expect(h.current.value).toBe(1);
  });

  it('容量裁剪：只保留最近 capacity 个快照', () => {
    const h = useHistory<number>(0, { capacity: 3 });
    h.commit(1);
    h.commit(2);
    h.commit(3);
    h.commit(4);
    // 栈为 [1,2,3]，current=4；undo 三次应到 1
    expect(h.undo()).toBe(3);
    expect(h.undo()).toBe(2);
    expect(h.undo()).toBe(1);
    expect(h.undo()).toBeNull();
  });

  it('isEqual 相等时不记录新快照', () => {
    const h = useHistory<number>(0, { isEqual: (a, b) => a === b });
    h.commit(0); // 与初始相等，不记录
    expect(h.canUndo.value).toBe(false);
    h.commit(1);
    expect(h.canUndo.value).toBe(true);
  });

  it('clear 清空历史', () => {
    const h = useHistory<number>(0);
    h.commit(1);
    h.commit(2);
    h.clear();
    expect(h.canUndo.value).toBe(false);
    expect(h.canRedo.value).toBe(false);
    expect(h.undo()).toBeNull();
  });
});
