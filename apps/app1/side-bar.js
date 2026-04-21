import { FlowState as Flow } from '../../lib/FlowState.js';

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
  <div id="work-items-container"></div>
  <div class="section-label">Recent</div>
  <div id="work-history"></div>
`;

const sheet = new CSSStyleSheet();
sheet.replaceSync(styles);

class SideBar extends HTMLElement {
  #state;
  #selectWorkItem;
  #selectedWorkItem;
  #workItemsContainer;
  #workHistoryContainer;


  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.appendChild(template.content.cloneNode(true));
    this.shadowRoot.adoptedStyleSheets = [sheet];

    this.#workItemsContainer = this.shadowRoot.getElementById('work-items-container');
    this.#workHistoryContainer = this.shadowRoot.getElementById('work-history');

    Flow.get(this.shadowRoot, 'selectWorkItem', (fn) => this.#selectWorkItem = fn);

    Flow.watch(this.shadowRoot, 'selectedWorkItem', this.#workItemSelected.bind(this));

    Flow.watch(this.shadowRoot, 'workItems', this.#renderWorkItems.bind(this));

    this.#state = Flow.create(this.shadowRoot, {
      history: [],
    },
    undefined,
    {
      label: 'SideBar'
    });

    Flow.watch(this.shadowRoot, 'history', this.#renderWorkHistory.bind(this));
  }


  #renderWorkItems(workItems) {
    if (!workItems) {
      this.#workItemsContainer.innerHTML = '<div class="empty-state">No work items</div>';
      return;
    }
    this.#workItemsContainer.innerHTML = '';
    workItems.forEach((item) => {
      const div = document.createElement('div');
      div.setAttribute('data-work-item-id', item.id);
      div.classList.add('work-item');
      if (this.#selectedWorkItem && item.id === this.#selectedWorkItem.id) {
        div.classList.add('selected');
      }
      div.innerHTML = `
        <span class="work-item-avatar">${String(item.name).charAt(0).toUpperCase()}</span>
        <span class="work-item-name">${item.name}</span>
      `;
      div.addEventListener('click', () => this.#selectWorkItem(item));
      this.#workItemsContainer.appendChild(div);
    });
  }


  #workItemSelected(workItem) {
    this.#selectedWorkItem = workItem;
    if (workItem) {
      this.#state.update((prev) => {
        const newHistory = [workItem, ...prev.history.filter(item => item.id !== workItem.id)];
        return { history: newHistory };
      });
    }
    this.#visuallySelectWorkItem(workItem);
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

  #renderWorkHistory(history) {
    if (!history || history.length === 0) {
      this.#workHistoryContainer.innerHTML = '<div class="empty-state">None yet</div>';
      return;
    }
    this.#workHistoryContainer.innerHTML = '';
    history.forEach((item) => {
      const div = document.createElement('div');
      div.classList.add('work-item');
      div.setAttribute('data-work-item-id', item.id);
      div.innerHTML = `
        <span class="work-item-avatar">${String(item.name).charAt(0).toUpperCase()}</span>
        <span class="work-item-name">${item.name}</span>
      `;
      div.addEventListener('click', () => this.#selectWorkItem(item));
      this.#workHistoryContainer.appendChild(div);
    });
  }
}

customElements.define('side-bar', SideBar); 