import { NodeState } from './lib/NodeState.js';
import './components/name-input/name-input.js';
import './components/greeting-display/greeting-display.js';
import './components/char-counter/char-counter.js';
import './components/name-history/name-history.js';

const sheet = new CSSStyleSheet();
const template = document.createElement('template');

// const millionNumbers = Array.from({ length: 1000000 }, (_, i) => i + 1);

await fetch(new URL('./app.html', import.meta.url))
  .then(res => res.text())
  .then(html => template.innerHTML = html);

await fetch(new URL('./app.css', import.meta.url))
  .then(res => res.text())
  .then(css => sheet.replaceSync(css))


class TestApp extends HTMLElement {
  #state;
  #testPerfBtn;

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.adoptedStyleSheets = [sheet];
    this.shadowRoot.appendChild(template.content.cloneNode(true));

    this.#testPerfBtn = this.shadowRoot.getElementById('test-perf-btn');

    // README: always pass the same root where the template content is rendered
    // if using shadow DOM pass the shadow DOM root, if using the light DOM pass 'this'
    this.#state = new NodeState(this.shadowRoot, {
      user: {
        name: 'World',
        id: '123',
        address: {
          street: '123 Main St',
          city: 'Anytown',
          state: 'CA',
          country: 'USA',
          zip: '12345'
        }
      },

      changeHistory: [],

      nameCharCount: (state) => state.user.name.length,

      hooks: {
        setName: this.#nameChangeHook.bind(this),
        reset: this.#resetHook.bind(this)
      }
    });

    // README: watching from the light DOM node if NodeState is attached to shadow DOM doesn't work
    NodeState.watch(this, 'user.name', (newName) => {
      console.log(`using "this": ${newName}`);
    });
    // Can static watch from shadowRoot
    NodeState.watch(this.shadowRoot, 'user.name', (newName) => {
      console.log(`using "this.shadowRoot": ${newName}`);
    });
    // Should be watching directly on this.#state instead
  }


  #nameChangeHook(newName) {
    const timestamp = new Date().toLocaleString();

    this.#state.update((prev) => ({
      user: {
        name: newName,
        id: Date.now().toString()
      },
      changeHistory: [
        ...prev.changeHistory,
        {
          username: newName,
          timestamp: timestamp
        }
      ]
    }));
  }


  #resetHook() {
    this.#state.update({
      user: {
        name: ''
      },
      changeHistory: []
    });
  }
}

customElements.define('test-app', TestApp);