import { FlowState as Flow } from '../../lib/FlowState.js';
import GraphicsLayer from '@arcgis/core/layers/GraphicsLayer.js';
import Graphic from '@arcgis/core/Graphic.js';
import Point from '@arcgis/core/geometry/Point.js';
import SimpleMarkerSymbol from '@arcgis/core/symbols/SimpleMarkerSymbol.js';
import TextSymbol from '@arcgis/core/symbols/TextSymbol.js';

const CSS = String.raw;
const HTML = String.raw;

const styles = CSS`
  :host {
    display: flex;
    flex-direction: column;
    height: 100%;
    font-family: 'Inter', 'Roboto', system-ui, sans-serif;
    background: #fafafa;
  }

  #work-view {
    flex: 1;
    display: flex;
    flex-direction: column;
    padding: 32px 40px;
    overflow-y: auto;
  }

  #no-selected-item-msg {
    margin: auto;
    color: #bdbdbd;
    font-size: 15px;
    text-align: center;
  }

  #editor {
    background: #fff;
    border: 1px solid #e0e0e0;
    border-radius: 8px;
    padding: 28px 32px;
    max-width: 600px;
    width: 100%;
    box-shadow: 0 1px 3px rgba(0,0,0,0.06);
  }

  #editor-fields {
    display: flex;
    flex-direction: column;
    gap: 16px;
    margin-bottom: 24px;
  }

  #editor-fields label {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 12px;
    font-weight: 500;
    color: #757575;
    text-transform: capitalize;
    letter-spacing: 0.03em;
  }

  #editor-fields input {
    padding: 10px 14px;
    border: 1px solid #e0e0e0;
    border-radius: 6px;
    font-size: 14px;
    font-family: inherit;
    color: #212121;
    background: #fafafa;
    outline: none;
    transition: border-color 0.15s, box-shadow 0.15s;
  }

  #editor-fields input:focus {
    border-color: #1976d2;
    background: #fff;
    box-shadow: 0 0 0 3px rgba(25,118,210,0.1);
  }

  #editor-fields input:disabled {
    color: #9e9e9e;
    background: #f5f5f5;
    cursor: not-allowed;
  }

  .action-row {
    display: flex;
    gap: 10px;
    justify-content: flex-end;
  }

  button {
    padding: 9px 20px;
    border-radius: 6px;
    font-size: 14px;
    font-weight: 500;
    font-family: inherit;
    cursor: pointer;
    border: none;
    transition: background 0.15s, box-shadow 0.15s;
  }

  #save-btn {
    background: #1976d2;
    color: #fff;
  }

  #save-btn:hover {
    background: #1565c0;
    box-shadow: 0 2px 6px rgba(25,118,210,0.3);
  }

  #close-btn {
    background: #f5f5f5;
    color: #424242;
  }

  #close-btn:hover {
    background: #eeeeee;
  }

  #map-container {
    width: 100%;
    height: 60vh;
    border-radius: 8px;
    overflow: hidden;
    margin-bottom: 24px;
    border: 1px solid #e0e0e0;
  }

  arcgis-map {
    width: 100%;
    height: 100%;
  }
`;

const noSelectedItemMsg = 'No work item selected...';

const template = document.createElement('template');
template.innerHTML = HTML`
  <div id="work-view">
    <div id="map-container">
      <arcgis-map item-id="dd4b2f25487d4a37a45093ba6acd026d" basemap="topo-vector" center="-118.244,34.052" zoom="12">
        <arcgis-zoom position="top-left"></arcgis-zoom>
      </arcgis-map>
    </div>
    <div id="no-selected-item-msg">Select a work item to view details</div>
    <div id="editor" hidden>
      <div id="editor-fields"></div>
      <div class="action-row">
        <button id="close-btn">Discard</button>
        <button id="save-btn">Save</button>
      </div>
    </div>
  </div>
`;

const sheet = new CSSStyleSheet();
sheet.replaceSync(styles);

class WorkView extends HTMLElement {
  #state;
  #workView;
  #noItemMsg;
  #editor;
  #editorFields;
  #saveBtn;
  #closeBtn;
  #saveWorkItem;
  #selectWorkItem;
  #map;
  #graphicsLayer;

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.appendChild(template.content.cloneNode(true));
    this.shadowRoot.adoptedStyleSheets = [sheet];

