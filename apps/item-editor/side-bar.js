import { FlowState as Flow } from '../../lib/FlowState.js';
const sheet = new CSSStyleSheet();
await sheet.replace(await fetch(new URL('./side-bar.css', import.meta.url)).then(r => r.text()));

const HTML = String.raw;

const template = document.createElement('template');
template.innerHTML = HTML`
  <div class="header">Work Items</div>
  <input id="filter-input" type="text" placeholder="Filter items…" />
  <div id="list"></div>
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
      init: { filter: '' },
      options: { label: 'SideBar' }
    });
  }

  connectedCallback() {
    this.#selectWorkItem = Flow.get(this, 'selectItem');

    Flow.watch(this, 'items', () => {
      this.#render();
    });

    Flow.watch(this, 'selectedItem', item => {
      this.#renderSelection(item?.id ?? null);
    });

    // Local state — re-render list when filter changes
    this.#state.watch('filter', () => this.#render());

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

  #render() {
    const filter = this.#state.get('filter').toLowerCase();
    const items = Flow.get(this, 'items');
    const selectedId = Flow.get(this, 'selectedItem')?.id ?? null;
    const filtered = filter
      ? items.filter(i => i.name.toLowerCase().includes(filter))
      : items;

    if (!filtered.length) {
      this.#list.innerHTML = `<div class="empty-state">No items match.</div>`;
      return;
    }

    this.#list.innerHTML = filtered.map(item => `
      <div class="work-item${item.id === selectedId ? ' selected' : ''}" data-id="${item.id}">
        <span class="work-item-avatar">${item.initial}</span>
        <span class="work-item-name">${item.name}</span>
      </div>
    `).join('');
  }

  #renderSelection(id) {
    this.#list.querySelectorAll('.work-item').forEach(el => {
      el.classList.toggle('selected', +el.dataset.id === id);
    });
  }
}

customElements.define('side-bar', SideBar);
