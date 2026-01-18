# NodeState.js

An opinionated, reactive state management class for DOM nodes, designed for use in web components and vanilla JS apps. NodeState enables binding state to DOM elements, computed properties, deep updates, and watcher subscriptions, with support for nested state and shadow DOM.

Opinionated: Design decisions intended to encourage/forge certain patterns i.e. only being able to update configured keys and having to use hooks to update parent states.


## Features
- Bind state to a DOM node (including shadow roots)
- Support for nested state objects and computed properties
- Deep selector support (including shadow DOM)
- Watchers for state changes (with dot notation for nested keys)
- Attribute and property binding via custom attributes
- Async initialization and readiness promise
- Eliminates React's prop drilling to deeply nested components

## API

### Constructor
```js
new NodeState(root, config)
```
- `root` (Node): The DOM node to bind state to. Throws if not a Node.
- `config` (Object): Initial state values and computed properties. Functions are treated as computed properties. Optionally, pass a `hooks` object for custom hooks.

### Static Methods
- `NodeState.create(root, config)` → Promise<NodeState>
  - Async factory. Waits for `root` if a string selector is provided.
- `NodeState.watch(element, key, callback)`
  - Registers a watcher for a state key on a DOM element. Supports string selectors for `element`.
- `NodeState.get` TODO

### Instance Methods (Public API)
- `state.ready` → Promise<void>
  - Resolves when state is initialized and bindings are ready.
- `state.update(updates)`
  - Deeply updates state values. Only configured keys are updated.
- `state.watch(key, callback)`
  - Subscribes to changes for a key (dot notation supported). Returns an unsubscribe function.
- `state.hasKey(key)`
  - Checks if a key (dot notation) exists in the state.

## Usage Example

```js
import { NodeState } from './lib/NodeState.js';

// HTML: <div id="my-root"></div>
const config = {
  count: 0,
  user: { name: 'Alice' },
  doubleCount: (state) => state.count * 2,
  hooks: { onLogin: () => alert('Logged in!') }
};

const state = new NodeState(document.getElementById('my-root'), config);

state.ready.then(() => {
  state.update({ count: 1 });
  state.watch('count', (val) => console.log('Count changed:', val));
  state.watch('doubleCount', (val) => console.log('Double:', val));
});

// Attribute/property binding in HTML:
// <span nstate-count-to-prop="textContent"></span>
// <span nstate-user-name-to-attr="data-username"></span>
```

## Notes
- Only keys defined in the initial config can be updated. Must provide hooks to child components to update state without direct reference to it.
- Computed properties are functions in the config; they receive the current state as an argument.
- Supports deep/nested state and dot notation for keys.
- Designed for use in web components and vanilla JS apps.
- Use instance methods for local reading and updating, use static methods for reading from overall system (local and directly above)
- Always pass the same root where your template content lives:
If using shadow DOM: new NodeState(this.shadowRoot, {...})
If using light DOM: new NodeState(this, {...}) and append template to this

## License
MIT
