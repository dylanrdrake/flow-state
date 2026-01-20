import { NodeState } from '../lib/NodeState.js';

export class NodeStateComponent extends HTMLElement {
  #state = {};
  
  constructor() {
    super();
    this.#state = new NodeState(this, this.#state);
  }
}