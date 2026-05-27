import { FlowState as Flow } from '../../lib/FlowState.js';
const sheet = new CSSStyleSheet();
await sheet.replace(await fetch(new URL('./side-bar.css', import.meta.url)).then(r => r.text()));

const HTML = String.raw;

const template = document.createElement('template');
template.innerHTML = HTML`
  <div class="header">Work Items</div>
  <input id="filter-input" type="text" placeholder="Filter items…" />
  <div id="list" flow-list="filteredItems">
    <template>
      <div flow-item-to-prop="itemClass:className" flow-item-to-attr="id:data-id">
        <span class="work-item-avatar" flow-item-to-prop="initial:textContent"></span>
        <span class="work-item-name" flow-item-to-prop="name:textContent"></span>
      </div>
    </template>
  </div>
`;

class SideBar extends HTMLElement {
  #state;
  #selectWorkItem;
  #list;

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.adoptedStyleSheets = [sheet];
    this.shadowRoot.appendChild(template.content.cloneNode(true));
    this.#list = this.shadowRoot.getElementById('list');

    // Create local FlowState for filter before children connect
    this.#state = Flow.create(this, {
      filter: '',
      filteredItems: []
    });
  }

  connectedCallback() {
    this.#selectWorkItem = Flow.get(this, 'selectItem');

    Flow.watch(this, 'items', items => {
      this.#updateFilteredItems(items, this.#state.get('filter'), Flow.get(this, 'selectedItem'));
    });

    Flow.watch(this, 'selectedItem', selected => {
      this.#updateFilteredItems(Flow.get(this, 'items'), this.#state.get('filter'), selected);
    });

    this.#state.watch('filter', filter => { // Could also use static Flow.watch(this, 'filter', ...)
      this.#updateFilteredItems(Flow.get(this, 'items'), filter, Flow.get(this, 'selectedItem'));
    });

    this.shadowRoot.getElementById('filter-input').addEventListener('input', e => {
      this.#state.update({ filter: e.target.value });
    });

    this.#list.addEventListener('click', e => {
      const el = e.target.closest('[data-id]');
      if (!el) return;
      const item = Flow.get(this, 'items').find(i => i.id === +el.dataset.id);
      if (item) this.#selectWorkItem(item);
    });
  }

  #updateFilteredItems(items, filter, selected) {
    const f = (filter ?? '').toLowerCase();
    const filtered = f ? items.filter(i => i.name.toLowerCase().includes(f)) : items;
    this.#state.update({
      filteredItems: filtered.map(i => ({
        ...i,
        itemClass: `work-item${i.id === selected?.id ? ' selected' : ''}`
      }))
    });
  }
}

customElements.define('side-bar', SideBar);
