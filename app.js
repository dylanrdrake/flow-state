import { NodeState } from './lib/NodeState.js';
import './components/name-input/name-input.js';
import './components/greeting-display/greeting-display.js';
import './components/char-counter/char-counter.js';
import './components/name-history/name-history.js';

// // const millionNumbers = Array.from({ length: 1000000 }, (_, i) => i + 1);

// await fetch(new URL('./app.html', import.meta.url))
//   .then(res => res.text())
//   .then(html => template.innerHTML = html);

// await fetch(new URL('./app.css', import.meta.url))
//   .then(res => res.text())
//   .then(css => sheet.replaceSync(css))


export const CSS = String.raw;
export const HTML = String.raw;

const styles = CSS`
  :host {
    background-color: gainsboro;
    display: flex;
    flex-direction: column;

    & name-history {
      max-height: 200px;
      overflow-y: scroll;
    }
  }
`

const html = HTML`
  <greeting-display></greeting-display>

  <name-input></name-input>

  <char-counter></char-counter>

  <name-history></name-history>
`;

const sheet = new CSSStyleSheet();
sheet.replaceSync(styles);
const template = document.createElement('template');
template.innerHTML = html;


class TestApp extends HTMLElement {
  #state;
  #stateConfig = {
    config: {
      logUpdates: false
    },

    user: {
      name: 'World',
      id: 123,
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
  };

  constructor() {
    super();
    let shadow = this.attachShadow({ mode: 'closed' });
    shadow.adoptedStyleSheets = [sheet];
    shadow.appendChild(template.content.cloneNode(true));

    // README: have to use reference to the shadow DOM when
    // using closed mode so that NodeState can access it
    this.#state = NodeState.create(shadow, this.#stateConfig);

    NodeState.watch(shadow, 'user', (user) => {
      console.log('App detected user change:', user);
    });

    this.#state.update({
      user: {
        name: 'Alice',
        id: 456
      }
    });

    NodeState.watch(shadow, 'user', (user) => {
      console.log('App detected user change after update:', user);
    });

    NodeState.get(shadow, 'user')
      .then(user => {
        console.log('App got user via get():', user);
      });
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