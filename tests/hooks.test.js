import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { FlowSource, flowGet, flowWatch, flowScope } from '../lib/FlowState.js';

const scope = flowScope();

describe('FlowSource – actions', () => {
  let root, state;
  const clickHandler = vi.fn();
  const deleteHandler = vi.fn();

  beforeEach(() => {
    root = document.createElement('div');
    document.body.appendChild(root);
    state = new FlowSource(root, {
      count: 0,
      onClick: clickHandler,
      onDelete: deleteHandler,
    });
  });

  afterEach(() => {
    root.remove();
    clickHandler.mockReset();
    deleteHandler.mockReset();
  });

  it('flowGet() returns the action function', () => {
    expect(flowGet(root, scope.onClick)).toBe(clickHandler);
    expect(flowGet(root, scope.onDelete)).toBe(deleteHandler);
  });

  it('flowWatch() calls the callback immediately with the action', () => {
    const spy = vi.fn();
    flowWatch(root, scope.onClick, spy);
    expect(spy).toHaveBeenCalledOnce();
    expect(spy).toHaveBeenCalledWith(clickHandler);
  });

  it('action watcher is NOT called again after a state update (actions are not reactive)', async () => {
    const spy = vi.fn();
    flowWatch(root, scope.onClick, spy);
    spy.mockClear();

    // Updating a regular state key should not trigger hook watchers
    await state.update({ count: 1 });
    expect(spy).not.toHaveBeenCalled();
  });

  it('action watcher unsubscribe does not throw', () => {
    const spy = vi.fn();
    const unsub = flowWatch(root, scope.onClick, spy);
    expect(() => unsub()).not.toThrow();
  });

  it('actions do not interfere with regular state values', () => {
    expect(flowGet(root, scope.count)).toBe(0);
  });
});
