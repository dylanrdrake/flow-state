import { describe, it, expect, afterEach } from 'vitest';
import { FlowSource, flowThrough, flowGet, flowWatch, flowCompute } from '../lib/FlowState.js';

// Bindings are read from an index kept in step with the DOM, not queried on each update.
// These cover DOM that changes after the source is mounted.

const bound = (key, tag = 'span') => {
  const el = document.createElement(tag);
  el.setAttribute(`flow-watch-${key}-to-prop`, 'textContent');
  return el;
};

describe('FlowSource – binding index follows the DOM', () => {
  let root;

  afterEach(() => root.remove());

  const mount = (config) => {
    root = document.createElement('div');
    document.body.appendChild(root);
    return new FlowSource(root, config);
  };

  it('updates an element added after the source was mounted', async () => {
    const state = mount({ name: 'Alice' });
    await Promise.resolve();

    const span = bound('name');
    root.appendChild(span);

    await state.update({ name: 'Bob' });
    expect(span.textContent).toBe('Bob');
  });

  it('updates an element added deep inside a new subtree', async () => {
    const state = mount({ name: 'Alice' });
    await Promise.resolve();

    const wrapper = document.createElement('section');
    wrapper.innerHTML = '<div><p><span flow-watch-name-to-prop="textContent"></span></p></div>';
    root.appendChild(wrapper);

    await state.update({ name: 'Bob' });
    expect(wrapper.querySelector('span').textContent).toBe('Bob');
  });

  it('stops updating an element removed from the root', async () => {
    const state = mount({ name: 'Alice' });
    const span = bound('name');
    root.appendChild(span);
    await state.update({ name: 'Bob' });

    span.remove();
    await state.update({ name: 'Carol' });
    expect(span.textContent).toBe('Bob');
  });

  it('keeps updating an element moved within the root', async () => {
    const state = mount({ name: 'Alice' });
    const a = document.createElement('div');
    const b = document.createElement('div');
    const span = bound('name');
    a.appendChild(span);
    root.append(a, b);
    await state.update({ name: 'Bob' });

    b.appendChild(span);
    await state.update({ name: 'Carol' });
    expect(span.textContent).toBe('Carol');
  });

  it('follows an element moved from one source to another', async () => {
    const state = mount({ name: 'Alice' });
    const other = document.createElement('div');
    document.body.appendChild(other);
    const otherState = new FlowSource(other, { name: 'Zed' });

    const span = bound('name');
    root.appendChild(span);
    await state.update({ name: 'Bob' });

    other.appendChild(span);
    await state.update({ name: 'Carol' });
    expect(span.textContent).toBe('Zed'); // filled from its new source, not the old one

    await otherState.update({ name: 'Yan' });
    expect(span.textContent).toBe('Yan');

    other.remove();
  });

  it('updates bindings inside flow-if and flow-ul content rendered in the same update', async () => {
    root = document.createElement('div');
    root.innerHTML = `
      <template flow-if="open">
        <section>
          <span id="title" flow-watch-title-to-prop="textContent"></span>
          <ul flow-ul="items"><template><li flow-li-to-prop="textContent"></li></template></ul>
        </section>
      </template>
    `;
    document.body.appendChild(root);
    const state = new FlowSource(root, { open: false, title: 'Hi', items: ['a'] });
    await Promise.resolve();
    expect(root.querySelector('#title')).toBeNull();

    await state.update({ open: true, title: 'Hello', items: ['a', 'b'] });
    expect(root.querySelector('#title').textContent).toBe('Hello');
    expect(root.querySelectorAll('li').length).toBe(2);
  });

  it('updates a list item component that binds to a source key', async () => {
    root = document.createElement('div');
    root.innerHTML = `
      <ul flow-ul="items">
        <template><li><b flow-li-to-prop="textContent"></b><i flow-watch-unit-to-prop="textContent"></i></li></template>
      </ul>
    `;
    document.body.appendChild(root);
    const state = new FlowSource(root, { items: [1, 2], unit: 'kg' });
    await Promise.resolve();
    expect([...root.querySelectorAll('i')].map(el => el.textContent)).toEqual(['kg', 'kg']);

    await state.update({ unit: 'lb' });
    expect([...root.querySelectorAll('i')].map(el => el.textContent)).toEqual(['lb', 'lb']);
  });
});

