import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { FlowState } from '../lib/FlowState.js';

// The constructor defers the initial binding update one microtask.
// Awaiting this lets us see the initial bound values in DOM assertions.
const waitForInitialBindings = () => Promise.resolve();

describe('FlowState – declarative bindings (to-prop)', () => {
  let root, state;

  beforeEach(async () => {
    root = document.createElement('div');
    document.body.appendChild(root);

    root.innerHTML = `
      <span id="name-el"    flow-watch-name-to-prop="textContent"></span>
      <span id="active-el"  flow-watch-active-to-prop="hidden"></span>
    `;

    state = new FlowState(root, {
      state: { name: 'Alice', active: false },
    });

    await waitForInitialBindings();
  });

  afterEach(() => root.remove());

  it('sets the bound property on initial render', () => {
    expect(root.querySelector('#name-el').textContent).toBe('Alice');
  });

  it('sets a boolean property on initial render', () => {
    expect(root.querySelector('#active-el').hidden).toBe(false);
  });

  it('updates the bound property when state changes', async () => {
    await state.update({ name: 'Bob' });
    expect(root.querySelector('#name-el').textContent).toBe('Bob');
  });

  it('updates a boolean property when state changes', async () => {
    await state.update({ active: true });
    expect(root.querySelector('#active-el').hidden).toBe(true);
  });
});

describe('FlowState – declarative bindings (to-attr)', () => {
  let root, state;

  beforeEach(async () => {
    root = document.createElement('div');
    document.body.appendChild(root);

    root.innerHTML = `
      <input id="count-input" flow-watch-count-to-attr="value">
      <img   id="avatar"      flow-watch-avatar-to-attr="src">
    `;

    state = new FlowState(root, {
      state: { count: 0, avatar: '/img/default.png' },
    });

    await waitForInitialBindings();
  });

  afterEach(() => root.remove());

  it('sets the bound attribute on initial render', () => {
    expect(root.querySelector('#count-input').getAttribute('value')).toBe('0');
    expect(root.querySelector('#avatar').getAttribute('src')).toBe('/img/default.png');
  });

  it('updates the bound attribute when state changes', async () => {
    await state.update({ count: 42 });
    expect(root.querySelector('#count-input').getAttribute('value')).toBe('42');
  });

  it('updates a string attribute when state changes', async () => {
    await state.update({ avatar: '/img/user.png' });
    expect(root.querySelector('#avatar').getAttribute('src')).toBe('/img/user.png');
  });
});

describe('FlowState – declarative bindings (dot-notation keys)', () => {
  let root, state;

  beforeEach(async () => {
    root = document.createElement('div');
    document.body.appendChild(root);

    // Dot in key name becomes a dash in the attribute: user.city → flow-watch-user-city-to-prop
    root.innerHTML = `
      <span id="city-el"  flow-watch-user-city-to-prop="textContent"></span>
      <span id="role-el"  flow-watch-user-role-to-attr="data-role"></span>
    `;

    state = new FlowState(root, {
      state: { user: { city: 'NY', role: 'admin' } },
    });

    await waitForInitialBindings();
  });

  afterEach(() => root.remove());

  it('sets a nested-key property binding on initial render', () => {
    expect(root.querySelector('#city-el').textContent).toBe('NY');
  });

  it('sets a nested-key attribute binding on initial render', () => {
    expect(root.querySelector('#role-el').getAttribute('data-role')).toBe('admin');
  });

  it('updates a nested-key property binding when state changes', async () => {
    await state.update({ user: { city: 'LA' } });
    expect(root.querySelector('#city-el').textContent).toBe('LA');
  });

  it('updates a nested-key attribute binding when state changes', async () => {
    await state.update({ user: { role: 'viewer' } });
    expect(root.querySelector('#role-el').getAttribute('data-role')).toBe('viewer');
  });

  it('does NOT update sibling nested key bindings when only one child changes', async () => {
    await state.update({ user: { city: 'LA' } });
    // role should remain 'admin' — we only changed city
    expect(root.querySelector('#role-el').getAttribute('data-role')).toBe('admin');
  });
});
