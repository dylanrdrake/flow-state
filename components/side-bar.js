import { FlowState as Flow } from '../lib/FlowState.js';


const CSS = String.raw;
const HTML = String.raw;


const styles = CSS`
  :host {
  }
`;
const sheet = new CSSStyleSheet();
sheet.replaceSync(styles);


const template = document.createElement('template');
template.innerHTML = HTML`
  <button id="add-btn">Add</button>
  <button id="clear-btn">Clear</button>
  <div flow-bind-itemCount-to-prop="innerHTML"></div>
`;


class SideBar extends HTMLElement {
  #addBtn;
  #clearBtn;

  constructor() {
    super();

    const shadow = this.attachShadow({ mode: 'closed' });

    shadow.appendChild(template.content.cloneNode(true));
    shadow.adoptedStyleSheets = [sheet];

    this.#addBtn = shadow.getElementById('add-btn');
    this.#clearBtn = shadow.getElementById('clear-btn');

    Flow.through(shadow);

    Flow.get(shadow, 'clearItems').then(clearItems => {
      this.#clearBtn.addEventListener('click', clearItems);
    });

    Flow.get(shadow, 'addItem').then(addItem => {
      this.#addBtn.addEventListener('click', addItem);
    });

    this.observer = new MutationObserver((muts) => {
      console.log('mutation observed in side-bar', muts);
    })
    this.observer.observe(shadow, {
      childList: true,
      subtree: true,
      attributes: true,
    });
  }

  disconnectedCallback() {
     this.observer.disconnect();
  }
}

window.customElements.define('side-bar', SideBar);