describe('FlowSource – binding index and nested sources', () => {
  let root;

  afterEach(() => root.remove());

  it('a source mounted later takes over the bindings for its keys', async () => {
    root = document.createElement('div');
    const inner = document.createElement('div');
    const mine = bound('name');
    const shared = bound('theme');
    inner.append(mine, shared);
    root.appendChild(inner);
    document.body.appendChild(root);

    const outer = new FlowSource(root, { name: 'outer', theme: 'light' });
    await outer.update({ name: 'outer-2' });
    expect(mine.textContent).toBe('outer-2');

    const innerState = new FlowSource(inner, { name: 'inner' });
    await Promise.resolve();
    expect(mine.textContent).toBe('inner');

    await outer.update({ name: 'outer-3', theme: 'dark' });
    expect(mine.textContent).toBe('inner');   // shadowed by the inner source
    expect(shared.textContent).toBe('dark');  // inner has no theme, so the outer one flows in

    await innerState.update({ name: 'inner-2' });
    expect(mine.textContent).toBe('inner-2');
  });

  it('the outer source takes the bindings back when the inner source is destroyed', async () => {
    root = document.createElement('div');
    const inner = document.createElement('div');
    const span = bound('name');
    inner.appendChild(span);
    root.appendChild(inner);

    // Left out of the document, so destroy() tears the inner source down.
    const outer = new FlowSource(root, { name: 'outer' });
    const innerState = new FlowSource(inner, { name: 'inner' });
    await outer.update({ name: 'outer-2' });
    expect(span.textContent).toBe('inner');

    innerState.destroy();
    await Promise.resolve();

    await outer.update({ name: 'outer-3' });
    expect(span.textContent).toBe('outer-3');
  });

  it('a source moved under another one picks up the new parent', async () => {
    root = document.createElement('div');
    const other = document.createElement('div');
    const inner = document.createElement('div');
    const span = bound('theme');
    inner.appendChild(span);
    root.appendChild(inner);
    document.body.append(root, other);

    const a = new FlowSource(root, { theme: 'a' });
    const b = new FlowSource(other, { theme: 'b' });
    new FlowSource(inner, { own: 1 });
    await a.update({ theme: 'a-2' });
    expect(span.textContent).toBe('a-2');

    other.appendChild(inner);
    await a.update({ theme: 'a-3' });
    expect(span.textContent).toBe('b'); // filled from its new parent, not the old one

    await b.update({ theme: 'b-2' });
    expect(span.textContent).toBe('b-2');

    other.remove();
  });

  it('bindings on a nested source root belong to the nested source', async () => {
    root = document.createElement('div');
    const inner = bound('name', 'div');
    root.appendChild(inner);
    document.body.appendChild(root);

    const outer = new FlowSource(root, { name: 'outer' });
    new FlowSource(inner, { name: 'inner' });
    await outer.update({ name: 'outer-2' });
    expect(inner.textContent).toBe('inner');
  });
});

