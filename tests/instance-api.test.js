import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { FlowState } from '../lib/FlowState.js';

// ─── Constructor ────────────────────────────────────────────────────────────

describe('FlowState – constructor', () => {
  it('throws when root is not a DOM Node', () => {
    expect(() => new FlowState({}, {})).toThrow();
    expect(() => new FlowState(null, {})).toThrow();
    expect(() => new FlowState('div', {})).toThrow();
  });

  it('throws when a FlowState is already mounted on the root', () => {
    const root = document.createElement('div');
    document.body.appendChild(root);
    new FlowState(root, {});
    expect(() => new FlowState(root, {})).toThrow();
    root.remove();
  });

  it('exposes __Flow__ with hasKey and flowThroughs on the root element', () => {
    const root = document.createElement('div');
    document.body.appendChild(root);
    new FlowState(root, { state: { count: 0, user: { name: 'Alice' } } });

    expect(root.__Flow__).toBeDefined();
    expect(root.__Flow__.hasKey('count')).toBe(true);
    expect(root.__Flow__.hasKey('user')).toBe(true);
    expect(root.__Flow__.hasKey('user.name')).toBe(true);
    expect(root.__Flow__.hasKey('missing')).toBe(false);

    root.remove();
  });

  it('accepts a config with no init (empty state)', () => {
    const root = document.createElement('div');
    document.body.appendChild(root);
    expect(() => new FlowState(root, {})).not.toThrow();
    root.remove();
  });

  it('accepts a null config', () => {
    const root = document.createElement('div');
    document.body.appendChild(root);
    expect(() => new FlowState(root, null)).not.toThrow();
    root.remove();
  });
});

// ─── state.get() ────────────────────────────────────────────────────────────

describe('FlowState – state.get()', () => {
  let root, state;

  beforeEach(() => {
    root = document.createElement('div');
    document.body.appendChild(root);
    state = new FlowState(root, {
      state: {
        count: 0,
        name: 'Alice',
        active: true,
        user: { role: 'admin', address: { city: 'NY' } },
        items: [1, 2, 3],
      },
    });
  });

  afterEach(() => root.remove());

  it('returns flat initial values', () => {
    expect(state.get('count')).toBe(0);
    expect(state.get('name')).toBe('Alice');
    expect(state.get('active')).toBe(true);
  });

  it('returns array initial values', () => {
    expect(state.get('items')).toEqual([1, 2, 3]);
  });

  it('returns nested object initial values', () => {
    expect(state.get('user')).toMatchObject({ role: 'admin' });
  });

  it('returns deeply nested values via dot notation', () => {
    expect(state.get('user.role')).toBe('admin');
    expect(state.get('user.address.city')).toBe('NY');
  });

  it('returns undefined for unknown keys', () => {
    expect(state.get('unknown')).toBeUndefined();
  });
});

// ─── state.update() ─────────────────────────────────────────────────────────

describe('FlowState – state.update()', () => {
  let root, state;

  beforeEach(() => {
    root = document.createElement('div');
    document.body.appendChild(root);
    state = new FlowState(root, {
      state: {
        count: 0,
        name: 'Alice',
        user: { role: 'admin', age: 30 },
      },
    });
  });

  afterEach(() => root.remove());

  it('returns a Promise', () => {
    const result = state.update({ count: 1 });
    expect(result).toBeInstanceOf(Promise);
    return result;
  });

  it('updates a flat key', async () => {
    await state.update({ count: 5 });
    expect(state.get('count')).toBe(5);
  });

  it('updates multiple keys in one call', async () => {
    await state.update({ count: 10, name: 'Bob' });
    expect(state.get('count')).toBe(10);
    expect(state.get('name')).toBe('Bob');
  });

  it('deep-merges nested objects, preserving untouched keys', async () => {
    await state.update({ user: { age: 31 } });
    expect(state.get('user.age')).toBe(31);
    expect(state.get('user.role')).toBe('admin'); // unchanged
  });

  it('accepts a function receiving the current state snapshot', async () => {
    await state.update(prev => ({ count: prev.count + 1 }));
    expect(state.get('count')).toBe(1);

    await state.update(prev => ({ count: prev.count + 1 }));
    expect(state.get('count')).toBe(2);
  });

  it('functional update receives the correct state after a prior update', async () => {
    await state.update({ count: 10 });
    await state.update(prev => ({ count: prev.count * 2 }));
    expect(state.get('count')).toBe(20);
  });

  it('batches multiple synchronous updates into a single watcher notification', async () => {
    const spy = vi.fn();
    state.watch('count', spy);
    spy.mockClear(); // ignore immediate call

    state.update({ count: 1 });
    state.update({ count: 2 });
    await state.update({ count: 3 });

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith(3);
  });

  it('warns and ignores updates to unknown keys', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await state.update({ nonExistent: 'x' });
    expect(warn).toHaveBeenCalled();
    expect(state.get('nonExistent')).toBeUndefined();
    warn.mockRestore();
  });
});

