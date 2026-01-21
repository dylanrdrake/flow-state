export class NodeState {
  #root;
  #values = {};
  #computed = {};
  #computedKeys = [];
  #watchers = new Map();
  #hooks = {};

  constructor(root, config = {}) {
    if (root.__N$__) {
      console.warn("Cannot mount multiple NodeState instances on the same root element.");
      return root.__N$__;
    }

    if (!(root instanceof Node)) {
      throw Error("State constructor requires the root element to be a DOM Node!");
    }

    // if (root.shadowRoot) {
    //   root = root.shadowRoot;
    // }

    this.#root = root;

    this.#hooks = config.hooks || {};
    delete config.hooks;

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

    // Listen for watcher registration events
    this.#root.addEventListener('node-state-watch', (e) => {
      const { key, callback } = e.detail || {};
      this.#watch(key, callback, e);
    });

    this.#root.addEventListener('node-state-get', (e) => {
      const { key, callback } = e.detail || {};
      let value = this.#get(key);
      if (value !== undefined) callback(value);
      let higherState = this.#hasOverwritingState(document, this.#root);
      if (!higherState) callback(value);
    });

    // Expose limited API on root el
    Object.defineProperty(this.#root, '__N$__', {
      value: {
        hasKey: this.#hasKey.bind(this),
        // ready: this.ready
      },
      writable: false,
      enumerable: true,
      configurable: false
    });

    const instanceApi = {};

    Object.defineProperty(instanceApi, 'update', {
      value: (update) => this.#update({ detail: update }, true),
      writable: false,
      enumerable: true,
      configurable: false
    });

    Object.defineProperty(instanceApi, 'watch', {
      value: this.#watch.bind(this),
      writable: false,
      enumerable: true,
      configurable: false
    });

    Object.defineProperty(instanceApi, 'get', {
      value: this.#get.bind(this),
      writable: false,
      enumerable: true,
      configurable: false
    });
    
    Object.defineProperty(instanceApi, 'hasKey', {
      value: this.#hasKey.bind(this),
      writable: false,
      enumerable: true,
      configurable: false
    });

    this.#update({ detail: this.#values });// update bindings

    return instanceApi;
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

  #hasOverwritingState(root, target) {
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

    let current = getParent(target);

    while (current && current !== root.host && current !== root) {
      // Check __N$__ on the current node
      if (current.__N$__) {
        return current.__N$__;
      }
      // If current has a shadowRoot, check __N$__ on the shadowRoot
      if (current.shadowRoot && current.shadowRoot.__N$__) {
        return current.shadowRoot.__N$__;
      }
      // Traverse up: if parentElement exists, use it; otherwise, try composed parent
      current = getParent(current);
    }
    return false;
  }

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

  async #update(e, notifyWatchers = false) {
    let updates = e.detail || {};

    // Provide current state if update is a function
    if (typeof e.detail === 'function') {
      updates = e.detail(structuredClone(this.#values));
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
      .filter(key => this.isConfiguredKey(key));
    
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
      if (configuredKeys.some(updateKey => {
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
    const allKeysToUpdate = [...configuredKeys, ...computedToUpdate];

    if (notifyWatchers) {
      let watcherKeys = Array.from(this.#watchers.keys());
      const keysToNotify = this.#getWatchersToNotify(allKeysToUpdate, watcherKeys);

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

    // Update bindings
    await null;
    allKeysToUpdate.map(this.#updateBindings.bind(this));
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


  #updateBindings(key) {
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
      let hasOverwritingState = this.#hasOverwritingState(this.#root, el);
      if (hasOverwritingState && hasOverwritingState.hasKey(key)) {
        // Skip elements that have an overwriting state in between
        return;
      }
      const prop = el.getAttribute(`ns-bind-${dashSeparatedKey}-to-prop`);
      if (prop) {
        el[prop] = value;
      }
    })

    attrBindings.forEach(el => {
      // Skip the root element itself
      if (el === this.#root) return;
      let hasOverwritingState = this.#hasOverwritingState(this.#root, el);
      if (hasOverwritingState && hasOverwritingState.hasKey(key)) {
        // Skip elements that have an overwriting state in between
        return;
      }
      const attr = el.getAttribute(`ns-bind-${dashSeparatedKey}-to-attr`);
      if (attr) {
        if (value instanceof Object) {
          value = JSON.stringify(value);
        }
        el.setAttribute(attr, value);
      }
    });
  }


  // Private static method: searches parent lineage for
  // elements with public getters matching update keys
  static #parentStatesReady(el, updateKeys) {
    // let updateKeys = Object.keys(update);
    const readyPromises = [];
    while (el) {
      if (el.__N$__) {
        for (const key of updateKeys) {
          // Check if the state instance has a public getter for this key
          const descriptor = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el.__N$__), key);
          if (descriptor && typeof descriptor.get === 'function') {
            // Collect the readiness promise (if available)
            if (el.__N$__.ready && typeof el.__N$__.ready.then === 'function') {
              readyPromises.push(el.__N$__.ready);
            }
          }
        }
      }
      el = el.parentNode;
    }

    return readyPromises;
  }


  #watch(key, callback, event) {
    // Check if a hook is being watched
    if (key.startsWith('hooks.')) {
      const hookName = key.slice(6);
      if (hookName in this.#hooks) {
        // Immediately call the callback with the current hook value
        callback(this.#hooks[hookName]);
      }
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


  #get(key) {
    if (key.startsWith('hooks.')) {
      const hookName = key.slice(6);
      if (hookName in this.#hooks) {
        // Immediately call the callback with the current hook value
        return this.#hooks[hookName];
      }
      return undefined;
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
    // if (typeof element === 'string') {
    //   element = await NodeState.#waitForElement(element);
    // }
    // if (element.shadowRoot) {
    //   element = element.shadowRoot;
    // }
    // await Promise.all(NodeState.#parentStatesReady(element, [key])); // necessary for watchers from below
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
    // if (typeof element === 'string') {
    //   element = await NodeState.#waitForElement(element);
    // }
    // if (element.shadowRoot) {
    //   element = element.shadowRoot;
    // }
    // await Promise.all(NodeState.#parentStatesReady(element, [key])); // might not be necessary?
    await null;
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
  static create(root, config = {}) {
    if (root instanceof Node) {
      return new NodeState(root, config);
    }
    // else if (typeof root === 'string') {
    //   this.ready = NodeState.#waitForElement(root).then((el) => {
    //     return new NodeState(el, config);
    //   });
    //   return this.ready;
    // }
    throw Error("NodeState.create requires the root to be a DOM Node!");
  }
}



// Saving for possible future use
function deepWatch(obj, callback) {
  function createProxy(target, path = []) {
    return new Proxy(target, {
      set(t, prop, value) {
        const fullPath = [...path, prop].join(".");
        callback(fullPath, value);
        if (typeof value === "object" && value !== null) {
          value = createProxy(value, [...path, prop]);
        }
        t[prop] = value;
        return true;
      },
      get(t, prop) {
        const val = t[prop];
        if (typeof val === "object" && val !== null && !val.__isProxy) {
          t[prop] = createProxy(val, [...path, prop]);
          t[prop].__isProxy = true;
        }
        return t[prop];
      }
    });
  }
  return createProxy(obj);
}