describe('FlowSource – binding index and shadow roots', () => {
  let root;

  afterEach(() => root.remove());

  it('reaches elements added to an open shadow root after mount', async () => {
    root = document.createElement('div');
    const host = document.createElement('div');
    const shadow = host.attachShadow({ mode: 'open' });
    root.appendChild(host);
    document.body.appendChild(root);

    const state = new FlowSource(root, { name: 'Alice' });
    await Promise.resolve();

    const span = bound('name');
    shadow.appendChild(span);
    await state.update({ name: 'Bob' });
    expect(span.textContent).toBe('Bob');
  });

  it('reaches elements added to a through-linked closed shadow root after mount', async () => {
    root = document.createElement('div');
    const host = document.createElement('div');
    const shadow = host.attachShadow({ mode: 'closed' });
    root.appendChild(host);
    document.body.appendChild(root);

    const state = new FlowSource(root, { name: 'Alice' });
    flowThrough(shadow);
    await Promise.resolve();

    const span = bound('name');
    shadow.appendChild(span);
    await state.update({ name: 'Bob' });
    expect(span.textContent).toBe('Bob');
  });

  it('does not let a source created later reach into a closed shadow root that is not linked', async () => {
    root = document.createElement('div');
    const host = document.createElement('div');
    const shadow = host.attachShadow({ mode: 'closed' });
    const inner = document.createElement('div');
    const span = bound('name');
    inner.appendChild(span);
    shadow.appendChild(inner);
    root.appendChild(host);
    document.body.appendChild(root);

    const outer = new FlowSource(root, { name: 'outer' });
    new FlowSource(inner, { own: 1 });

    await outer.update({ name: 'outer-2' });
    expect(span.textContent).toBe('');
  });

  it('reaches the open shadow root of an element defined after mount', async () => {
    root = document.createElement('div');
    root.innerHTML = '<late-defined-host></late-defined-host>';
    document.body.appendChild(root);
    const state = new FlowSource(root, { name: 'Alice' });
    await Promise.resolve();

    customElements.define('late-defined-host', class extends HTMLElement {
      constructor() {
        super();
        this.attachShadow({ mode: 'open' }).innerHTML = '<span flow-watch-name-to-prop="textContent"></span>';
      }
    });
    await customElements.whenDefined('late-defined-host');
    await Promise.resolve();

    await state.update({ name: 'Bob' });
    expect(root.querySelector('late-defined-host').shadowRoot.querySelector('span').textContent).toBe('Bob');
  });
});

describe('flowGet / flowWatch – resolved through the source tree', () => {
  const nodes = [];
  const el = (parent = document.body) => {
    const node = document.createElement('div');
    parent.appendChild(node);
    if (parent === document.body) nodes.push(node);
    return node;
  };

  afterEach(() => nodes.splice(0).forEach(node => node.remove()));

  it('dispatches no events', () => {
    const root = el();
    const child = el(root);
    new FlowSource(root, { count: 1 });

    const seen = [];
    for (const type of ['flow-state-get', 'flow-state-watch', 'flow-state-flow-through']) {
      document.addEventListener(type, () => seen.push(type), true);
    }
    const shadow = child.attachShadow({ mode: 'closed' });
    flowThrough(shadow);
    expect(flowGet(child, 'count')).toBe(1);
    flowWatch(child, 'count', () => {})();
    expect(seen).toEqual([]);
  });

  it('resolves a key several sources up, skipping sources that do not define it', () => {
    const top = el();
    const mid = el(top);
    const leaf = el(el(mid));
    new FlowSource(top, { theme: 'dark', greet: () => 'hi' });
    new FlowSource(mid, { own: 1 });

    expect(flowGet(leaf, 'theme')).toBe('dark');
    expect(flowGet(leaf, 'own')).toBe(1);
    expect(flowGet(leaf, 'greet')()).toBe('hi');
    expect(flowGet(leaf, 'missing')).toBeUndefined();
    expect(flowWatch(leaf, 'missing', () => {})).toBeUndefined();
  });

  it('follows a node that moves, with no wait in between', () => {
    const a = el();
    const b = el();
    const node = el(a);
    new FlowSource(a, { name: 'a' });
    new FlowSource(b, { name: 'b' });
    expect(flowGet(node, 'name')).toBe('a');

    b.appendChild(node);
    expect(flowGet(node, 'name')).toBe('b');
  });

  it('follows a nested source that moves, with no wait in between', () => {
    const a = el();
    const b = el();
    const inner = el(a);
    new FlowSource(a, { name: 'a' });
    new FlowSource(b, { name: 'b' });
    new FlowSource(inner, { own: 1 });
    expect(flowGet(inner, 'name')).toBe('a');

    b.appendChild(inner);
    expect(flowGet(inner, 'name')).toBe('b');

    inner.remove();
    expect(flowGet(inner, 'name')).toBeUndefined();
    expect(flowGet(inner, 'own')).toBe(1);
  });

  it('resolves across a closed shadow root that is not through-linked', () => {
    const root = el();
    const host = el(root);
    const shadow = host.attachShadow({ mode: 'closed' });
    const inside = document.createElement('span');
    shadow.appendChild(inside);
    new FlowSource(root, { name: 'outer' });

    expect(flowGet(inside, 'name')).toBe('outer');
    expect(flowGet(shadow, 'name')).toBe('outer');
  });

  it('a source mounted in between takes over resolution for its keys', () => {
    const top = el();
    const mid = el(top);
    const leaf = el(mid);
    new FlowSource(top, { name: 'top' });
    expect(flowGet(leaf, 'name')).toBe('top');

    new FlowSource(mid, { name: 'mid' });
    expect(flowGet(leaf, 'name')).toBe('mid');
  });

  it('keeps notifying a watcher after its node moves away, until it unsubscribes', async () => {
    const a = el();
    const b = el();
    const node = el(a);
    const state = new FlowSource(a, { n: 0 });
    const seen = [];
    const unsub = flowWatch(node, 'n', (value) => seen.push(value));

    b.appendChild(node);
    await state.update({ n: 1 });
    unsub();
    await state.update({ n: 2 });
    expect(seen).toEqual([0, 1]);
  });
});

