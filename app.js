import { NodeState as N$ } from './lib/NodeState.js';
import './components/work-space.js';
import './components/log-history.js';

// const sheet = new CSSStyleSheet();
// const template = document.createElement('template');

// await fetch(new URL('./app.html', import.meta.url))
//   .then(res => res.text())
//   .then(html => template.innerHTML = html);

// await fetch(new URL('./app.css', import.meta.url))
//   .then(res => res.text())
//   .then(css => sheet.replaceSync(css))


const CSS = String.raw;
const HTML = String.raw;

const styles = CSS`
  :host {
    background-color: gainsboro;
    display: flex;
    flex-direction: column;
    width: 100%;
    height: 100%;

    & work-space {
      flex-grow: 1;
      max-height: 75%;
    }

    & log-history {
      border-top: 2px solid gray;
      min-height: 25%;
      max-height: 25%;
    }
  }
`

const html = HTML`
  <work-space></work-space>
  <log-history></log-history>
`;

const sheet = new CSSStyleSheet();
sheet.replaceSync(styles);
const template = document.createElement('template');
template.innerHTML = html;


class TestApp extends HTMLElement {
  #state;

  constructor() {
    super();
    this.shadow = this.attachShadow({ mode: 'closed' });
    this.shadow.adoptedStyleSheets = [sheet];
    this.shadow.appendChild(template.content.cloneNode(true));

      // README: have to use reference to the shadow DOM when
    // using closed mode so that NodeState can access it
    this.#state = N$.create(this.shadow, {
      config: {
        logUpdates: false
      },

      user: {
        name: 'Dylan',
        id: 123,
        address: {
          street: '123 Main St',
          city: 'Anytown',
          state: 'CA',
          country: 'USA',
          zip: '12345'
        }
      },

      items: [],

      itemCount: (state) => state.items.length,

      log: [],

      hooks: {
        addItem: this.#addItemHook.bind(this),
        deleteItem: this.#deleteItemHook.bind(this),
        clearItems: this.#clearItems.bind(this)
      }
    })
  }

  #addItemHook = () => {
    this.#state.update(prev => {
      let id = Date.now();
      let newItem = {
        id: id,
        name: `Item: ${id}`,
        createdAt: new Date().toISOString()
      };
      return {
        user: { id: Date.now() },
        items: [
          ...prev.items,
          newItem
        ],
        log: [
          {
            user: prev.user,
            message: `ADDED ${newItem.name} at ${newItem.createdAt}`
          },
          ...prev.log
        ]
      }
    });
  }

  #deleteItemHook = (itemId) => {
    this.#state.update(prev => ({
      items: prev.items.filter(item => item.id !== itemId),
      log: [
        {
          user: prev.user,
          message: `DELETED item ${itemId} at ${new Date().toISOString()}`
        },
        ...prev.log
      ]
    }));
  }

  #clearItems = () => {
    this.#state.update(prev => ({
      items: [],
      log: [
        {
          user: prev.user,
          message: `CLEARED all items at ${new Date().toISOString()}`
        },
        ...prev.log
      ]
    }));
  }

}

customElements.define('test-app', TestApp);