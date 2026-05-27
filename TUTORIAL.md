# FlowState Tutorial

FlowState is a lightweight, DOM-native reactive state library. It lives entirely in the browser, has zero dependencies, and is built around the same event and shadow DOM primitives that the platform already provides.

---

## Core Concepts

### The Scope

Every FlowState instance is anchored to a **root element** — a light DOM `HTMLElement`. The root defines the **scope**: only elements that are DOM descendants of the root can receive state from that instance.

> **Always mount FlowState on a host element, not a ShadowRoot.**  To extend a specific state scope into a closed shadow, use `state.through(shadowRoot)` after mounting on the host. To connect the shadow to the overall FlowState scope of that shadow, use the static method: `FlowState.through(shadowRoot)`

```
<my-app>          ← FlowState root
  <child-a>       ← inside scope, can watch/get
  <child-b>
    <grandchild>  ← also inside scope
```

When a child calls `FlowState.watch()` or `FlowState.get()`, it dispatches a `CustomEvent` that **bubbles up** the DOM. The first ancestor that owns that key intercepts it, stopping propagation. This means scopes nest naturally — a child component can shadow a key from a parent scope without affecting siblings.

### State is Immutable Between Updates

FlowState deep-freezes its internal values after every update. You cannot mutate state in place. All changes go through `state.update()`.

### Updates are Batched

Multiple `state.update()` calls in the same synchronous turn are **batched** into a single flush via `queueMicrotask`. Watchers and bindings are only notified once after the flush, not once per call.

```js
state.update({ count: 1 });
state.update({ name: 'Alice' }); // batched — one notification fires
```

`state.update()` returns a **Promise** that resolves after the flush completes, so you can `await` it when you need to read the post-update value immediately.

### Watchers fire immediately

When you register a watcher with `state.watch()` or `FlowState.watch()`, it **calls your callback immediately** with the current value.

---

## Two Ways to Use FlowState

### 1. Manually — `new FlowState(root, config)` / `FlowState.create()`

For plain `HTMLElement` classes where you manage everything manually.

```js
import { FlowState } from 'flow-state';

class MyCounter extends HTMLElement {
  #state;

  connectedCallback() {
    const shadow = this.attachShadow({ mode: 'open' });

    // ⚠️ Create FlowState BEFORE appending children.
    this.#state = new FlowState(this, {
      count: 0,
    });

    shadow.innerHTML = `<button id="btn">Click me</button>`;

    this.#state.watch('count', n => {
      shadow.getElementById('btn').textContent = `Clicked ${n} times`;
    });

    shadow.getElementById('btn').addEventListener('click', () => {
      this.#state.update(prev => ({ count: prev.count + 1 }));
    });
  }
}
customElements.define('my-counter', MyCounter);
```

`FlowState.create(root, config)` is identical to `new FlowState(root, config)` and exists for symmetry with the static API.

### 2. Component — `FlowStateComponent`

A base class for Web Components that handles shadow DOM creation, styles, template stamping, and FlowState initialization in the correct order automatically.

```js
import { FlowStateComponent } from 'flow-state';

class MyCounter extends FlowStateComponent {
  shadowMode = 'open';
  styles = CSS`button { font-size: 1.5rem; }`;
  template = HTML`<button id="btn">Click 0 times</button>`;

  state = {
    count: 0,
  };

  connectedCallback() {
    super.connectedCallback(); // always call first

    this.state.watch('count', n => {
      this.shadowRoot.getElementById('btn').textContent = `Clicked ${n} times`;
    });

    this.shadowRoot.getElementById('btn').addEventListener('click', () => {
      this.state.update(prev => ({ count: prev.count + 1 }));
    });
  }
}
customElements.define('my-counter', MyCounter);
```

`FlowStateComponent` exposes `this.state` — the instance API returned by the FlowState constructor.

**Light DOM mode**: omit `shadowMode` entirely to render the template into the element itself (no shadow root). Styles are injected as a `<style>` tag into `document.head` (deduplicated per tag name). Use `this.querySelector()` instead of `this.shadowRoot.getElementById()` when querying elements.