describe('FlowSource – binding attributes that change on elements already in the DOM', () => {
  let root;

  afterEach(() => root.remove());

  const mount = (config, html = '') => {
    root = document.createElement('div');
    root.innerHTML = html;
    document.body.appendChild(root);
    return new FlowSource(root, config);
  };

  it('picks up a flow-watch attribute added later', async () => {
    const state = mount({ name: 'Alice' }, '<span></span>');
    await Promise.resolve();
    const span = root.querySelector('span');

    span.setAttribute('flow-watch-name-to-prop', 'textContent');
    await state.update({ name: 'Bob' });
    expect(span.textContent).toBe('Bob');
  });

  it('stops updating once the attribute is removed', async () => {
    const state = mount({ name: 'Alice' }, '<span flow-watch-name-to-prop="textContent"></span>');
    await Promise.resolve();
    const span = root.querySelector('span');
    expect(span.textContent).toBe('Alice');

    span.removeAttribute('flow-watch-name-to-prop');
    await state.update({ name: 'Bob' });
    expect(span.textContent).toBe('Alice');
  });

  it('follows a flow-ul attribute that is pointed at another key', async () => {
    const state = mount(
      { a: ['x'], b: ['y', 'z'] },
      '<ul flow-ul="a"><template><li flow-li-to-prop="textContent"></li></template></ul>',
    );
    await Promise.resolve();
    const list = root.querySelector('ul');
    expect(list.querySelectorAll('li').length).toBe(1);

    list.setAttribute('flow-ul', 'b');
    await state.update({ a: ['x', 'x', 'x'], b: ['y', 'z'] });
    expect([...list.querySelectorAll('li')].map(li => li.textContent)).toEqual(['y', 'z']);
  });

  it('picks up an attribute added on the source root and inside an open shadow root', async () => {
    root = document.createElement('div');
    const host = document.createElement('div');
    const inner = document.createElement('span');
    host.attachShadow({ mode: 'open' }).appendChild(inner);
    root.appendChild(host);
    document.body.appendChild(root);
    const state = new FlowSource(root, { name: 'Alice' });
    await Promise.resolve();

    root.setAttribute('flow-watch-name-to-attr', 'data-name');
    inner.setAttribute('flow-watch-name-to-prop', 'textContent');
    await state.update({ name: 'Bob' });
    expect(root.getAttribute('data-name')).toBe('Bob');
    expect(inner.textContent).toBe('Bob');
  });

  // Skipped for the same happy-dom reason as the nested-key test below: the outer root is
  // observed again with the new attribute name, and happy-dom keeps the first options.
  it.skip('picks up an attribute for a key defined by a source mounted later', async () => {
    mount({ name: 'Alice' }, '<section><span></span></section>');
    await Promise.resolve();
    const span = root.querySelector('span');

    const inner = new FlowSource(root.querySelector('section'), { late: 1 });
    await Promise.resolve();
    span.setAttribute('flow-watch-late-to-prop', 'textContent');
    await inner.update({ late: 2 });
    expect(span.textContent).toBe('2');
  });

  // Skipped: happy-dom keeps the options from a node's first observe() call, so the observer
  // never learns the new attribute name. Browsers replace the options; this passes in Chromium.
  it.skip('picks up an attribute for a nested key that appears in a later update', async () => {
    const state = mount({ user: null }, '<span></span>');
    await Promise.resolve();
    const span = root.querySelector('span');

    await state.update({ user: { name: 'Alice' } });
    span.setAttribute('flow-watch-user-name-to-prop', 'textContent');
    await state.update({ user: { name: 'Bob' } });
    expect(span.textContent).toBe('Bob');
  });
});

