import { FlowState as Flow } from '../lib/FlowState.js';
import { LogEntry } from './log-entry.js';


const CSS = String.raw;
const HTML = String.raw;

const styles = CSS`
  :host {
    overflow: auto;
  }
`

const template = document.createElement('template');
template.innerHTML = HTML``;


const sheet = new CSSStyleSheet();
sheet.replaceSync(styles);


class LogHistory extends HTMLElement {
 
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.appendChild(template.content.cloneNode(true));
    this.shadowRoot.adoptedStyleSheets = [sheet];

    Flow.watch(this, 'log', (logEntries) => {
      let logEls = logEntries.map(entry => new LogEntry(entry));
      this.shadowRoot.replaceChildren(...logEls);
    });
  }

}

window.customElements.define('log-history', LogHistory);