```js
class MyBanner extends FlowStateComponent {
  // no shadowMode — renders into light DOM
  template = `<p id="msg"></p>`;
  state = { message: 'Hello' };

  connectedCallback() {
    super.connectedCallback();
    this.state.watch('message', v => {
      this.querySelector('#msg').textContent = v;
    });
  }
}
```

---

## The Config Object

```js
{
  // Plain values — any JSON-serializable type
  count: 0,
  user: { name: 'Alice', role: 'admin' },
  items: [],

  // Computed values — functions of state
  // Re-evaluated automatically when dependencies change
  fullLabel: (s) => `${s.user.name} (${s.user.role})`,

  actions: {
    // Actions are read-only shared values or callbacks.
    // Children call FlowState.get(el, 'doSomething') to retrieve them.
    // They are NOT reactive — watchers receive the action value once on registration.
    doSomething: (arg) => console.log(arg),
    theme: 'dark',
  },
}
```

### Computed Values

Computed values are declared as functions in `init`. They are **re-evaluated lazily** when their dependencies update, and watchers on them are notified.

```js
price: 10,
qty: 3,
total: (s) => s.price * s.qty,
```

> ⚠️ **Known limitation**: Dependency tracking is **top-level only**. `(s) => s.user.name` tracks `'user'`, not `'user.name'`. Any update to the `user` object will trigger recomputation, even if only an unrelated nested field changed.

---

## The Instance API

The object returned by `new FlowState(...)` or accessible as `this.state` in `FlowStateComponent`.

### `state.update(patch | fn)`

Update state. Accepts either a partial object or a function that receives the current state and returns a partial object. Returns a Promise that resolves after the microtask flush.

```js
// Partial object
state.update({ count: 5 });

// Function (safe for values that depend on current state)
state.update(prev => ({ count: prev.count + 1 }));

// Deep partial — merges into nested objects
state.update({ user: { name: 'Bob' } }); // only name changes, role preserved

// Awaitable
await state.update({ count: 99 });
const current = state.get('count'); // 99 ✓
```

> ⚠️ Only configured keys can be updated. Attempts to add new keys are silently ignored (with a console warning). Computed keys cannot be updated.

### `state.watch(key, callback)`

Register a watcher. The callback fires **immediately** with the current value, then again whenever the key (or any of its ancestors) changes.

```js
const unsub = state.watch('user.name', name => {
  console.log('Name changed:', name);
});

// Later, to stop watching:
unsub();
```

Supports dot-notation for nested keys. Watching `'user'` fires when any property inside `user` changes. Watching `'user.name'` fires only when `name` changes.

### `state.get(key)`

Read the current value synchronously. Does not register a watcher.

```js
const count = state.get('count');
const name  = state.get('user.name');
```

Works for actions too — `state.get('myAction')` returns the action value.

### `state.through(shadowRoot)`

Extend the FlowState scope into a shadow DOM so that elements inside it can use declarative bindings.

```js
const shadow = this.attachShadow({ mode: 'open' });
this.#state = new FlowState(this, config);
this.#state.through(shadow); // scope now includes shadow
```

`FlowStateComponent` does this automatically.

---

## The Static API

Used by **child elements** to reach a parent's FlowState without holding a direct reference to it. Everything works via DOM events that bubble up.

### `FlowState.watch(element, key, callback)`

Register a watcher from a child element. The event bubbles up until it finds a FlowState instance that owns `key`.

```js
// Inside a child element's connectedCallback:
FlowState.watch(this, 'items', items => {
  this.render(items);
});
```

### `FlowState.get(element, key)`

Synchronously read a value or hook from the nearest ancestor FlowState that owns `key`.

```js
const deleteItem = FlowState.get(this, 'deleteItem'); // retrieve a hook/callback
deleteItem(this.#itemId);
```

### `FlowState.through(shadowRoot)`

