import { FlowState as Flow } from '../lib/FlowState.js';
import { WorkItem } from '../components/work-item.js';


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
  }
`

const template = document.createElement('template');
template.innerHTML = HTML``;

const sheet = new CSSStyleSheet();
sheet.replaceSync(styles);


class WorkView extends HTMLElement {
  #deleteItem;
 
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.appendChild(template.content.cloneNode(true));
    this.shadowRoot.adoptedStyleSheets = [sheet];

    Flow.get(this.shadowRoot, 'deleteItem').then(deleteItem => {
      this.#deleteItem = deleteItem;
    });

    Flow.watch(this, 'items', (items) => {
      let itemEls = items.map(item => {
        let el = new WorkItem({
          id: item.id
        });
        el.addEventListener('click', this.#deleteItem.bind(this, item.id));
        return el;
      });
      this.shadowRoot.replaceChildren(...itemEls.reverse());
    });

    this.observer = new MutationObserver((muts) => {
      console.log('mutation observed in work-view', muts);
    })
    this.observer.observe(this.shadowRoot, {
      childList: true,
      subtree: true,
      attributes: true,
    });
   }

   disconnectedCallback() {
     this.observer.disconnect();
  }
}

window.customElements.define('work-view', WorkView);