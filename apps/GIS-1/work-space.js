import { FlowState as Flow } from '../../lib/FlowState.js';
import './side-bar.js';
import './work-view.js';

const CSS = String.raw;
const HTML = String.raw;

const styles = CSS`
  :host {
    display: flex;
    flex-direction: row;
    height: 100%;
    background: #fafafa;
    font-family: 'Inter', 'Roboto', system-ui, sans-serif;
  }
  :host #divider {
    width: 4px;
    flex-shrink: 0;
    background: transparent;
    cursor: col-resize;
    transition: background 0.15s;
    position: relative;
    z-index: 1;
  }
  :host #divider:hover {
    background: #1976d2;
  }
  :host #side-bar-container {
    width: 280px;
    flex-shrink: 0;
    overflow-x: hidden;
    background: #fff;
    border-right: 1px solid #e0e0e0;
    display: flex;
    flex-direction: column;
  }
  :host side-bar {
    flex: 1;
  }
  :host work-view {
    flex: 1;
    overflow: hidden;
  }
`

const template = document.createElement('template');
template.innerHTML = HTML`
  <div id="side-bar-container">
    <side-bar></side-bar>
  </div>
  <div id="divider"></div>
  <work-view></work-view>
`;

const sheet = new CSSStyleSheet();
sheet.replaceSync(styles);


class Workspace extends HTMLElement {
  #state;
  minWidth = 10;

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.adoptedStyleSheets = [sheet];
    this.isDragging = false;
  }

  connectedCallback() {
    if (this.#state) return;

    const workItems = Flow.get(this, 'config.workItems').map(item => ({
      ...item,
      initial: item.name.charAt(0).toUpperCase()
    }));

    // Initialize FlowState BEFORE stamping the template so the listener
    // is registered before child connectedCallbacks fire and dispatch flow-state-get/watch events.
    this.#state = new Flow(this, {
      init: {
        workItems,
        selectedWorkItem: null
      },
      hooks: {
        selectWorkItem: this.#selectWorkItemHook.bind(this),
        saveWorkItem: this.#saveWorkItem.bind(this)
      },
      options: {
        label: 'Workspace'
      }
    });

    this.shadowRoot.appendChild(template.content.cloneNode(true));

    this.divider = this.shadowRoot.getElementById('divider');
    this.sideBarContainer = this.shadowRoot.getElementById('side-bar-container');
    this.workView = this.shadowRoot.querySelector('work-view');

    this.divider.addEventListener('mousedown', this.#onMouseDown.bind(this));
    document.addEventListener('mousemove', this.#onMouseMove.bind(this));
    document.addEventListener('mouseup', this.#onMouseUp.bind(this));
  }

  #onMouseDown(e) {
    this.isDragging = true;
    this.divider.classList.add('dragging');
    e.preventDefault();
  }

  #onMouseMove(e) {
    if (!this.isDragging) return;
    
    const containerRect = this.getBoundingClientRect();
    const maxWidth = containerRect.width - 150;
    
    if (e.clientX >= this.minWidth && e.clientX <= maxWidth) {
      this.sideBarContainer.style.width = `${e.clientX}px`;
    }
  }

  #onMouseUp() {
    this.isDragging = false;
    this.divider.classList.remove('dragging');
  }

  #selectWorkItemHook(workItem) {
    this.#state.update({ selectedWorkItem: workItem });
    this.workView.selectedWorkItem = workItem;
  }

  #saveWorkItem(edits) {
    this.#state.update((state) => {
      let updatedItem = { ...state.selectedWorkItem, ...edits };
      const updatedWorkItems = state.workItems.map(item => {
        if (item.id === state.selectedWorkItem.id) {
          return updatedItem;
        }
        return item;
      });
      return {
        workItems: updatedWorkItems,
        selectedWorkItem: updatedItem
      };
    });
  }

}

window.customElements.define('work-space', Workspace);