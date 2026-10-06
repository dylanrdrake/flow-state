/** @typedef {import('../types/index.d.ts').Snapshot} Snapshot */

const FLOW_COMPUTE = Symbol('FlowState.compute');
let FLOW_DEV_MODE = false;
let FLOW_DEV_CHANNEL = null;
/** @type {Map<string, { root: Node, state: FlowState, getSnapshot: () => Snapshot }>} */
const FLOW_REGISTRY = new Map();        // id -> { root, state, getSnapshot }
const FLOW_SOURCE_EL_REGISTRY = new Map(); // id -> WeakRef<Element> for non-FlowState source elements
const FLOW_SOURCE_EL_IDS = new WeakMap();  // Element -> id (stable ID per element)
const FLOW_SOURCE_EL_FINALIZER = new FinalizationRegistry((id) => {
  FLOW_SOURCE_EL_REGISTRY.delete(id);
});
const FLOW_DEV_THROTTLE_MS = 100; // 10fps max

/**
 * @typedef {{ source: FlowState | null, reachable: boolean }} FlowScope
 *   The nearest source above a node, and whether that source's bindings flow down to it.
 * @typedef {{ owner: FlowState, keys: string[] }} FlowBinding
 *   The source that indexes an element, and the index entries the element is listed under.
 * @typedef {{
 *   get: (node: Node, key: string) => any,
 *   watch: (node: Node, key: string, callback: (value: any) => void) => (() => void) | undefined,
 *   through: (shadowRoot: ShadowRoot) => void,
 * }} FlowInternals
 */

// Source tree and binding index (see the "Source tree" section of the class).
/** @type {WeakMap<Node, FlowState>} */
const FLOW_ROOTS = new WeakMap();        // root Node -> FlowState mounted on it
/** @type {WeakMap<Element, FlowBinding>} */
const FLOW_BINDINGS = new WeakMap();     // bound Element -> the source that indexes it
/** @type {WeakSet<ShadowRoot>} */
const FLOW_THROUGH = new WeakSet();      // shadow roots registered with flowThrough()
/** @type {WeakMap<Element, ShadowRoot>} */
const FLOW_CLOSED_ROOTS = new WeakMap(); // host Element -> its closed ShadowRoot, once known
/** @type {WeakSet<Node>} */
const FLOW_OBSERVED = new WeakSet();     // nodes FLOW_OBSERVER already watches
/** @type {WeakRef<Node>[]} */
let FLOW_OBSERVED_NODES = [];            // the same nodes, listable, to observe them again
let FLOW_OBSERVED_PRUNE_AT = 1024;       // list length at which dead entries are dropped
/** @type {Map<string, WeakRef<Element>[]>} */
const FLOW_UNDEFINED = new Map();        // tag name -> elements waiting on customElements.define
/** @type {Set<string>} */
const FLOW_ATTRIBUTES = new Set(['flow-if', 'flow-ul']); // binding attributes the observer reports
/** @type {MutationObserverInit} */
let FLOW_OBSERVE_OPTIONS = { childList: true, subtree: true, attributeFilter: [...FLOW_ATTRIBUTES] };
/** @type {WeakMap<Node, (unsub: () => void) => void>} */
const FLOW_WATCH_TRACKERS = new WeakMap(); // node -> told about each flowWatch() made from it
/** @type {MutationObserver | null} */
let FLOW_OBSERVER = null;                // one MutationObserver for every source
/** @type {FlowInternals} */
let FLOW_INTERNALS;                      // private operations the functional helpers call

class FlowState {
  #root;
  #actions = {};
  #values = {};
  #computed = {};
  #computedKeys = [];
  #computedDeps = new Map();
  #watchers = new Map();
  #flowThroughs = new Map();
  #ifRenderedNodes = new WeakMap(); // template-anchor -> rendered nodes
  /** @type {FlowState | null} */
  #parent = null;         // nearest source above this one
  /** @type {Set<FlowState>} */
  #children = new Set();  // sources whose nearest source is this one
  #reachable = false;     // whether #parent's bindings flow into this source's subtree
  /** @type {Set<string>} */
  #watchedKeys = new Set(); // keys whose binding attributes the observer already reports
  /** @type {Map<string, Set<Element>>} */
  #index = new Map();     // 'prop:<dash-key>' | 'attr:<dash-key>' | 'if:<key>' | 'ul:<key>' -> elements
  #pendingUpdates = [];
  #flushScheduled = false;

  //
  // Devtools
  #id = crypto.randomUUID();
  #label = null;

  #devBroadcastPending = false;
  #devLastBroadcast = 0;
  #destroyed = false;
  #destroyQueued = false;
  // Devtools
  //

