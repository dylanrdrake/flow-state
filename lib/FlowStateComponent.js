import { FlowSource, flowThrough } from './FlowState.js';
export class FlowStateComponent extends HTMLElement {
  #shadowRoot;
  #source;
  #watchUnsubs = new Set();
  #watchTrackerBound = false;
  #onFlowWatch = (e) => {
    const { unsub, sourceElement } = e.detail || {};
    if (typeof unsub !== 'function') return;
    if (!this.#isOwnedSourceElement(sourceElement)) return;
    this.#watchUnsubs.add(unsub);
  };

  constructor() {
    super();

    // Capture both open and closed shadow roots created by subclasses.
    const originalAttachShadow = this.attachShadow.bind(this);
    this.attachShadow = (init) => {
      const root = originalAttachShadow(init);
      this.#shadowRoot = root;
      return root;
    };
  }

  connectedCallback() {
    // Initialize here rather than in the constructor so that:
    // 1. Subclass field initializers (e.g. source = {...}, template, styles) have already run by now.
    // 2. This fires synchronously during element upgrade — AFTER any child elements that
    //    were imported earlier have already queued their FlowState.get/watch microtasks,
    //    so the listener is registered before those microtasks drain.
    if (this.#source) return;

    // Auto-attach shadow DOM if shadowMode is declared and no shadow root exists yet.
    if (!this.#shadowRoot && (this.shadowMode === 'open' || this.shadowMode === 'closed')) {
      this.attachShadow({ mode: this.shadowMode });
    }

    if (this.styles) {
      if (this.#shadowRoot) {
        const sheet = new CSSStyleSheet();
        sheet.replaceSync(this.styles);
        this.#shadowRoot.adoptedStyleSheets = [sheet];
      } else {
        // Light DOM: inject once per tag name into document head
        const tag = this.tagName.toLowerCase();
        const styleId = `--flow-style-${tag}`;
        if (!document.getElementById(styleId)) {
          const style = document.createElement('style');
          style.id = styleId;
          style.textContent = this.styles;
          document.head.appendChild(style);
        }
      }
    }

    if (Object.hasOwn(this, 'source') && typeof this.source === 'object') {
      // Initialize FlowState BEFORE stamping the template so that the event listener
      // is registered before any child connectedCallbacks fire and dispatch flow-state-get/watch events.
      // Read the subclass's `source = { ... }` field (own property), then delete it so
      // the prototype getter `get source()` becomes visible and returns the source instance.
      this.#source = new FlowSource(this, this.source);
      delete this.source;
    }

    if (this.#shadowRoot) flowThrough(this.#shadowRoot);

    if (!this.#watchTrackerBound) {
      // Track flowWatch subscriptions created from this component host and/or ShadowRoot.
      // FlowState sets detail.unsub during the same event dispatch.
      this.addEventListener('flow-state-watch', this.#onFlowWatch);
      this.#watchTrackerBound = true;
    }

    // Stamp the template after FlowState is ready so children's connectedCallbacks
    // can synchronously resolve FlowState.get/watch calls.
    if (this.template) {
      const root = this.#shadowRoot ?? this;
      const tempEl = document.createElement('template');
      tempEl.innerHTML = this.template;
      root.appendChild(tempEl.content.cloneNode(true));
    }
  }

  disconnectedCallback() {
    // Auto-clean all owned flowWatch subscriptions.
    for (const unsub of this.#watchUnsubs) {
      try {
        unsub();
      } catch {
        // Ignore unsubscribe errors so one bad callback does not block cleanup.
      }
    }
    this.#watchUnsubs.clear();

    // Also teardown this component's own FlowState scope.
    this.#source?.destroy();
  }

  #isOwnedSourceElement(sourceElement) {
    if (!(sourceElement instanceof Node)) return false;
    if (sourceElement === this) return true;
    if (sourceElement === this.#shadowRoot) return true;
    return false;
  }

  get source() {
    return this.#source;
  }
}