import { FlowSource, flowThrough } from './FlowState.js';

/** @typedef {import('../types/index.d.ts').FlowStateComponent<any>} FlowStateComponentDecl */
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
    // 1. Subclass field initializers (e.g. sourceConfig = {...}, template, styles) have already run by now.
    // 2. This fires synchronously during element upgrade — AFTER any child elements that
    //    were imported earlier have already queued their FlowState.get/watch microtasks,
    //    so the listener is registered before those microtasks drain.
    if (this.#source) return;

    // Members a subclass declares (`sourceConfig`, `styles`, `template`, `shadowMode`) are
    // read through this typed view. Declaring them as fields on the base class would create
    // own properties that shadow a subclass's prototype getters.
    const decl = /** @type {FlowStateComponentDecl} */ (/** @type {unknown} */ (this));

    // Auto-attach shadow DOM if shadowMode is declared and no shadow root exists yet.
    if (!this.#shadowRoot && (decl.shadowMode === 'open' || decl.shadowMode === 'closed')) {
      this.attachShadow({ mode: decl.shadowMode });
    }

    if (decl.styles) {
      if (this.#shadowRoot) {
        const sheet = new CSSStyleSheet();
        sheet.replaceSync(decl.styles);
        this.#shadowRoot.adoptedStyleSheets = [sheet];
      } else {
        // Light DOM: inject once per tag name into document head
        const tag = this.tagName.toLowerCase();
        const styleId = `--flow-style-${tag}`;
        if (!document.getElementById(styleId)) {
          const style = document.createElement('style');
          style.id = styleId;
          style.textContent = decl.styles;
          document.head.appendChild(style);
        }
      }
    }

    if (Object.hasOwn(this, 'source')) {
      // Legacy shape: the config used to be declared as `source = { ... }`. An own property
      // shadows the prototype getter, so drop it — `source` always reads back as the instance.
      console.warn(
        `${this.tagName.toLowerCase()}: declaring \`source = { ... }\` is no longer supported. ` +
        'Rename the field to `sourceConfig`; `source` now holds the FlowSource instance.'
      );
      delete (/** @type {any} */ (this)).source;
    }

    if (decl.sourceConfig && typeof decl.sourceConfig === 'object') {
      // Initialize FlowState BEFORE stamping the template so that the event listener
      // is registered before any child connectedCallbacks fire and dispatch flow-state-get/watch events.
      this.#source = new FlowSource(this, decl.sourceConfig);
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
    if (decl.template) {
      const root = this.#shadowRoot ?? this;
      const tempEl = document.createElement('template');
      tempEl.innerHTML = decl.template;
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