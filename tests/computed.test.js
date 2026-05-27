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
      total: FlowState.compute((price, qty) => price * qty, ['price', 'qty']),
      upper: FlowState.compute((name) => name.toUpperCase(), ['name']),
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
      double: FlowState.compute((x) => x * 2, ['x']),
      triple: FlowState.compute((x) => x * 3, ['x']),
    });

    await s.update({ x: 5 });
    expect(s.get('double')).toBe(10);
    expect(s.get('triple')).toBe(15);
    root2.remove();
  });
});

describe('FlowState – computed values with nested object deps', () => {
  let root, state;

  beforeEach(() => {
    root = document.createElement('div');
    document.body.appendChild(root);
    state = new FlowState(root, {
      user:  { name: 'Alice', role: 'admin' },
      score: 42,
      label: FlowState.compute((user) => `${user.name} (${user.role})`, ['user']),
    });
  });

  afterEach(() => root.remove());

  it('receives the full nested object as a positional argument', () => {
    expect(state.get('label')).toBe('Alice (admin)');
  });

  it('re-evaluates when a nested property of the dep changes', async () => {
    await state.update({ user: { name: 'Bob' } }); // deep merge — role preserved
    expect(state.get('label')).toBe('Bob (admin)');
  });

  it('re-evaluates when the whole dep object is replaced', async () => {
    await state.update({ user: { name: 'Carol', role: 'viewer' } });
    expect(state.get('label')).toBe('Carol (viewer)');
  });

  it('does NOT re-evaluate when an unrelated key changes', async () => {
    const spy = vi.fn();
    state.watch('label', spy);
    spy.mockClear();

    await state.update({ score: 99 });
    expect(spy).not.toHaveBeenCalled();
    expect(state.get('label')).toBe('Alice (admin)');
  });

  it('watcher fires with the new derived value after a nested dep update', async () => {
    const spy = vi.fn();
    state.watch('label', spy);
    spy.mockClear();

    await state.update({ user: { name: 'Dave' } });
    expect(spy).toHaveBeenCalledOnce();
    expect(spy).toHaveBeenCalledWith('Dave (admin)');
  });
});

describe('FlowState – computed values depending on computed values', () => {
  it('evaluates upstream computed deps before downstream computed values', async () => {
    const root = document.createElement('div');
    document.body.appendChild(root);

    const state = new FlowState(root, {
      price: 10,
      qty: 2,
      taxRate: 0.1,
      subtotal: FlowState.compute((price, qty) => price * qty, ['price', 'qty']),
      total: FlowState.compute((subtotal, taxRate) => subtotal * (1 + taxRate), ['subtotal', 'taxRate']),
    });

    expect(state.get('subtotal')).toBe(20);
    expect(state.get('total')).toBe(22);

    await state.update({ qty: 3 });
    expect(state.get('subtotal')).toBe(30);
    expect(state.get('total')).toBe(33);

    root.remove();
  });

  it('notifies watcher on downstream computed key when upstream computed key changes', async () => {
    const root = document.createElement('div');
    document.body.appendChild(root);

    const state = new FlowState(root, {
      price: 10,
      qty: 2,
      taxRate: 0.1,
      subtotal: FlowState.compute((price, qty) => price * qty, ['price', 'qty']),
      total: FlowState.compute((subtotal, taxRate) => subtotal * (1 + taxRate), ['subtotal', 'taxRate']),
    });

    const spy = vi.fn();
    state.watch('total', spy);
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
      new FlowState(root, {
        source: 1,
        a: FlowState.compute((b) => b + 1, ['b']),
        b: FlowState.compute((a) => a + 1, ['a']),
      });
    }).toThrow(/Circular computed dependency detected/);

    root.remove();
  });
});
