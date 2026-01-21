import { NodeState as N$ } from '../lib/NodeState.js';
import './side-bar.js';
import './work-view.js';


const CSS = String.raw;
const HTML = String.raw;

const styles = CSS`
  :host {
    display: flex;
    flex-direction: row;

    & side-bar {
      border-right: 2px solid gray;
      min-width: 30%;
    }

    & work-view {
      flex-grow: 1;
    }
  }
`

const html = HTML`
  <side-bar></side-bar>
  <work-view></work-view>
`;

const sheet = new CSSStyleSheet();
sheet.replaceSync(styles);
const template = document.createElement('template');
template.innerHTML = html;


class Workspace extends HTMLElement {
 
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.appendChild(template.content.cloneNode(true));
    this.shadowRoot.adoptedStyleSheets = [sheet];
  }

}

window.customElements.define('work-space', Workspace);