  // flowGet, flowWatch and flowThrough are plain functions. This hands them the private
  // operations they need without putting statics on the public class.
  static {
    FLOW_INTERNALS = {
      get(node, key) {
        const owner = FlowState.#resolve(node, key);
        return owner ? owner.#get(key) : undefined;
      },
      watch(node, key, callback) {
        const owner = FlowState.#resolve(node, key);
        return owner ? owner.#watch(key, callback, node) : undefined;
      },
      through(shadowRoot) {
        FlowState.#sync();
        FlowState.#linkThrough(shadowRoot);
        // Every source above records the link, as each one that heard the event used to.
        let flow = FLOW_ROOTS.get(shadowRoot) ?? FlowState.#scopeOf(shadowRoot).source;
        for (; flow; flow = flow.#parent) flow.#flowThroughs.set(shadowRoot, flow);
      },
    };
  }

  constructor(root, config = {}) {
    // Check: 1
    // Check if a FlowState instance is already mounted on this root
    if (root.__Flow__) {
      throw Error("A FlowState instance is already mounted on this root element! Multiple FlowState instances cannot share the same root.");
    }

    // Check: 2
    if (!(root instanceof Node)) {
      throw Error("State constructor requires the root element to be a DOM Node!");
    }

    // Check: 3
    // if (root instanceof ShadowRoot) {
    //   throw Error('FlowState must be mounted on a light DOM element, not a ShadowRoot. FlowState will flow through open shadowDOMs automatically. Use flowThrough() to propagate bindings into closed shadow DOM.');
    // }

    // Auto-detect label from class name (custom elements) or tag name
    const cn = root.constructor?.name;
    this.#label = (cn && !/^HTML\w*Element$/.test(cn))
      ? cn
      : (root instanceof Element ? root.tagName.toLowerCase() : null);

    this.#root = root;

    // Parse flat config: top-level functions -> actions, flowCompute() wrappers -> computed, rest -> state values
    const actions = {};
    const computedEntries = [];
    const valueEntries = [];

    for (const [k, v] of Object.entries(config ?? {})) {
      if (v?.[FLOW_COMPUTE] === true) {
        computedEntries.push([k, v.fn, v.deps]);  // explicit compute() wrapper
      } else if (typeof v === 'function') {
        actions[k] = v;                           // top-level functions are actions
      } else {
        valueEntries.push([k, v]);
      }
    }

    this.#actions = actions;

    // Set initial instance state values
    FlowState.#setNested(this.#values, Object.fromEntries(valueEntries));

    // Guarantee immutability of state values to prevent accidental mutations outside of update method
    FlowState.#deepFreeze(this.#values);

    // Computed
    this.#computedKeys = computedEntries.map(([k]) => k);
    this.#computed = Object.fromEntries(computedEntries.map(([k, fn]) => [k, fn]));
    // Use explicit deps provided by compute(fn, deps)
    for (const [key, , deps] of computedEntries) {
      this.#computedDeps.set(key, deps);
    }
    this.#assertAcyclicComputedGraph();

    // Expose limited 'hasKey', 'flowThroughs' API on root el
    Object.defineProperty(this.#root, '__Flow__', {
      value: {
        hasKey: this.#isConfiguredKey.bind(this),
        flowThroughs: this.#flowThroughs,
        // ready: this.ready
      },
      writable: false,
      enumerable: true,
      configurable: true
    });

    // Join the source tree and index the bindings already under this root.
    FlowState.#mount(this);

    // Construct and return instance API
    const instanceApi = {};

    Object.defineProperties(instanceApi, {
      update: {
        value: (update) => this.#queueUpdate(update, true),
        writable: false,
        enumerable: true,
        configurable: false
      },
      destroy: {
        value: () => this.#destroy(),
        writable: false,
        enumerable: true,
        configurable: false
      }
    });

    // Register with devtools
    FLOW_REGISTRY.set(this.#id, { root: this.#root, state: this, getSnapshot: () => this.#buildSnapshot() });

    // Update bindings but defer 1 microtask.
    // NEEDED. Wait for children to initialize
    // and register their watchers and bindings before
    // notifying of initial state, otherwise they will
    // miss the initial value and only get updates after that.
    Promise.resolve().then(() => {
      this.#update({ detail: this.#values });
      if (FLOW_DEV_MODE) {
        this.#broadcastSnapshot(); // Wake up an already connected devtools panel if there is one
      }
    });

    // The public surface is the frozen facade, not the class instance. TypeScript pins
    // `new C()` to the instance type, so this is declared as a constructor type instead —
    // see `FlowSource` in types/index.d.ts.
    // @ts-expect-error - intentional: constructor returns { update, destroy }
    return instanceApi;
  }


  #queueUpdate(update, notifyWatchers) {
    // Resolve functional updates synchronously so closures capture mutable values
    // (e.g. e.target.value) at call time rather than at flush time.
    const resolved = typeof update === 'function'
      ? update(structuredClone(this.#values))
      : update;

    if (resolved == null) return Promise.resolve();

    if (typeof resolved !== 'object') {
      throw new TypeError(`FlowState.update: functional update must return a plain object, got ${typeof resolved}`);
    }

    return new Promise((resolve) => {
      this.#pendingUpdates.push({ update: resolved, notifyWatchers, resolve });
      if (!this.#flushScheduled) {
        this.#flushScheduled = true;
        queueMicrotask(() => this.#flush());
        // or: requestAnimationFrame(() => this.#flush())
      }
    });
  }


  #flush() {
    this.#flushScheduled = false;
    if (this.#destroyed) return;
    const pending = this.#pendingUpdates.splice(0);
    const shouldNotify = pending.some(p => p.notifyWatchers);

    const merged = {};
    for (const { update } of pending) {
      Object.assign(merged, update);
    }

    this.#update({ detail: merged }, shouldNotify);
    for (const { resolve } of pending) resolve();

    // Process updates sequentially to ensure correct order and state consistency
    // hurts performance if there are many updates, but ensures that each update has the latest state
    // mode?
    // let draft = structuredClone(this.#values);
    // for (const { update } of pending) {
    //   const resolved = typeof update === 'function'
    //     ? update(structuredClone(draft))
    //     : update;
    //   Object.assign(draft, resolved);
    // }
    // this.#update({ detail: draft }, shouldNotify);

    // Devtools snapshot after each flush if in dev mode
    if (FLOW_DEV_MODE && !this.#devBroadcastPending) {
      const now = performance.now();
      const remaining = FLOW_DEV_THROTTLE_MS - (now - this.#devLastBroadcast);
      this.#devBroadcastPending = true;
      setTimeout(() => {
        this.#devBroadcastPending = false;
        this.#devLastBroadcast = performance.now();
        this.#broadcastSnapshot();
      }, Math.max(0, remaining));
    }
  }


  #teardown() {
    if (this.#destroyed) return;
    this.#watchers.clear();
    this.#pendingUpdates = [];
    this.#flowThroughs.clear();
    FLOW_REGISTRY.delete(this.#id);
    FlowState.#unmount(this);
    delete this.#root.__Flow__;
    this.#destroyed = true;
  }


  #destroy() {
    if (this.#destroyed || this.#destroyQueued) return;
    this.#destroyQueued = true;
    queueMicrotask(() => {
      this.#destroyQueued = false;
      if (!this.#root?.isConnected) {
        this.#teardown();
      }
    });
  }


  //
  // Source tree and binding index
  //
  // Sources form a tree that mirrors how their roots nest in the DOM, and every bound element
  // is indexed by the nearest source above it. An update reads the index and walks the source
  // tree instead of querying the DOM. One MutationObserver keeps both current as nodes move.

  /** @param {Node} node */
  static #observe(node) {
    if (FLOW_OBSERVED.has(node)) return;
    FLOW_OBSERVED.add(node);

    FLOW_OBSERVER ??= new MutationObserver((records) => FlowState.#sync(records));
    FLOW_OBSERVER.observe(node, FLOW_OBSERVE_OPTIONS);

    FLOW_OBSERVED_NODES.push(new WeakRef(node));
    if (FLOW_OBSERVED_NODES.length > FLOW_OBSERVED_PRUNE_AT) {
      FLOW_OBSERVED_NODES = FLOW_OBSERVED_NODES.filter(ref => ref.deref());
      FLOW_OBSERVED_PRUNE_AT = Math.max(1024, FLOW_OBSERVED_NODES.length * 2);
    }
  }


  // Adds the binding attributes for `keys` to the ones the observer reports. The observer
  // takes a list of exact attribute names, so the list grows as sources define keys.
  /** @param {string[]} keys */
  #watchKeys(keys) {
    let grew = false;
    for (const key of keys) {
      if (this.#watchedKeys.has(key)) continue;
      this.#watchedKeys.add(key);

      const name = `flow-watch-${this.#dashSeparatedKey(key).toLowerCase()}`;
      if (FLOW_ATTRIBUTES.has(`${name}-to-prop`)) continue;
      FLOW_ATTRIBUTES.add(`${name}-to-prop`).add(`${name}-to-attr`);
      grew = true;
    }
    if (!grew) return;

    // The list is fixed per observed node, so every node is observed again with the new one.
    FLOW_OBSERVE_OPTIONS = { ...FLOW_OBSERVE_OPTIONS, attributeFilter: [...FLOW_ATTRIBUTES] };
    FLOW_OBSERVED_NODES = FLOW_OBSERVED_NODES.filter(ref => {
      const node = ref.deref();
      if (node) FLOW_OBSERVER.observe(node, FLOW_OBSERVE_OPTIONS);
      return Boolean(node);
    });
  }


  // Applies DOM changes that have not been delivered yet. Called before the index or the
  // tree is read, so both always match the DOM at that moment.
  /** @param {MutationRecord[]} [records] */
  static #sync(records = FLOW_OBSERVER?.takeRecords() ?? []) {
    if (!records.length) return;

    /** @type {Set<Element>} */
    const moved = new Set();
    // Indexed loops: iterating these NodeLists costs more than everything else in here.
    /** @type {Set<Element>} */
    const changed = new Set(); // elements whose binding attributes changed
    for (let r = 0; r < records.length; r++) {
      if (records[r].type === 'attributes') {
        changed.add(/** @type {Element} */ (records[r].target));
        continue;
      }
      const { removedNodes, addedNodes } = records[r];
      for (let i = 0; i < removedNodes.length; i++) {
        if (removedNodes[i].nodeType === Node.ELEMENT_NODE) moved.add(/** @type {Element} */ (removedNodes[i]));
      }
      for (let i = 0; i < addedNodes.length; i++) {
        if (addedNodes[i].nodeType === Node.ELEMENT_NODE) moved.add(/** @type {Element} */ (addedNodes[i]));
      }
    }

    // Where each node is now decides its scope, so the order of the records does not matter.
    for (const node of moved) FlowState.#release(node);

    /** @type {Map<Node, FlowScope>} */
    const scopes = new Map(); // parent -> scope; a rendered list adds many siblings at once
    for (const node of moved) {
      const parent = node.parentNode;
      if (!parent) continue; // removed and not put back
      let scope = scopes.get(parent);
      if (!scope) scopes.set(parent, scope = FlowState.#scopeOf(node));
      if (scope.source) FlowState.#adopt(node, scope.source, scope.reachable);
    }

    // Re-read the binding attributes of an element that stayed where it was.
    for (const el of changed) {
      if (moved.has(el)) continue;
      const own = FLOW_ROOTS.get(el);
      const { source, reachable } = own ? { source: own, reachable: true } : FlowState.#scopeOf(el);
      FlowState.#bind(el, reachable ? source : null);
    }
  }


  // Finds the nearest source above `node`, and whether that source's bindings reach `node`:
  // they flow through open and through-linked shadow roots and stop at any other closed one.
  /**
   * @param {Node} node
   * @returns {FlowScope}
   */
  static #scopeOf(node) {
    let reachable = true;
    let current = node;

    while (true) {
      if (current instanceof ShadowRoot) {
        // Watch every shadow root a scope was resolved through, so a move inside it is seen.
        FlowState.#observe(current);
        if (current.mode === 'closed') {
          if (!FLOW_THROUGH.has(current)) reachable = false;
          // A closed root is only visible from inside. Remember it, so a later walk down
          // from its host still finds the sources in it.
          FLOW_CLOSED_ROOTS.set(current.host, current);
        }
        current = current.host;
      } else {
        current = current.parentNode;
      }

      if (!current) return { source: null, reachable };
      const source = FLOW_ROOTS.get(current);
      if (source) return { source, reachable };
    }
  }


  // Gives `node` and its subtree to `owner`. A source root found on the way keeps its own
  // subtree and becomes a child of `owner`.
  /**
   * @param {Node} node
   * @param {FlowState} owner
   * @param {boolean} reachable
   */
  static #adopt(node, owner, reachable) {
    const source = FLOW_ROOTS.get(node);
    if (source) {
      source.#setParent(owner, reachable);
    } else {
      FlowState.#adoptInside(node, owner, reachable);
    }
  }


  /**
   * @param {Node} node
   * @param {FlowState} owner
   * @param {boolean} reachable
   */
  static #adoptInside(node, owner, reachable) {
    if (node.nodeType === Node.ELEMENT_NODE) {
      const el = /** @type {Element} */ (node);
      FlowState.#bind(el, reachable ? owner : null);

      const shadowRoot = el.shadowRoot ?? FLOW_CLOSED_ROOTS.get(el);
      if (shadowRoot) {
        const open = shadowRoot.mode === 'open';
        if (open) FlowState.#observe(shadowRoot);
        FlowState.#adopt(shadowRoot, owner, reachable && (open || FLOW_THROUGH.has(shadowRoot)));
      } else if (el.localName.includes('-') && !customElements.get(el.localName)) {
        FlowState.#awaitDefinition(el);
      }
    }

    for (let child = /** @type {ParentNode} */ (node).firstElementChild; child; child = child.nextElementSibling) {
      FlowState.#adopt(child, owner, reachable);
    }
  }


  // Undoes #adopt for a subtree that left its place in the DOM.
  /** @param {Node} node */
  static #release(node) {
    const source = FLOW_ROOTS.get(node);
    if (source) {
      source.#setParent(null, false);
      return;
    }

    if (node.nodeType === Node.ELEMENT_NODE) {
      const el = /** @type {Element} */ (node);
      FlowState.#unbind(el);
      const shadowRoot = el.shadowRoot ?? FLOW_CLOSED_ROOTS.get(el);
      if (shadowRoot) FlowState.#release(shadowRoot);
    }

    for (let child = /** @type {ParentNode} */ (node).firstElementChild; child; child = child.nextElementSibling) {
      FlowState.#release(child);
    }
  }


  // Indexes an element's flow-watch-*, flow-if and flow-ul attributes under `owner`.
  // Attribute names are indexed lowercased, as HTML stores them.
  /**
   * @param {Element} el
   * @param {FlowState | null} owner
   */
  static #bind(el, owner) {
    FlowState.#unbind(el);
    if (!owner || !el.hasAttributes()) return;

    /** @type {string[] | null} */
    let keys = null;
    for (const name of el.getAttributeNames()) {
      if (!name.startsWith('flow-')) continue;

      let key = null;
      if (name === 'flow-ul') {
        key = `ul:${el.getAttribute(name)}`;
      } else if (name === 'flow-if') {
        if (el.localName === 'template') key = `if:${el.getAttribute(name)}`;
      } else if (name.startsWith('flow-watch-')) {
        if (name.endsWith('-to-prop')) key = `prop:${name.slice(11, -8).toLowerCase()}`;
        else if (name.endsWith('-to-attr')) key = `attr:${name.slice(11, -8).toLowerCase()}`;
      }
      if (key) (keys ??= []).push(key);
    }
    if (!keys) return;

    for (const key of keys) {
      let elements = owner.#index.get(key);
      if (!elements) owner.#index.set(key, elements = new Set());
      elements.add(el);
    }
    FLOW_BINDINGS.set(el, { owner, keys });
  }


