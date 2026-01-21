import { NodeState as N$ } from '../lib/NodeState.js';


const CSS = String.raw;
const HTML = String.raw;

const styles = CSS`
  :host {
    display: flex;
    flex-direction: row;
    flex-wrap: wrap;
    gap: 1vh;
    align-content: flex-start;
    overflow-y: auto;

    & .item-box {
      height: 50px;
      width: 50px;
      background-color: steelblue;
      font-size: 14px;
      color: white;
      word-wrap: break-word;
      &:hover {
        filter: brightness(75%);
        cursor: pointer;
      }
    }
  }
`

const html = HTML``;

const sheet = new CSSStyleSheet();
sheet.replaceSync(styles);
const template = document.createElement('template');
template.innerHTML = html;


class WorkView extends HTMLElement {
  #deleteItem;
 
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.appendChild(template.content.cloneNode(true));
    this.shadowRoot.adoptedStyleSheets = [sheet];

    N$.get(this.shadowRoot, 'hooks.deleteItem').then(deleteItem => {
      this.#deleteItem = deleteItem;
    });

    N$.watch(this, 'items', (items) => {
      let itemEls = items.map(item => {
        let el = document.createElement('div');
        el.className = 'item-box';
        el.innerHTML = item.id;
        el.addEventListener('click', this.#deleteItem.bind(this, item.id));
        return el;
      });
      this.shadowRoot.replaceChildren(...itemEls.reverse());
    });
  }

}

window.customElements.define('work-view', WorkView);