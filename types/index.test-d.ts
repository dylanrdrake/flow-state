/**
 * Type-level tests. Compiled by `npm run typecheck`, never shipped.
 * `@ts-expect-error` lines fail the build if the error they expect stops happening.
 */
import {
  FlowSource,
  FlowStateComponent,
  flowCompute,
  flowGet,
  flowThrough,
  flowWatch,
  type Paths,
  type PathValue,
  type Snapshot,
} from 'flow-state';

declare function expectType<T>(value: T): void;

const root = document.createElement('div');

// ---------------------------------------------------------------------------
// FlowSource: state is inferred from the config literal
// ---------------------------------------------------------------------------

const source = new FlowSource(root, {
  count: 0,
  user: { name: 'Ada', role: 'admin' },
  doubled: flowCompute((count: number) => count * 2, ['count']),
  increment: () => source.update((prev) => ({ count: prev.count + 1 })),
});

expectType<Promise<void>>(source.update({ count: 1 }));
expectType<void>(source.destroy());

// Nested patches are partial all the way down.
source.update({ user: { name: 'Grace' } });

// Functional updates receive the previous state.
source.update((prev) => ({ count: prev.count + 1 }));
source.update((prev) => (prev.count > 3 ? null : { count: 0 }));

// @ts-expect-error - wrong value type
source.update({ count: 'nope' });

// @ts-expect-error - unknown key
source.update({ nope: 1 });

// @ts-expect-error - computed keys are derived, not settable
source.update({ doubled: 4 });

// @ts-expect-error - actions are not state
source.update({ increment: () => {} });

// The snapshot handed to a functional update is deeply frozen.
source.update((prev) => {
  // @ts-expect-error - readonly
  prev.user.name = 'mutated';
  return {};
});

// ---------------------------------------------------------------------------
// Functional API
// ---------------------------------------------------------------------------

expectType<number | undefined>(flowGet<number>(root, 'count'));
expectType<unknown>(flowGet(root, 'count'));
expectType<(() => void) | undefined>(flowWatch<number>(root, 'count', (n) => expectType<number>(n)));
expectType<void>(flowThrough(root.attachShadow({ mode: 'open' })));

// @ts-expect-error - a source reference is not a Node
flowGet(source, 'count');

// flowCompute infers its result type from the callback's return.
const total = flowCompute((price: number, qty: number) => price * qty, ['price', 'qty']);
expectType<number>(total.fn(2, 3));

// ---------------------------------------------------------------------------
// Dot paths
// ---------------------------------------------------------------------------

interface AppState {
  count: number;
  user: { name: string; address: { city: string } };
  tags: string[];
}

expectType<Paths<AppState>>('user.address.city');
expectType<Paths<AppState>>('tags');
// @ts-expect-error - not a path into AppState
expectType<Paths<AppState>>('user.address.zip');

expectType<PathValue<AppState, 'user.address.city'>>('Boston');
expectType<PathValue<AppState, 'count'>>(1);

// ---------------------------------------------------------------------------
// FlowStateComponent
// ---------------------------------------------------------------------------

class Counter extends FlowStateComponent<{ count: number }> {
  shadowMode = 'open' as const;
  template = '<button id="btn"></button>';
  styles = 'button { font-size: 1.5rem; }';
  sourceConfig = { count: 0 };

  connectedCallback() {
    super.connectedCallback();
    this.source?.update((prev) => ({ count: prev.count + 1 }));
    // @ts-expect-error - wrong value type
    this.source?.update({ count: 'nope' });
  }
}

// @ts-expect-error - `source` is the instance, assigned by connectedCallback
new Counter().source = undefined;

// ---------------------------------------------------------------------------
// Devtools contract
// ---------------------------------------------------------------------------

declare const snapshot: Snapshot;
expectType<'snapshot'>(snapshot.type);
expectType<string | null>(snapshot.parentId);
expectType<string[]>(snapshot.computedKeys);
expectType<number>(snapshot.watchers.length);