    this.#workView = this.shadowRoot.getElementById('work-view');
    this.#noItemMsg = this.shadowRoot.getElementById('no-selected-item-msg');
    this.#editor = this.shadowRoot.getElementById('editor');
    this.#editorFields = this.shadowRoot.getElementById('editor-fields');
    this.#saveBtn = this.shadowRoot.getElementById('save-btn');
    this.#closeBtn = this.shadowRoot.getElementById('close-btn');
    this.#map = this.shadowRoot.querySelector('arcgis-map');

    this.#graphicsLayer = new GraphicsLayer();
    this.#map.addEventListener('arcgisViewReadyChange', () => {
      this.#map.view.map.add(this.#graphicsLayer);
    });

    Flow.get(this.shadowRoot, 'saveWorkItem', (fn) => this.#saveWorkItem = fn);
    Flow.get(this.shadowRoot, 'selectWorkItem', (fn) => this.#selectWorkItem = fn);
    Flow.watch(this.shadowRoot, 'workItems', this.#workItemsUpdated.bind(this));
    Flow.watch(this.shadowRoot, 'selectedWorkItem', (workItem) => {
      if (workItem) {
        this.#map.view.goTo({ center: [workItem.longitude, workItem.latitude], zoom: 14 });
      }
    });

    this.#state = Flow.create(this.shadowRoot, {
      edits: null
    },
    undefined,
    {
      label: 'WorkView'
    });

    this.#saveBtn.addEventListener('click', () => {
      if (this.#saveWorkItem) {
        const edits = this.#state.get('edits');
        this.#saveWorkItem(edits);
      }
    });

    this.#closeBtn.addEventListener('click', () => {
      this.selectedWorkItem = null;
      this.#state.update({ edits: {} });
      this.#selectWorkItem(null);
    });
  }


  set selectedWorkItem(workItem) {
    this.#state.update({ edits: workItem || {} });
    this.#editorFields.innerHTML = ''; // clear previous inputs

    if (!workItem) {
      this.#noItemMsg.style.display = 'block';
      this.#editor.style.display = 'none';
      return;
    }

    this.#noItemMsg.style.display = 'none';
    this.#editor.style.display = 'block';
    // build inputs 
    Object.entries(workItem).forEach(([key, value]) => {
      const input = this.#createFormInput(key, value);
      this.#editorFields.appendChild(input);
    });
  }


  #createFormInput(key, value) {
    const label = document.createElement('label');
    label.textContent = key.replace(/([A-Z])/g, ' $1').replace(/_/g, ' ');

    let input = document.createElement('input');
    if (key === 'id') {
      input.setAttribute('disabled', '');
      input.setAttribute('readonly', '');
    }
    switch (typeof value) {
      case 'number':
        input.type = 'number';
        break;
      case 'string':
        input.type = 'text';
        break;
      default:
        console.warn('Unsupported field type for key', key);
    }
    input.value = value;
    input.addEventListener('input', (e) => {
      let val = e.target.value;
      switch (typeof value) {
        case 'number':
          val = parseFloat(val);
          if (isNaN(val)) val = 0;
          break;
        case 'string':
          // no need to transform
          break;
        default:
          console.warn('Unsupported field type for key', key);
      }
      this.#state.update((state) => {
        state.edits[key] = val;
        return state;
      });
    });
    label.appendChild(input);
    return label;
  }

  
  #workItemsUpdated(workItems) {
    if (!workItems?.length) return;
    this.#graphicsLayer.removeAll();
    const symbol = new SimpleMarkerSymbol({
      color: [25, 118, 210],
      outline: { color: [255, 255, 255], width: 1.5 },
      size: 10,
    });
    const graphics = workItems.flatMap((item) => {
      const point = new Point({ longitude: item.longitude, latitude: item.latitude });
      return [
        new Graphic({
          geometry: point,
          symbol,
          attributes: { ...item },
        }),
        new Graphic({
          geometry: point,
          symbol: new TextSymbol({
            text: item.name,
            color: [25, 118, 210],
            haloColor: [255, 255, 255],
            haloSize: 2,
            font: { size: 11, family: 'Inter, sans-serif', weight: 'bold' },
            yoffset: 10,
          }),
        }),
      ];
    });
    this.#graphicsLayer.addMany(graphics);
  }

}

customElements.define('work-view', WorkView);