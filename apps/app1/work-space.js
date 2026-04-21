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
    this.shadowRoot.appendChild(template.content.cloneNode(true));
    this.shadowRoot.adoptedStyleSheets = [sheet];

    this.divider = this.shadowRoot.getElementById('divider');
    this.sideBarContainer = this.shadowRoot.getElementById('side-bar-container');
    this.workView = this.shadowRoot.querySelector('work-view');
    this.isDragging = false;
    
    this.divider.addEventListener('mousedown', this.#onMouseDown.bind(this));
    document.addEventListener('mousemove', this.#onMouseMove.bind(this));
    document.addEventListener('mouseup', this.#onMouseUp.bind(this));

    this.#state = new Flow(this.shadowRoot, {
      workItems: null,
      selectedWorkItem: null
    }, {
      selectWorkItem: this.#selectWorkItemHook.bind(this),
      saveWorkItem: this.#saveWorkItem.bind(this)
    }, {
      label: 'Workspace'
    });

    this.#state.update({
      workItems: [
        { id: 1,  name: 'Seattle Waterfront',       longitude: -122.3321, latitude: 47.6062  },
        { id: 2,  name: 'Portland Transit Hub',      longitude: -122.6765, latitude: 45.5051  },
        { id: 3,  name: 'San Francisco Bay Area',    longitude: -122.4194, latitude: 37.7749  },
        { id: 4,  name: 'Los Angeles Metro',         longitude: -118.2437, latitude: 34.0522  },
        { id: 5,  name: 'Phoenix Urban Core',        longitude: -112.0740, latitude: 33.4484  },
        { id: 6,  name: 'Denver Highlands',          longitude: -104.9903, latitude: 39.7392  },
        { id: 7,  name: 'Dallas Corridor',           longitude:  -96.7970, latitude: 32.7767  },
        { id: 8,  name: 'Minneapolis Riverfront',    longitude:  -93.2650, latitude: 44.9778  },
        { id: 9,  name: 'Chicago Lakefront',         longitude:  -87.6298, latitude: 41.8781  },
        { id: 10, name: 'Nashville Midtown',         longitude:  -86.7816, latitude: 36.1627  },
        { id: 11, name: 'Atlanta Beltline',          longitude:  -84.3880, latitude: 33.7490  },
        { id: 12, name: 'Miami Brickell',            longitude:  -80.1918, latitude: 25.7617  },
        { id: 13, name: 'Charlotte Uptown',          longitude:  -80.8431, latitude: 35.2271  },
        { id: 14, name: 'Washington DC Capitol',     longitude:  -77.0369, latitude: 38.9072  },
        { id: 15, name: 'New York Hudson Yards',     longitude:  -74.0060, latitude: 40.7128  },
        { id: 16, name: 'Boston Seaport',            longitude:  -71.0589, latitude: 42.3601  },
      ]
    });
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