Registers a closed shadow root with the nearest ancestor FlowState scope so that **declarative bindings** inside it receive updates. This is not needed for `FlowState.watch()` / `FlowState.get()` — those dispatch `composed: true` events that already cross shadow boundaries automatically.

```js
connectedCallback() {
  const shadow = this.attachShadow({ mode: 'closed' });
  // Declarative bindings (flow-watch-*) inside this shadow will now update
  FlowState.through(shadow); // dispatches event that bubbles to nearest ancestor scope
}
```

---

## Declarative Bindings

FlowState supports declarative DOM bindings via HTML attributes — no JavaScript watcher needed for simple one-way binding.

```html
<!-- Bind state key 'username' to the element's textContent property -->
<span flow-watch-username-to-prop="textContent"></span>

<!-- Bind to an attribute -->
<img flow-watch-avatar-url-to-attr="src">

<!-- Nested key (dot → dash) -->
<span flow-watch-user-name-to-prop="textContent"></span>
```

FlowState queries for these attributes inside its scope and updates them automatically when the key changes.

> Dots in key names become dashes in attribute names: `user.name` → `flow-watch-user-name-to-prop`.

> **Descendants only.** Declarative bindings on the root element itself are ignored. When mounting, you already have a reference to the root — use `state.watch()` to reactively bind its attributes/properties, or `state.get()` to set initial values.
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

### Render a list (`flow-list`)

Place `flow-list="key"` on a container with a `<template>` child. When the array state key updates, FlowState re-renders the container by cloning the template once per item. Inside the template, bind item fields with `flow-<key>-to-prop` and `flow-<key>-to-attr`, where `<key>` is the field name from the item object:

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

The item key is encoded in the attribute name itself:
- `flow-name-to-prop="textContent"` — sets `element.textContent = item.name`
- `flow-id-to-attr="data-user-id"` — calls `element.setAttribute('data-user-id', item.id)`
- `flow-user-city-to-prop="textContent"` — reads `item.user.city` (dashes map to nested access)

> **Timing note**: If a `state.watch()` watcher on the same array key also updates visual state (e.g. adding a `.selected` class), wrap that visual update in `queueMicrotask()` to defer it until after `flow-list` has re-rendered the DOM.

---

## Actions

Actions are callbacks or values passed down from parent to child via the state scope. Children read them with `FlowState.get()` or `state.get()`.

```js
// Parent
state = {
  actions: {
    deleteCard: (id) => this.#deleteCard(id),
    theme: 'dark',
  }
};

// Child (in connectedCallback)
const deleteCard = FlowState.get(this, 'deleteCard');
const theme      = FlowState.get(this, 'theme');
```

Actions are **not reactive** — `FlowState.watch(el, 'deleteCard', cb)` calls `cb` once with the action value and never again. Use them for stable callbacks and config, not changing data.

---

## Common Patterns

### Parent → Children data flow

The canonical pattern. Parent owns state. Children watch it.

```js
// parent.js
state = {
  items: [],
  actions: { removeItem: (id) => this.#remove(id) },
};

// child.js (connectedCallback)
FlowState.watch(this, 'items', items => this.#render(items));
const remove = FlowState.get(this, 'removeItem');
this.#btn.addEventListener('click', () => remove(this.#id));
```


### Component-local state

Each component can have its own FlowState scope for state that shouldn't leak to ancestors or siblings.

```js
class KanbanColumn extends FlowStateComponent {
  state = {
    selectedCardId: null, // local only
  };
}
```

### Functional updates for dependent state

Always use the functional form when the new value depends on the old one.

```js
// ✓ Safe — prev is a snapshot at flush time
state.update(prev => ({ count: prev.count + 1 }));

// ✗ Risky if called multiple times before flush
state.update({ count: state.get('count') + 1 });
```

---

## Timing Rules

These are the most common source of bugs.

### 1. Create FlowState BEFORE appending children

