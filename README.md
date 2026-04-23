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
      init: {
        count: 0,
        doubled: (s) => s.count * 2,   // computed value
      },
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

A `FlowState` instance is **scoped to a root DOM element**. State updates propagate to all descendants/children of that root. Only one `FlowState` instance can be mounted per element.

```js
const state = new FlowState(rootElement, { init, hooks, options });
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `rootElement` | `Node` | The DOM element that this state scope is mounted to |
| `config` | `Object` | Configuration object: `{ init, hooks, options }` |
| `config.init` | `Object` | Initial state. Functions become **computed values**. |
| `config.hooks` | `Object` | Non-reactive static values (e.g. callbacks, services) |
| `config.options` | `Object` | `{ label: string }` — labels this instance in devtools (to be expanded later...) |

Returns an **instance API** object: `{ update, watch, get, through }`.

### Config — Values and Computed

Plain values and computed values are declared together in `config.init`. Any value whose definition is a function is treated as a **computed value** — it receives the current state and returns a derived result.

```js
const state = new FlowState(app, {
  init: {
    firstName: 'Jane',
    lastName: 'Doe',
    fullName: (s) => `${s.firstName} ${s.lastName}`,  // computed
    items: [],
    total: (s) => s.items.reduce((sum, i) => sum + i.price, 0), // computed
  },
});
```

Computed values are read-only and update automatically when their dependencies change.

### Nested State

State can be deeply nested using plain objects:

```js
const state = new FlowState(app, {
  init: {
    user: {
      name: 'Jane',
      address: {
        city: 'Austin',
      },
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

Both methods are **synchronous** — the event dispatches and resolves inline. They must be called from `connectedCallback`, not from `constructor`. See [Timing Rules](#timing-rules) below.

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

### `FlowState.get(element, key)`

Get a state value from a descendant element synchronously. Returns the value directly.

```js
class MyWidget extends HTMLElement {
  connectedCallback() {
    const userName = FlowState.get(this, 'user.name');
  }
}
```

### `FlowState.create(root, config)`

Alias for `new FlowState(...)`.

```html
<div id="app">...</div>
<script type="module">
  import { FlowState } from 'flow-state';

  FlowState.create(document.querySelector('#app'), {
    init: { count: 0 }
  });
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
const state = new FlowState(app, {
  init: config,
  hooks: {
    onSave: async (data) => { /* ... */ },
    apiUrl: '/api/v1',
  }
});
```

Hooks are accessible via `FlowState.get(element, 'apiUrl')` from a child's `connectedCallback` like any other state value, or via `state.watch('onSave', fn)` on the instance directly (called once immediately, then never again since hooks are static).

---

## Timing Rules

FlowState's static methods (`FlowState.watch`, `FlowState.get`) work by dispatching a DOM event that bubbles up to the nearest ancestor with a matching FlowState scope. For this to work, the parent's FlowState instance must already be initialized and listening when the event fires.

### Use static methods in `connectedCallback`, not `constructor`

The browser fires `connectedCallback` **parent-first, then children**. By the time a child's `connectedCallback` runs, the parent's `connectedCallback` has already completed — so the FlowState listener is guaranteed to exist.

Constructors fire in the opposite order (children first), so calling static methods there will dispatch an event before any parent listener is registered and the call will silently do nothing.

```js
// ✅ Correct
class MyWidget extends HTMLElement {
  connectedCallback() {
    FlowState.watch(this, 'count', value => { this.textContent = value; });
    this.#hook = FlowState.get(this, 'onSave');
  }
}

// ❌ Wrong — parent listener doesn't exist yet
class MyWidget extends HTMLElement {
  constructor() {
    super();
    FlowState.watch(this, 'count', value => { this.textContent = value; }); // silent no-op
  }
}
```

### Initialize FlowState before stamping children into the DOM

When a parent element creates its FlowState instance and stamps its template in the same synchronous block, the order matters. Appending a template to the DOM synchronously connects all child custom elements, firing their `connectedCallback`s immediately. If FlowState isn't initialized yet at that point, those child calls will find no listener.

**Always create the FlowState instance before calling `appendChild`:**

```js
class MyParent extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });

    // ✅ FlowState first — listener is registered before children connect
    this.#state = new FlowState(this.shadowRoot, { init: { count: 0 } });

    // Children's connectedCallbacks fire here and can successfully call
    // FlowState.watch / FlowState.get
    this.shadowRoot.appendChild(template.content.cloneNode(true));
  }
}
```

```js
class MyParent extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });

    // ❌ Children connect here, FlowState doesn't exist yet
    this.shadowRoot.appendChild(template.content.cloneNode(true));

    // Too late — child connectedCallbacks already fired
    this.#state = new FlowState(this.shadowRoot, { init: { count: 0 } });
  }
}
```

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
