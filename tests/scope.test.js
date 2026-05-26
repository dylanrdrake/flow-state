import { describe, it, expect, vi, afterEach } from 'vitest';
import { FlowState } from '../lib/FlowState.js';

describe('FlowState – scope isolation between siblings', () => {
  it('updating one scope does not affect a sibling scope', async () => {
    const root1 = document.createElement('div');
    const root2 = document.createElement('div');
    document.body.appendChild(root1);
    document.body.appendChild(root2);

    const state1 = new FlowState(root1, { state: { count: 0 } });
    const state2 = new FlowState(root2, { state: { count: 100 } });

    await state1.update({ count: 5 });

    expect(state1.get('count')).toBe(5);
    expect(state2.get('count')).toBe(100); // unchanged

    root1.remove();
    root2.remove();
  });

  it('watchers in one scope are not notified by updates in a sibling scope', async () => {
    const root1 = document.createElement('div');
    const root2 = document.createElement('div');
    document.body.appendChild(root1);
    document.body.appendChild(root2);

    const state1 = new FlowState(root1, { state: { count: 0 } });
    const state2 = new FlowState(root2, { state: { count: 0 } });

    const spy = vi.fn();
    state2.watch('count', spy);
    spy.mockClear();

    await state1.update({ count: 42 });
    expect(spy).not.toHaveBeenCalled();

    root1.remove();
    root2.remove();
  });

  it('a child element only sees its nearest parent scope for a given key', () => {
    const root1 = document.createElement('div');
    const root2 = document.createElement('div');
    document.body.appendChild(root1);
    document.body.appendChild(root2);

    const child1 = document.createElement('span');
    const child2 = document.createElement('span');
    root1.appendChild(child1);
    root2.appendChild(child2);

    new FlowState(root1, { state: { label: 'scope-1' } });
    new FlowState(root2, { state: { label: 'scope-2' } });

    expect(FlowState.get(child1, 'label')).toBe('scope-1');
    expect(FlowState.get(child2, 'label')).toBe('scope-2');

    root1.remove();
    root2.remove();
  });
});

describe('FlowState – child scope shadows parent key', () => {
  it("a child FlowState's key shadows the parent's key within the child's subtree", () => {
    const parent = document.createElement('div');
    const child = document.createElement('div');
    parent.appendChild(child);
    document.body.appendChild(parent);

    new FlowState(parent, { state: { theme: 'dark' } });
    new FlowState(child, { state: { theme: 'light' } }); // shadows parent

    const inner = document.createElement('span');
    child.appendChild(inner);

    // inner is inside the child scope — should see 'light', not 'dark'
    expect(FlowState.get(inner, 'theme')).toBe('light');

    parent.remove();
  });

  it("an element outside the child scope still sees the parent key", () => {
    const parent = document.createElement('div');
    const child = document.createElement('div');
    const sibling = document.createElement('div');
    parent.appendChild(child);
    parent.appendChild(sibling);
    document.body.appendChild(parent);

    new FlowState(parent, { state: { theme: 'dark' } });
    new FlowState(child, { state: { theme: 'light' } }); // shadows only inside child

    // sibling is not inside the child scope — should see parent's 'dark'
    expect(FlowState.get(sibling, 'theme')).toBe('dark');

    parent.remove();
  });

  it('child scope watcher is NOT triggered by parent scope updates to the same key', async () => {
    const parent = document.createElement('div');
    const child = document.createElement('div');
    parent.appendChild(child);
    document.body.appendChild(parent);

    const parentState = new FlowState(parent, { state: { value: 'parent' } });
    const childState = new FlowState(child, { state: { value: 'child' } });

    const childSpy = vi.fn();
    childState.watch('value', childSpy);
    childSpy.mockClear();

    await parentState.update({ value: 'parent-updated' });
    expect(childSpy).not.toHaveBeenCalled(); // child scope is unaffected

    parent.remove();
  });
});

describe('FlowState – closed shadow DOM and through()', () => {
  // Helper: create a custom element with a closed shadow root.
  // FlowState is mounted on the host (light DOM) and the shadow is registered via through().
  // Returns { host, shadow, state }.
  const makeClosedHost = (tag, config = {}) => {
    if (!customElements.get(tag)) {
      customElements.define(tag, class extends HTMLElement {});
    }
    const host = document.createElement(tag);
    document.body.appendChild(host);
    const shadow = host.attachShadow({ mode: 'closed' });
    const state = new FlowState(host, config);
    state.through(shadow);
    return { host, shadow, state };
  };

  afterEach(() => { document.body.innerHTML = ''; });

  it('FlowState.watch can reach a closed shadow scope via composed events', () => {
    const { shadow } = makeClosedHost('closed-scope-watch', { state: { label: 'hello' } });

    const inner = document.createElement('span');
    shadow.appendChild(inner);

    const spy = vi.fn();
    FlowState.watch(inner, 'label', spy);
    expect(spy).toHaveBeenCalledWith('hello');
  });

  it('FlowState.watch on a closed shadow child fires again after state.update', async () => {
    const { shadow, state } = makeClosedHost('closed-scope-update', { state: { count: 0 } });

    const inner = document.createElement('span');
    shadow.appendChild(inner);

    const spy = vi.fn();
    FlowState.watch(inner, 'count', spy);
    spy.mockClear();

    await state.update({ count: 42 });
    expect(spy).toHaveBeenCalledWith(42);
  });

  it('through() registers a closed shadow so parent bindings reach elements inside it', async () => {
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    const parentState = new FlowState(parent, { state: { status: 'idle' } });

    if (!customElements.get('closed-binding-child')) {
      customElements.define('closed-binding-child', class extends HTMLElement {});
    }
    const child = document.createElement('closed-binding-child');
    parent.appendChild(child);
    const closedShadow = child.attachShadow({ mode: 'closed' });

    const span = document.createElement('span');
    span.setAttribute('flow-watch-status-to-prop', 'textContent');
    closedShadow.appendChild(span);

    // Register the closed shadow with the parent scope
    FlowState.through(closedShadow);

    // Parent update should now reach the binding inside the closed shadow
    await parentState.update({ status: 'active' });
    expect(span.textContent).toBe('active');
  });

  it('through() must be called before update to push values into a closed shadow binding', async () => {
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    const parentState = new FlowState(parent, { state: { mode: 'light' } });

    if (!customElements.get('closed-late-through')) {
      customElements.define('closed-late-through', class extends HTMLElement {});
    }
    const child = document.createElement('closed-late-through');
    parent.appendChild(child);
    const shadow = child.attachShadow({ mode: 'closed' });

    const span = document.createElement('span');
    span.setAttribute('flow-watch-mode-to-prop', 'textContent');
    shadow.appendChild(span);

    // Register BEFORE update — binding should receive the next value
    FlowState.through(shadow);

    await parentState.update({ mode: 'dark' });
    expect(span.textContent).toBe('dark');
  });

  it('a closed shadow scope is isolated from sibling scopes', async () => {
    const { state: state1 } = makeClosedHost('closed-sibling-a', { state: { x: 1 } });
    const { state: state2 } = makeClosedHost('closed-sibling-b', { state: { x: 100 } });

    await state1.update({ x: 99 });

    expect(state1.get('x')).toBe(99);
    expect(state2.get('x')).toBe(100);
  });
});
