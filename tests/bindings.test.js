import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { FlowSource, flowThrough } from '../lib/FlowState.js';

// The constructor defers the initial binding update one microtask.
// Awaiting this lets us see the initial bound values in DOM assertions.
const waitForInitialBindings = () => Promise.resolve();

describe('FlowSource – declarative bindings (flow-prop)', () => {
  let root, state;

  beforeEach(async () => {
    root = document.createElement('div');
    document.body.appendChild(root);

    root.innerHTML = `
      <span id="name-el"    flow-prop="textContent: name"></span>
      <span id="active-el"  flow-prop="hidden: active"></span>
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

describe('FlowSource – declarative bindings on the source root', () => {
  let root, state;

  beforeEach(async () => {
    root = document.createElement('div');
    document.body.appendChild(root);

    root.setAttribute('flow-prop', 'textContent: title');
    root.setAttribute('flow-attr', 'data-status: status');

    state = new FlowSource(root, {
      title: 'Dashboard',
      status: 'ready',
    });

    await waitForInitialBindings();
  });

  afterEach(() => root.remove());

  it('sets a bound property on the source root', () => {
    expect(root.textContent).toBe('Dashboard');
  });

  it('sets a bound attribute on the source root', () => {
    expect(root.getAttribute('data-status')).toBe('ready');
  });

  it('updates bindings on the source root when state changes', async () => {
    await state.update({ title: 'Reports', status: 'busy' });
    expect(root.textContent).toBe('Reports');
    expect(root.getAttribute('data-status')).toBe('busy');
  });
});

describe('FlowSource – declarative bindings (flow-attr)', () => {
  let root, state;

  beforeEach(async () => {
    root = document.createElement('div');
    document.body.appendChild(root);

    root.innerHTML = `
      <input id="count-input" flow-attr="value: count">
      <img   id="avatar"      flow-attr="src: avatar">
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

    // A nested key is written as its dot-path
    root.innerHTML = `
      <span id="city-el"  flow-prop="textContent: user.city"></span>
      <span id="role-el"  flow-attr="data-role: user.role"></span>
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

describe('FlowSource – list item bindings (flow-ul)', () => {
  let root, state;

  beforeEach(async () => {
    root = document.createElement('div');
    document.body.appendChild(root);

    root.innerHTML = `
      <div flow-ul="users">
        <template>
          <div flow-li-attr="data-id: id">
            <span class="name" flow-li-prop="textContent: name"></span>
            <span class="role" flow-li-attr="data-role: role"></span>
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

  it('binds a flat property via flow-li-prop', () => {
    const names = [...root.querySelectorAll('.name')].map(el => el.textContent);
    expect(names).toEqual(['Alice', 'Bob']);
  });

  it('binds a flat attribute via flow-li-attr', () => {
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

    // A dot-path reads a nested property: user.city reads item.user.city
    root.innerHTML = `
      <div flow-ul="people">
        <template>
          <span class="city"  flow-li-prop="textContent: user.city"></span>
          <span class="badge" flow-li-attr="data-role: user.role"></span>
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

  it('reads a nested property via a dot-path (flow-li-prop)', () => {
    const cities = [...root.querySelectorAll('.city')].map(el => el.textContent);
    expect(cities).toEqual(['NY', 'LA']);
  });

  it('reads a nested property via a dot-path (flow-li-attr)', () => {
    const roles = [...root.querySelectorAll('.badge')].map(el => el.getAttribute('data-role'));
    expect(roles).toEqual(['admin', 'viewer']);
  });

  it('re-renders nested bindings when the list updates', async () => {
    await state.update({ people: [{ user: { city: 'Chicago', role: 'editor' } }] });
    expect(root.querySelector('.city').textContent).toBe('Chicago');
    expect(root.querySelector('.badge').getAttribute('data-role')).toBe('editor');
  });

  it('binds camelCase item keys exactly as written', async () => {
    root = document.createElement('div');
    document.body.appendChild(root);

    root.innerHTML = `
      <div flow-ul="people">
        <template>
          <span class="display" flow-li-prop="textContent: displayName"></span>
        </template>
      </div>
    `;

    state = new FlowSource(root, {
      people: [{ displayName: 'Alice' }],
    });

    await waitForInitialBindings();

    expect(root.querySelector('.display').textContent).toBe('Alice');
  });

  it('binds primitive list item values when a flow-li pair has no item key', async () => {
    root = document.createElement('div');
    document.body.appendChild(root);

    root.innerHTML = `
      <div flow-ul="levels">
        <template>
          <span class="level" flow-li-attr="data-level"></span>
          <span class="level-prop" flow-li-prop="textContent"></span>
        </template>
      </div>
    `;

    state = new FlowSource(root, {
      levels: [1, 2, 3],
    });

    await waitForInitialBindings();

    const levels = [...root.querySelectorAll('.level')].map(el => el.getAttribute('data-level'));
    const levelProps = [...root.querySelectorAll('.level-prop')].map(el => el.textContent);
    expect(levels).toEqual(['1', '2', '3']);
    expect(levelProps).toEqual(['1', '2', '3']);
  });
});

describe('FlowSource – declarative bindings in closed shadow roots', () => {
  let root, state;

  afterEach(() => root.remove());

  it('does not update closed-shadow bindings unless the shadow root is through-linked', async () => {
    root = document.createElement('div');
    document.body.appendChild(root);

    const closedShadow = root.attachShadow({ mode: 'closed' });
    closedShadow.innerHTML = `
      <span id="name" flow-prop="textContent: name"></span>
      <span id="role" flow-attr="data-role: role"></span>
    `;

    state = new FlowSource(root, {
      name: 'Alice',
      role: 'admin',
    });

    await waitForInitialBindings();

    expect(closedShadow.querySelector('#name').textContent).toBe('');
    expect(closedShadow.querySelector('#role').getAttribute('data-role')).toBeNull();

    await state.update({ name: 'Bob', role: 'viewer' });

    expect(closedShadow.querySelector('#name').textContent).toBe('');
    expect(closedShadow.querySelector('#role').getAttribute('data-role')).toBeNull();
  });

  it('updates closed-shadow bindings when the shadow root is through-linked', async () => {
    root = document.createElement('div');
    document.body.appendChild(root);

    const closedShadow = root.attachShadow({ mode: 'closed' });
    closedShadow.innerHTML = `
      <span id="name" flow-prop="textContent: name"></span>
      <span id="role" flow-attr="data-role: role"></span>
    `;

    state = new FlowSource(root, {
      name: 'Alice',
      role: 'admin',
    });
    flowThrough(closedShadow);

    await waitForInitialBindings();

    expect(closedShadow.querySelector('#name').textContent).toBe('Alice');
    expect(closedShadow.querySelector('#role').getAttribute('data-role')).toBe('admin');

    await state.update({ name: 'Bob', role: 'viewer' });

    expect(closedShadow.querySelector('#name').textContent).toBe('Bob');
    expect(closedShadow.querySelector('#role').getAttribute('data-role')).toBe('viewer');
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

  it('renders flow-ul inside pass element on first render', async () => {
    root = document.createElement('div');
    document.body.appendChild(root);

    root.innerHTML = `
      <div id="cond">
        <template flow-if="showUsers">
          <section id="users" flow-ul="users">
            <template>
              <span class="name" flow-li-prop="textContent: name"></span>
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

  it('renders flow-ul inside a through-linked closed shadow root', async () => {
    root = document.createElement('div');
    document.body.appendChild(root);

    const closedShadow = root.attachShadow({ mode: 'closed' });
    closedShadow.innerHTML = `
      <div flow-ul="items">
        <template>
          <span class="name" flow-li-prop="textContent: name"></span>
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

describe('FlowSource – binding pairs', () => {
  let root;

  afterEach(() => root.remove());

  const mount = async (config, html) => {
    root = document.createElement('div');
    root.innerHTML = html;
    document.body.appendChild(root);
    const state = new FlowSource(root, config);
    await waitForInitialBindings();
    return state;
  };

  it('binds several keys on one element, to props and attributes', async () => {
    const state = await mount(
      { name: 'Alice', bio: 'Engineer', id: 7, role: 'admin' },
      '<span flow-prop="textContent: name; title: bio" flow-attr="data-id: id; data-role: role"></span>',
    );
    const span = root.querySelector('span');
    expect([span.textContent, span.title, span.dataset.id, span.dataset.role]).toEqual(['Alice', 'Engineer', '7', 'admin']);

    await state.update({ bio: 'Manager', role: 'owner' });
    expect([span.textContent, span.title, span.dataset.id, span.dataset.role]).toEqual(['Alice', 'Manager', '7', 'owner']);
  });

  it('writes one key to several targets', async () => {
    const state = await mount({ name: 'Alice' }, '<span flow-prop="textContent: name; title: name" flow-attr="data-name: name"></span>');
    const span = root.querySelector('span');

    await state.update({ name: 'Bob' });
    expect([span.textContent, span.title, span.dataset.name]).toEqual(['Bob', 'Bob', 'Bob']);
  });

  it('keeps key case and dots exactly as written', async () => {
    const state = await mount(
      { userName: 'camel', username: 'lower', user: { name: 'nested' }, 'user-name': 'dashed' },
      `<i flow-prop="textContent: userName"></i><i flow-prop="textContent: username"></i>
       <i flow-prop="textContent: user.name"></i><i flow-prop="textContent: user-name"></i>`,
    );
    expect([...root.querySelectorAll('i')].map(el => el.textContent)).toEqual(['camel', 'lower', 'nested', 'dashed']);

    await state.update({ userName: 'CAMEL' });
    expect([...root.querySelectorAll('i')].map(el => el.textContent)).toEqual(['CAMEL', 'lower', 'nested', 'dashed']);
  });

  it('tolerates spacing, a trailing semicolon, and a target that contains a colon', async () => {
    await mount({ name: 'Alice', url: '#a' }, '<a flow-prop="  textContent :name ;" flow-attr="xlink:href: url;"></a>');
    const a = root.querySelector('a');
    expect(a.textContent).toBe('Alice');
    expect(a.getAttribute('xlink:href')).toBe('#a');
  });

  it('ignores a pair that names no key', async () => {
    await mount({ name: 'Alice' }, '<span flow-prop="textContent; title: name">kept</span>');
    const span = root.querySelector('span');
    expect(span.textContent).toBe('kept');
    expect(span.title).toBe('Alice');
  });

  it('follows the pairs when the attribute is rewritten', async () => {
    const state = await mount({ name: 'Alice', bio: 'Engineer' }, '<span flow-prop="textContent: name"></span>');
    const span = root.querySelector('span');

    span.setAttribute('flow-prop', 'title: bio');
    await state.update({ name: 'Bob', bio: 'Manager' });
    expect(span.textContent).toBe('Alice');
    expect(span.title).toBe('Manager');
  });

  it('binds several item fields on one list element', async () => {
    await mount(
      { rows: [{ id: 1, label: 'One', meta: { tone: 'warm' } }, { id: 2, label: 'Two', meta: { tone: 'cool' } }] },
      `<ul flow-ul="rows"><template>
         <li flow-li-prop="textContent: label; title: meta.tone" flow-li-attr="data-id: id; data-tone: meta.tone"></li>
       </template></ul>`,
    );
    expect([...root.querySelectorAll('li')].map(li => [li.textContent, li.title, li.dataset.id, li.dataset.tone]))
      .toEqual([['One', 'warm', '1', 'warm'], ['Two', 'cool', '2', 'cool']]);
  });

  it('binds item fields and source keys on the same list element', async () => {
    const state = await mount(
      { rows: [{ label: 'One' }, { label: 'Two' }], unit: 'kg' },
      '<ul flow-ul="rows"><template><li flow-li-prop="textContent: label" flow-attr="data-unit: unit"></li></template></ul>',
    );
    expect([...root.querySelectorAll('li')].map(li => [li.textContent, li.dataset.unit])).toEqual([['One', 'kg'], ['Two', 'kg']]);

    await state.update({ unit: 'lb' });
    expect([...root.querySelectorAll('li')].map(li => li.dataset.unit)).toEqual(['lb', 'lb']);
  });

  it('no longer reads the old attribute-name syntax', async () => {
    await mount({ name: 'Alice' }, '<span flow-watch-name-to-prop="textContent"></span>');
    expect(root.querySelector('span').textContent).toBe('');
  });
});
