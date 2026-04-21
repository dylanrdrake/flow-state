export class FlowState {
  #root;
  #hooks = {};
  #values = {};
  #computed = {};
  #computedKeys = [];
  #computedDeps = new Map();
  #watchers = new Map();
  #flowThroughs = new Map();
  #pendingUpdates = [];
  #flushScheduled = false;

  //
  // Devtools
  #id = crypto.randomUUID();
  #label = null;

  static #devMode = false;
  static #devChannel = null;
  static #registry = new Map(); // id → { root, getSnapshot }
  static #DEV_THROTTLE_MS = 100; // 10fps max

  #devBroadcastPending = false;
  #devLastBroadcast = 0;
  // Devtools
  //

  constructor(root, config = {}, hooks = {}, options = {}) {
    // Check: 1
    // Check if a FlowState instance is already mounted on this root
    if (root.__Flow__) {
      console.warn("Cannot mount multiple FlowState instances on the same root element.");
      // Or should you be able to?
      // Allow freedom to or enforce opinionated best practice?
      // Or, should it be a configurable mode? "lazy" mode?
      return root.__Flow__;
    }

    // Check: 2
    if (!(root instanceof Node)) {
      throw Error("State constructor requires the root element to be a DOM Node!");
      // Should it allow an element id string? I'm thinking no...
      // Maybe would keep other, far-away code from mounting to and affecting things they shouldn't or didn't intend to
    }

    this.#label = options.label ?? null;

    this.#root = root;

    this.#hooks = hooks;

    const entries = Object.entries(config);

    // Separate values from computed values (functions)
    const valueEntries = entries.filter(([, v]) => typeof v !== 'function');

    // Set initial instance state values
    FlowState.#setNested(this.#values, Object.fromEntries(valueEntries));

    // Guarantee immutability of state values to prevent accidental mutations outside of update method
    FlowState.#deepFreeze(this.#values);

    // Computed
    const computedEntries = entries.filter(([, v]) => typeof v === 'function');
    this.#computedKeys = computedEntries.map(([k]) => k);
    this.#computed = Object.fromEntries(computedEntries);
    // Track dependencies for computed values
    for (const [key, fn] of computedEntries) {
      const fnDeps = FlowState.#getComputedDependencies(fn, structuredClone(this.#values));
      this.#computedDeps.set(key, fnDeps);
    }

    // Listen for 'watch'  registration events
    this.#root.addEventListener('flow-state-watch', (e) => {
      const { key, callback } = e.detail || {};
      this.#watch(key, callback, e);
    });

    // Listen for 'get' events
    this.#root.addEventListener('flow-state-get', (e) => {
      const { key, callback } = e.detail || {};
      let value = this.#get(key);
      if (value !== undefined) callback(value);
      let higherFlow = FlowState.#hasOverwritingFlow(document, this.#root, key);
      if (!higherFlow) callback(value);
    });

    // Listen for shadow root linking events
    this.#root.addEventListener('flow-state-flow-through', (e) => {
      e.stopPropagation();
      const { shadowRoot } = e.detail || {};
      this.#flowThroughs.set(shadowRoot, this);
    });

    // Expose limited 'hasKey', 'flowThroughs' API on root el
    Object.defineProperty(this.#root, '__Flow__', {
      value: {
        hasKey: this.#hasKey.bind(this),
        flowThroughs: this.#flowThroughs,
        // ready: this.ready
      },
      writable: false,
      enumerable: true,
      configurable: false
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
      watch: {
        value: this.#watch.bind(this),
        writable: false,
        enumerable: true,
        configurable: false
      },
      get: {
        value: this.#get.bind(this),
        writable: false,
        enumerable: true,
        configurable: false
      },
      through: {
        value: this.#through.bind(this),
        writable: false,
        enumerable: true,
        configurable: false
      }
    });

    // Register with devtools
    FlowState.#registry.set(this.#id, { root: this.#root, getSnapshot: () => this.#buildSnapshot() });

    // Update bindings
    this.#update({ detail: this.#values });

    return instanceApi;
  }


  #queueUpdate(update, notifyWatchers) {
    this.#pendingUpdates.push({ update, notifyWatchers });
    if (!this.#flushScheduled) {
      this.#flushScheduled = true;
      queueMicrotask(() => this.#flush());
      // or: requestAnimationFrame(() => this.#flush())
    }
  }


  #flush() {
    this.#flushScheduled = false;
    const pending = this.#pendingUpdates.splice(0);
    const shouldNotify = pending.some(p => p.notifyWatchers);

    // Apply functional updates sequentially against current #values,
    // then merge plain object updates together
    let draft = structuredClone(this.#values);
    for (const { update } of pending) {
      const resolved = typeof update === 'function'
        ? update(structuredClone(draft))
        : update;
      // shallow-ish merge into accumulated object
      Object.assign(draft, resolved);
    }    

    this.#update({ detail: draft }, shouldNotify);

    // Devtools snapshot after each flush if in dev mode
    if (FlowState.#devMode && !this.#devBroadcastPending) {
      const now = performance.now();
      const remaining = FlowState.#DEV_THROTTLE_MS - (now - this.#devLastBroadcast);
      this.#devBroadcastPending = true;
      setTimeout(() => {
        this.#devBroadcastPending = false;
        this.#devLastBroadcast = performance.now();
        this.#broadcastSnapshot();
      }, Math.max(0, remaining));
    }
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

    // Start traversing from the target element up to the root
    let current = getParent(target);

    while (current && current !== root.host && current !== root) {
      // Check __Flow__ on the current node
      if (current.__Flow__ && current.__Flow__.hasKey(key)) {
        return true;
      }
      // If current has a shadowRoot, check __Flow__ on the shadowRoot
      if (current.shadowRoot && current.shadowRoot.__Flow__ && current.shadowRoot.__Flow__.hasKey(key)) {
        return true;
      }
      // Traverse up: if parentElement exists, use it; otherwise, try composed parent
      current = getParent(current);
    }

    return false;
  }


  // Recursively searches for elements matching the
  // selector in the root and all nested shadow roots.
  #querySelectorAllDeep(selector, root = this.#root) {
    const results = [...root.querySelectorAll(selector)];
    
    // Search in shadow roots of all elements
    let elements = [root, ...root.querySelectorAll('*')];
    elements.forEach(el => {
      if (el.shadowRoot) {
        results.push(...this.#querySelectorAllDeep(selector, el.shadowRoot));
      }
    });
    
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

    // Only update computed values if their function body references any of the updating keys
    const computedToUpdate = [];
    for (const key of this.#computedKeys) {
      const fn = this.#computed[key];
      const fnDeps = this.#computedDeps.get(key);

      if (fnDeps.some(dep => configuredKeys.includes(dep))) {
        computedToUpdate.push(key);
      }
    }

    // Add computed keys to update list
    const allKeysToUpdate = [...configuredKeys, ...computedToUpdate];

    // Call watchers
    if (notifyWatchers) {
      let watcherKeys = Array.from(this.#watchers.keys());
      const keysToNotify = this.#getWatchersToNotify(allKeysToUpdate, watcherKeys);
      keysToNotify.map(this.#notifyWatchersForKey.bind(this));
    }

    // Wait a microtask
    await null;

    // Update bindings
    allKeysToUpdate.map(this.#updateBindingsForKey.bind(this));
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


  // Notifies all watchers for a given key by calling
  // their callbacks with the current values.
  #notifyWatchersForKey(key) {
    const entries = this.#watchers.get(key);
    if (entries) {
      let value;
      if (this.#computed[key]) {
        value = this.#computed[key](this.#values);
      } else {
        value = key.split('.').reduce((o, k) => o?.[k], this.#values);
      }
      entries.forEach(({ callback }) => callback(value));
    }
  }


  #dashSeparatedKey(key) {
    return key.replace(/\./g, '-');
  }


  #getBindingsForKey(key) {
    const dashKey = this.#dashSeparatedKey(key);
    const propSelector = `[flow-watch-${dashKey}-to-prop]`;
    const attrSelector = `[flow-watch-${dashKey}-to-attr]`;
    const propBindings = this.#querySelectorAllDeep(propSelector);
    const attrBindings = this.#querySelectorAllDeep(attrSelector);

    // Look in flowThroughs for additional bindings
    for (const [shadowRoot, state] of this.#flowThroughs.entries()) {
      propBindings.push(...state.#querySelectorAllDeep(propSelector, shadowRoot));
      attrBindings.push(...state.#querySelectorAllDeep(attrSelector, shadowRoot));
    }
 
    return { propBindings, attrBindings };
  }


  // Updates all DOM bindings for a given key by querying
  // the root for elements with matching flow-watch attributes
  #updateBindingsForKey(key) {
    let value;
    if (this.#computed[key]) {
      value = this.#computed[key](this.#values);
    } else {
      value = key.split('.').reduce((o, k) => o?.[k], this.#values);
    }

    const dashKey = this.#dashSeparatedKey(key);
    const { propBindings, attrBindings } = this.#getBindingsForKey(key);

    propBindings.forEach(el => {
      // Skip the root element itself
      if (el === this.#root) return;

      let hasOverwritingFlow = FlowState.#hasOverwritingFlow(this.#root, el, key);
      if (hasOverwritingFlow) return;

      const prop = el.getAttribute(`flow-watch-${dashKey}-to-prop`);
      if (prop) {
        el[prop] = value;
      }
    })

    attrBindings.forEach(el => {
      // Skip the root element itself
      if (el === this.#root) return;

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


  // Get list of accessed state keys
  static #getComputedDependencies(fn, stateValues) {
    const accessed = new Set();
    
    const handler = {
      get(target, prop) {
        accessed.add(prop);
        const value = target[prop];
        // Recursively wrap nested objects
        if (value !== null && typeof value === 'object') {
          return new Proxy(value, handler);
        }
        return value;
      }
    };
    
    try {
      const proxy = new Proxy(stateValues, handler);
      fn(proxy); // Execute function to track access
    } catch (e) {
      // Ignore errors - function might not be pure
      console.warn(`Could not track dependencies for computed value: ${e.message}`);
    }
    
    return Array.from(accessed);
  }


  // Internal method to register a shadow root for flow-through access for state updates.
  #through(shadowRoot) {
    this.#flowThroughs.set(shadowRoot, this);
  }


  // Internal watch method that registers a watcher callback for a given key,
  // and immediately calls the callback with the current value.
  #watch(key, callback, event) {
    // Check if a hook is being watched
    if (key in this.#hooks) {
      // Immediately call the callback with the current hook value
      callback(this.#hooks[key]);
      return () => {};
    }

    // Check if key exists in state (supports dot notation)
    const exists = key in this.#computed || key.split('.').reduce((o, k) => (o && k in o ? o[k] : undefined), this.#values) !== undefined;
    if (!exists) {
      return () => {};
    }

    event?.stopPropagation();

    const source = event?.target
      ? (event.target.tagName?.toLowerCase() ?? 'unknown')
      : '(internal)';

    const entry = { callback, source };

    if (!this.#watchers.has(key)) this.#watchers.set(key, new Set());
    this.#watchers.get(key).add(entry);

    // Immediately call the callback with the current value
    let value;
    if (this.#computed[key]) {
      value = this.#computed[key](this.#values);
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
     * Checks if the state instance has the provided key (dot notation supported).
     * @param {string} key - The dot-separated key to check (e.g., 'user.name')
     * @returns {boolean} - True if the key exists in the state, false otherwise.
     */
  #hasKey(key) {
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
    if (this.#hooks[key]) {
      return this.#hooks[key];
    }
    let value;
    if (this.#computed[key]) {
      value = this.#computed[key](this.#values);
    } else {
      value = key.split('.').reduce((o, k) => o?.[k], this.#values);
    }
    return value;
  }


  // Builds a snapshot of the current state for devtools visualization
  #buildSnapshot() {
    let parentId = null;
    let closestDepth = -1;
    for (const [id, { root }] of FlowState.#registry) {
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
    const rootTag = isShadow
      ? `${root.host.tagName.toLowerCase()} (shadow)`
      : (root.tagName?.toLowerCase() ?? '#document');
    const watchers = Array.from(this.#watchers.entries()).flatMap(([key, entries]) =>
      Array.from(entries).map(({ source }) => ({ key, source }))
    );
    return {
      type: 'snapshot',
      id: this.#id,
      rootTag,
      label: this.#label,
      parentId,
      values,
      computedKeys: this.#computedKeys,
      watchers: watchers,
      watcherKeys: Array.from(this.#watchers.keys()),
      watcherCount: Array.from(this.#watchers.values()).reduce((n, s) => n + s.size, 0),
      flowThroughCount: this.#flowThroughs.size,
      timestamp: Date.now(),
    };
  }


  // Broadcasts the current state snapshot to the devtools visualizer if in dev mode
  #broadcastSnapshot() {
    FlowState.#devChannel?.postMessage(this.#buildSnapshot());
  }


  // Utility method to check if ancestor is a root of descendant (including shadow DOM boundaries)
  static #isAncestorRoot(ancestor, descendant) {
    let current = descendant instanceof ShadowRoot ? descendant.host : descendant;
    while (current) {
      const parent = current.parentNode;
      if (!parent) break;
      if (parent === ancestor) return true;          // ShadowRoot found as direct parent
      if (parent instanceof ShadowRoot) {
        current = parent.host;                       // cross shadow boundary
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


  /****************************/
  /****  Public Static API ****/
  /****************************/

  // Emit watcher registration event shorthand to use from a child element within the Scope.
  // Can import State to utilize this static method.
  static async watch(element, key, callback) {
    await null;
    element.dispatchEvent(new CustomEvent('flow-state-watch', {
      detail: {
        key,
        callback
      },
      bubbles: true,
      composed: true
    }));
  }


  // Can provide a callback OR wait on the promise to get the value
  static async get(element, key, callback) {
    await null; // defers 1 microtask to allow parent elements to initialize
    return new Promise((resolve) => {
      const wrappedCallback = (value) => {
        if (callback) callback(value);
        resolve(value);
      };
      element.dispatchEvent(new CustomEvent('flow-state-get', {
        detail: {
          key,
          callback: wrappedCallback
        },
        bubbles: true,
        composed: true
      }));
    });
  }


  static async through(shadowRoot) {
    if (!(shadowRoot instanceof ShadowRoot)) {
      throw Error("FlowState.through requires a ShadowRoot!");
    }
    await null;
    return new Promise((resolve) => {
      shadowRoot.dispatchEvent(new CustomEvent('flow-state-flow-through', {
        detail: {
          shadowRoot: shadowRoot
        },
        bubbles: true,
        composed: true
      }));
    });
  }


  // Allows for creating a FlowState on an element that may not exist yet.
  // So you can put the <script> tag before the element in HTML.
  static create(root, config = {}, hooks = {}, options = {}) {
    if (root instanceof Node) {
      return new FlowState(root, config, hooks, options);
    }
    throw Error("FlowState.create requires the root to be a DOM Node!");
  }


  // Starts the FlowState devtools visualizer in a new tab and connects it to the app.
  static devtools() {
    FlowState.#devMode = true;
    if (!FlowState.#devChannel) {
      FlowState.#devChannel = new BroadcastChannel('flowstate-devtools');
      FlowState.#devChannel.addEventListener('message', (e) => {
        if (e.data?.type === 'ready') {
          setTimeout(() => {
            for (const { getSnapshot } of FlowState.#registry.values()) {
              FlowState.#devChannel.postMessage(getSnapshot());
            }
          }, 50);
        }
        if (e.data?.type === 'highlight') {
          const entry = FlowState.#registry.get(e.data.id);
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
    }
    const url = new URL('../devtools/index.html', import.meta.url);
    const tab = window.open(url.href, 'flowstate-devtools');
    // If the tab was already open (reused), notify it the app has (re)loaded.
    // A freshly opened tab sends its own 'ready' on load instead.
    if (!tab || !tab.closed) {
      FlowState.#devChannel.postMessage({ type: 'init' });
    }
  }
}