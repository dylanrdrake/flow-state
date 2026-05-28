<h1><img src="assets/FlowState2.svg" alt="FlowState logo" width="28" style="vertical-align: middle; margin-right: 8px;" />flow-state</h1>

A lightweight, DOM-native reactive state library for web components and vanilla JavaScript.

Tutorial and instructional documentation:

- https://dylanrdrake.github.io/flow-state/apps/tutorial

## Current API Surface

`flow-state` exposes:

- `FlowSource` constructor
- `flowGet(source, key)`
- `flowWatch(source, key, callback)`
- `flowThrough(shadowRoot)`
- `flowCompute(fn, deps)`
- `startFlowDevtools()`
- `FlowStateComponent`

Source instance API returned by `new FlowSource(root, config)`:

- `state.update(patchOrUpdater)`
- `state.destroy()`

## Quick Start

```js
import {
	FlowSource,
	flowGet,
	flowWatch,
	flowThrough,
	flowCompute,
	startFlowDevtools,
} from 'flow-state';

startFlowDevtools();

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

## Installation

> Not published to npm yet: `flow-state` is not currently available on npm.
> Use the repository source directly for now.

```bash
npm install flow-state
```

## Scripts

```bash
npm run build
npm test
npm run test:watch
```
