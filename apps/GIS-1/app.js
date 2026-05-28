import { FlowSource, flowGet, flowWatch, flowThrough, flowCompute, startFlowDevtools } from '../../lib/FlowState.js';
import './work-space.js';

startFlowDevtools();


const CSS = String.raw;
const HTML = String.raw;


const appCSS = CSS`
  :host {
    display: block;
    height: 100vh;
  }

  :host work-space {
    height: 100%;
  }
`;
const appSheet = new CSSStyleSheet();
appSheet.replaceSync(appCSS);


const appTemplate = document.createElement('template');
appTemplate.innerHTML = HTML`
  <work-space></work-space>
`;


class GIS1 extends HTMLElement {
  #source;
  #shadow;

  constructor() {
    super();
    this.#shadow = this.attachShadow({ mode: 'closed' });
    this.#shadow.adoptedStyleSheets = [appSheet];
  }

  async connectedCallback() {
    if (this.#source) return;

    const config = await fetch(new URL('./config.json', import.meta.url)).then(r => r.json());

    // Initialize FlowState BEFORE stamping the template so the listener
    // is registered before child connectedCallbacks fire and dispatch flow-state-get/watch events.
    this.#source = new FlowSource(this, config);

    // Allow declarative bindings inside the closed shadow to receive updates
    flowThrough(this.#shadow);

    this.#shadow.appendChild(appTemplate.content.cloneNode(true));
  }
}

customElements.define('app-1', GIS1);

