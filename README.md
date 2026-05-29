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

- `FlowSource` constructor
- `flowGet(source, key)`
- `flowWatch(source, key, callback)`
- `flowThrough(shadowRoot)`
- `flowCompute(fn, deps)`
- `flowDevtools()`
- `FlowStateComponent`

Source instance API returned by `new FlowSource(root, config)`:

- `state.update(patchOrUpdater)`
- `state.destroy()`


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
	flowThrough,
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

## Common Patterns

Create state on a host element:

```js
const state = new FlowSource(this, {
	items: [],
	selectedId: null,
});
```

Read or watch from descendants:

```js
const items = flowGet(this, 'items');
const unsub = flowWatch(this, 'selectedId', (id) => {
	// update child UI
});
```

Link a closed shadow root for declarative bindings:

```js
const shadow = this.attachShadow({ mode: 'closed' });
flowThrough(shadow);
```

This is only necessary for closed shadow roots. Open shadow roots do not require `flowThrough`.
Use it when FlowState values need to flow down into declarative bindings inside a closed shadow
root. It is not needed for events flowing up from `flowGet()` / `flowWatch()`.