  /** @param {Element} el */
  static #unbind(el) {
    const binding = FLOW_BINDINGS.get(el);
    if (!binding) return;

    for (const key of binding.keys) {
      const elements = binding.owner.#index.get(key);
      elements?.delete(el);
      if (elements?.size === 0) binding.owner.#index.delete(key);
    }
    FLOW_BINDINGS.delete(el);
  }


  // Attaching a shadow root is not a mutation, so the observer cannot report it. An element
  // whose tag is not defined yet usually attaches one when it is upgraded, so look again
  // then. A shadow root attached at any other time after insertion needs flowThrough().
  /** @param {Element} el */
  static #awaitDefinition(el) {
    const name = el.localName;
    let waiting = FLOW_UNDEFINED.get(name);

    if (!waiting) {
      FLOW_UNDEFINED.set(name, waiting = []);
      customElements.whenDefined(name).then(() => {
        FLOW_UNDEFINED.delete(name);
        FlowState.#sync();
        for (const ref of waiting) {
          const el = ref.deref();
          if (el?.shadowRoot) FlowState.#place(el);
        }
      }, () => {
        FLOW_UNDEFINED.delete(name); // not a valid custom element name
      });
    }

    waiting.push(new WeakRef(el));
  }


  // Re-reads where `node` sits and indexes its subtree for the scope it is in now.
  /** @param {Node} node */
  static #place(node) {
    FlowState.#release(node);
    if (!node.parentNode && !(node instanceof ShadowRoot)) return;
    const { source, reachable } = FlowState.#scopeOf(node);
    if (source) FlowState.#adopt(node, source, reachable);
  }


  /** @param {ShadowRoot} shadowRoot */
  static #linkThrough(shadowRoot) {
    if (FLOW_THROUGH.has(shadowRoot)) return;
    FLOW_THROUGH.add(shadowRoot);
    if (shadowRoot.mode === 'closed') FLOW_CLOSED_ROOTS.set(shadowRoot.host, shadowRoot);
    FlowState.#observe(shadowRoot);
    FlowState.#place(shadowRoot);
  }


  /** @param {FlowState} flow */
  static #mount(flow) {
    const root = flow.#root;
    FlowState.#sync();
    FLOW_ROOTS.set(root, flow);
    const valueKeys = FlowState.#collectKeys(flow.#values);
    flow.#watchKeys([
      ...flow.#computedKeys,
      ...Object.keys(flow.#values),
      ...valueKeys,
      ...FlowState.#getCommonAncestors(valueKeys),
    ]);
    FlowState.#observe(root);

    const { source, reachable } = FlowState.#scopeOf(root);
    flow.#setParent(source, reachable);
    // Takes over the bindings and child sources that the source above held for this subtree.
    FlowState.#adoptInside(root, flow, true);
  }


  /** @param {FlowState} flow */
  static #unmount(flow) {
    FlowState.#sync();
    const root = flow.#root;
    const parent = flow.#parent;
    const reachable = flow.#reachable;

    FLOW_ROOTS.delete(root);
    for (const elements of flow.#index.values()) {
      for (const el of elements) FLOW_BINDINGS.delete(el);
    }
    flow.#index.clear();
    for (const child of flow.#children) child.#setParent(null, false);
    flow.#setParent(null, false);

    // The source above, if this root is still under one, takes the subtree back.
    if (parent) FlowState.#adoptInside(root, parent, reachable);
  }


  /**
   * @param {FlowState | null} parent
   * @param {boolean} reachable
   */
  #setParent(parent, reachable) {
    if (this.#parent !== parent) {
      if (this.#parent) this.#parent.#children.delete(this);
      if (parent) parent.#children.add(this);
      this.#parent = parent;
    }
    this.#reachable = reachable;
  }


  // Finds the source that answers flowGet/flowWatch for `key` from `node`: the nearest one,
  // at or above the node, that defines the key as a value, a computed or an action.
  // Only the hop from the node to its nearest source reads the DOM; the rest is the tree.
  /**
   * @param {Node} node
   * @param {string} key
   * @returns {FlowState | null}
   */
  static #resolve(node, key) {
    FlowState.#sync();
    let flow = FLOW_ROOTS.get(node) ?? FlowState.#scopeOf(node).source;
    while (flow && !(flow.#isConfiguredKey(key) || key in flow.#actions)) flow = flow.#parent;
    return flow;
  }


  // Collects the elements bound to `key` under one index entry: this source's own, plus
  // those of every source below that the bindings reach and that does not define `key` itself.
  /**
   * @param {string} indexKey
   * @param {string} key
   * @param {Element[]} [found]
   * @returns {Element[]}
   */
  #boundElements(indexKey, key, found = []) {
    const own = this.#index.get(indexKey);
    if (own) found.push(...own);

    for (const child of this.#children) {
      if (child.#reachable && !child.#isConfiguredKey(key)) {
        child.#boundElements(indexKey, key, found);
      }
    }
    return found;
  }


  // Static method to get all common ancestor keys from a list of dot-separated keys
  // For example, if the updated keys are ['user.name', 'user.address.street', 'items'],
  // this method would return ['user', 'user.address'] as common ancestors.
  // (but not 'items' since it has no nested keys).
  static #getCommonAncestors(keys) {
    return keys.reduce((acc, key) => {
      const parts = key.split('.');
      for (let i = 1; i < parts.length; i++) {
        const parentKey = parts.slice(0, i).join('.');
        if (!acc.includes(parentKey)) {
          acc.push(parentKey);
        }
      }
      return acc;
    }, []);
  }

  
  // Main update method that processes state update,
  // Applies them internally to instance,
  // computes derived values, notifies watchers, and updates bindings.
  async #update(e, notifyWatchers = false) {
    let updates = e.detail || {};

    // Provide current state if update is a function
    // For example: state.update(prev => ({ count: prev.count + 1 }))
    if (typeof e.detail === 'function') {
      updates = e.detail(structuredClone(this.#values));
    }

    // Strip out any configured computed keys from updates,
    // since they should not be mutated after initialization.
    // Warn if attempted to update a computed key.
    for (const key of this.#computedKeys) {
      if (key in updates) {
        console.warn(`Attempted to update computed value: "${key}"'s definition. Computed value functions cannot be re-defined.`);

        // this.#computed never gets updated after initialization,
        // so actually deleting them isn't necessary.
        // But, it keeps later new key warning from triggering
        delete updates[key];
      }
    }

    const updatedKeys = FlowState.#collectKeys(updates);

    const updatedAncestors = FlowState.#getCommonAncestors(updatedKeys);

    const configuredKeys = [...updatedKeys, ...updatedAncestors]
      .filter(key => this.#isConfiguredKey(key))
      .sort();
    
    const draft = structuredClone(this.#values);
    FlowState.#mergeValues(draft, updates);
    this.#values = FlowState.#deepFreeze(draft);

    // A value replaced by an object brings new nested keys with it.
    this.#watchKeys(updatedKeys);
    this.#watchKeys(updatedAncestors);

    // Update computed values transitively when either state keys or upstream computed keys change.
    const computedToUpdate = this.#getComputedToUpdate(configuredKeys);

    // Add computed keys to update list
    const allKeysToUpdate = [...configuredKeys, ...computedToUpdate];

    // Call watchers
    if (notifyWatchers) {
      const keysToNotify = this.#getWatchersToNotify(allKeysToUpdate, this.#watchers.keys());
      keysToNotify.map(this.#notifyWatchersForKey.bind(this));
    }

    // Resolve each key's current value
    const valueMap = new Map(allKeysToUpdate.map(key => [
      key,
      this.#computed[key] ? this.#evalComputed(key) : this.#getStateValue(key),
    ]));

    // Update structural bindings first so newly rendered items are in the DOM
    // before the prop/attr pass runs (rendered content may carry flow-watch-* bindings).
    // flow-if runs before flow-ul so conditional branches that contain lists
    // exist before the list renderer looks up its flow-ul containers.
    // Each pass syncs the index first, to pick up what the pass before it rendered.
    FlowState.#sync();
    for (const key of allKeysToUpdate) {
      this.#updateIfBindingsForKey(key, valueMap.get(key));
    }

    FlowState.#sync();
    for (const key of allKeysToUpdate) {
      const value = valueMap.get(key);
      if (Array.isArray(value)) this.#updateListBindingsForKey(key, value);
    }

    FlowState.#sync();
    for (const key of allKeysToUpdate) {
      this.#updateBindingsForKey(key, valueMap.get(key));
    }
  }


  // Collect all updated keys (dot notation)
  static #collectKeys(obj, prefix = []) {
    let keys = [];
    for (const k in obj) {
      if (typeof obj[k] === 'object' && obj[k] !== null && !Array.isArray(obj[k])) {
        keys = keys.concat(FlowState.#collectKeys(obj[k], [...prefix, k]));
      } else {
        keys.push([...prefix, k].join('.'));
      }
    }
    return keys;
  };


  // Recursively sets nested values from source to target, creating nested objects as needed.
  static #setNested = (target, src) => {
    for (const [k, v] of Object.entries(src)) {
      if (typeof v === 'object' && v !== null && typeof v !== 'function' && !Array.isArray(v)) {
        target[k] = {};
        FlowState.#setNested(target[k], v);
      } else {
        target[k] = v;
      }
    }
  };


  // Deeply merges source object into target object, but only for existing keys in target.
  static #mergeValues(target, src) {
    for (const k in src) {
      if (!(k in target)) {
        // Ignore new keys
        console.warn(`Attempted to update non-existent key: "${k}". Only existing keys can be updated.`);
        continue;
      }
      if (
        typeof src[k] === 'object' && src[k] !== null && !Array.isArray(src[k]) &&
        typeof target[k] === 'object' && target[k] !== null && !Array.isArray(target[k])
      ) {
        FlowState.#mergeValues(target[k], src[k]);
      } else {
        target[k] = src[k];
      }
    }
  }


  /**
   * Given a list of state update keys and watcher keys (both as dot-separated strings),
   * returns the watcher keys that should be notified for the updates.
   * A watcher should be notified if any update key is equal to or is a descendant of the watcher key.
   *
   * @param {string[]} updateKeys - List of updated state keys (dot-separated)
   * @param {string[]} watcherKeys - List of watcher keys (dot-separated)
   * @returns {string[]} - List of watcher keys to notify
   */
  /**
   * @param {Iterable<string>} updateKeys
   * @param {Iterable<string>} watcherKeys
   * @returns {string[]}
   */
  #getWatchersToNotify(updateKeys, watcherKeys) {
    const result = new Set();
    for (const watcher of watcherKeys) {
      for (const update of updateKeys) {
        if (
          update === watcher ||
          update.startsWith(watcher + ".")
        ) {
          result.add(watcher);
          break;
        }
      }
    }
    return Array.from(result);
  }


  static #keysOverlap(a, b) {
    return a === b || a.startsWith(`${b}.`) || b.startsWith(`${a}.`);
  }


  #getComputedToUpdate(changedKeys) {
    const dirtyComputed = new Set();
    let changed = true;

    while (changed) {
      changed = false;

      for (const key of this.#computedKeys) {
        if (dirtyComputed.has(key)) continue;
        const deps = this.#computedDeps.get(key) || [];

        const depChanged = deps.some(dep => {
          if (dirtyComputed.has(dep)) return true;
          if (this.#computed[dep]) return false;
          return changedKeys.some(changedKey => FlowState.#keysOverlap(dep, changedKey));
        });

        if (depChanged) {
          dirtyComputed.add(key);
          changed = true;
        }
      }
    }

    return this.#computedKeys.filter(key => dirtyComputed.has(key));
  }


  // Notifies all watchers for a given key by calling
  // their callbacks with the current values.
  #notifyWatchersForKey(key) {
    const entries = this.#watchers.get(key);
    if (entries) {
      let value;
      if (this.#computed[key]) {
        value = this.#evalComputed(key);
      } else {
        value = key.split('.').reduce((o, k) => o?.[k], this.#values);
      }
      entries.forEach(({ callback }) => callback(value));
    }
  }


  #getStateValue(key) {
    return key.split('.').reduce((o, k) => o?.[k], this.#values);
  }


  // Evaluates a computed value by spreading its dep values as positional arguments.
  // Dependencies can reference state keys or other computed keys.
  #evalComputed(key, stack = []) {
    if (stack.includes(key)) {
      throw Error(`Circular computed dependency detected: ${[...stack, key].join(' -> ')}`);
    }

    const deps = this.#computedDeps.get(key) || [];
    const values = deps.map(dep => (
      this.#computed[dep]
        ? this.#evalComputed(dep, [...stack, key])
        : this.#getStateValue(dep)
    ));

    return this.#computed[key](...values);
  }


  #assertAcyclicComputedGraph() {
    const visiting = new Set();
    const visited = new Set();

    const visit = (key, stack = []) => {
      if (visited.has(key)) return;
      if (visiting.has(key)) {
        throw Error(`Circular computed dependency detected: ${[...stack, key].join(' -> ')}`);
      }

      visiting.add(key);
      const deps = this.#computedDeps.get(key) || [];
      deps.forEach(dep => {
        if (this.#computed[dep]) visit(dep, [...stack, key]);
      });
      visiting.delete(key);
      visited.add(key);
    };

    this.#computedKeys.forEach(key => visit(key));
  }

  #dashSeparatedKey(key) {
    return key.replace(/\./g, '-');
  }


  // Updates all DOM bindings for a given key from the binding index
  #updateBindingsForKey(key, value) {
    const dashKey = this.#dashSeparatedKey(key);
    const indexKey = dashKey.toLowerCase();

    this.#boundElements(`prop:${indexKey}`, key).forEach(el => {
      const prop = el.getAttribute(`flow-watch-${dashKey}-to-prop`);
      if (prop) {
        FlowState.#setProp(el, prop, value);
      }
    })

    this.#boundElements(`attr:${indexKey}`, key).forEach(el => {
      const attr = el.getAttribute(`flow-watch-${dashKey}-to-attr`);
      if (attr) {
        if (value instanceof Object) {
          value = JSON.stringify(value);
        }
        el.setAttribute(attr, value);
      }
    });
  }


  // Writes a bound property. Text that replaces a lone text node goes into that node instead:
  // no node is created, and the observer has nothing to report for the write.
  static #setProp(el, prop, value) {
    if (prop === 'textContent' && value != null && value !== '' && typeof value !== 'object'
      && !el.localName.includes('-')) {
      const text = el.firstChild;
      if (text && text === el.lastChild && text.nodeType === Node.TEXT_NODE) {
        /** @type {Text} */ (text).data = value;
        return;
      }
    }
    el[prop] = value;
  }


  // Updates all flow-ul containers for a given key.
  #updateListBindingsForKey(key, value) {
    this.#boundElements(`ul:${key}`, key).forEach(container => {
      this.#renderList(container, value);
    });
  }


  // Updates all template-hosted flow-if directives for a given key.
  #updateIfBindingsForKey(key, value) {
    this.#boundElements(`if:${key}`, key).forEach(templateEl => {
      this.#renderIf(templateEl, Boolean(value));
    });
  }


  // Renders a list into a container element using the first <template> child as the item template.
  // Item bindings inside the template:
  //   flow-li-<item-key>-to-prop="domProp"   — sets el[domProp] = item[itemKey]
  //   flow-li-<item-key>-to-attr="attrName"  — sets el.setAttribute(attrName, item[itemKey])
  // Dashes in the key map to nested property access: flow-li-user-name-to-prop reads item.user.name
  #renderList(container, items) {
    const templateEl = container.querySelector(':scope > template');
    if (!templateEl) return;

    // Remove previously rendered items, leaving the <template> in place
    Array.from(container.children).forEach(child => {
      if (child.tagName !== 'TEMPLATE') child.remove();
    });

    // Rendered into one fragment, so the list reaches the DOM as a single insertion.
    const rendered = document.createDocumentFragment();

    items.forEach(item => {
      const fragment = templateEl.content.cloneNode(true);

      fragment.querySelectorAll('*').forEach(el => {
        for (const { name, value } of el.attributes) {
          if (name.startsWith('flow-li-') && name.endsWith('-to-prop')) {
            const rawKey = name.slice(8, -8);
            const itemValue = rawKey ? this.#getValueByDashPathCaseInsensitive(item, rawKey) : item;
            if (value && itemValue !== undefined) el[value] = itemValue;
          } else if (name.startsWith('flow-li-') && name.endsWith('-to-attr')) {
            const rawKey = name.slice(8, -8);
            const itemValue = rawKey ? this.#getValueByDashPathCaseInsensitive(item, rawKey) : item;
            if (value && itemValue !== undefined) el.setAttribute(value, String(itemValue));
          }
        }
      });

      rendered.appendChild(fragment);
    });

    container.appendChild(rendered);
  }


  // HTML lowercases attribute names, so flow-li key segments may arrive lowercased.
  // Resolve dash-path segments case-insensitively against item object keys.
  #getValueByDashPathCaseInsensitive(obj, dashPath) {
    const segments = dashPath.split('-');
    let current = obj;

    for (const segment of segments) {
      if (current == null || typeof current !== 'object') return undefined;

      if (segment in current) {
        current = current[segment];
        continue;
      }

      const segmentLower = segment.toLowerCase();
      const actualKey = Object.keys(current).find(k => k.toLowerCase() === segmentLower);
      if (!actualKey) return undefined;
      current = current[actualKey];
    }

    return current;
  }


  // Renders template-hosted flow-if branches from template content:
  // <template flow-if="key"><pass-element>...</pass-element><fail-element>...</fail-element></template>
  // The first element child is pass, the second (if present) is fail.
  #renderIf(passTemplate, condition) {
    const branches = Array.from(passTemplate.content.children);
    const passBranch = branches[0];
    const failBranch = branches[1];

    this.#clearIfRenderedNodes(passTemplate);

    const selected = condition ? passBranch : failBranch;
    if (!selected) return;

    const renderedNode = selected.cloneNode(true);
    passTemplate.parentNode?.insertBefore(renderedNode, passTemplate.nextSibling);
    const renderedNodes = [renderedNode];
    this.#ifRenderedNodes.set(passTemplate, renderedNodes);
  }


  #clearIfRenderedNodes(passTemplate) {
    const renderedNodes = this.#ifRenderedNodes.get(passTemplate);
    if (!renderedNodes) return;

    renderedNodes.forEach(node => {
      if (node.parentNode) node.parentNode.removeChild(node);
    });
    this.#ifRenderedNodes.delete(passTemplate);
  }


  // Internal method to register a shadow root for flow-through access for state updates.
  #through(shadowRoot) {
    this.#flowThroughs.set(shadowRoot, this);
  }


  // Internal watch method that registers a watcher callback for a given key,
  // and immediately calls the callback with the current value.
  /**
   * @param {string} key
   * @param {(value: any) => void} callback
   * @param {Node} sourceElement - the node flowWatch() was called with
   * @returns {() => void}
   */
  #watch(key, callback, sourceElement) {
    // Check if an action is being watched
    if (key in this.#actions) {
      // Immediately call the callback with the current action value
      callback(this.#actions[key]);
      return () => {};
    }

    // Check if key exists in state (supports dot notation)
    const exists = key in this.#computed || key.split('.').reduce((o, k) => (o && k in o ? o[k] : undefined), this.#values) !== undefined;
    if (!exists) {
      return () => {};
    }

    const sourceEl = /** @type {Element | null} */ (sourceElement ?? null);
    const source = sourceEl?.tagName?.toLowerCase() ?? '(internal)';
    const sourceElRef = sourceEl ? new WeakRef(sourceEl) : null;

    const entry = { callback, source, sourceElRef };

    if (!this.#watchers.has(key)) this.#watchers.set(key, new Set());
    this.#watchers.get(key).add(entry);

    // Immediately call the callback with the current value
    let value;
    if (this.#computed[key]) {
      value = this.#evalComputed(key);
    } else {
      value = key.split('.').reduce((o, k) => o?.[k], this.#values);
    }
    callback(value);

    // Return unsubscribe function
    let unsub = () => {
      this.#watchers.get(key)?.delete(entry);
    };

    return unsub;
  }
  

  /**
   * Checks if a dot-separated key is a configured key in the state (including nested keys).
   * @param {string} key - The dot-separated key to check (e.g., 'user.name')
   * @returns {boolean} - True if the key exists in the state, false otherwise.
   */
  #isConfiguredKey(key) {
    // Check computed keys first (flat, not nested)
    if (this.#computedKeys.includes(key)) {
      return true;
    }
    // Check nested values
    const parts = key.split('.');
    let current = this.#values;
    for (let i = 0; i < parts.length; i++) {
      if (current && typeof current === 'object' && parts[i] in current) {
        current = current[parts[i]];
      } else {
        return false;
      }
    }
    return true;
  }


  // Internal get method that retrieves the current value for a given key
  #get(key) {
    if (key in this.#actions) {
      return this.#actions[key];
    }
    let value;
    if (this.#computed[key]) {
      value = this.#evalComputed(key);
    } else {
      value = key.split('.').reduce((o, k) => o?.[k], this.#values);
    }
    return value;
  }


  // Builds a snapshot of the current state for devtools visualization
  /** @returns {Snapshot} */
  #buildSnapshot() {
    FlowState.#sync();
    const parentId = this.#parent ? this.#parent.#id : null;
    let values;
    try { values = JSON.parse(JSON.stringify(this.#values)); } catch { values = null; }
    const root = this.#root;
    const isShadow = root instanceof ShadowRoot;
    const shadowHostTag = isShadow
      ? root.host.tagName.toLowerCase()
      : (root.tagName?.toLowerCase() ?? '#document');
    const shadowMode = isShadow ? root.mode : 'n/a';
    const isFlowThrough = isShadow
      ? Array.from(FLOW_REGISTRY.entries()).some(([id, { state }]) => id !== this.#id && state.#flowThroughs.has(root))
      : false;
    const rootTag = isShadow
      ? `${root.host.tagName.toLowerCase()} (shadow)`
      : (root.tagName?.toLowerCase() ?? '#document');
    const actionKeys = Object.keys(this.#actions);
    const watchers = Array.from(this.#watchers.entries()).flatMap(([key, entries]) =>
      Array.from(entries).map(({ source, sourceElRef }) => {
        // Resolve the source element to a FlowState snapshot ID if possible,
        // so the devtools can link to it, even if it's in a different part of the DOM or across shadow boundaries.
        const sourceEl = sourceElRef?.deref();
        let sourceFlowId = null;
        if (sourceEl) {
          for (const [id, { root }] of FLOW_REGISTRY) {
            if (root === sourceEl || (root instanceof ShadowRoot && root.host === sourceEl)) {
              sourceFlowId = id;
              break;
            }
          }
        }
        // For elements with no FlowState scope (e.g. kanban-card), register them in
        // #sourceElRegistry so the highlight handler can reach them directly.
        let sourceElId = null;
        if (sourceEl && !sourceFlowId) {
          if (!FLOW_SOURCE_EL_IDS.has(sourceEl)) {
            const newId = crypto.randomUUID();
            FLOW_SOURCE_EL_IDS.set(sourceEl, newId);
            FLOW_SOURCE_EL_REGISTRY.set(newId, new WeakRef(sourceEl));
            FLOW_SOURCE_EL_FINALIZER.register(sourceEl, newId);
          }
          sourceElId = FLOW_SOURCE_EL_IDS.get(sourceEl);
        }
        return { key, source, sourceFlowId, sourceElId };
      })
    );
    return {
      type: 'snapshot',
      id: this.#id,
      rootTag,
      shadowHostTag,
      isShadow,
      shadowMode,
      isFlowThrough,
      label: this.#label,
      parentId,
      values,
      computedKeys: this.#computedKeys,
      actionKeys,
      watchers: watchers,
      watcherKeys: Array.from(this.#watchers.keys()),
      watcherCount: Array.from(this.#watchers.values()).reduce((n, s) => n + s.size, 0),
      flowThroughCount: this.#flowThroughs.size,
      timestamp: Date.now(),
    };
  }


  // Broadcasts the current state snapshot to the devtools visualizer if in dev mode
  #broadcastSnapshot() {
    FLOW_DEV_CHANNEL?.postMessage(this.#buildSnapshot());
  }


  static #deepFreeze(obj) {
    Object.freeze(obj);
    for (const value of Object.values(obj)) {
      if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
        FlowState.#deepFreeze(value);
      }
    }
    return obj;
  }


}


export { FlowState as FlowSource };


export function flowGet(source, key) {
  if (!(source instanceof Node)) {
    throw Error('flowGet requires a DOM Node source!');
  }

  return FLOW_INTERNALS.get(source, key);
}


export function flowWatch(source, key, callback) {
  if (!(source instanceof Node)) {
    throw Error('flowWatch requires a DOM Node source!');
  }

  const unsub = FLOW_INTERNALS.watch(source, key, callback);
  if (unsub) FLOW_WATCH_TRACKERS.get(source)?.(unsub);
  return unsub;
}


// Internal, for FlowStateComponent: `track` receives the unsubscribe function of every
// flowWatch() made from `node`, so the component can clean them up when it disconnects.
/**
 * @param {Node} node
 * @param {(unsub: () => void) => void} track
 */
export function flowTrackWatches(node, track) {
  FLOW_WATCH_TRACKERS.set(node, track);
}


export function flowThrough(shadowRoot) {
  if (!(shadowRoot instanceof ShadowRoot)) {
    throw Error('flowThrough requires a ShadowRoot!');
  }
  FLOW_INTERNALS.through(shadowRoot);
}


export function flowCompute(fn, deps = []) {
  return Object.freeze({ [FLOW_COMPUTE]: true, fn, deps });
}


function broadcastAllSnapshots() {
  if (!FLOW_DEV_CHANNEL) return;
  for (const { getSnapshot } of FLOW_REGISTRY.values()) {
    FLOW_DEV_CHANNEL.postMessage(getSnapshot());
  }
}


export function flowDevtools() {
  FLOW_DEV_MODE = true;
  if (!FLOW_DEV_CHANNEL) {
    FLOW_DEV_CHANNEL = new BroadcastChannel('flowstate-devtools');
    FLOW_DEV_CHANNEL.addEventListener('message', (e) => {
      if (e.data?.type === 'ready') {
        setTimeout(() => {
          broadcastAllSnapshots();
        }, 50);
      }
      if (e.data?.type === 'highlight-source-el') {
        const ref = FLOW_SOURCE_EL_REGISTRY.get(e.data.id);
        const target = ref?.deref();
        if (!target) return;
        const rect = target.getBoundingClientRect();
        let scrim = document.getElementById('--flow-highlight-scrim');
        if (!scrim) {
          scrim = document.createElement('div');
          scrim.id = '--flow-highlight-scrim';
          scrim.style.cssText = 'position:fixed;pointer-events:none;z-index:2147483647;transition:opacity 0.1s;background:rgba(122,162,247,0.25);border:2px solid #7aa2f7;border-radius:3px;box-sizing:border-box;';
          document.body.appendChild(scrim);
        }
        scrim.style.top    = `${rect.top}px`;
        scrim.style.left   = `${rect.left}px`;
        scrim.style.width  = `${rect.width}px`;
        scrim.style.height = `${rect.height}px`;
        scrim.style.opacity = '1';
      }
      if (e.data?.type === 'highlight') {
        const entry = FLOW_REGISTRY.get(e.data.id);
        if (!entry) return;
        const root = entry.root;
        const target = root instanceof ShadowRoot ? root.host : root;
        if (!(target instanceof Element)) return;
        const rect = target.getBoundingClientRect();
        let scrim = document.getElementById('--flow-highlight-scrim');
        if (!scrim) {
          scrim = document.createElement('div');
          scrim.id = '--flow-highlight-scrim';
          scrim.style.cssText = 'position:fixed;pointer-events:none;z-index:2147483647;transition:opacity 0.1s;background:rgba(122,162,247,0.25);border:2px solid #7aa2f7;border-radius:3px;box-sizing:border-box;';
          document.body.appendChild(scrim);
        }
        scrim.style.top    = `${rect.top}px`;
        scrim.style.left   = `${rect.left}px`;
        scrim.style.width  = `${rect.width}px`;
        scrim.style.height = `${rect.height}px`;
        scrim.style.opacity = '1';
      }
      if (e.data?.type === 'clear-highlight') {
        const scrim = document.getElementById('--flow-highlight-scrim');
        if (scrim) scrim.style.opacity = '0';
      }
    });

    // Reset stale snapshots in an already-open devtools tab when the app boots/reloads.
    FLOW_DEV_CHANNEL.postMessage({ type: 'init' });
  }

  // If devtools already sent `ready` before this app called flowDevtools(),
  // push snapshots immediately so the UI connects without waiting for state changes.
  broadcastAllSnapshots();
}