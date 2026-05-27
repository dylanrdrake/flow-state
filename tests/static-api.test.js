import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { FlowState } from '../lib/FlowState.js';

// ─── FlowState.watch() / FlowState.get() from child elements ────────────────

describe('FlowState static API – watch and get from child elements', () => {
  let parent, child, grandchild, state;

  beforeEach(() => {
    parent = document.createElement('div');
    child = document.createElement('div');
    grandchild = document.createElement('div');

    child.appendChild(grandchild);
    parent.appendChild(child);
    document.body.appendChild(parent);

    state = new FlowState(parent, {
      count: 0, name: 'Alice',
      actions: { doAction: vi.fn() },
    });
  });

  afterEach(() => parent.remove());

  it('FlowState.get(el, key) returns the current state value from a direct child', () => {
    expect(FlowState.get(child, 'count')).toBe(0);
    expect(FlowState.get(child, 'name')).toBe('Alice');
  });

  it('FlowState.get(el, key) works from a grandchild element', () => {
    expect(FlowState.get(grandchild, 'count')).toBe(0);
  });

  it('FlowState.get(el, key) returns an action value', () => {
    const action = state.get('doAction');
    expect(FlowState.get(child, 'doAction')).toBe(action);
  });

  it('FlowState.get(el, key) returns undefined for unknown keys', () => {
    expect(FlowState.get(child, 'missing')).toBeUndefined();
  });

  it('FlowState.watch(el, key, cb) calls the callback immediately with the current value', () => {
    const spy = vi.fn();
    FlowState.watch(child, 'count', spy);
    expect(spy).toHaveBeenCalledOnce();
    expect(spy).toHaveBeenCalledWith(0);
  });

  it('FlowState.watch(el, key, cb) callback is called on update', async () => {
    const spy = vi.fn();
    FlowState.watch(child, 'count', spy);
    spy.mockClear();

    await state.update({ count: 7 });
    expect(spy).toHaveBeenCalledWith(7);
  });

  it('FlowState.watch(el, key, cb) returns an unsubscribe function', async () => {
    const spy = vi.fn();
    const unsub = FlowState.watch(child, 'count', spy);
    spy.mockClear();

    unsub();
    await state.update({ count: 99 });
    expect(spy).not.toHaveBeenCalled();
  });

  it('FlowState.watch(el, key, cb) works from a grandchild element', async () => {
    const spy = vi.fn();
    FlowState.watch(grandchild, 'name', spy);
    spy.mockClear();

    await state.update({ name: 'Bob' });
    expect(spy).toHaveBeenCalledWith('Bob');
  });
});

// ─── FlowState.create() ─────────────────────────────────────────────────────

describe('FlowState.create()', () => {
  it('creates a FlowState instance on a DOM Node', () => {
    const root = document.createElement('div');
    document.body.appendChild(root);
    const state = FlowState.create(root, { x: 1 });
    expect(state.get('x')).toBe(1);
    root.remove();
  });

  it('throws for non-Node argument', () => {
    expect(() => FlowState.create({}, {})).toThrow();
    expect(() => FlowState.create(null, {})).toThrow();
  });
});

// ─── FlowState.through() – static method ────────────────────────────────────

describe('FlowState.through() – static method', () => {
  it('throws when called with a non-ShadowRoot argument', () => {
    expect(() => FlowState.through(document.createElement('div'))).toThrow();
    expect(() => FlowState.through(null)).toThrow();
  });
});

// ─── state.through() – instance method, cross-shadow watch/get ──────────────

describe('FlowState instance – state.through(shadowRoot)', () => {
  let parent, child, shadow, inner, state;

  beforeEach(() => {
    parent = document.createElement('div');
    document.body.appendChild(parent);

    child = document.createElement('div');
    parent.appendChild(child);

    shadow = child.attachShadow({ mode: 'open' });
    inner = document.createElement('div');
    shadow.appendChild(inner);

    state = new FlowState(parent, { count: 0, label: 'hello' });
    state.through(shadow); // link shadow into parent scope
  });

  afterEach(() => parent.remove());

  it('FlowState.watch from inside the shadow root reaches the parent scope', () => {
    const spy = vi.fn();
    FlowState.watch(inner, 'count', spy);
    expect(spy).toHaveBeenCalledWith(0);
  });

  it('FlowState.get from inside the shadow root returns the correct value', () => {
    expect(FlowState.get(inner, 'label')).toBe('hello');
  });

  it('watcher registered from inside shadow root is notified on update', async () => {
    const spy = vi.fn();
    FlowState.watch(inner, 'count', spy);
    spy.mockClear();

    await state.update({ count: 5 });
    expect(spy).toHaveBeenCalledWith(5);
  });
});
