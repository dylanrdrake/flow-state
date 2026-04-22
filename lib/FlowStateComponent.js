import { FlowState } from './FlowState.js';

export class FlowStateComponent extends HTMLElement {
  #flowConfig;
  #flowRoot;
  #flow;

  constructor() {
    super();

    // Capture both open and closed shadow roots created by subclasses.
    const originalAttachShadow = this.attachShadow.bind(this);
    this.attachShadow = (init) => {
      const root = originalAttachShadow(init);
      this.#flowRoot = root;
      return root;
    };
  }

  connectedCallback() {
    // Initialize here rather than in the constructor so that:
    // 1. Subclass field initializers (e.g. flowConfig = {...}) have already run by now.
    // 2. This fires synchronously during element upgrade — AFTER any child elements that
    //    were imported earlier have already queued their FlowState.get/watch microtasks,
    //    so the listener is registered before those microtasks drain.
    if (this.#flow) return;
    this.#flowConfig = this.flowConfig ?? {};
    this.#flow = new FlowState(this, this.#flowConfig);
    if (this.#flowRoot) this.#flow.through(this.#flowRoot);
  }

  get Flow() {
    return this.#flow;
  }
}