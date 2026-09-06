import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { FlowStateComponent } from '../lib/FlowStateComponent.js';
import { flowGet, flowWatch } from '../lib/FlowState.js';

// Each test registers a uniquely named custom element to avoid
// "already defined" errors across tests.
let counter = 0;
const tag = () => `test-component-${counter++}`;

describe('FlowStateComponent', () => {
  afterEach(() => document.body.innerHTML = '');

  it('Creates a FlowState source instance in this.source after connectedCallback', () => {
    class MyComp extends FlowStateComponent {
      shadowMode = 'open';
      sourceConfig = { value: 42 };

      connectedCallback() {
        super.connectedCallback();
        // source should be available here
        expect(this.source).toBeDefined();
        expect(flowGet(this, 'value')).toBe(42);
      }
    }
    const name = tag();
    customElements.define(name, MyComp);

    const el = document.createElement(name);
    document.body.appendChild(el);
  });

  it('does not create a FlowState source when source is undefined', () => {
    class MyComp extends FlowStateComponent {
      shadowMode = 'open';
      template = '<p id="msg">hello</p>';
    }
    const name = tag();
    customElements.define(name, MyComp);

    const el = document.createElement(name);
    document.body.appendChild(el);

    expect(el.source).toBeUndefined();
    expect(el.__Flow__).toBeUndefined();
    expect(el.shadowRoot.querySelector('#msg')?.textContent).toBe('hello');
  });

  it('attaches a shadow root when shadowMode is set', () => {
    class MyComp extends FlowStateComponent {
      shadowMode = 'open';
      sourceConfig = {};
    }
    const name = tag();
    customElements.define(name, MyComp);

    const el = document.createElement(name);
    document.body.appendChild(el);

    expect(el.shadowRoot).not.toBeNull();
  });

  it('stamps the template into the shadow root', () => {
    class MyComp extends FlowStateComponent {
      shadowMode = 'open';
      template = '<p id="msg">hello</p>';
      sourceConfig = {};
    }
    const name = tag();
    customElements.define(name, MyComp);

    const el = document.createElement(name);
    document.body.appendChild(el);

    expect(el.shadowRoot.querySelector('#msg')).not.toBeNull();
    expect(el.shadowRoot.querySelector('#msg').textContent).toBe('hello');
  });

  it('source.update() and flowGet() work correctly', async () => {
    class MyComp extends FlowStateComponent {
      shadowMode = 'open';
      sourceConfig = { count: 0 };
    }
    const name = tag();
    customElements.define(name, MyComp);

    const el = document.createElement(name);
    document.body.appendChild(el);

    await el.source.update({ count: 5 });
    expect(flowGet(el, 'count')).toBe(5);
  });

  it('flowWatch() fires immediately with the current value', () => {
    class MyComp extends FlowStateComponent {
      shadowMode = 'open';
      sourceConfig = { label: 'hello' };
    }
    const name = tag();
    customElements.define(name, MyComp);

    const el = document.createElement(name);
    document.body.appendChild(el);

    const spy = vi.fn();
    flowWatch(el, 'label', spy);
    expect(spy).toHaveBeenCalledWith('hello');
  });

  it('does not reinitialize source when reconnected to the DOM', () => {
    class MyComp extends FlowStateComponent {
      shadowMode = 'open';
      sourceConfig = { count: 0 };
    }
    const name = tag();
    customElements.define(name, MyComp);

    const el = document.createElement(name);
    document.body.appendChild(el);

    const sourceRef = el.source;

    // Disconnect and reconnect
    el.remove();
    document.body.appendChild(el);

    // source reference should be the same object (no re-init)
    expect(el.source).toBe(sourceRef);
  });

  it('declarative bindings in the template are updated when source changes', async () => {
    class MyComp extends FlowStateComponent {
      shadowMode = 'open';
      template = '<span id="name-el" flow-watch-name-to-prop="textContent"></span>';
      sourceConfig = { name: 'Alice' };
    }
    const name = tag();
    customElements.define(name, MyComp);

    const el = document.createElement(name);
    document.body.appendChild(el);

    // Wait for initial binding flush
    await Promise.resolve();

    await el.source.update({ name: 'Bob' });
    expect(el.shadowRoot.querySelector('#name-el').textContent).toBe('Bob');
  });

  it('automatically unsubscribes flowWatch listeners on disconnect', async () => {
    class MyComp extends FlowStateComponent {
      shadowMode = 'open';
      sourceConfig = { count: 0 };
    }
    const name = tag();
    customElements.define(name, MyComp);

    const el = document.createElement(name);
    document.body.appendChild(el);

    const spy = vi.fn();
    flowWatch(el, 'count', spy);
    expect(spy).toHaveBeenCalledWith(0);
    spy.mockClear();

    // Invoke disconnect lifecycle to trigger FlowStateComponent cleanup.
    el.disconnectedCallback();

    await el.source.update({ count: 1 });

    expect(spy).not.toHaveBeenCalled();
  });

  it('does not auto-unsubscribe flowWatch listeners created by light DOM descendants while connected', async () => {
    class MyComp extends FlowStateComponent {
      sourceConfig = { count: 0 };
      template = '<span id="child"></span>';
    }
    const name = tag();
    customElements.define(name, MyComp);

    const el = document.createElement(name);
    document.body.appendChild(el);

    const child = el.querySelector('#child');
    const spy = vi.fn();
    flowWatch(child, 'count', spy);
    expect(spy).toHaveBeenCalledWith(0);
    spy.mockClear();

    await el.source.update({ count: 1 });

    expect(spy).toHaveBeenCalledWith(1);
  });

  it('auto-destroys its source scope on disconnect', async () => {
    class MyComp extends FlowStateComponent {
      sourceConfig = { count: 0 };
    }
    const name = tag();
    customElements.define(name, MyComp);

    const el = document.createElement(name);
    document.body.appendChild(el);

    expect(el.__Flow__).toBeDefined();

    el.remove();
    await Promise.resolve();

    expect(el.__Flow__).toBeUndefined();
  });
});
