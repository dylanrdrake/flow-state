# FlowState

A simple, lightweight, zero-dependency state library for web components and vanilla JavaScript.

**[View the tutorial →](https://dylanrdrake.github.io/flow-state/apps/tutorial)**

## At a Glance

The entire public API — 5 instance methods, 6 static methods, and 5 HTML attributes:

| | |
|---|---|
| **5 instance methods** | `update` · `watch` · `get` · `through` · `destroy` |
| **6 static methods** | `FlowState.watch` · `FlowState.get` · `FlowState.through` · `FlowState.create` · `FlowState.compute` · `FlowState.devtools` |
| **2 scope bindings** | `flow-watch-*-to-prop` · `flow-watch-*-to-attr` |
| **1 list directive** | `flow-list` |
| **2 item bindings** | `flow-<key>-to-prop` · `flow-<key>-to-attr` |

---

## Features

- **Reactive state** — scoped to a DOM element and its descendants
- **Computed values** — derived state with explicit dependencies via `FlowState.compute()`
- **Declarative DOM bindings** — bind state to element properties or attributes via HTML attributes
- **List rendering** — render arrays declaratively with `flow-list` and HTML `<template>`; no JavaScript required
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

### 1. Manually

Mount FlowState on any DOM element. Use declarative HTML bindings and `state.update()` in your scripts — no custom elements required.

```html
<!DOCTYPE html>
<html>
<body>
  <div id="app">
    <span flow-watch-count-to-prop="textContent">0</span>
    <button id="inc">Increment</button>
  </div>

  <script type="module">
    import { FlowState } from 'flow-state';

    const state = new FlowState(document.getElementById('app'), {
      count: 0,
      doubled: FlowState.compute((count) => count * 2, ['count']),
    });

    document.getElementById('inc').addEventListener('click', () => {
      state.update(prev => ({ count: prev.count + 1 }));
    });
  </script>
</body>
</html>
```

### 2. Manually with Web Components

Use `new FlowState(this, config)` or `FlowState.create(this, config)` inside a custom element. Create FlowState **before** stamping the template.

```js
import { FlowState } from 'flow-state';

class MyCounter extends HTMLElement {
  #state;

  connectedCallback() {
    const shadow = this.attachShadow({ mode: 'open' });

    // ⚠️ Create FlowState BEFORE appending children.
    this.#state = new FlowState(this, { count: 0 });
    this.#state.through(shadow);

    shadow.innerHTML = `<button id="btn">Click me</button>`;

    this.#state.watch('count', n => {
      shadow.getElementById('btn').textContent = `Clicked ${n} times`;
    });

    shadow.getElementById('btn').addEventListener('click', () => {
      this.#state.update(prev => ({ count: prev.count + 1 }));
    });
  }

  disconnectedCallback() {
    // ⚠️ Cleanup: destroy the FlowState scope when this component is torn down.
    this.#state?.destroy();
  }
}
customElements.define('my-counter', MyCounter);
```


### 3. With FlowStateComponent

A base class that handles shadow DOM, styles, template stamping, and FlowState initialization automatically.

```js
import { FlowStateComponent } from 'flow-state';

class MyCounter extends FlowStateComponent {
  shadowMode = 'open';
  styles = `button { font-size: 1.5rem; }`;
  template = `<button id="btn">Click 0 times</button>`;

  state = { count: 0 };

  connectedCallback() {
    super.connectedCallback();

    this.state.watch('count', n => {
      this.shadowRoot.getElementById('btn').textContent = `Clicked ${n} times`;
    });

    this.shadowRoot.getElementById('btn').addEventListener('click', () => {
      this.state.update(prev => ({ count: prev.count + 1 }));
    });
  }

  disconnectedCallback() {
    this.state?.destroy();
  }
}
customElements.define('my-counter', MyCounter);
```

> **Cleanup warning:** If a FlowState scope is being removed permanently, call `state.destroy()` in `disconnectedCallback()`.
> This releases watchers, removes internal scope registration, and helps prevent memory leaks in long-running apps.
> See `state.destroy()` in Instance API and Cleanup on permanent unmount in Common Patterns below.
>
> ```js
> disconnectedCallback() {
>   this.state?.destroy();
> }
> ```

---

## Core Concepts

### Scope

A `FlowState` instance is **scoped to a root DOM element**. State updates propagate to all descendants/children of that root. Only one `FlowState` instance can be mounted per element.

```js
const state = new FlowState(rootElement, config);
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `rootElement` | `Node` | The DOM element that this state scope is mounted to |
| `config` | `Object` | Flat configuration object. Top-level functions → actions. `FlowState.compute()` wrappers → computed values. Everything else → reactive state. |

Returns an **instance API** object: `{ update, watch, get, through, destroy }`.

### Config — Values, Computed, and Actions

Plain values go directly in the config object. Wrap derived values with `FlowState.compute(fn, deps)` — the function receives each listed dependency as a positional argument. Top-level functions are treated as **actions** (non-reactive).

```js
const state = new FlowState(app, {
  firstName: 'Jane',
  lastName: 'Doe',
  fullName: FlowState.compute(
    (firstName, lastName) => `${firstName} ${lastName}`,
    ['firstName', 'lastName']
  ),
  items: [],
  total: FlowState.compute((items) => items.reduce((sum, i) => sum + i.price, 0), ['items']),

  // Top-level functions are actions — non-reactive, passed to children
  onSave: async (data) => { /* ... */ },
});
```

Computed values are read-only and re-evaluated when any listed dependency changes.

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
  },
});

state.update({ user: { name: 'John' } });  // deep merge — city is preserved
state.watch('user.address.city', city => console.log(city));
```

---

## Instance API

The object returned by `new FlowState(...)` or `FlowState.create(...)`, also accessible as `this.state` inside `FlowStateComponent`.

### `state.update(partialOrFn)`

Update state values. Only keys declared in the initial config can be updated. New, non-configured state keys will be ignored. Updates are batched and flushed as microtasks.

`state.update(...)` returns a Promise that resolves after the flush completes. If you need to read the latest state immediately after an update, `await` it.

```js
// Partial object — merged into current state
state.update({ count: 5 });

// Functional update — receives previous state, must return partial object
state.update(prev => ({ count: prev.count + 1 }));

// Await when you need a post-flush read
await state.update({ count: 99 });
console.log(state.get('count')); // 99
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

### `state.destroy()`

Destroy a FlowState scope when it is being removed permanently. This clears registered watchers,
removes internal scope registration, and unregisters the instance from devtools snapshots.

Use this for permanent teardown (for example in `disconnectedCallback` of components that are
not expected to be reattached).

```js
disconnectedCallback() {
  this.state?.destroy();
}
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
    count: 0
  });
