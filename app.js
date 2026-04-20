import { FlowState as Flow } from './lib/FlowState.js';
import './components/work-space.js';
import './components/log-history.js';

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
const sheet = new CSSStyleSheet();
sheet.replaceSync(styles);


const template = document.createElement('template');
template.innerHTML = HTML`
  <work-space></work-space>
  <log-history></log-history>
`;


  
class TestApp extends HTMLElement {
  #state;

  constructor() {
    super();
    const shadow = this.attachShadow({ mode: 'closed' });
    shadow.appendChild(template.content.cloneNode(true));
    shadow.adoptedStyleSheets = [sheet];

    // README: have to use reference to the shadow DOM when
    // using closed mode so that FlowState can access it
    this.#state = Flow.create(this, {
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
          zip: '39507'
        }
      },

      items: [],

      itemCount: (state) => state.items.length,

      log: [],
    },
    {
      addItem: this.#addItemHook.bind(this),
      deleteItem: this.#deleteItemHook.bind(this),
      clearItems: this.#clearItems.bind(this)
    });

    this.#state.through(shadow);
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


// const sheet = new CSSStyleSheet();
// const template = document.createElement('template');

// await fetch(new URL('./app.html', import.meta.url))
//   .then(res => res.text())
//   .then(html => template.innerHTML = html);

// await fetch(new URL('./app.css', import.meta.url))
//   .then(res => res.text())
//   .then(css => sheet.replaceSync(css))

