export class NodeState {
  #root;
  #hooks = {};
  #values = {};
  #computed = {};
  #computedKeys = [];
  #computedDeps = new Map();
  #watchers = new Map();

  constructor(root, config = {}, hooks = {}) {
    // Check: 1
    // Check if a NodeState instance is already mounted on this root
    if (root.__N$__) {
      console.warn("Cannot mount multiple NodeState instances on the same root element.");
      // Or should you be able to?
      // Allow freedom to or enforce opinionated best practice?
      // Or, should it be a configurable mode? "lazy" mode?
      return root.__N$__;
    }

    // Check: 2
    if (!(root instanceof Node)) {
      throw Error("State constructor requires the root element to be a DOM Node!");
      // Should it allow an element id string? I'm thinking no...
      // Maybe would keep other, far-away code from mounting to and affecting things they shouldn't or didn't intend to
    }

    this.#root = root;

    this.#hooks = hooks;

    const entries = Object.entries(config);

    // Separate values from computed values (functions)
    const valueEntries = entries.filter(([, v]) => typeof v !== 'function');

    // Apply initial values to DOM bindings
    const setNested = (target, obj) => {
      for (const [k, v] of Object.entries(obj)) {
        if (typeof v === 'object' && v !== null && typeof v !== 'function' && !Array.isArray(v)) {
          target[k] = {};
          setNested(target[k], v);
        } else {
          target[k] = v;
        }
      }
    };

    // Set initial instance state values
    setNested(this.#values, Object.fromEntries(valueEntries));

    // Computed
    const computedEntries = entries.filter(([, v]) => typeof v === 'function');
    this.#computedKeys = computedEntries.map(([k]) => k);
    this.#computed = Object.fromEntries(computedEntries);
    // Track dependencies for computed values
    for (const [key, fn] of computedEntries) {
      const fnDeps = this.#getComputedDependencies(fn, this.#values);
      this.#computedDeps.set(key, fnDeps);
    }

    // Listen for 'watch'  registration events
    this.#root.addEventListener('node-state-watch', (e) => {
      const { key, callback } = e.detail || {};
      this.#watch(key, callback, e);
    });

    // Listen for 'get' events
    this.#root.addEventListener('node-state-get', (e) => {
      const { key, callback } = e.detail || {};
      let value = this.#get(key);
      if (value !== undefined) callback(value);
      let higherState = this.#hasOverwritingState(document, this.#root, key);
      if (!higherState) callback(value);
    });

    // Expose limited 'hasKey' API on root el
    Object.defineProperty(this.#root, '__N$__', {
      value: {
        hasKey: this.#hasKey.bind(this),
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
        value: (update) => this.#update({ detail: update }, true),
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
      }
    });

    // Update bindings
    this.#update({ detail: this.#values });

    return instanceApi;
  }


  // Checks if there is an overwriting state instance between
  // root and target (inclusive) with the given key,
  // and if so, returns true. Otherwise returns false.
  #hasOverwritingState(root, target, key) {
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
      // Check __N$__ on the current node
      if (current.__N$__ && current.__N$__.hasKey(key)) {
        return true;
      }
      // If current has a shadowRoot, check __N$__ on the shadowRoot
      if (current.shadowRoot && current.shadowRoot.__N$__ && current.shadowRoot.__N$__.hasKey(key)) {
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

    // Collect all updated keys (dot notation)
    const collectKeys = (obj, prefix = []) => {
      let keys = [];
      for (const k in obj) {
        if (typeof obj[k] === 'object' && obj[k] !== null && !Array.isArray(obj[k])) {
          keys = keys.concat(collectKeys(obj[k], [...prefix, k]));
        } else {
          keys.push([...prefix, k].join('.'));
        }
      }
      return keys;
    };

    const updatedKeys = collectKeys(updates);

    const updatedAncestors = NodeState.#getCommonAncestors(updatedKeys);

    const configuredKeys = [...updatedKeys, ...updatedAncestors]
      .filter(key => this.#isConfiguredKey(key))
      .sort();
    
    // Recursively merge updates into #values, but do NOT allow new keys
    const merge = (target, src) => {
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
          merge(target[k], src[k]);
        } else {
          target[k] = src[k];
        }
      }
    };

    merge(this.#values, updates);

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
    const cbs = this.#watchers.get(key);
    if (cbs) {
      let value;
      if (this.#computed[key]) {
        value = this.#computed[key](this.#values);
      } else {
        value = key.split('.').reduce((o, k) => o?.[k], this.#values);
      }
      cbs.forEach(cb => cb(value));
    }
  }


  // Updates all DOM bindings for a given key by querying
  // the root for elements with matching ns-bind attributes
  #updateBindingsForKey(key) {
    let value;
    if (this.#computed[key]) {
      value = this.#computed[key](this.#values);
    } else {
      value = key.split('.').reduce((o, k) => o?.[k], this.#values);
    }

    const dashSeparatedKey = key.replace(/\./g, '-');
    const propSelector = `[ns-bind-${dashSeparatedKey}-to-prop]`;
    const attrSelector = `[ns-bind-${dashSeparatedKey}-to-attr]`;
    let propBindings = this.#querySelectorAllDeep(propSelector);
    let attrBindings = this.#querySelectorAllDeep(attrSelector);

    propBindings.forEach(el => {
      // Skip the root element itself
      if (el === this.#root) return;

      let hasOverwritingState = this.#hasOverwritingState(this.#root, el, key);
      if (hasOverwritingState) return;

      const prop = el.getAttribute(`ns-bind-${dashSeparatedKey}-to-prop`);
      if (prop) {
        el[prop] = value;
      }
    })

    attrBindings.forEach(el => {
      // Skip the root element itself
      if (el === this.#root) return;

      let hasOverwritingState = this.#hasOverwritingState(this.#root, el, key);
      if (hasOverwritingState) return;

      const attr = el.getAttribute(`ns-bind-${dashSeparatedKey}-to-attr`);
      if (attr) {
        if (value instanceof Object) {
          value = JSON.stringify(value);
        }
        el.setAttribute(attr, value);
      }
    });
  }


  // Get list of accessed state keys
  #getComputedDependencies(fn, stateValues) {
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

    if (!this.#watchers.has(key)) this.#watchers.set(key, new Set());
    this.#watchers.get(key).add(callback);

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
      this.#watchers.get(key)?.delete(callback);
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


  /****************************/
  /****  Public Static API ****/
  /****************************/

  // Emit watcher registration event shorthand to use from a child element within the Scope.
  // Can import State to utilize this static method.
  static async watch(element, key, callback) {
    await null;
    element.dispatchEvent(new CustomEvent('node-state-watch', {
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
      element.dispatchEvent(new CustomEvent('node-state-get', {
        detail: {
          key,
          callback: wrappedCallback
        },
        bubbles: true,
        composed: true
      }));
    });
  }


  // Allows for creating a NodeState on an element that may not exist yet.
  // So you can put the <script> tag before the element in HTML.
  static create(root, config = {}, hooks = {}) {
    if (root instanceof Node) {
      return new NodeState(root, config, hooks);
    }
    throw Error("NodeState.create requires the root to be a DOM Node!");
  }
}