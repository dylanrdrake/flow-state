const FLOW_COMPUTE = Symbol('FlowState.compute');
let FLOW_DEV_MODE = false;
let FLOW_DEV_CHANNEL = null;
const FLOW_REGISTRY = new Map();        // id -> { root, getSnapshot }
const FLOW_SOURCE_EL_REGISTRY = new Map(); // id -> WeakRef<Element> for non-FlowState source elements
const FLOW_SOURCE_EL_IDS = new WeakMap();  // Element -> id (stable ID per element)
const FLOW_SOURCE_EL_FINALIZER = new FinalizationRegistry((id) => {
  FLOW_SOURCE_EL_REGISTRY.delete(id);
});
const FLOW_DEV_THROTTLE_MS = 100; // 10fps max

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
    this.#label = (cn && !/^HTML\w*Element$/.test(cn)) ? cn : (root.tagName?.toLowerCase() ?? null);

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

    // Listen for 'watch'  registration events
    this.#root.addEventListener('flow-state-watch', (e) => {
      const { key, callback, sourceElement } = e.detail || {};
      if (this.#isConfiguredKey(key) || key in this.#actions) {
        e.stopPropagation();
        e.detail.unsub = this.#watch(key, callback, e, sourceElement);
      }
    });

    // Listen for 'get' events
    this.#root.addEventListener('flow-state-get', (e) => {
      const { key, callback } = e.detail || {};
      if (this.#isConfiguredKey(key) || key in this.#actions) {
        e.stopPropagation();
        let value = this.#get(key);
        callback(value);
      }
    });

    // Listen for shadow root linking events
    this.#root.addEventListener('flow-state-flow-through', (e) => {
      const { shadowRoot } = e.detail || {};
      this.#flowThroughs.set(shadowRoot, this);
    });

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
    FLOW_REGISTRY.set(this.#id, { root: this.#root, getSnapshot: () => this.#buildSnapshot() });

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


  // Checks if there is an overwriting flow instance between
  // root and target (inclusive) with the given key,
  // and if so, returns true. Otherwise returns false.
  static #hasOverwritingFlow(root, target, key) {
    const getParent = (el) => {
      if (el.parentElement) {
        return el.parentElement;
      } else {
        // If inside a shadow DOM, get the host
        const rootNode = el.getRootNode && el.getRootNode();
        if (rootNode && rootNode instanceof ShadowRoot && rootNode.host) {
          return rootNode.host;
        } else {
          return;
        }
      }
    }

    // Start traversing from the target element up to the root.
    // If the target itself hosts a FlowSource with the same key, it should
    // override the ancestor scope because it is more specific.
    let current = target;

    while (current && current !== root.host && current !== root) {
      // Check __Flow__ on the current node
      if (current.__Flow__ && current.__Flow__.hasKey(key)) {
        return true;
      }
      // Traverse up: if parentElement exists, use it; otherwise, try composed parent
      current = getParent(current);
    }

    return false;
  }


  // Searches for elements matching selector in root and all nested shadow roots.
  // Uses a TreeWalker to find shadow root hosts rather than querySelectorAll('*'),
  // avoiding the O(n²) cost of collecting every element into an array first.
  #querySelectorAllDeep(selector, root = this.#root) {
    const results = [...root.querySelectorAll(selector)];

    // If traversal starts at a host element, include its own shadow root.
    if (root instanceof Element && root.shadowRoot) {
      results.push(...this.#querySelectorAllDeep(selector, root.shadowRoot));
    }

    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
    let el = walker.nextNode();
    while (el) {
      if (el.shadowRoot) {
        results.push(...this.#querySelectorAllDeep(selector, el.shadowRoot));
      }
      el = walker.nextNode();
    }

    return results;
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

    // Update computed values transitively when either state keys or upstream computed keys change.
    const computedToUpdate = this.#getComputedToUpdate(configuredKeys);

    // Add computed keys to update list
    const allKeysToUpdate = [...configuredKeys, ...computedToUpdate];

    // Call watchers
    if (notifyWatchers) {
      let watcherKeys = Array.from(this.#watchers.keys());
      const keysToNotify = this.#getWatchersToNotify(allKeysToUpdate, watcherKeys);
      keysToNotify.map(this.#notifyWatchersForKey.bind(this));
    }

    // Update structural bindings first so newly rendered items are in the DOM
    // before the prop/attr pass runs (rendered content may carry flow-watch-* bindings).
    // flow-if runs before flow-ul so conditional branches that contain lists
    // exist before the list renderer queries for [flow-ul="key"] containers.
    allKeysToUpdate.forEach(key => {
      const value = this.#computed[key]
        ? this.#evalComputed(key)
        : key.split('.').reduce((o, k) => o?.[k], this.#values);
      this.#updateIfBindingsForKey(key, value);
    });

    allKeysToUpdate.forEach(key => {
      const value = this.#computed[key]
        ? this.#evalComputed(key)
        : key.split('.').reduce((o, k) => o?.[k], this.#values);
      if (Array.isArray(value)) this.#updateListBindingsForKey(key, value);
    });

    allKeysToUpdate.forEach(this.#updateBindingsForKey.bind(this));
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


  #getDirectiveBindingsFromRoot(selector, root = this.#root) {
    const bindings = this.#querySelectorAllDeep(selector, root);

    if (root instanceof Element && root.matches(selector)) {
      bindings.push(root);
    }

    // Include through-linked shadow roots (including closed roots) for all directives.
    for (const [shadowRoot, flow] of this.#flowThroughs.entries()) {
      bindings.push(...flow.#querySelectorAllDeep(selector, shadowRoot));
    }

    return [...new Set(bindings)];
  }


  #getBindingsForKeyFromRoot(key, root) {
    const dashKey = this.#dashSeparatedKey(key);
    const propSelector = `[flow-watch-${dashKey}-to-prop]`;
    const attrSelector = `[flow-watch-${dashKey}-to-attr]`;
    const propBindings = this.#getDirectiveBindingsFromRoot(propSelector, root);
    const attrBindings = this.#getDirectiveBindingsFromRoot(attrSelector, root);
 
    return { propBindings, attrBindings };
  }

  // Updates all DOM bindings for a given key by querying
  // the root for elements with matching flow-watch attributes
  #updateBindingsForKey(key) {
    let value;
    if (this.#computed[key]) {
      value = this.#evalComputed(key);
    } else {
      value = key.split('.').reduce((o, k) => o?.[k], this.#values);
    }

    const dashKey = this.#dashSeparatedKey(key);
    const { propBindings, attrBindings } = this.#getBindingsForKeyFromRoot(key, this.#root);

    propBindings.forEach(el => {
      let hasOverwritingFlow = FlowState.#hasOverwritingFlow(this.#root, el, key);
      if (hasOverwritingFlow) return;

      const prop = el.getAttribute(`flow-watch-${dashKey}-to-prop`);
      if (prop) {
        el[prop] = value;
      }
    })

    attrBindings.forEach(el => {
      let hasOverwritingFlow = FlowState.#hasOverwritingFlow(this.#root, el, key);
      if (hasOverwritingFlow) return;

      const attr = el.getAttribute(`flow-watch-${dashKey}-to-attr`);
      if (attr) {
        if (value instanceof Object) {
          value = JSON.stringify(value);
        }
        el.setAttribute(attr, value);
      }
    });
  }


  // Updates all flow-ul containers for a given key.
  #updateListBindingsForKey(key, value) {
    const containers = this.#getDirectiveBindingsFromRoot(`[flow-ul="${key}"]`, this.#root);

    containers.forEach(container => {
      if (FlowState.#hasOverwritingFlow(this.#root, container, key)) return;
      this.#renderList(container, value);
    });
  }


  // Updates all template-hosted flow-if directives for a given key.
  #updateIfBindingsForKey(key, value) {
    const templates = this.#getDirectiveBindingsFromRoot(`template[flow-if="${key}"]`, this.#root);

    templates.forEach(templateEl => {
      if (FlowState.#hasOverwritingFlow(this.#root, templateEl, key)) return;
      this.#renderIf(templateEl, Boolean(value));
    });
  }


  // Renders a list into a container element using the first <template> child as the item template.
  // Item bindings inside the template:
  //   flow-li-<item-key>-to-prop="domProp"   — sets el[domProp] = item[itemKey]
  //   flow-li-<item-key>-to-attr="attrName"  — sets el.setAttribute(attrName, item[itemKey])
  // Dashes in the key map to nested property access: flow-li-user-name-to-prop reads item.user.name
  #renderList(container, items) {
    const templateEl = Array.from(container.children).find(c => c.tagName === 'TEMPLATE');
    if (!templateEl) return;

    // Remove previously rendered items, leaving the <template> in place
    Array.from(container.children).forEach(child => {
      if (child.tagName !== 'TEMPLATE') child.remove();
    });

    items.forEach(item => {
      const fragment = templateEl.content.cloneNode(true);

      fragment.querySelectorAll('*').forEach(el => {
        for (const { name, value } of [...el.attributes]) {
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

      container.appendChild(fragment);
    });
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
  #watch(key, callback, event, sourceElement) {
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

    // sourceElement comes from event.detail (never retargeted), falling back to event.target.
    const sourceEl = sourceElement ?? event?.target ?? null;
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
  #buildSnapshot() {
    let parentId = null;
    let closestDepth = -1;
    for (const [id, { root }] of FLOW_REGISTRY) {
      if (id === this.#id) continue;
      if (FlowState.#isAncestorRoot(root, this.#root)) {
        const depth = FlowState.#domDepth(root);
        if (depth > closestDepth) { closestDepth = depth; parentId = id; }
      }
    }
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


  // Utility method to check if ancestor is a root of descendant (including shadow DOM boundaries)
  static #isAncestorRoot(ancestor, descendant) {
    let current = descendant instanceof ShadowRoot ? descendant.host : descendant;
    while (current) {
      const parent = current.parentNode;
      if (!parent) break;
      if (parent === ancestor) return true;
      if (parent instanceof ShadowRoot) {
        current = parent.host;
        if (current === ancestor) return true;       // host itself is the ancestor
      } else {
        current = parent;
      }
    }
    return false;
  }


  // Utility method to calculate DOM depth of an element (including shadow DOM boundaries)
  static #domDepth(el) {
    let depth = 0;
    let current = el instanceof ShadowRoot ? el.host : el;
    while (current) {
      depth++;
      const parent = current.parentNode;
      if (!parent) break;
      if (parent instanceof ShadowRoot) {
        current = parent.host;
      } else {
        current = parent;
      }
    }
    return depth;
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

  let result;
  source.dispatchEvent(new CustomEvent('flow-state-get', {
    detail: {
      key,
      callback: (value) => { result = value; }
    },
    bubbles: true,
    composed: true
  }));
  return result;
}


export function flowWatch(source, key, callback) {
  if (!(source instanceof Node)) {
    throw Error('flowWatch requires a DOM Node source!');
  }

  // Include sourceElement in detail — event.target gets retargeted when crossing
  // shadow boundaries, but detail is a plain object that is never retargeted.
  const detail = { key, callback, sourceElement: source };
  source.dispatchEvent(new CustomEvent('flow-state-watch', {
    detail,
    bubbles: true,
    composed: true
  }));
  return detail.unsub;
}


export function flowThrough(shadowRoot) {
  if (!(shadowRoot instanceof ShadowRoot)) {
    throw Error('flowThrough requires a ShadowRoot!');
  }
  shadowRoot.dispatchEvent(new CustomEvent('flow-state-flow-through', {
    detail: {
      shadowRoot: shadowRoot
    },
    bubbles: true,
    composed: true
  }));
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