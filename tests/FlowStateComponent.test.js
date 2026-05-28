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
      source = { value: 42 };

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

  it('attaches a shadow root when shadowMode is set', () => {
    class MyComp extends FlowStateComponent {
      shadowMode = 'open';
      source = {};
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
      source = {};
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
      source = { count: 0 };
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
      source = { label: 'hello' };
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
      source = { count: 0 };
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
      source = { name: 'Alice' };
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
});
