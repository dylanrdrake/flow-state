import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  FlowSource,
  flowGet,
  flowWatch,
  flowThrough,
  flowCompute, flowScope
} from '../lib/FlowState.js';

const scope = flowScope();

describe('functional API – create/get/watch', () => {
  let parent;
  let child;
  let state;

  beforeEach(() => {
    parent = document.createElement('div');
    child = document.createElement('div');
    parent.appendChild(child);
    document.body.appendChild(parent);

    state = new FlowSource(parent, {
      count: 1,
      label: 'hello',
    });
  });

  afterEach(() => parent.remove());

  it('FlowSource creates a FlowState instance API', () => {
    expect(typeof state.update).toBe('function');
    expect(typeof state.destroy).toBe('function');
  });

  it('flowGet reads from descendant scope', () => {
    expect(flowGet(child, scope.label)).toBe('hello');
  });

  it('flowWatch subscribes and unsubscribes', async () => {
    const spy = vi.fn();
    const unsub = flowWatch(child, scope.count, spy);
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

  it('flowCompute creates computed descriptor consumed by FlowSource', () => {
    const root = document.createElement('div');
    document.body.appendChild(root);

    const state = new FlowSource(root, {
      price: 10,
      qty: 2,
      total: flowCompute((price, qty) => price * qty, ['price', 'qty']),
    });

    expect(flowGet(root, scope.total)).toBe(20);
    state.destroy();
    root.remove();
  });

  it('flowThrough links closed shadow root for get/watch', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const shadow = host.attachShadow({ mode: 'closed' });
    const inner = document.createElement('span');
    shadow.appendChild(inner);

    const state = new FlowSource(host, { count: 0 });
    flowThrough(shadow);

    const spy = vi.fn();
    flowWatch(inner, scope.count, spy);
    spy.mockClear();

    await state.update({ count: 5 });
    expect(spy).toHaveBeenCalledWith(5);

    host.remove();
  });
});

describe('keys', () => {
  let root, source;

  beforeEach(() => {
    root = document.createElement('div');
    document.body.appendChild(root);
    source = new FlowSource(root, {
      count: 1,
      user: { name: 'Ada', address: { city: 'London' } },
      doubled: flowCompute((count) => count * 2, ['count']),
      greet: () => 'hi',
    });
  });

  afterEach(() => root.remove());

  it('a source carries a key for every config entry, next to update and destroy', () => {
    expect(Object.keys(source).sort()).toEqual(['count', 'destroy', 'doubled', 'greet', 'update', 'user']);
    expect(flowGet(root, source.count)).toBe(1);
    expect(flowGet(root, source.doubled)).toBe(2);
    expect(flowGet(root, source.greet)()).toBe('hi');
  });

  it('a property of a key is the key one level down', () => {
    expect(flowGet(root, source.user.name)).toBe('Ada');
    expect(flowGet(root, source.user.address.city)).toBe('London');
    expect(flowGet(root, source.user)).toEqual({ name: 'Ada', address: { city: 'London' } });
    expect(source.user.name).toBe(source.user.name);
  });

  it('flowScope() gives the same keys without a source', async () => {
    const scope = flowScope();
    const seen = [];
    flowWatch(root, scope.user.name, (value) => seen.push(value));
    await source.update({ user: { name: 'Grace' } });
    expect(seen).toEqual(['Ada', 'Grace']);
    expect(flowGet(root, scope['count'])).toBe(1);
  });

  it('a key from one source reads whichever source is nearest the node', () => {
    const inner = document.createElement('div');
    root.appendChild(inner);
    new FlowSource(inner, { count: 50 });
    expect(flowGet(inner, source.count)).toBe(50);
    expect(flowGet(root, source.count)).toBe(1);
  });

  it('rejects string keys and anything else that is not a key', () => {
    expect(() => flowGet(root, 'count')).toThrow(/requires a key/);
    expect(() => flowWatch(root, 'count', () => {})).toThrow(/requires a key/);
    expect(() => flowGet(root, undefined)).toThrow(TypeError);
    expect(() => flowGet(root, flowScope())).toThrow(TypeError);
    expect(() => flowGet(root, { count: 1 })).toThrow(TypeError);
  });

  it('does not allow update or destroy as config keys', () => {
    const el = document.createElement('div');
    expect(() => new FlowSource(el, { update: 1 })).toThrow(/cannot be used as a source key/);
    expect(() => new FlowSource(el, { destroy: () => {} })).toThrow(/cannot be used as a source key/);
    expect(el.__Flow__).toBeUndefined();
  });

  it('a key cannot be written to', () => {
    expect(() => { 'use strict'; source.count = 5; }).toThrow();
    expect(flowGet(root, source.count)).toBe(1);
  });
});
