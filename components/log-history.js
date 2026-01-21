import { NodeState as N$ } from '../lib/NodeState.js';


const CSS = String.raw;
const HTML = String.raw;

const styles = CSS`
  :host {
    overflow: auto;
  }
`

const html = HTML`
`;

const sheet = new CSSStyleSheet();
sheet.replaceSync(styles);
const template = document.createElement('template');
template.innerHTML = html;


class LogHistory extends HTMLElement {
 
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.appendChild(template.content.cloneNode(true));
    this.shadowRoot.adoptedStyleSheets = [sheet];

    N$.watch(this, 'log', (logEntries) => {
      let logEls = logEntries.map(entry => {
        let el = document.createElement('div');
        el.textContent = `${entry.user.name} ${entry.message}`;
        return el;
      });
      this.shadowRoot.replaceChildren(...logEls);
    });
  }

}

window.customElements.define('log-history', LogHistory);