describe('FlowSource – shadow roots attached after the host is in the DOM', () => {
  let root;

  afterEach(() => root.remove());

  it('reaches an open shadow root attached after mount only once it calls flowThrough', async () => {
    root = document.createElement('div');
    const host = document.createElement('div');
    root.appendChild(host);
    document.body.appendChild(root);
    const state = new FlowSource(root, { name: 'Alice' });
    await state.update({ name: 'Bob' });

    const shadow = host.attachShadow({ mode: 'open' });
    shadow.innerHTML = '<p><span flow-watch-name-to-prop="textContent"></span></p>';
    await state.update({ name: 'Carol' });
    expect(shadow.querySelector('span').textContent).toBe('');

    flowThrough(shadow);
    await state.update({ name: 'Dan' });
    expect(shadow.querySelector('span').textContent).toBe('Dan');
  });

  it('still stops at a closed shadow root attached after mount', async () => {
    root = document.createElement('div');
    const host = document.createElement('div');
    root.appendChild(host);
    document.body.appendChild(root);
    const state = new FlowSource(root, { name: 'Alice' });
    await Promise.resolve();

    const shadow = host.attachShadow({ mode: 'closed' });
    shadow.innerHTML = '<span flow-watch-name-to-prop="textContent"></span>';
    await state.update({ name: 'Bob' });
    expect(shadow.querySelector('span').textContent).toBe('');
  });
});

