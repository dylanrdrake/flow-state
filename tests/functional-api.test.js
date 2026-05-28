import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  createFlowFrom,
  getFlowFrom,
  watchFlowFrom,
  flowThrough,
  flowCompute,
} from '../lib/FlowState.js';

describe('functional API – create/get/watch', () => {
  let parent;
  let child;
  let state;

  beforeEach(() => {
    parent = document.createElement('div');
    child = document.createElement('div');
    parent.appendChild(child);
    document.body.appendChild(parent);

    state = createFlowFrom(parent, {
      count: 1,
      label: 'hello',
    });
  });

  afterEach(() => parent.remove());

  it('createFlowFrom creates a FlowState instance API', () => {
    expect(typeof state.update).toBe('function');
    expect(typeof state.destroy).toBe('function');
  });

  it('getFlowFrom reads from descendant scope', () => {
    expect(getFlowFrom(child, 'label')).toBe('hello');
  });

  it('watchFlowFrom subscribes and unsubscribes', async () => {
    const spy = vi.fn();
    const unsub = watchFlowFrom(child, 'count', spy);
    expect(spy).toHaveBeenCalledWith(1);

    spy.mockClear();
    await state.update({ count: 2 });
    expect(spy).toHaveBeenCalledWith(2);

    spy.mockClear();
    unsub();
    await state.update({ count: 3 });
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('functional API – flowThrough/flowCompute', () => {
  it('flowThrough throws for non-ShadowRoot', () => {
    expect(() => flowThrough(document.createElement('div'))).toThrow();
    expect(() => flowThrough(null)).toThrow();
  });

  it('flowCompute creates computed descriptor consumed by FlowState', () => {
    const root = document.createElement('div');
    document.body.appendChild(root);

    const state = createFlowFrom(root, {
      price: 10,
      qty: 2,
      total: flowCompute((price, qty) => price * qty, ['price', 'qty']),
    });

    expect(getFlowFrom(root, 'total')).toBe(20);
    state.destroy();
    root.remove();
  });

  it('flowThrough links closed shadow root for get/watch', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const shadow = host.attachShadow({ mode: 'closed' });
    const inner = document.createElement('span');
    shadow.appendChild(inner);

    const state = createFlowFrom(host, { count: 0 });
    flowThrough(shadow);

    const spy = vi.fn();
    watchFlowFrom(inner, 'count', spy);
    spy.mockClear();

    await state.update({ count: 5 });
    expect(spy).toHaveBeenCalledWith(5);

    host.remove();
  });
});
