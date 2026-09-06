import { FlowStateComponent } from '../../../../lib/FlowStateComponent.js';
import { flowWatch } from '../../../../lib/FlowState.js';
import { registerNode, unregisterNode } from '../../registry.js';

const loadText = async (relativePath) => {
  const response = await fetch(new URL(relativePath, import.meta.url));
  if (!response.ok) throw new Error(`Failed to load ${relativePath}: ${response.status}`);
  return response.text();
};

const [styles, template] = await Promise.all([
  loadText('./perf-leaf.css'),
  loadText('./perf-leaf.html'),
]);

/**
 * A leaf of the source tree. Owns a source of its own, and subscribes to a
 * root-owned key with flowWatch — which is the other half of the fan-out cost:
 * template bindings are resolved by querying the DOM from the source root, while
 * flowWatch subscriptions live in the source's watcher map. This component
 * exercises both against the same update.
 */
class PerfLeaf extends FlowStateComponent {
  styles = styles;
  template = template;

  #depth = 0;
  #initialized = false;
  #echoEl = null;
  #unwatch = null;

  connectedCallback() {
    this.#depth = Number(this.getAttribute('depth') ?? 0);
    const path = this.getAttribute('path') ?? '0';

    if (this.hasAttribute('use-shadow')) this.shadowMode = 'open';

    this.sourceConfig = {
      leafPath: path,
      localValue: 0,
      hot: false,
      barStyle: 'width: 0%',
    };

    super.connectedCallback();

    if (this.#initialized) return;
    this.#initialized = true;

    registerNode(this.#depth, this);

    // Light DOM host or shadow root — only querySelector exists on both.
    this.#echoEl = (this.shadowRoot ?? this).querySelector('#echo');

    // Resolves through every ancestor source up to whichever one owns `broadcast`.
    this.#unwatch = flowWatch(this, 'broadcast', (value) => {
      if (this.#echoEl) this.#echoEl.textContent = String(value ?? '–');
    });
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.#unwatch?.();
    this.#unwatch = null;
    unregisterNode(this.#depth, this);
    this.#initialized = false;
  }

  /** Update this leaf's own source. Returns the flush promise. */
  bump(n) {
    return this.source.update({
      localValue: n,
      hot: n % 2 === 0,
      barStyle: `width: ${n % 100}%`,
    });
  }
}

customElements.define('perf-leaf', PerfLeaf);