</script>
```

### `FlowState.compute(fn, deps)`

Creates a computed value descriptor for use in a config object. `fn` receives each key listed in `deps` as a positional argument and is re-evaluated lazily when any dependency changes.

```js
const state = new FlowState(app, {
  price: 10,
  qty: 3,
  total: FlowState.compute((price, qty) => price * qty, ['price', 'qty']),
});
```

Computed values are read-only — `state.update({ total: ... })` is ignored. They can depend on other computed values.

---

## Declarative DOM Bindings

Bind state to element properties or attributes directly in HTML — no JavaScript required on the receiving element.

> **Descendants only.** Declarative bindings are ignored on the root element itself. When mounting, you already have a reference to the root — use `state.watch()` to reactively bind its attributes/properties, or `state.get()` to set initial values.
>
> ```js
> const root = document.getElementById('app');
> const state = new FlowState(root, { status: 'idle', count: 0 });
>
> // Reactively update a root attribute
> state.watch('status', value => root.setAttribute('data-status', value));
>
> // Set an initial value once
> root.setAttribute('data-count', state.get('count'));
> ```

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

### Render a list

Place `flow-list="key"` on a container with a `<template>` child. When the state key (an array) changes, FlowState clears the container and clones the template once per item. Use `flow-<key>-to-prop` and `flow-<key>-to-attr` inside the template to bind item fields, where `<key>` is the field name from the item object:

```html
<div flow-list="users">
  <template>
    <div flow-id-to-attr="data-user-id">
      <span flow-name-to-prop="textContent"></span>
      <span flow-role-to-prop="textContent"></span>
    </div>
  </template>