describe('FlowSource – new bindings are filled with the current value', () => {
  let root;
  const settle = () => new Promise(resolve => setTimeout(resolve));

  afterEach(() => root.remove());

  const mount = async (config, html = '') => {
    root = document.createElement('div');
    root.innerHTML = html;
    document.body.appendChild(root);
    const state = new FlowSource(root, config);
    await settle();
    return state;
  };

  it('fills an element added after the first update, with no update needed', async () => {
    await mount({ name: 'Alice', role: 'admin' });
    const span = bound('name');
    span.setAttribute('flow-watch-role-to-attr', 'data-role');
    root.appendChild(span);

    await settle();
    expect(span.textContent).toBe('Alice');
    expect(span.getAttribute('data-role')).toBe('admin');
  });

  it('fills a binding attribute added to an element already in the DOM', async () => {
    await mount({ name: 'Alice' }, '<span></span>');
    const span = root.querySelector('span');

    span.setAttribute('flow-watch-name-to-prop', 'textContent');
    await settle();
    expect(span.textContent).toBe('Alice');
  });

  it('is filled by the time a flowGet from the new element returns', async () => {
    await mount({ name: 'Alice' });
    const span = bound('name');
    root.appendChild(span);

    flowGet(span, 'name');
    expect(span.textContent).toBe('Alice');
  });

  it('fills bindings inside flow-if content for keys the update did not change', async () => {
    const state = await mount(
      { open: false, name: 'Alice', items: ['a', 'b'], deep: true },
      `<template flow-if="open">
         <section>
           <span id="name" flow-watch-name-to-prop="textContent"></span>
           <ul flow-ul="items"><template><li flow-li-to-prop="textContent"></li></template></ul>
           <template flow-if="deep"><em flow-watch-name-to-prop="textContent"></em></template>
         </section>
       </template>`,
    );
    expect(root.querySelector('#name')).toBeNull();

    await state.update({ open: true });
    await settle();
    expect(root.querySelector('#name').textContent).toBe('Alice');
    expect([...root.querySelectorAll('li')].map(li => li.textContent)).toEqual(['a', 'b']);
    expect(root.querySelector('em').textContent).toBe('Alice');
  });

  it('fills nested flow-if content during the first update', async () => {
    await mount(
      { open: true, deep: true, name: 'Alice' },
      `<template flow-if="open">
         <section><template flow-if="deep"><em flow-watch-name-to-prop="textContent"></em></template></section>
       </template>`,
    );
    expect(root.querySelector('em').textContent).toBe('Alice');
  });

  it('fills from a source further up when the nearest one does not define the key', async () => {
    await mount({ theme: 'dark' }, '<section></section>');
    const section = root.querySelector('section');
    new FlowSource(section, { own: 1 });
    await settle();

    const span = bound('theme');
    section.appendChild(span);
    await settle();
    expect(span.textContent).toBe('dark');
  });

  it('fills with a computed value and a nested key', async () => {
    await mount({ user: { name: 'Alice' }, shout: flowCompute((user) => user.name.toUpperCase(), ['user']) });
    const a = bound('user-name');
    const b = bound('shout');
    root.append(a, b);

    await settle();
    expect(a.textContent).toBe('Alice');
    expect(b.textContent).toBe('ALICE');
  });

  it('does not write a binding twice during the first update', async () => {
    root = document.createElement('div');
    const el = document.createElement('div');
    let writes = 0;
    Object.defineProperty(el, 'value', { set() { writes++; } });
    el.setAttribute('flow-watch-name-to-prop', 'value');
    root.appendChild(el);
    document.body.appendChild(root);

    new FlowSource(root, { name: 'Alice' });
    await settle();
    expect(writes).toBe(1);
  });

  it('refills a detached element with what it missed once it is put back', async () => {
    const state = await mount({ name: 'Alice' }, '<span flow-watch-name-to-prop="textContent"></span>');
    const span = root.querySelector('span');

    span.remove();
    await state.update({ name: 'Bob' });
    expect(span.textContent).toBe('Alice');

    root.appendChild(span);
    await settle();
    expect(span.textContent).toBe('Bob');
  });

  it('refills from the source above when the source that shadowed a key is destroyed', async () => {
    root = document.createElement('div');
    root.innerHTML = '<section><div><span flow-watch-name-to-prop="textContent"></span></div></section>';
    const outer = new FlowSource(root, { name: 'outer' });
    const middle = new FlowSource(root.querySelector('section'), { name: 'middle' });
    new FlowSource(root.querySelector('div'), { own: 1 });
    await settle();
    const span = root.querySelector('span');
    expect(span.textContent).toBe('middle');

    middle.destroy();
    await settle();
    expect(span.textContent).toBe('outer');
    await outer.update({ name: 'outer-2' });
    expect(span.textContent).toBe('outer-2');
  });
});
