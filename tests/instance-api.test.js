import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { FlowSource, flowGet, flowWatch, flowCompute } from '../lib/FlowState.js';

describe('FlowSource – constructor and instance surface', () => {
  it('throws when FlowSource root is not a DOM Node', () => {
    expect(() => new FlowSource({}, {})).toThrow();
    expect(() => new FlowSource(null, {})).toThrow();
    expect(() => new FlowSource('div', {})).toThrow();
  });

  it('returns instance with update/destroy only', () => {
    const root = document.createElement('div');
    document.body.appendChild(root);
    const state = new FlowSource(root, { count: 0 });

    expect(typeof state.update).toBe('function');
    expect(typeof state.destroy).toBe('function');
    expect(state.get).toBeUndefined();
    expect(state.watch).toBeUndefined();
    expect(state.through).toBeUndefined();

    root.remove();
  });

  it('throws when a FlowState is already mounted on the root', () => {
    const root = document.createElement('div');
    document.body.appendChild(root);
    new FlowSource(root, {});
    expect(() => new FlowSource(root, {})).toThrow();
    root.remove();
  });
});

describe('FlowSource – update with functional read/watch APIs', () => {
  let root;
  let state;

  beforeEach(() => {
    root = document.createElement('div');
    document.body.appendChild(root);
    state = new FlowSource(root, {
      count: 0,
      user: { role: 'admin', age: 30 },
      total: flowCompute((count) => count * 2, ['count']),
    });
  });

  afterEach(() => root.remove());

  it('update returns a Promise', () => {
    const result = state.update({ count: 1 });
    expect(result).toBeInstanceOf(Promise);
    return result;
  });

  it('updates values retrievable through flowGet', async () => {
    await state.update({ count: 5 });
    expect(flowGet(root, 'count')).toBe(5);
    expect(flowGet(root, 'total')).toBe(10);
  });

  it('deep-merges nested updates', async () => {
    await state.update({ user: { age: 31 } });
    expect(flowGet(root, 'user.age')).toBe(31);
    expect(flowGet(root, 'user.role')).toBe('admin');
  });

  it('functional update receives latest snapshot', async () => {
    await state.update({ count: 10 });
    await state.update(prev => ({ count: prev.count * 2 }));
    expect(flowGet(root, 'count')).toBe(20);
  });

  it('flowWatch notifies immediately and on updates', async () => {
    const spy = vi.fn();
    flowWatch(root, 'count', spy);
    expect(spy).toHaveBeenCalledWith(0);

    spy.mockClear();
    await state.update({ count: 7 });
    expect(spy).toHaveBeenCalledWith(7);
  });

  it('flowWatch unsubscribe stops notifications', async () => {
    const spy = vi.fn();
    const unsub = flowWatch(root, 'count', spy);
    spy.mockClear();

    unsub();
    await state.update({ count: 99 });
    expect(spy).not.toHaveBeenCalled();
  });

  it('destroy removes FlowState from root after disconnect', async () => {
    root.remove();
    state.destroy();
    await Promise.resolve();
    expect(root.__Flow__).toBeUndefined();
  });
});
