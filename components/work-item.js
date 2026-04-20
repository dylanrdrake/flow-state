import { FlowState as Flow } from '../lib/FlowState.js';


const CSS = String.raw;
const HTML = String.raw;

const styles = CSS`
  :host {
    height: 50px;
    width: 50px;
    background-color: steelblue;
    font-size: 14px;
    color: white;
    word-wrap: break-word;
  }
  :host:hover {
    filter: brightness(75%);
    cursor: pointer;
  }
`


const sheet = new CSSStyleSheet();
sheet.replaceSync(styles);


export class WorkItem extends HTMLElement {
 
  constructor(item) {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.adoptedStyleSheets = [sheet];
    this.shadowRoot.innerHTML = item.id;
  }
}

window.customElements.define('work-item', WorkItem);
 