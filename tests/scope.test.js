import { describe, it, expect, vi, afterEach } from 'vitest';
import { FlowSource, flowThrough, flowGet, flowWatch } from '../lib/FlowState.js';

describe('FlowSource – scope isolation between siblings', () => {
  it('updating one scope does not affect a sibling scope', async () => {
    const root1 = document.createElement('div');
    const root2 = document.createElement('div');
    document.body.appendChild(root1);
    document.body.appendChild(root2);

    const state1 = new FlowSource(root1, { count: 0 });
    const state2 = new FlowSource(root2, { count: 100 });

    await state1.update({ count: 5 });

    expect(flowGet(root1, 'count')).toBe(5);
    expect(flowGet(root2, 'count')).toBe(100); // unchanged

    root1.remove();
    root2.remove();
  });

  it('watchers in one scope are not notified by updates in a sibling scope', async () => {
    const root1 = document.createElement('div');
    const root2 = document.createElement('div');
    document.body.appendChild(root1);
    document.body.appendChild(root2);

    const state1 = new FlowSource(root1, { count: 0 });
    const state2 = new FlowSource(root2, { count: 0 });

    const spy = vi.fn();
    flowWatch(root2, 'count', spy);
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

    new FlowSource(root1, { label: 'scope-1' });
    new FlowSource(root2, { label: 'scope-2' });

    expect(flowGet(child1, 'label')).toBe('scope-1');
    expect(flowGet(child2, 'label')).toBe('scope-2');

    root1.remove();
    root2.remove();
  });
});

describe('FlowSource – child scope shadows parent key', () => {
  it("a child FlowSource's key shadows the parent's key within the child's subtree", () => {
    const parent = document.createElement('div');
    const child = document.createElement('div');
    parent.appendChild(child);
    document.body.appendChild(parent);

    new FlowSource(parent, { theme: 'dark' });
    new FlowSource(child, { theme: 'light' }); // shadows parent

    const inner = document.createElement('span');
    child.appendChild(inner);

    // inner is inside the child scope — should see 'light', not 'dark'
    expect(flowGet(inner, 'theme')).toBe('light');

    parent.remove();
  });

  it("an element outside the child scope still sees the parent key", () => {
    const parent = document.createElement('div');
    const child = document.createElement('div');
    const sibling = document.createElement('div');
    parent.appendChild(child);
    parent.appendChild(sibling);
    document.body.appendChild(parent);

    new FlowSource(parent, { theme: 'dark' });
    new FlowSource(child, { theme: 'light' }); // shadows only inside child

    // sibling is not inside the child scope — should see parent's 'dark'
    expect(flowGet(sibling, 'theme')).toBe('dark');

    parent.remove();
  });

  it('child scope watcher is NOT triggered by parent scope updates to the same key', async () => {
    const parent = document.createElement('div');
    const child = document.createElement('div');
    parent.appendChild(child);
    document.body.appendChild(parent);

    const parentState = new FlowSource(parent, { state: { value: 'parent' } });
    const childState = new FlowSource(child, { state: { value: 'child' } });

    const childSpy = vi.fn();
    flowWatch(child, 'value', childSpy);
    childSpy.mockClear();

    await parentState.update({ value: 'parent-updated' });
    expect(childSpy).not.toHaveBeenCalled(); // child scope is unaffected

    parent.remove();
  });
});

describe('FlowSource – closed shadow DOM and through()', () => {
  // Helper: create a custom element with a closed shadow root.
  // FlowSource is mounted on the host (light DOM) and the shadow is registered via through().
  // Returns { host, shadow, state }.
  const makeClosedHost = (tag, config = {}) => {
    if (!customElements.get(tag)) {
      customElements.define(tag, class extends HTMLElement {});
    }
    const host = document.createElement(tag);
    document.body.appendChild(host);
    const shadow = host.attachShadow({ mode: 'closed' });
    const state = new FlowSource(host, config);
    flowThrough(shadow);
    return { host, shadow, state };
  };

  afterEach(() => { document.body.innerHTML = ''; });

  it('flowWatch can reach a closed shadow scope via composed events', () => {
    const { shadow } = makeClosedHost('closed-scope-watch', { label: 'hello' });

    const inner = document.createElement('span');
    shadow.appendChild(inner);

    const spy = vi.fn();
    flowWatch(inner, 'label', spy);
    expect(spy).toHaveBeenCalledWith('hello');
  });

  it('flowWatch on a closed shadow child fires again after state.update', async () => {
    const { shadow, state } = makeClosedHost('closed-scope-update', { count: 0 });

    const inner = document.createElement('span');
    shadow.appendChild(inner);

    const spy = vi.fn();
    flowWatch(inner, 'count', spy);
    spy.mockClear();

    await state.update({ count: 42 });
    expect(spy).toHaveBeenCalledWith(42);
  });

  it('through() registers a closed shadow so parent bindings reach elements inside it', async () => {
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    const parentState = new FlowSource(parent, { status: 'idle' });

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
    flowThrough(closedShadow);

    // Parent update should now reach the binding inside the closed shadow
    await parentState.update({ status: 'active' });
    expect(span.textContent).toBe('active');
  });

  it('through() must be called before update to push values into a closed shadow binding', async () => {
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    const parentState = new FlowSource(parent, { mode: 'light' });

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
    flowThrough(shadow);

    await parentState.update({ mode: 'dark' });
    expect(span.textContent).toBe('dark');
  });

  it('a closed shadow scope is isolated from sibling scopes', async () => {
    const { state: state1 } = makeClosedHost('closed-sibling-a', { x: 1 });
    const { state: state2 } = makeClosedHost('closed-sibling-b', { x: 100 });

    await state1.update({ x: 99 });

    expect(flowGet(document.querySelector('closed-sibling-a'), 'x')).toBe(99);
    expect(flowGet(document.querySelector('closed-sibling-b'), 'x')).toBe(100);
  });
});
