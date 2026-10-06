/**
 * Type-level tests. Compiled by `npm run typecheck`, never shipped.
 * `@ts-expect-error` lines fail the build if the error they expect stops happening.
 */
import {
  FlowSource,
  FlowStateComponent,
  flowCompute,
  flowGet,
  flowScope,
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

// A source carries one key per config entry; the key carries the value type.
expectType<number | undefined>(flowGet(root, source.count));
expectType<string | undefined>(flowGet(root, source.user.name));
expectType<{ name: string; role: string } | undefined>(flowGet(root, source.user));
expectType<number | undefined>(flowGet(root, source.doubled));
flowGet(root, source.increment)?.();
expectType<(() => void) | undefined>(flowWatch(root, source.count, (n) => expectType<number>(n)));
flowWatch(root, source.user.role, (role) => expectType<string>(role));
expectType<void>(flowThrough(root.attachShadow({ mode: 'open' })));

// @ts-expect-error - string keys are gone
flowGet(root, 'count');
// @ts-expect-error - string keys are gone
flowWatch(root, 'count', () => {});
// @ts-expect-error - not a key of this source
flowGet(root, source.nope);
// @ts-expect-error - a key is not the value
expectType<number>(source.count);
// @ts-expect-error - a source reference is not a Node
flowGet(source, source.count);

// `update` and `destroy` are the source's own methods, so a config cannot use those names.
// @ts-expect-error - reserved key
new FlowSource(root, { update: 1 });
// @ts-expect-error - reserved key
new FlowSource(root, { destroy: () => {} });

// flowScope: typed from a config type, untyped with no type argument.
const appScope = flowScope<{ squads: string[]; total: ReturnType<typeof flowCompute<number>>; nested: { deep: { flag: boolean } } }>();
expectType<string[] | undefined>(flowGet(root, appScope.squads));
expectType<number | undefined>(flowGet(root, appScope.total));
expectType<boolean | undefined>(flowGet(root, appScope.nested.deep.flag));
// @ts-expect-error - not a key of that config
flowGet(root, appScope.missing);
const anyScope = flowScope();
flowWatch(root, anyScope.whatever.nested, (value) => expectType<any>(value));

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

// A component's keys: from its own source inside it, from flowScope<Component>() elsewhere.
class Board extends FlowStateComponent<{ squads: string[]; user: { name: string } | null }> {
  sourceConfig = { squads: [] as string[], user: null as { name: string } | null };

  connectedCallback() {
    super.connectedCallback();
    if (this.source) expectType<string[] | undefined>(flowGet(this, this.source.squads));
  }
}
const boardScope = flowScope<Board>();
expectType<string[] | undefined>(flowGet(root, boardScope.squads));
flowWatch(root, boardScope.user.name, (name) => expectType<string>(name));
// @ts-expect-error - not a key of Board
flowGet(root, boardScope.count);

// ---------------------------------------------------------------------------
// Devtools contract
// ---------------------------------------------------------------------------

declare const snapshot: Snapshot;
expectType<'snapshot'>(snapshot.type);
expectType<string | null>(snapshot.parentId);
expectType<string[]>(snapshot.computedKeys);
expectType<number>(snapshot.watchers.length);
