import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { FlowStateComponent } from '../lib/FlowStateComponent.js';

// Each test registers a uniquely named custom element to avoid
// "already defined" errors across tests.
let counter = 0;
const tag = () => `test-component-${counter++}`;

describe('FlowStateComponent', () => {
  afterEach(() => document.body.innerHTML = '');

  it('Creates a FlowState instance in this.state after connectedCallback', () => {
    class MyComp extends FlowStateComponent {
      shadowMode = 'open';
      state = { value: 42 };

      connectedCallback() {
        super.connectedCallback();
        // state should be available here
        expect(this.state).toBeDefined();
        expect(this.state.get('value')).toBe(42);
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
      state = {};
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
      state = {};
    }
    const name = tag();
    customElements.define(name, MyComp);

    const el = document.createElement(name);
    document.body.appendChild(el);

    expect(el.shadowRoot.querySelector('#msg')).not.toBeNull();
    expect(el.shadowRoot.querySelector('#msg').textContent).toBe('hello');
  });

  it('state.update() and state.get() work correctly', async () => {
    class MyComp extends FlowStateComponent {
      shadowMode = 'open';
      state = { count: 0 };
    }
    const name = tag();
    customElements.define(name, MyComp);

    const el = document.createElement(name);
    document.body.appendChild(el);

    await el.state.update({ count: 5 });
    expect(el.state.get('count')).toBe(5);
  });

  it('state.watch() fires immediately with the current value', () => {
    class MyComp extends FlowStateComponent {
      shadowMode = 'open';
      state = { label: 'hello' };
    }
    const name = tag();
    customElements.define(name, MyComp);

    const el = document.createElement(name);
    document.body.appendChild(el);

    const spy = vi.fn();
    el.state.watch('label', spy);
    expect(spy).toHaveBeenCalledWith('hello');
  });

  it('does not reinitialize state when reconnected to the DOM', () => {
    class MyComp extends FlowStateComponent {
      shadowMode = 'open';
      state = { count: 0 };
    }
    const name = tag();
    customElements.define(name, MyComp);

    const el = document.createElement(name);
    document.body.appendChild(el);

    const stateRef = el.state;

    // Disconnect and reconnect
    el.remove();
    document.body.appendChild(el);

    // state reference should be the same object (no re-init)
    expect(el.state).toBe(stateRef);
  });

  it('declarative bindings in the template are updated when state changes', async () => {
    class MyComp extends FlowStateComponent {
      shadowMode = 'open';
      template = '<span id="name-el" flow-watch-name-to-prop="textContent"></span>';
      state = { name: 'Alice' };
    }
    const name = tag();
    customElements.define(name, MyComp);

    const el = document.createElement(name);
    document.body.appendChild(el);

    // Wait for initial binding flush
    await Promise.resolve();

    await el.state.update({ name: 'Bob' });
    expect(el.shadowRoot.querySelector('#name-el').textContent).toBe('Bob');
  });
});
