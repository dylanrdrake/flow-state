import { createFlowFrom, flowThrough } from './FlowState.js';

/**
 * FlowStateComponent
 *
 * Note: If your component will be removed permanently, call `this.state?.destroy()`
 * from `disconnectedCallback()` to free watchers and unregister the instance from
 * FlowState's devtools registry. We intentionally do not auto-destroy on detach,
 * because some apps reattach elements and recreating state may be undesirable.
 *
 * Example:
 * disconnectedCallback() {
 *   this.state?.destroy();
 * }
 */
export class FlowStateComponent extends HTMLElement {
  #shadowRoot;
  #state;

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
    // 1. Subclass field initializers (e.g. state = {...}, template, styles) have already run by now.
    // 2. This fires synchronously during element upgrade — AFTER any child elements that
    //    were imported earlier have already queued their FlowState.get/watch microtasks,
    //    so the listener is registered before those microtasks drain.
    if (this.#state) return;

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

    // Initialize FlowState BEFORE stamping the template so that the event listener
    // is registered before any child connectedCallbacks fire and dispatch flow-state-get/watch events.
    // Read the subclass's `state = { ... }` field (own property), then delete it so
    // the prototype getter `get state()` becomes visible and returns the FlowState instance.
    const config = Object.hasOwn(this, 'state') ? this.state : {};
    this.#state = createFlowFrom(this, config);
    delete this.state;
    if (this.#shadowRoot) flowThrough(this.#shadowRoot);

    // Stamp the template after FlowState is ready so children's connectedCallbacks
    // can synchronously resolve FlowState.get/watch calls.
    if (this.template) {
      const root = this.#shadowRoot ?? this;
      const tempEl = document.createElement('template');
      tempEl.innerHTML = this.template;
      root.appendChild(tempEl.content.cloneNode(true));
    }
  }

  get state() {
    return this.#state;
  }
}