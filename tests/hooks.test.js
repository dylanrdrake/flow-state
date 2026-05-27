import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { FlowState } from '../lib/FlowState.js';

describe('FlowState – actions', () => {
  let root, state;
  const clickHandler = vi.fn();
  const deleteHandler = vi.fn();

  beforeEach(() => {
    root = document.createElement('div');
    document.body.appendChild(root);
    state = new FlowState(root, {
      count: 0,
      actions: {
        onClick: clickHandler,
        onDelete: deleteHandler,
        theme: 'dark',
      },
    });
  });

  afterEach(() => {
    root.remove();
    clickHandler.mockReset();
    deleteHandler.mockReset();
  });

  it('state.get() returns the action function', () => {
    expect(state.get('onClick')).toBe(clickHandler);
    expect(state.get('onDelete')).toBe(deleteHandler);
  });

  it('state.get() returns a hook value', () => {
    expect(state.get('theme')).toBe('dark');
  });

  it('state.watch() calls the callback immediately with the action', () => {
    const spy = vi.fn();
    state.watch('onClick', spy);
    expect(spy).toHaveBeenCalledOnce();
    expect(spy).toHaveBeenCalledWith(clickHandler);
  });

  it('action watcher is NOT called again after a state update (actions are not reactive)', async () => {
    const spy = vi.fn();
    state.watch('onClick', spy);
    spy.mockClear();

    // Updating a regular state key should not trigger hook watchers
    await state.update({ count: 1 });
    expect(spy).not.toHaveBeenCalled();
  });

  it('action watcher returns a no-op unsubscribe that does not throw', () => {
    const spy = vi.fn();
    const unsub = state.watch('theme', spy);
    expect(() => unsub()).not.toThrow();
  });

  it('actions do not interfere with regular state values', () => {
    expect(state.get('count')).toBe(0);
    // theme is a hook value, accessible via get
    expect(state.get('theme')).toBe('dark');
  });
});
