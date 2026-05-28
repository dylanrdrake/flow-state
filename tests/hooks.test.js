import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { FlowSource, flowGet, flowWatch } from '../lib/FlowState.js';

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
    expect(flowGet(root, 'onClick')).toBe(clickHandler);
    expect(flowGet(root, 'onDelete')).toBe(deleteHandler);
  });

  it('flowWatch() calls the callback immediately with the action', () => {
    const spy = vi.fn();
    flowWatch(root, 'onClick', spy);
    expect(spy).toHaveBeenCalledOnce();
    expect(spy).toHaveBeenCalledWith(clickHandler);
  });

  it('action watcher is NOT called again after a state update (actions are not reactive)', async () => {
    const spy = vi.fn();
    flowWatch(root, 'onClick', spy);
    spy.mockClear();

    // Updating a regular state key should not trigger hook watchers
    await state.update({ count: 1 });
    expect(spy).not.toHaveBeenCalled();
  });

  it('action watcher unsubscribe does not throw', () => {
    const spy = vi.fn();
    const unsub = flowWatch(root, 'onClick', spy);
    expect(() => unsub()).not.toThrow();
  });

  it('actions do not interfere with regular state values', () => {
    expect(flowGet(root, 'count')).toBe(0);
  });
});