FlowState registers event listeners on the root. When a child element's `connectedCallback` fires, it immediately dispatches `flow-state-watch` and `flow-state-get` events. If FlowState isn't set up yet, those events have no listener and are silently lost.

```js
// ✓ Correct
this.#state = new FlowState(this, config);
this.#state.through(shadow);
shadow.appendChild(template.content.cloneNode(true)); // children init here

// ✗ Wrong — children connect before FlowState exists
shadow.appendChild(template.content.cloneNode(true));
this.#state = new FlowState(this, config);
```

`FlowStateComponent` handles this automatically in `connectedCallback`.

### 2. Static API only in connectedCallback

`FlowState.watch()` and `FlowState.get()` dispatch events that bubble up to a parent FlowState instance. That instance only exists once the parent is connected to the DOM. Never call them in a `constructor`.

```js
// ✓ Correct
connectedCallback() {
  FlowState.watch(this, 'items', cb);
}

// ✗ Wrong — parent not yet connected
constructor() {
  super();
  FlowState.watch(this, 'items', cb); // no listener exists yet
}
```

### 3. Await update before reading new state

`state.update()` is **batched via microtask** — `state.get()` immediately after returns the old value. Use the functional form to depend on current state, or `await` the update.

```js
// ✓ Read in a watcher (fires after flush)
state.watch('count', n => console.log(n));

// ✓ Await the update
await state.update({ count: 99 });
console.log(state.get('count')); // 99

// ✗ Race condition
state.update({ count: 99 });
console.log(state.get('count')); // still old value!
```

### 4. Initial notification is deferred one microtask

After `new FlowState(root, config)`, the initial watcher notification is deferred with `Promise.resolve().then(...)` to give children time to register their watchers. This means watchers registered synchronously after construction will receive the initial value, but watchers registered in a later macrotask may miss it.

---

## Scope and Shadow DOM

FlowState uses DOM event bubbling to locate the right scope. Shadow DOM normally blocks bubbling — FlowState handles this by dispatching events with `composed: true`, which crosses shadow boundaries. The `through()` call is what links a shadow root into a parent's scope for **declarative bindings**; it's not required for the static API (watch/get) because those events are already composed.

```
document
 └─ <my-app>              ← FlowState scope (root = my-app)
     └─ #shadow-root      ← through() links this in
         └─ <my-column>   ← FlowState scope (root = my-column)
             └─ #shadow-root
                 └─ <my-card>   ← watch/get bubble up through shadows
```

When `<my-card>` calls `FlowState.watch(this, 'theme', cb)`:
1. Event bubbles through `my-column`'s shadow → host → `my-app`'s shadow → host
2. If `my-column` owns `theme`, it intercepts and stops propagation
3. If not, `my-app` intercepts it
4. The first ancestor that has the key wins

---

## Devtools

```js
FlowState.devtools();
```

Call this once, early in your app entry point. It opens the devtools panel in a new tab and connects via `BroadcastChannel`. The devtools show all active FlowState scopes, their current state values, watchers, and the source element that registered each watcher. Clicking a watcher in the panel highlights the corresponding element in the app.

---

## Quick Reference

| Method | Where | Description |
|---|---|---|
| `new FlowState(root, config)` | anywhere | Create an instance anchored to `root` |
| `FlowState.create(root, config)` | anywhere | Same as above |
| `state.update(patch\|fn)` | owner | Update state; returns `Promise` |
| `state.watch(key, cb)` | owner | Watch a key; returns unsubscribe fn |
| `state.get(key)` | owner | Read current value synchronously |
| `state.through(shadowRoot)` | owner | Extend scope into a shadow DOM |
| `FlowState.watch(el, key, cb)` | child `connectedCallback` | Subscribe from a child element |
| `FlowState.get(el, key)` | child `connectedCallback` | Read from nearest ancestor scope |
| `FlowState.through(shadowRoot)` | child `connectedCallback` | Link shadow into parent scope |
| `FlowState.devtools()` | app entry point | Open devtools panel |
