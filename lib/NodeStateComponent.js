import { FlowState } from '../lib/FlowState.js';


export class FlowComponent extends HTMLElement {
  #root;
  #state;
  
  constructor() {
    super();
  }
}