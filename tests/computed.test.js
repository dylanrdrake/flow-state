import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { FlowState } from '../lib/FlowState.js';

describe('FlowState – computed values', () => {
  let root, state;

  beforeEach(() => {
    root = document.createElement('div');
    document.body.appendChild(root);
    state = new FlowState(root, {
      price: 10,
      qty: 3,
      name: 'alice',
      total: (s) => s.price * s.qty,
      upper: (s) => s.name.toUpperCase(),
    });
  });

  afterEach(() => root.remove());

  it('state.get() returns the computed value', () => {
    expect(state.get('total')).toBe(30);
    expect(state.get('upper')).toBe('ALICE');
  });

  it('computed value is recalculated when a dependency changes', async () => {
    await state.update({ price: 20 });
    expect(state.get('total')).toBe(60);
  });

  it('computed value updates when the other dependency changes', async () => {
    await state.update({ qty: 5 });
    expect(state.get('total')).toBe(50);
  });

  it('watcher on a computed key fires immediately with the computed value', () => {
    const spy = vi.fn();
    state.watch('total', spy);
    expect(spy).toHaveBeenCalledOnce();
    expect(spy).toHaveBeenCalledWith(30);
  });

  it('watcher on a computed key fires with the new value when a dependency changes', async () => {
    const spy = vi.fn();
    state.watch('total', spy);
    spy.mockClear();

    await state.update({ qty: 5 });
    expect(spy).toHaveBeenCalledWith(50);
  });

  it('watcher on a computed key does NOT fire when an unrelated key changes', async () => {
    const spy = vi.fn();
    state.watch('total', spy);
    spy.mockClear();

    await state.update({ name: 'bob' });
    // total depends on price and qty, not name — should not be notified
    expect(spy).not.toHaveBeenCalled();
  });

  it('warns and ignores attempts to overwrite a computed key', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await state.update({ total: 999 });
    expect(warn).toHaveBeenCalled();
    expect(state.get('total')).toBe(30); // still computed from price * qty
    warn.mockRestore();
  });

  it('__Flow__.hasKey() returns true for computed keys', () => {
    expect(root.__Flow__.hasKey('total')).toBe(true);
    expect(root.__Flow__.hasKey('upper')).toBe(true);
  });

  it('multiple computed values can depend on the same key', async () => {
    const root2 = document.createElement('div');
    document.body.appendChild(root2);
    const s = new FlowState(root2, {
      x: 4,
      double: (s) => s.x * 2,
      triple: (s) => s.x * 3,
    });

    await s.update({ x: 5 });
    expect(s.get('double')).toBe(10);
    expect(s.get('triple')).toBe(15);
    root2.remove();
  });
});
