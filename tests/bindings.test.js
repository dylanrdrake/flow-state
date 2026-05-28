import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { FlowSource, flowThrough } from '../lib/FlowState.js';

// The constructor defers the initial binding update one microtask.
// Awaiting this lets us see the initial bound values in DOM assertions.
const waitForInitialBindings = () => Promise.resolve();

describe('FlowSource – declarative bindings (to-prop)', () => {
  let root, state;

  beforeEach(async () => {
    root = document.createElement('div');
    document.body.appendChild(root);

    root.innerHTML = `
      <span id="name-el"    flow-watch-name-to-prop="textContent"></span>
      <span id="active-el"  flow-watch-active-to-prop="hidden"></span>
    `;

    state = new FlowSource(root, {
      name: 'Alice', active: false,
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

describe('FlowSource – declarative bindings (to-attr)', () => {
  let root, state;

  beforeEach(async () => {
    root = document.createElement('div');
    document.body.appendChild(root);

    root.innerHTML = `
      <input id="count-input" flow-watch-count-to-attr="value">
      <img   id="avatar"      flow-watch-avatar-to-attr="src">
    `;

    state = new FlowSource(root, {
      count: 0, avatar: '/img/default.png',
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

describe('FlowSource – declarative bindings (dot-notation keys)', () => {
  let root, state;

  beforeEach(async () => {
    root = document.createElement('div');
    document.body.appendChild(root);

    // Dot in key name becomes a dash in the attribute: user.city → flow-watch-user-city-to-prop
    root.innerHTML = `
      <span id="city-el"  flow-watch-user-city-to-prop="textContent"></span>
      <span id="role-el"  flow-watch-user-role-to-attr="data-role"></span>
    `;

    state = new FlowSource(root, {
      user: { city: 'NY', role: 'admin' },
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

describe('FlowSource – list item bindings (flow-list)', () => {
  let root, state;

  beforeEach(async () => {
    root = document.createElement('div');
    document.body.appendChild(root);

    root.innerHTML = `
      <div flow-list="users">
        <template>
          <div flow-id-to-attr="data-id">
            <span class="name" flow-name-to-prop="textContent"></span>
            <span class="role" flow-role-to-attr="data-role"></span>
          </div>
        </template>
      </div>
    `;

    state = new FlowSource(root, {
      users: [
        { id: 1, name: 'Alice', role: 'admin' },
        { id: 2, name: 'Bob',   role: 'viewer' },
      ],
    });

    await waitForInitialBindings();
  });

  afterEach(() => root.remove());

  it('renders one element per item', () => {
    const items = root.querySelectorAll('[data-id]');
    expect(items.length).toBe(2);
  });

  it('binds a flat property via flow-*-to-prop', () => {
    const names = [...root.querySelectorAll('.name')].map(el => el.textContent);
    expect(names).toEqual(['Alice', 'Bob']);
  });

  it('binds a flat attribute via flow-*-to-attr', () => {
    const roles = [...root.querySelectorAll('.role')].map(el => el.getAttribute('data-role'));
    expect(roles).toEqual(['admin', 'viewer']);
  });

  it('re-renders when the list updates', async () => {
    await state.update({ users: [{ id: 3, name: 'Carol', role: 'editor' }] });
    const items = root.querySelectorAll('[data-id]');
    expect(items.length).toBe(1);
    expect(root.querySelector('.name').textContent).toBe('Carol');
  });
});

describe('FlowSource – list item bindings (nested keys)', () => {
  let root, state;

  beforeEach(async () => {
    root = document.createElement('div');
    document.body.appendChild(root);

    // Dashes in the attribute key map to nested property access:
    // flow-user-city-to-prop reads item.user.city
    root.innerHTML = `
      <div flow-list="people">
        <template>
          <span class="city"  flow-user-city-to-prop="textContent"></span>
          <span class="badge" flow-user-role-to-attr="data-role"></span>
        </template>
      </div>
    `;

    state = new FlowSource(root, {
      people: [
        { user: { city: 'NY', role: 'admin' } },
        { user: { city: 'LA', role: 'viewer' } },
      ],
    });

    await waitForInitialBindings();
  });

  afterEach(() => root.remove());

  it('reads a nested property via dash-separated key (to-prop)', () => {
    const cities = [...root.querySelectorAll('.city')].map(el => el.textContent);
    expect(cities).toEqual(['NY', 'LA']);
  });

  it('reads a nested property via dash-separated key (to-attr)', () => {
    const roles = [...root.querySelectorAll('.badge')].map(el => el.getAttribute('data-role'));
    expect(roles).toEqual(['admin', 'viewer']);
  });

  it('re-renders nested bindings when the list updates', async () => {
    await state.update({ people: [{ user: { city: 'Chicago', role: 'editor' } }] });
    expect(root.querySelector('.city').textContent).toBe('Chicago');
    expect(root.querySelector('.badge').getAttribute('data-role')).toBe('editor');
  });

  it('binds camelCase item keys even when flow-list attribute names are lowercased by HTML', async () => {
    root = document.createElement('div');
    document.body.appendChild(root);

    root.innerHTML = `
      <div flow-list="people">
        <template>
          <span class="display" flow-displayName-to-prop="textContent"></span>
        </template>
      </div>
    `;

    state = new FlowSource(root, {
      people: [{ displayName: 'Alice' }],
    });

    await waitForInitialBindings();

    expect(root.querySelector('.display').textContent).toBe('Alice');
  });
});

describe('FlowSource – conditional bindings (flow-if)', () => {
  let root, state;

  afterEach(() => root.remove());

  it('renders the first element child in template content when truthy', async () => {
    root = document.createElement('div');
    document.body.appendChild(root);

    root.innerHTML = `
      <div id="cond">
        <template flow-if="isReady">
          <section id="pass">Ready</section>
          <article id="fail">Not ready</article>
        </template>
      </div>
    `;

    state = new FlowSource(root, { isReady: true });
    await waitForInitialBindings();

    expect(root.querySelector('#pass')?.textContent).toBe('Ready');
    expect(root.querySelector('#fail')).toBeNull();

    await state.update({ isReady: false });
    expect(root.querySelector('#fail')?.textContent).toBe('Not ready');
    expect(root.querySelector('#pass')).toBeNull();
  });

  it('renders the second element child in template content when falsy', async () => {
    root = document.createElement('div');
    document.body.appendChild(root);

    root.innerHTML = `
      <div id="cond">
        <template flow-if="isReady">
          <section id="pass">Ready</section>
          <article id="fail">Not ready</article>
        </template>
      </div>
    `;

    state = new FlowSource(root, { isReady: false });
    await waitForInitialBindings();

    expect(root.querySelector('#fail')?.textContent).toBe('Not ready');
    expect(root.querySelector('#pass')).toBeNull();
  });

  it('renders nothing on falsy when only pass element exists', async () => {
    root = document.createElement('div');
    document.body.appendChild(root);

    root.innerHTML = `
      <div id="cond">
        <template flow-if="isReady">
          <section id="pass">Ready</section>
        </template>
      </div>
    `;

    state = new FlowSource(root, { isReady: false });
    await waitForInitialBindings();

    expect(root.querySelector('#pass')).toBeNull();
  });

  it('switches branches when the condition changes', async () => {
    root = document.createElement('div');
    document.body.appendChild(root);

    root.innerHTML = `
      <div id="cond">
        <template flow-if="isReady">
          <section id="pass">Ready</section>
          <article id="fail">Not ready</article>
        </template>
      </div>
    `;

    state = new FlowSource(root, { isReady: false });
    await waitForInitialBindings();

    expect(root.querySelector('#fail')).not.toBeNull();
    await state.update({ isReady: true });
    expect(root.querySelector('#pass')).not.toBeNull();
    expect(root.querySelector('#fail')).toBeNull();
  });

  it('renders flow-list inside pass element on first render', async () => {
    root = document.createElement('div');
    document.body.appendChild(root);

    root.innerHTML = `
      <div id="cond">
        <template flow-if="showUsers">
          <section id="users" flow-list="users">
            <template>
              <span class="name" flow-name-to-prop="textContent"></span>
            </template>
          </section>
          <p id="fallback">No users</p>
        </template>
      </div>
    `;

    state = new FlowSource(root, {
      showUsers: true,
      users: [{ name: 'Alice' }, { name: 'Bob' }],
    });

    await waitForInitialBindings();

    const names = [...root.querySelectorAll('.name')].map(el => el.textContent);
    expect(names).toEqual(['Alice', 'Bob']);
    expect(root.querySelector('#fallback')).toBeNull();
  });

  it('renders flow-if inside a through-linked closed shadow root', async () => {
    root = document.createElement('div');
    document.body.appendChild(root);

    const closedShadow = root.attachShadow({ mode: 'closed' });
    closedShadow.innerHTML = `
      <div id="cond">
        <template flow-if="showEmpty">
          <p id="empty">No items</p>
        </template>
      </div>
    `;

    state = new FlowSource(root, { showEmpty: true });
    flowThrough(closedShadow);
    await waitForInitialBindings();

    expect(closedShadow.querySelector('#empty')?.textContent).toBe('No items');

    await state.update({ showEmpty: false });
    expect(closedShadow.querySelector('#empty')).toBeNull();
  });

  it('renders flow-list inside a through-linked closed shadow root', async () => {
    root = document.createElement('div');
    document.body.appendChild(root);

    const closedShadow = root.attachShadow({ mode: 'closed' });
    closedShadow.innerHTML = `
      <div flow-list="items">
        <template>
          <span class="name" flow-name-to-prop="textContent"></span>
        </template>
      </div>
    `;

    state = new FlowSource(root, {
      items: [{ name: 'A' }, { name: 'B' }],
    });
    flowThrough(closedShadow);
    await waitForInitialBindings();

    const names = [...closedShadow.querySelectorAll('.name')].map(el => el.textContent);
    expect(names).toEqual(['A', 'B']);
  });
});
