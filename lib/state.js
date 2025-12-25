export class State {
  #root;
  #values = {};
  #computed = {};
  #computedKeys = [];
  ready;         // Public promise that resolves when state is ready
  #watchers = new Map();

  constructor(root, config = {}) {
    if (!(root instanceof Node)) {
      throw Error("State constructor requires the root element to be a DOM Node!");
    }

    this.#root = root;
    // Expose state instance on root el for static access
    this.#root.__state__ = this;

    // Internal instance for private fields and logic
    let resolveReady;
    this.ready = new Promise((resolve) => {
      resolveReady = resolve;
    });

    // Separate values from computed (functions)
    const entries = Object.entries(config);
    const valueEntries = entries.filter(([, v]) => typeof v !== 'function');
    const computedEntries = entries.filter(([, v]) => typeof v === 'function');

    this.#computedKeys = computedEntries.map(([k]) => k);
    this.#computed = Object.fromEntries(computedEntries);

    // Recursively set initial values
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

    setNested(this.#values, Object.fromEntries(valueEntries));

    // Create the public API object and recursively define getters
    const publicApi = {};

    // Expose ready promise and update method on publicApi
    Object.defineProperty(publicApi, 'ready', {
      get: () => this.ready,
      enumerable: false
    });

    // update will be set after ready promise resolves
    publicApi.update = (...args) => {
      console.error("Unable to update state before ready! Wait for the State instance's .ready promise to resolve before directly updating state with .update(). Or use State.update(element, detail) static method to guarantee update.");
    };

    // Add .watch method to public API
    publicApi.watch = this.#watch.bind(this);

    root.addEventListener('state-emission', this.#update.bind(this));

    // Listen for watcher registration events
    root.addEventListener('state-watch', (e) => {
      const { key, callback } = e.detail || {};
      this.#watch(key, callback, e);
    });

    Promise.resolve().then(() => { // Makes Web Components to work. Ensures children are ready.
      publicApi.update = this.#publicUpdateReady.bind(this);
      this.#update({ detail: this.#values });
      resolveReady();
    });

    return publicApi;
  }

  static #waitForElement(id) {
    return new Promise((resolve) => {
      const el = document.getElementById(id);
      if (el) {
        return resolve(el);
      }

      const observer = new MutationObserver(() => {
        const el = document.getElementById(id);
        if (el) {
          observer.disconnect();
          resolve(el);
        }
      });

      observer.observe(document.body, {
        childList: true,
        subtree: true
      });
    });
  }

  #querySelectorAllDeep(selector, root = this.#root) {
    const results = [...root.querySelectorAll(selector)];
    
    // Search in shadow roots of all elements
    const elements = root.querySelectorAll('*');
    elements.forEach(el => {
      if (el.shadowRoot) {
        results.push(...this.#querySelectorAllDeep(selector, el.shadowRoot));
      }
    });
    
    return results;
  }

  #update(e) {
    let updates = e.detail || {};

    // Provide current state if update is a function
    if (typeof e.detail === 'function') {
      updates = e.detail(structuredClone(this.#values));
    }

    // Recursively merge updates into #values, but do NOT allow new keys
    const merge = (target, src) => {
      for (const k in src) {
        if (!(k in target)) {
          // Ignore new keys
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

    // Only update computed values if their function body references any of the updating keys
    const computedToUpdate = [];
    for (const key of this.#computedKeys) {
      const fn = this.#computed[key];
      const fnStr = fn.toString();
      // Try to extract the first parameter name from the function definition
      let paramName = 'state';
      const match = fnStr.match(/^\s*(?:function)?\s*\(?\s*([\w$]+)\s*[),]/) || fnStr.match(/^\s*\(?\s*([\w$]+)\s*=>/);
      if (match && match[1]) {
        paramName = match[1];
      }
      // Check for any updated key being referenced in the function body
      if (updatedKeys.some(updateKey => {
        const parts = updateKey.split('.');
        let found = false;
        for (let i = 1; i <= parts.length; i++) {
          const path = parts.slice(0, i).join('.');
          // Look for paramName.<path> (with word boundary)
          const regex = new RegExp(paramName + `\\.${path}\\b`, 'g');
          if (regex.test(fnStr)) {
            found = true;
            break;
          }
        }
        return found;
      })) {
        computedToUpdate.push(key);
      }
    }

    // Add computed keys to update list
    const allKeysToUpdate = [...updatedKeys, ...computedToUpdate];

    // Ignore updates to keys not configured in state
    let configuredKeys = allKeysToUpdate.filter(key => this.isConfiguredKey(key));

    configuredKeys.forEach(key => {
      let value;
      if (this.#computed[key]) {
        value = this.#computed[key](this.#values);
      } else {
        value = key.split('.').reduce((o, k) => o?.[k], this.#values);
      }
      this.#updateBindings(key, value);
    });

    let watcherKeys = Array.from(this.#watchers.keys());
    const keysToNotify = this.#getWatchersToNotify(configuredKeys, watcherKeys);

    // Call watchers for changed keys
    keysToNotify.forEach(key => {
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
    });
  }

  /**
   * Checks if a dot-separated key is a configured key in the state (including nested keys).
   * @param {string} key - The dot-separated key to check (e.g., 'user.name')
   * @returns {boolean} - True if the key exists in the state, false otherwise.
   */
  isConfiguredKey(key) {
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

  #updateBindings(key, value) {
    const selector = `[bind-state="${key}"]`;
    let bindings = this.#querySelectorAllDeep(selector);

    // Include the root itself if it matches
    if (this.#root && this.#root.matches && this.#root.matches(selector)) {
      bindings = [this.#root, ...bindings];
    }

    bindings.forEach(el => {
      const prop = el.getAttribute('to-prop');
      if (prop) {
        el[prop] = value;
      }
      const attr = el.getAttribute('to-attr');
      if (attr) {
        el.setAttribute(attr, value);
      }
    });
  }


  #publicUpdateReady(update) {
    return this.#update({ detail: update });
  }

  // Private static method: searches parent lineage for
  // elements with public getters matching update keys
  static #parentStatesReady(el, updateKeys) {
    // let updateKeys = Object.keys(update);
    const readyPromises = [];
    while (el) {
      if (el.__state__) {
        for (const key of updateKeys) {
          // Check if the state instance has a public getter for this key
          const descriptor = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el.__state__), key);
          if (descriptor && typeof descriptor.get === 'function') {
            // Collect the readiness promise (if available)
            if (el.__state__.ready && typeof el.__state__.ready.then === 'function') {
              readyPromises.push(el.__state__.ready);
            }
          }
        }
      }
      el = el.parentNode;
    }

    return readyPromises;
  }

  #watch(key, callback, event) {
    // Check if key exists in state (supports dot notation)
    const exists = key in this.#computed || key.split('.').reduce((o, k) => (o && k in o ? o[k] : undefined), this.#values) !== undefined;
    if (!exists) {
      return () => {};
    }
    if (!this.#watchers.has(key)) this.#watchers.set(key, new Set());
    this.#watchers.get(key).add(callback);
    // Return unsubscribe function
    return () => {
      this.#watchers.get(key)?.delete(callback);
    };
  }


  /****  Public Static API ****/

  // Emit update event shorthand to use from a child element within the Scope.
  // Can import State to utilize this static method to ensure a wait for ready parent states.
  static async update(element, detail) {
    let updateKeys = Object.keys(detail);
    await Promise.all(State.#parentStatesReady(element, updateKeys));
    element.dispatchEvent(new CustomEvent('state-emission', {
      detail,
      bubbles: true,
      composed: true
    }));
  };

  // Emit watcher registration event shorthand to use from a child element within the Scope.
  // Can import State to utilize this static method.
  static async watch(element, key, callback) {
    await Promise.all(State.#parentStatesReady(element, [key])); // might not be necessary?
    element.dispatchEvent(new CustomEvent('state-watch', {
      detail: {
        key,
        callback
      },
      bubbles: true,
      composed: true
    }));
  }

  static async create(root, config = {}) {
    // If root is a string, wait for the element to exist.
    // This allows you to define state for elements that may not yet be in the DOM or created in code yet.
    let el = root;
    if (typeof root === 'string') {
      el = await State.#waitForElement(root);
    }
    const state = new State(el, config);
    await state.ready;
    return state;
  }
}