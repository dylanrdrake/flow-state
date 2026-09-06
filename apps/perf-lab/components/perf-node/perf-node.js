import { FlowStateComponent } from '../../../../lib/FlowStateComponent.js';
import { registerNode, unregisterNode } from '../../registry.js';
import '../perf-leaf/perf-leaf.js';

const loadText = async (relativePath) => {
  const response = await fetch(new URL(relativePath, import.meta.url));
  if (!response.ok) throw new Error(`Failed to load ${relativePath}: ${response.status}`);
  return response.text();
};

const [styles, template] = await Promise.all([
  loadText('./perf-node.css'),
  loadText('./perf-node.html'),
]);

/**
 * A branch in the source tree. Every instance owns its own FlowSource, so a tree
 * of depth D and branching B mounts (B + B^2 + ... + B^D) nested sources.
 *
 * Reads its shape from attributes rather than constructor arguments, because the
 * element is created with document.createElement() before any of it is known.
 */
class PerfNode extends FlowStateComponent {
  styles = styles;
  template = template;

  #depth = 0;
  #initialized = false;

  connectedCallback() {
    // Attributes are readable here but not in the field initializers above, which run
    // during createElement(). sourceConfig and shadowMode must both be set before
    // super.connectedCallback() reads them.
    this.#depth = Number(this.getAttribute('depth') ?? 0);
    const path = this.getAttribute('path') ?? '0';
    const shadowed = this.hasAttribute('shadow-key');

    if (this.hasAttribute('use-shadow')) this.shadowMode = 'open';

    // The tree root always owns `broadcast`, so the fan-out binding pass is scoped to the
    // tree instead of to the lab shell around it. `shadow-key` gives a mid-tree node its
    // own copy, which is what the key-shadowing scenario measures.
    const ownsBroadcast = shadowed || this.#depth === 0;

    this.sourceConfig = {
      depthLabel: `d${this.#depth}`,
      nodeLabel: path,
      localTick: 0,
      status: 'idle',
      ...(ownsBroadcast ? { broadcast: 0 } : {}),
    };

    super.connectedCallback();

    if (this.#initialized) return;
    this.#initialized = true;

    registerNode(this.#depth, this);
    this.#buildChildren();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    unregisterNode(this.#depth, this);
    this.#initialized = false;
  }

  #buildChildren() {
    const maxDepth = Number(this.getAttribute('max-depth') ?? 0);
    const branch = Number(this.getAttribute('branch') ?? 0);
    if (this.#depth >= maxDepth) return;

    const host = (this.shadowRoot ?? this).querySelector('#kids');
    if (!host) return;

    const childDepth = this.#depth + 1;
    const isLeafLevel = childDepth === maxDepth;
    const path = this.getAttribute('path') ?? '0';
    const fragment = document.createDocumentFragment();

    for (let i = 0; i < branch; i++) {
      const el = document.createElement(isLeafLevel ? 'perf-leaf' : 'perf-node');
      el.setAttribute('depth', String(childDepth));
      el.setAttribute('path', `${path}.${i}`);
      if (!isLeafLevel) {
        el.setAttribute('max-depth', String(maxDepth));
        el.setAttribute('branch', String(branch));
      }
      this.#inherit(el, 'use-shadow');
      if (this.hasAttribute('shadow-at') && Number(this.getAttribute('shadow-at')) === childDepth) {
        el.setAttribute('shadow-key', '');
      }
      this.#inherit(el, 'shadow-at');
      fragment.appendChild(el);
    }

    host.appendChild(fragment);
  }

  #inherit(el, attr) {
    if (this.hasAttribute(attr)) el.setAttribute(attr, this.getAttribute(attr));
  }
}

customElements.define('perf-node', PerfNode);
