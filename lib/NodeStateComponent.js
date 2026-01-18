import { NodeState, deepWatch } from '../lib/NodeState.js';

class NodeStateComponent extends HTMLElement {
  #state = {};
  
  constructor() {
    super();
    this._NodeState = new NodeState(this.shadowRoot, this.#state);
    // this.#state = deepWatch(this.#state, (key, value) => {
    //   this._NodeState.update();
    // });
  }
}