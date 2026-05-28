import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { FlowSource, flowCompute, flowGet, flowWatch } from '../lib/FlowState.js';

describe('FlowSource – computed values', () => {
  let root, state;

  beforeEach(() => {
    root = document.createElement('div');
    document.body.appendChild(root);
    state = new FlowSource(root, {
      price: 10,
      qty: 3,
      name: 'alice',
      total: flowCompute((price, qty) => price * qty, ['price', 'qty']),
      upper: flowCompute((name) => name.toUpperCase(), ['name']),
    });
  });

  afterEach(() => root.remove());

  it('state.get() returns the computed value', () => {
    expect(flowGet(root, 'total')).toBe(30);
    expect(flowGet(root, 'upper')).toBe('ALICE');
  });

  it('computed value is recalculated when a dependency changes', async () => {
    await state.update({ price: 20 });
    expect(flowGet(root, 'total')).toBe(60);
  });

  it('computed value updates when the other dependency changes', async () => {
    await state.update({ qty: 5 });
    expect(flowGet(root, 'total')).toBe(50);
  });

  it('watcher on a computed key fires immediately with the computed value', () => {
    const spy = vi.fn();
    flowWatch(root, 'total', spy);
    expect(spy).toHaveBeenCalledOnce();
    expect(spy).toHaveBeenCalledWith(30);
  });

  it('watcher on a computed key fires with the new value when a dependency changes', async () => {
    const spy = vi.fn();
    flowWatch(root, 'total', spy);
    spy.mockClear();

    await state.update({ qty: 5 });
    expect(spy).toHaveBeenCalledWith(50);
  });

  it('watcher on a computed key does NOT fire when an unrelated key changes', async () => {
    const spy = vi.fn();
    flowWatch(root, 'total', spy);
    spy.mockClear();

    await state.update({ name: 'bob' });
    // total depends on price and qty, not name — should not be notified
    expect(spy).not.toHaveBeenCalled();
  });

  it('warns and ignores attempts to overwrite a computed key', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await state.update({ total: 999 });
    expect(warn).toHaveBeenCalled();
    expect(flowGet(root, 'total')).toBe(30); // still computed from price * qty
    warn.mockRestore();
  });

  it('__Flow__.hasKey() returns true for computed keys', () => {
    expect(root.__Flow__.hasKey('total')).toBe(true);
    expect(root.__Flow__.hasKey('upper')).toBe(true);
  });

  it('multiple computed values can depend on the same key', async () => {
    const root2 = document.createElement('div');
    document.body.appendChild(root2);
    const s = new FlowSource(root2, {
      x: 4,
      double: flowCompute((x) => x * 2, ['x']),
      triple: flowCompute((x) => x * 3, ['x']),
    });

    await s.update({ x: 5 });
    expect(flowGet(root2, 'double')).toBe(10);
    expect(flowGet(root2, 'triple')).toBe(15);
    root2.remove();
  });
});

describe('FlowSource – computed values with nested object deps', () => {
  let root, state;

  beforeEach(() => {
    root = document.createElement('div');
    document.body.appendChild(root);
    state = new FlowSource(root, {
      user:  { name: 'Alice', role: 'admin' },
      score: 42,
      label: flowCompute((user) => `${user.name} (${user.role})`, ['user']),
    });
  });

  afterEach(() => root.remove());

  it('receives the full nested object as a positional argument', () => {
    expect(flowGet(root, 'label')).toBe('Alice (admin)');
  });

  it('re-evaluates when a nested property of the dep changes', async () => {
    await state.update({ user: { name: 'Bob' } }); // deep merge — role preserved
    expect(flowGet(root, 'label')).toBe('Bob (admin)');
  });

  it('re-evaluates when the whole dep object is replaced', async () => {
    await state.update({ user: { name: 'Carol', role: 'viewer' } });
    expect(flowGet(root, 'label')).toBe('Carol (viewer)');
  });

  it('does NOT re-evaluate when an unrelated key changes', async () => {
    const spy = vi.fn();
    flowWatch(root, 'label', spy);
    spy.mockClear();

    await state.update({ score: 99 });
    expect(spy).not.toHaveBeenCalled();
    expect(flowGet(root, 'label')).toBe('Alice (admin)');
  });

  it('watcher fires with the new derived value after a nested dep update', async () => {
    const spy = vi.fn();
    flowWatch(root, 'label', spy);
    spy.mockClear();

    await state.update({ user: { name: 'Dave' } });
    expect(spy).toHaveBeenCalledOnce();
    expect(spy).toHaveBeenCalledWith('Dave (admin)');
  });
});

describe('FlowSource – computed values depending on computed values', () => {
  it('evaluates upstream computed deps before downstream computed values', async () => {
    const root = document.createElement('div');
    document.body.appendChild(root);

    const state = new FlowSource(root, {
      price: 10,
      qty: 2,
      taxRate: 0.1,
      subtotal: flowCompute((price, qty) => price * qty, ['price', 'qty']),
      total: flowCompute((subtotal, taxRate) => subtotal * (1 + taxRate), ['subtotal', 'taxRate']),
    });

    expect(flowGet(root, 'subtotal')).toBe(20);
    expect(flowGet(root, 'total')).toBe(22);

    await state.update({ qty: 3 });
    expect(flowGet(root, 'subtotal')).toBe(30);
    expect(flowGet(root, 'total')).toBe(33);

    root.remove();
  });

  it('notifies watcher on downstream computed key when upstream computed key changes', async () => {
    const root = document.createElement('div');
    document.body.appendChild(root);

    const state = new FlowSource(root, {
      price: 10,
      qty: 2,
      taxRate: 0.1,
      subtotal: flowCompute((price, qty) => price * qty, ['price', 'qty']),
      total: flowCompute((subtotal, taxRate) => subtotal * (1 + taxRate), ['subtotal', 'taxRate']),
    });

    const spy = vi.fn();
    flowWatch(root, 'total', spy);
    spy.mockClear();

    await state.update({ price: 20 });
    expect(spy).toHaveBeenCalledOnce();
    expect(spy).toHaveBeenCalledWith(44);

    root.remove();
  });

  it('throws for circular computed dependencies', () => {
    const root = document.createElement('div');
    document.body.appendChild(root);

    expect(() => {
      new FlowSource(root, {
        source: 1,
        a: flowCompute((b) => b + 1, ['b']),
        b: flowCompute((a) => a + 1, ['a']),
      });
    }).toThrow(/Circular computed dependency detected/);

    root.remove();
  });
});
