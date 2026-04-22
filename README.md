# FlowState

A simple, lightweight, zero-dependency state library for web components and vanilla JavaScript.

## Features

- **Reactive state** — scoped to a DOM element and its descendants
- **Computed values** — derived state with automatic dependency tracking
- **Declarative DOM bindings** — bind state to element properties or attributes via HTML attributes
- **Watchers** — subscribe to granular key changes with dot-notation support
- **Shadow DOM aware** — opt-in to state updates through closed shadowRoot boundaries with `FlowState.through()`
- **Built-in devtools** — inspect all live state instances in a separate browser tab
- **Zero dependencies** — pure browser APIs; no build tool required

---

## Installation

```bash
npm install flow-state
```

Or import directly from a CDN:

```html
<script type="module">
  import { FlowState } from 'https://cdn.jsdelivr.net/npm/flow-state/index.js';
</script>
```

---

## Quick Start

```html
<!DOCTYPE html>
<html>
<body>
  <div id="app">
    <p flow-watch-count-to-prop="textContent"></p>
    <button id="inc">Increment</button>
  </div>

  <script type="module">
    import { FlowState } from 'flow-state';

    const app = document.getElementById('app');

    const state = new FlowState(app, {
      count: 0,
      doubled: (s) => s.count * 2,   // computed value
    });

    document.getElementById('inc').addEventListener('click', () => {
      state.update(prev => ({ count: prev.count + 1 }));
    });

    state.watch('count', value => console.log('count is', value));
  </script>
</body>
</html>
```

---

## Core Concepts

### Scope

A `FlowState` instance is **scoped to a root DOM element**. State updates propagate to all descendants of that root. Only one `FlowState` instance can be mounted per element.

```js
const state = new FlowState(rootElement, config, hooks, options);
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `rootElement` | `Node` | The DOM element that owns this state scope |
| `config` | `Object` | Initial state. Functions become **computed values**. |
| `hooks` | `Object` | Non-reactive static values (e.g. callbacks, services) |
| `options` | `Object` | `{ label: string }` — labels this instance in devtools |

Returns an **instance API** object: `{ update, watch, get, through }`.

### Config — Values and Computed

Plain values and computed values are declared together in `config`. Any value whose definition is a function is treated as a **computed value** — it receives the current state and returns a derived result.

```js
const state = new FlowState(app, {
  firstName: 'Jane',
  lastName: 'Doe',
  fullName: (s) => `${s.firstName} ${s.lastName}`,  // computed
  items: [],
  total: (s) => s.items.reduce((sum, i) => sum + i.price, 0), // computed
});
```

Computed values are read-only and update automatically when their dependencies change.

### Nested State

State can be deeply nested using plain objects:

```js
const state = new FlowState(app, {
  user: {
    name: 'Jane',
    address: {
      city: 'Austin',
    },
  },
});

state.update({ user: { name: 'John' } });  // deep merge — city is preserved
state.watch('user.address.city', city => console.log(city));
```

---

## Instance API

### `state.update(partialOrFn)`

Update state values. Only keys declared in the initial config can be updated. New, non-configured state keys will be ignored. Updates are batched and flushed as microtasks.

```js
// Partial object — merged into current state
state.update({ count: 5 });

// Functional update — receives previous state, must return partial object
state.update(prev => ({ count: prev.count + 1 }));
```

### `state.watch(key, callback)`

Subscribe to changes on a state key. The callback is called immediately with the current value and again on every subsequent change. Returns an unsubscribe function.

Dot notation is supported for nested keys. Watching a parent key (e.g. `'user'`) triggers when any descendant (e.g. `'user.name'`) changes.

```js
const unsub = state.watch('user.name', name => {
  console.log('Name changed:', name);
});

// Later:
unsub();
```

### `state.get(key)`

Get the current value of a state key once.

```js
const count = state.get('count');
```

---

## Static API

For use inside **child elements** that don't hold a direct reference to the parent `FlowState` instance. These methods dispatch events that bubble up to the nearest owning scope.

### `FlowState.watch(element, key, callback)`

Register a watcher from a descendant element. Bubbles up through the DOM to find the nearest `FlowState` scope that owns `key`.

```js
class MyWidget extends HTMLElement {
  connectedCallback() {
    FlowState.watch(this, 'count', value => {
      this.textContent = value;
    });
  }
}
```

### `FlowState.get(element, key, callback?)`

Get a state value from a descendant element. Returns a promise and optionally accepts a callback.

```js
const value = await FlowState.get(this, 'user.name');

