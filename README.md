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
- 2 `FlowSource` instance methods: `update` and `destroy`
- 5 functional helpers: `flowWatch`, `flowGet`, `flowThrough`, `flowCompute`, `flowDevtools`
- 1 component config field: `sourceConfig` (the instance lands on `source`)
- 1 source state binding: `flow-watch-<source-key>-to-<attr|prop>`
- 3 structural directives: `flow-if`, `flow-ul`, and `flow-li-<item-key>-to-<attr|prop>`


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

flowWatch(root, 'doubled', (value) => {
	console.log('doubled =', value);
});

const increment = flowGet(root, 'increment');
increment();
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

For components, declare the config as `sourceConfig`; `source` holds the resulting instance:

```ts
class MyCounter extends FlowStateComponent<{ count: number }> {
  sourceConfig = { count: 0 };

  connectedCallback() {
    super.connectedCallback();
    this.source?.update((prev) => ({ count: prev.count + 1 }));
  }
}
```

### Two limits worth knowing

`flowGet` and `flowWatch` take a DOM Node, and the owning source is resolved at runtime by a
bubbling event. There is no static link between the two, so the value type cannot be inferred —
supply it at the call site:

```ts
const squads = flowGet<Squad[]>(this, 'squads');
flowWatch<number>(this, 'count', (n) => n.toFixed(0));
```

The HTML attribute bindings (`flow-watch-…`, `flow-if`, `flow-ul`, `flow-li-…`) live in template
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
