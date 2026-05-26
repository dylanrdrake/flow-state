import { FlowState as Flow } from '../../lib/FlowState.js';
import './side-bar.js';
import './item-editor.js';

const HTML = String.raw;

const template = document.createElement('template');
template.innerHTML = HTML`
  <link rel="stylesheet" href="./app.css">
  <div id="side-bar-container">
    <side-bar></side-bar>
  </div>
  <item-editor></item-editor>
`;

class ItemEditorApp extends HTMLElement {
  #state;

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  async connectedCallback() {
    if (this.#state) return;

    const config = await fetch(new URL('./config.json', import.meta.url)).then(r => r.json());
    const items = config.items.map(item => ({
      ...item,
      initial: item.name.charAt(0).toUpperCase()
    }));

    // Initialize FlowState BEFORE stamping the template so the listener
    // is registered before child connectedCallbacks fire and dispatch flow-state-get/watch events.
    this.#state = new Flow(this, {
      init: {
        items,
        selectedItem: null
      },
      hooks: {
        selectItem:    this.#selectWorkItem.bind(this),
        saveWorkItem:  this.#saveWorkItem.bind(this)
      },
      options: { label: 'ItemEditorApp' }
    });

    this.shadowRoot.appendChild(template.content.cloneNode(true));
  }

  #selectWorkItem(workItem) {
    this.#state.update({ selectedItem: workItem });
  }

  #saveWorkItem(edits) {
    this.#state.update(state => ({
      items: state.items.map(i =>
        i.id === state.selectedItem.id ? { ...i, ...edits } : i
      ),
      selectedItem: { ...state.selectedItem, ...edits }
    }));
  }
}

customElements.define('item-editor-app', ItemEditorApp);
