<h1>
<picture>
	<source media="(prefers-color-scheme: dark)" srcset="lib/assets/FlowState_light_transparent.svg">
	<source media="(prefers-color-scheme: light)" srcset="lib/assets/FlowState3_transparent.svg">
	<img src="lib/assets/FlowState3_transparent.svg" alt="FlowState logo" width="28" style="vertical-align: middle; margin-right: 14px;" />
</picture>
flow-state</h1>

A simple, lightweight, reactive, composable, nestable, expressive, 0-dependency state library for vanilla JavaScript and Web Components or any other stack you're working with. Influenced by patterns observed in React and functional programming languages like Lisp and Clojure.


Tutorial and instructional documentation:

- https://dylanrdrake.github.io/flow-state/apps/tutorial

## Current API Surface

`flow-state` exposes:

- 2 Classes: `FlowSource` and `FlowStateComponent`
- 2 `FlowSource` instance methods: `update` and `destroy`, plus one key per config entry (`source.count`)
- 6 functional helpers: `flowWatch`, `flowGet`, `flowScope`, `flowThrough`, `flowCompute`, `flowDevtools`
- 1 component config field: `sourceConfig` (the instance lands on `source`)
- 2 source state bindings: `flow-prop="<prop>: <source-key>"` and `flow-attr="<attr>: <source-key>"`
- 2 structural directives: `flow-if` and `flow-ul`, with `flow-li-prop="<prop>: <item-key>"` and `flow-li-attr="<attr>: <item-key>"` inside a list template

A binding attribute takes one or more `target: key` pairs separated by semicolons, so one
element can bind several keys: `flow-prop="textContent: user.name; title: user.bio"`. Keys are
written exactly as in the config, with dots for nested values.


## Getting Started

Preferred workflow:

```bash
npm install flow-state
```

Then import from `flow-state` in your app.

### ⚠️ Temporary Until npm Publish

Until `flow-state` is published, clone this repo and use an import map that points to `index.js`.

```bash
git clone https://github.com/dylanrdrake/flow-state.git
```

```html
<script type="importmap">
{
	"imports": {
		"flow-state": "/path/to/flow-state/index.js"
	}
}
</script>
```

Then `import { FlowSource } from 'flow-state'` as you would with an npm module.

## Quick Start

```js
import {
	FlowSource,
	flowGet,
	flowWatch,
	flowCompute,
	flowDevtools,
} from 'flow-state';

flowDevtools();

const root = document.getElementById('app');
const state = new FlowSource(root, {
	count: 0,
	doubled: flowCompute((count) => count * 2, ['count']),
	increment: () => state.update(prev => ({ count: prev.count + 1 })),
});

flowWatch(root, state.doubled, (value) => {
	console.log('doubled =', value);
});

const increment = flowGet(root, state.increment);
increment();
```

### Keys

`flowGet` and `flowWatch` take a key object, not a string. A source carries one key per config
entry, and a property of a key is the key one level down:

```js
flowGet(root, state.count);
flowWatch(root, state.user.name, (name) => { /* ... */ });
```

`state.count` is the key, not the value: it names `count` for whichever source is nearest the
node you pass. Because the keys sit next to `update` and `destroy`, a config cannot have a
top-level key named `update` or `destroy`.

When the source cannot be imported, as with a component's own source, get the keys from
`flowScope()`:

```js
import { flowScope, flowGet } from 'flow-state';

const scope = flowScope();
flowGet(this, scope.user.name);
```

## Devtools Quick Start

Enable in app entry:

```js
import { flowDevtools } from 'flow-state';
flowDevtools();
```

Run devtools server and open both pages on the same origin:
```bash
node node_modules/flow-state/devtools/server.js -r ./app/root/path -p 3300
```

```bash
node lib/devtools/server.js -r ./app/root/path -p 3300
```

- `http://localhost:3300/`
- `http://localhost:3300/devtools/`

npm script example (once package is installed):

```json
{
	"scripts": {
		"devtools": "node ./node_modules/flow-state/lib/devtools/server.js -r . -p 3300"
	}
}
```

For this repository clone path, use:

```json
{
	"scripts": {
		"devtools": "node lib/devtools/server.js -r . -p 3300"
	}
}
```

## TypeScript

Types ship with the package — no `@types` install, nothing to configure:

```ts
import { FlowSource, flowGet, flowWatch } from 'flow-state';

const state = new FlowSource(root, {
  count: 0,
  user: { name: 'Ada' },
});

state.update({ count: 1 });                                   // ✅
state.update((prev) => ({ count: prev.count + 1 }));          // ✅ prev is deeply readonly
state.update({ count: 'nope' });                              // ❌ Type 'string' is not assignable
```

State is inferred from the config literal. Actions (plain functions) and computed keys are
recognized by shape and excluded from `update()`, since neither is settable.

For components, declare the config as `sourceConfig`; `source` holds the resulting instance.
`this.source` is typed from the class's type argument, so pass the config's type there:

```ts
type CounterConfig = { count: number };

class MyCounter extends FlowStateComponent<CounterConfig> {
  sourceConfig = { count: 0 };

  connectedCallback() {
    super.connectedCallback();
    this.source?.update((prev) => ({ count: prev.count + 1 }));   // ✅ checked
    this.source?.update({ count: 'nope' });                       // ❌ Type 'string' is not assignable
  }
}
```

What the compiler does and does not check:

- The `sourceConfig` field is checked against the type argument: a missing key or a wrong
  value type is an error.
- A key in `sourceConfig` that the type argument does not list is **not** an error, but
  `this.source` will not know about it.
- With no type argument at all, `this.source` is not checked.
- `flowScope<MyCounter>()` reads the `sourceConfig` field itself, not the type argument, so it
  is typed correctly in all three cases.

### Typed reads

The owning source is still found at runtime, from where the node sits in the DOM. The key is
what carries the value type, so a read is typed by the key you pass:

```ts
flowGet(root, state.count);                          // number | undefined
flowWatch(root, state.user.name, (name) => name.toUpperCase());   // name: string
flowGet(root, state.nope);                           // ❌ not a key of this source
flowGet(root, 'count');                              // ❌ string keys are not accepted
```

For a component, name it and `flowScope` types the keys from its `sourceConfig`:

```ts
class SquadBoard extends FlowStateComponent {
  sourceConfig = { squads: [] as Squad[] };
}
export const boardScope = flowScope<SquadBoard>();

// in a child component
const squads = flowGet(this, boardScope.squads);      // Squad[] | undefined
```

`flowScope()` with no type argument gives untyped keys, which is what plain JavaScript gets.

### Two limits worth knowing

A key says what type a value has, not that a source providing it is really above the node:
that is only known at runtime, so every read can also be `undefined`.

The HTML attribute bindings (`flow-prop`, `flow-attr`, `flow-if`, `flow-ul`, `flow-li-…`) live in template
strings and get no type coverage.

### Devtools in Action

Open both in the same browser:

- <a href="https://dylanrdrake.github.io/flow-state/apps/incident-command/" target="_blank" rel="noreferrer">Incident Command app</a>
- <a href="https://dylanrdrake.github.io/flow-state/lib/devtools/" target="_blank" rel="noreferrer">FlowState Devtools</a>

## Performance

`apps/perf-lab` measures nested sources specifically — key-resolution cost by depth, root
fan-out across a tree of sources, mount/unmount churn, and what a shadow root at every level
costs. See <a href="apps/perf-lab/README.md">its README</a> for the scenarios and a baseline.
`apps/stress` remains the flat, single-source throughput demo.
