import { FlowSource, flowGet, flowWatch, flowCompute } from '../../lib/FlowState.js';

const CSS = String.raw;
const HTML = String.raw;

const styles = CSS`
  :host {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow-y: auto;
    font-family: 'Inter', 'Roboto', system-ui, sans-serif;
  }

  .section-label {
    padding: 20px 16px 8px;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: #9e9e9e;
    flex-shrink: 0;
  }

  #work-items-container {
    flex: 1;
    padding: 4px 0;
    border-bottom: 1px solid #f0f0f0;
  }

  #work-history {
    padding: 4px 0 12px;
  }

  .work-item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 9px 16px;
    cursor: pointer;
    font-size: 14px;
    color: #212121;
    transition: background 0.1s;
    border-left: 3px solid transparent;
    user-select: none;
  }

  .work-item:hover {
    background: #f5f5f5;
  }

  .work-item.selected {
    background: #e3f2fd;
    border-left-color: #1976d2;
    color: #1565c0;
    font-weight: 500;
  }

  .work-item-avatar {
    width: 26px;
    height: 26px;
    border-radius: 50%;
    background: #eeeeee;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 11px;
    font-weight: 600;
    color: #757575;
    flex-shrink: 0;
  }

  .work-item.selected .work-item-avatar {
    background: #bbdefb;
    color: #1565c0;
  }

  .work-item-name {
    flex: 1;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .empty-state {
    padding: 16px;
    font-size: 13px;
    color: #bdbdbd;
  }
`;

const template = document.createElement('template');
template.innerHTML = HTML`
  <div class="section-label">Work Items</div>
  <div id="work-items-container" flow-ul="workItems">
    <template>
      <div class="work-item" flow-li-id-to-attr="data-work-item-id">
        <span class="work-item-avatar" flow-li-initial-to-prop="textContent"></span>
        <span class="work-item-name" flow-li-name-to-prop="textContent"></span>
      </div>
    </template>
  </div>
  <template flow-if="hasHistory">
    <section id="recent-section">
      <div class="section-label">Recent</div>
      <div id="work-history" flow-ul="history">
        <template>
          <div class="work-item" flow-li-id-to-attr="data-work-item-id">
            <span class="work-item-avatar" flow-li-initial-to-prop="textContent"></span>
            <span class="work-item-name" flow-li-name-to-prop="textContent"></span>
          </div>
        </template>
      </div>
    </section>
    <section id="recent-empty">
      <div class="section-label">Recent</div>
      <div class="empty-state">No recently viewed items yet.</div>
    </section>
  </template>
`;

const sheet = new CSSStyleSheet();
sheet.replaceSync(styles);

class SideBar extends HTMLElement {
  #source;
  #selectWorkItem;
  #selectedWorkItem;
  #workItemsContainer;
  #selectedItemUnsub = () => {};


  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    const shadowRoot = this.shadowRoot;
    shadowRoot.appendChild(template.content.cloneNode(true));
    shadowRoot.adoptedStyleSheets = [sheet];

    this.#workItemsContainer = shadowRoot.getElementById('work-items-container');
    shadowRoot.addEventListener('click', this.#onItemClick);

    this.#source = new FlowSource(this, {
      history: [],
      hasHistory: flowCompute((history) => history.length > 0, ['history']),
    });
  }

  connectedCallback() {
    this.#selectWorkItem = flowGet(this, 'selectWorkItem');
    this.#selectedItemUnsub = flowWatch(this, 'selectedWorkItem', this.#workItemSelected.bind(this));
  }

  disconnectedCallback() {
    this.#selectedItemUnsub();
    this.#source?.destroy();
  }


  #onItemClick = (e) => {
    const el = e.target.closest('[data-work-item-id]');
    if (!el) return;
    const id = parseInt(el.getAttribute('data-work-item-id'));
    const workItem = flowGet(this, 'workItems')?.find(w => w.id === id);
    if (workItem) this.#selectWorkItem(workItem);
  };


  #workItemSelected(workItem) {
    this.#selectedWorkItem = workItem;
    if (workItem) {
      this.#source.update((prev) => {
        const newHistory = [workItem, ...prev.history.filter(item => item.id !== workItem.id)];
        return { history: newHistory };
      });
    }
    // Defer visual update so flow-ul bindings have already re-rendered
    queueMicrotask(() => this.#visuallySelectWorkItem(workItem));
  }


  #visuallySelectWorkItem(workItem) {
    const workItemElements = this.#workItemsContainer.querySelectorAll('.work-item');
    workItemElements.forEach((el) => {
      const workItemId = parseInt(el.getAttribute('data-work-item-id'));
      if (workItem && workItemId === workItem.id) {
        el.classList.add('selected');
      } else {
        el.classList.remove('selected');
      }
    });
  }

}

customElements.define('side-bar', SideBar); 