import { NodeState as N$ } from '../lib/NodeState.js';

const [ CSS, HTML ] = String.raw;


export class NodeStateComponent extends HTMLElement {
  #root;
  #state;
  
  constructor(htmlStr, cssStr, shadowDOMConfig = undefined, stateConfig = undefined) {
    super();
    const template = document.createElement('template');
    template.innerHTML = htmlStr;
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(cssStr);

    if (shadowDOMConfig) {
      this.#root = this.attachShadow(shadowDOMConfig);
    } else {
      this.#root = this;
    }

    this.#root.adoptedStyleSheets = [sheet];
    this.#root.appendChild(template.content.cloneNode(true));

    if (stateConfig) {
      this.#state = N$.create(this.#root, stateConfig)
    }
  }
}