</div>
```

The item key is encoded in the attribute name itself, consistent with `flow-watch-*-to-prop` scope bindings. Use dashes to access nested properties: `flow-user-name-to-prop` reads `item.user.name`.

---

## Shadow DOM — `FlowState.through()`

By default, `FlowState` traverses **open** shadow DOMs automatically when searching for declarative bindings. For **closed** shadow roots, call `FlowState.through(shadowRoot)` to explicitly register the shadow with the nearest parent `FlowState` scope.

> **Mount FlowState on the host element, not the ShadowRoot.** 

```js
class MyCard extends HTMLElement {
  connectedCallback() {
    // Hold a reference to the closed shadow — this.shadowRoot returns null for closed shadows
    const shadow = this.attachShadow({ mode: 'closed' });

    // Mount FlowState on the host (this), not the shadow
    const state = new FlowState(this, { /* config */ });

    // Register the closed shadow so bindings inside it receive updates
    state.through(shadow); // only pierces shadow with only this FlowState instance (keep your closed component closed off from outside state too)
    FlowState.through(shadow); // static method connects shadow to this component's FlowState AND
    // any higher FlowState flows (scopes) (will behave consistently with non-shadow/open-shadow roots)
  }
}
```

Or, to register a child component's closed shadow with a **parent** scope from inside the child:

```js
class MyCard extends HTMLElement {
  connectedCallback() {
    const shadow = this.attachShadow({ mode: 'closed' });
    // Link this shadow to the nearest ancestor FlowState scope
    FlowState.through(shadow);
  }
}
```

After registration, declarative bindings inside the shadow root will receive updates from the owning `FlowState` scope.

---

## Actions

Actions are non-reactive values injected into the state scope — useful for passing callbacks to deeply nested child components without prop-drilling. **Top-level functions in the config are automatically treated as actions.**

```js
const state = new FlowState(app, {
  count: 0,
  // Top-level function → action (non-reactive)
  onSave: async (data) => { /* ... */ },
});
```

Actions are accessible via `FlowState.get(element, 'onSave')` from a child's `connectedCallback`, or via `state.watch('onSave', fn)` on the instance directly (called once immediately, then never again since actions are static).

---

## Common Patterns

### Cleanup on permanent unmount

If a component scope will not be reused, call `state.destroy()` during teardown.

```js
class TaskPanel extends FlowStateComponent {
  disconnectedCallback() {
    this.state?.destroy();
  }
}
```

`destroy()` internally uses a microtask + connectivity check, so transient detach/reattach cycles
in the same turn are ignored.

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

    // ✅ FlowState on the host element (light DOM)
    this.#state = new FlowState(this, { count: 0 });

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
    this.#state = new FlowState(this, { count: 0 });
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

## FlowStateComponent

`FlowStateComponent` is a base class for custom elements that handles FlowState setup automatically. It initializes FlowState on the host element, applies styles, stamps the template into the shadow root, and registers the shadow (if opted-into with shadowMode property) via `through()` — all in the right order.

```js
import { FlowStateComponent } from 'flow-state';

class MyCounter extends FlowStateComponent {
  shadowMode = 'open'; // auto-attaches shadow DOM

  styles = `
    :host { display: block; }
    button { font-size: 1rem; }
  `;

  template = `
    <span flow-watch-count-to-prop="textContent"></span>
    <button id="inc">+</button>
  `;

  state = {
    count: 0,
  };

  connectedCallback() {
    super.connectedCallback(); // must call super — sets up FlowState and stamps template

    this.shadowRoot.getElementById('inc').addEventListener('click', () => {
      this.state.update(prev => ({ count: prev.count + 1 }));
    });
  }

  disconnectedCallback() {
    this.state?.destroy();
  }
}

customElements.define('my-counter', MyCounter);
```

### Subclass API

| Property | Type | Description |
|----------|------|-------------|
| `shadowMode` | `'open' \| 'closed'` | Auto-attaches a shadow root of this mode |
| `template` | `string` | HTML string stamped into the shadow (or light DOM if no shadow) |
| `styles` | `string` | CSS string applied via `adoptedStyleSheets` |
| `state` | `object` | Flat config as `new FlowState(...)` — values, `FlowState.compute()` wrappers for computed, top-level functions for actions |
| `this.state` | instance API | The `FlowState` instance — available after `super.connectedCallback()` |

`FlowStateComponent` mounts FlowState on `this` (the host element) and calls `state.through(shadowRoot)` automatically, so scope traversal works correctly across shadow boundaries.

---

## Showcase Apps

The `apps/` directory contains fully functional example applications built with FlowState. Each app is self-contained and can be opened directly in a browser — no build step required.

| App | Entry | Description |
|-----|-------|-------------|
| `apps/GIS-1/` | [index.html](apps/GIS-1/index.html) | Work/map view with ArcGIS integration |
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
