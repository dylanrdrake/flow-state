import { FlowSource, flowGet, flowWatch } from '../../lib/FlowState.js';
const sheet = new CSSStyleSheet();
await sheet.replace(await fetch(new URL('./side-bar.css', import.meta.url)).then(r => r.text()));

const HTML = String.raw;

const template = document.createElement('template');
template.innerHTML = HTML`
  <div class="header">Work Items</div>
  <input id="filter-input" type="text" placeholder="Filter items…" />
  <div id="list" flow-list="filteredItems">
    <template>
      <div flow-class-to-prop="className" flow-id-to-attr="data-id">
        <span class="work-item-avatar" flow-initial-to-prop="textContent"></span>
        <span class="work-item-name" flow-name-to-prop="textContent"></span>
      </div>
    </template>
  </div>
`;

class SideBar extends HTMLElement {
  #source;
  #selectWorkItem;
  #watchUnsubs = [];

  #onFilterInput = (e) => {
    this.#source.update({ filter: e.target.value });
  };

  #onListClick = (e) => {
    const el = e.target.closest('[data-id]');
    if (!el) return;
    const item = flowGet(this, 'items').find(i => i.id === +el.dataset.id);
    if (item) this.#selectWorkItem(item);
  };

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.adoptedStyleSheets = [sheet];
    this.shadowRoot.appendChild(template.content.cloneNode(true));

    // Create local FlowState for filter before children connect
    this.#source = new FlowSource(this, {
      filter: '',
      filteredItems: []
    });
  }

  connectedCallback() {
    this.#selectWorkItem = flowGet(this, 'selectItem');

    this.#watchUnsubs = [
      flowWatch(this, 'items', items => {
        this.#updateFilteredItems(items, flowGet(this, 'filter'), flowGet(this, 'selectedItem'));
      }),
      flowWatch(this, 'selectedItem', selected => {
        this.#updateFilteredItems(flowGet(this, 'items'), flowGet(this, 'filter'), selected);
      }),
      flowWatch(this, 'filter', filter => { // Could also use static flowWatch(this, 'filter', ...)
        this.#updateFilteredItems(flowGet(this, 'items'), filter, flowGet(this, 'selectedItem'));
      })
    ];

    this.shadowRoot.getElementById('filter-input').addEventListener('input', this.#onFilterInput);
    this.shadowRoot.getElementById('list').addEventListener('click', this.#onListClick);
  }

  disconnectedCallback() {
    this.#watchUnsubs.forEach(unsub => unsub?.());
    this.#source?.destroy();
    this.shadowRoot.getElementById('filter-input').removeEventListener('input', this.#onFilterInput);
    this.shadowRoot.getElementById('list').removeEventListener('click', this.#onListClick);
  }

  #updateFilteredItems(items, filter, selected) {
    const f = (filter ?? '').toLowerCase();
    const filtered = f ? items.filter(i => i.name.toLowerCase().includes(f)) : items;
    this.#source.update({
      filteredItems: filtered.map(i => ({
        ...i,
        class: `work-item${i.id === selected?.id ? ' selected' : ''}`
      }))
    });
  }
}

customElements.define('side-bar', SideBar);