// OR...

FlowState.get(this, 'user.name', (userName) => {
  // Do something
});
```

### `FlowState.create(root, config, hooks, options)`

Alias for `new FlowState(...)`.

```html
<div id="app">...</div>
<script type="module">
  import { FlowState } from 'flow-state';

  FlowState.create(document.querySelector('#app'), { count: 0 });
</script>
```

---

## Declarative DOM Bindings

Bind state to element properties or attributes directly in HTML — no JavaScript required on the receiving element.

### Bind to a property

```html
<!-- Sets element.textContent = state.count -->
<span flow-watch-count-to-prop="textContent"></span>

<!-- Sets element.value = state.user.name (dots become dashes) -->
<input flow-watch-user-name-to-prop="value" />
```

### Bind to an attribute

```html
<!-- Sets el.setAttribute('aria-label', state.status) -->
<div flow-watch-status-to-attr="aria-label"></div>
```

> **Key format:** dots in state key names are replaced with dashes in attribute names.
> `user.address.city` → `flow-watch-user-address-city-to-prop`

---

## Shadow DOM — `FlowState.through()`

By default, `FlowState` pierces through open shadow DOMs. Call `FlowState.through()` from inside a shadow root to opt it in to parent state scopes:

```js
class MyCard extends HTMLElement {
  connectedCallback() {
    this.attachShadow({ mode: 'closed' });
    FlowState.through(this.shadowRoot); // link this shadow to the parent scope
  }
}
```

After this, declarative bindings inside the shadow root will receive updates from the parent `FlowState` scope.

---

## Hooks

Hooks are non-reactive, static values that can be injected into the state scope — useful for passing callbacks, services, or config to deeply nested child components without prop-drilling.

```js
const state = new FlowState(app, config, {
  onSave: async (data) => { /* ... */ },
  apiUrl: '/api/v1',
});
```

Hooks are accessible via `FlowState.get(element, 'apiUrl')` like any other state value or `state.watch('onSave', fn)` (called once immediately like all watched values but will not fire again due to hooks being static and immutable).

---

## Devtools

FlowState ships with a built-in devtools panel that visualizes all live state instances on the page, their current values, computed keys, watchers, and scope hierarchy.

```js
import { FlowState } from 'flow-state';

FlowState.devtools(); // opens the panel in a new browser tab
```

The panel updates in real time as state changes (throttled to ~10 fps). Click any instance to inspect its values. Hover to highlight the corresponding DOM element.

> The devtools use the `BroadcastChannel` API and work across tabs in the same origin.

---

## Showcase Apps

The `apps/` directory contains fully functional example applications built with FlowState. Each app is self-contained and can be opened directly in a browser — no build step required.

| App | Entry | Description |
|-----|-------|-------------|
| `apps/app1/` | [index.html](apps/app1/index.html) | Work/map view with ArcGIS integration |
| `apps/budget/` | [index.html](apps/budget/index.html) | Personal budget tracker with transactions |
| `apps/calendar/` | [index.html](apps/calendar/index.html) | Monthly calendar with sidebar |
| `apps/stress/` | [index.html](apps/stress/index.html) | Stress tracker |
| `apps/todo/` | [index.html](apps/todo/index.html) | Todo list |

To run any app locally, serve the repo root with any static file server:

```bash
npx serve .
# then open http://localhost:3000/apps/todo/
```

---

## Browser Support

FlowState targets modern browsers with native support for:

- ES Modules (`import`/`export`)
- Custom Elements v1
- Shadow DOM v1
- `BroadcastChannel`
- Private class fields (`#field`)
- `queueMicrotask`

No polyfills are included. All major browsers (Chrome, Firefox, Safari, Edge) have supported these APIs since 2021+.

---

## License

MIT