// ─── state.watch() ──────────────────────────────────────────────────────────

describe('FlowState – state.watch()', () => {
  let root, state;

  beforeEach(() => {
    root = document.createElement('div');
    document.body.appendChild(root);
    state = new FlowState(root, {
      state: {
        count: 0,
        user: { name: 'Alice', age: 30 },
      },
    });
  });

  afterEach(() => root.remove());

  it('calls the callback immediately with the current value on registration', () => {
    const spy = vi.fn();
    state.watch('count', spy);
    expect(spy).toHaveBeenCalledOnce();
    expect(spy).toHaveBeenCalledWith(0);
  });

  it('calls the callback again when state updates', async () => {
    const spy = vi.fn();
    state.watch('count', spy);
    spy.mockClear();

    await state.update({ count: 42 });
    expect(spy).toHaveBeenCalledOnce();
    expect(spy).toHaveBeenCalledWith(42);
  });

  it('supports dot-notation for nested keys', () => {
    const spy = vi.fn();
    state.watch('user.name', spy);
    expect(spy).toHaveBeenCalledWith('Alice');
  });

  it('updates nested key via dot notation', async () => {
    const spy = vi.fn();
    state.watch('user.name', spy);
    spy.mockClear();

    await state.update({ user: { name: 'Bob' } });
    expect(spy).toHaveBeenCalledWith('Bob');
  });

  it('notifies a parent key watcher when a descendant key updates', async () => {
    const spy = vi.fn();
    state.watch('user', spy);
    spy.mockClear();

    await state.update({ user: { age: 31 } });
    expect(spy).toHaveBeenCalled();
    expect(spy.mock.calls[0][0]).toMatchObject({ name: 'Alice', age: 31 });
  });

  it('notifies a deep key watcher when the whole parent object is replaced', async () => {
    const spy = vi.fn();
    state.watch('user.name', spy);
    spy.mockClear();

    // Replace the entire user object — user.name changes as part of the replacement
    await state.update({ user: { name: 'Bob', age: 31 } });
    expect(spy).toHaveBeenCalledOnce();
    expect(spy).toHaveBeenCalledWith('Bob');
  });

  it('does NOT notify a sibling key watcher when a different child updates', async () => {
    const spy = vi.fn();
    state.watch('user.age', spy);
    spy.mockClear();

    await state.update({ user: { name: 'Bob' } });
    // user.age watcher should not fire — user.name changed, not user.age
    expect(spy).not.toHaveBeenCalled();
  });

  it('returns an unsubscribe function that stops future notifications', async () => {
    const spy = vi.fn();
    const unsub = state.watch('count', spy);
    spy.mockClear();

    unsub();
    await state.update({ count: 99 });
    expect(spy).not.toHaveBeenCalled();
  });

  it('multiple watchers on the same key are all notified', async () => {
    const spy1 = vi.fn();
    const spy2 = vi.fn();
    state.watch('count', spy1);
    state.watch('count', spy2);
    spy1.mockClear();
    spy2.mockClear();

    await state.update({ count: 7 });
    expect(spy1).toHaveBeenCalledWith(7);
    expect(spy2).toHaveBeenCalledWith(7);
  });

  it('unsubscribing one watcher does not affect others on the same key', async () => {
    const spy1 = vi.fn();
    const spy2 = vi.fn();
    const unsub1 = state.watch('count', spy1);
    state.watch('count', spy2);
    spy1.mockClear();
    spy2.mockClear();

    unsub1();
    await state.update({ count: 7 });
    expect(spy1).not.toHaveBeenCalled();
    expect(spy2).toHaveBeenCalledWith(7);
  });
});

// ─── State immutability ─────────────────────────────────────────────────────

describe('FlowState – state immutability', () => {
  let root, state;

  beforeEach(() => {
    root = document.createElement('div');
    document.body.appendChild(root);
    state = new FlowState(root, { state: { count: 0, user: { name: 'Alice' } } });
  });

  afterEach(() => root.remove());

  it('returned objects are frozen', () => {
    expect(Object.isFrozen(state.get('user'))).toBe(true);
  });

  it('mutating a returned value throws in strict mode', () => {
    const user = state.get('user');
    expect(() => {
      user.name = 'Bob';
    }).toThrow(TypeError);
  });

  it('returned arrays are frozen', () => {
    const root2 = document.createElement('div');
    document.body.appendChild(root2);
    const s = new FlowState(root2, { state: { items: [1, 2, 3] } });
    expect(Object.isFrozen(s.get('items'))).toBe(true);
    root2.remove();
  });

  it('state does not change without calling update()', () => {
    try { state.get('user').name = 'Bob'; } catch { /* expected */ }
    expect(state.get('user.name')).toBe('Alice');
  });
});
