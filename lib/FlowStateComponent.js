import { FlowState } from './FlowState.js';

export class FlowStateComponent extends HTMLElement {
  #flowConfig;
  #flowRoot;
  #state;

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
    // 1. Subclass field initializers (e.g. state = {...}, template, styles) have already run by now.
    // 2. This fires synchronously during element upgrade — AFTER any child elements that
    //    were imported earlier have already queued their FlowState.get/watch microtasks,
    //    so the listener is registered before those microtasks drain.
    if (this.#state) return;

    // Auto-attach shadow DOM if shadowMode is declared and no shadow root exists yet.
    if (!this.#flowRoot && (this.shadowMode === 'open' || this.shadowMode === 'closed')) {
      this.attachShadow({ mode: this.shadowMode });
    }

    if (this.styles) {
      const sheet = new CSSStyleSheet();
      sheet.replaceSync(this.styles);
      if (this.#flowRoot) this.#flowRoot.adoptedStyleSheets = [sheet];
    }

    // Initialize FlowState BEFORE stamping the template so that the event listener
    // is registered before any child connectedCallbacks fire and dispatch flow-state-get/watch events.
    this.#flowConfig = this.flowConfig ?? {};
    this.#state = new FlowState(this, this.#flowConfig);
    if (this.#flowRoot) this.#state.through(this.#flowRoot);

    // Stamp the template after FlowState is ready so children's connectedCallbacks
    // can synchronously resolve FlowState.get/watch calls.
    if (this.template) {
      const root = this.#flowRoot ?? this;
      const tempEl = document.createElement('template');
      tempEl.innerHTML = this.template;
      root.appendChild(tempEl.content.cloneNode(true));
    }
  }

  get state() {
    return this.#state;
  }
}