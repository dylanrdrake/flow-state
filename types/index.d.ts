/**
 * Type definitions for flow-state.
 *
 * Two parts of the runtime API cannot be typed statically and are documented here
 * rather than silently under-typed:
 *
 * 1. `flowGet` / `flowWatch` take a DOM Node, not a source reference. The owning
 *    `FlowSource` is resolved at runtime by a bubbling, composed CustomEvent, so there
 *    is no static edge from consumer to producer. Supply the value type at the call
 *    site: `flowGet<Squad[]>(this, 'squads')`.
 * 2. The HTML attribute bindings (`flow-watch-<key>-to-prop|attr`, `flow-if`, `flow-ul`,
 *    `flow-li-<item-key>-to-prop|attr`) live in template strings and get no coverage.
 */

// ---------------------------------------------------------------------------
// Utility types
// ---------------------------------------------------------------------------

type IsAny<T> = 0 extends 1 & T ? true : false;

type Primitive = string | number | boolean | bigint | symbol | null | undefined;

/** Values that are treated as leaves — never recursed into for paths or merging. */
type Leaf = Primitive | Function | Date | RegExp | ReadonlyArray<unknown> | Map<unknown, unknown> | Set<unknown>;

/**
 * Dot-separated paths into `T`, e.g. `'user' | 'user.name' | 'user.address.city'`.
 * Depth-limited to keep the checker from recursing forever on cyclic types.
 */
export type Paths<T, Depth extends readonly unknown[] = []> =
  IsAny<T> extends true
    ? string
    : Depth['length'] extends 8
      ? never
      : T extends Leaf
        ? never
        : {
            [K in keyof T & string]:
              | K
              | (T[K] extends Leaf ? never : `${K}.${Paths<T[K], [...Depth, unknown]>}`);
          }[keyof T & string];

/** The type at dot-path `P` within `T`. */
export type PathValue<T, P> =
  IsAny<T> extends true
    ? any
    : P extends `${infer Head}.${infer Rest}`
      ? Head extends keyof T
        ? PathValue<T[Head], Rest>
        : unknown
      : P extends keyof T
        ? T[P]
        : unknown;

/** Recursive `Partial`, matching `update()`'s deep merge (arrays are replaced, not merged). */
export type DeepPartial<T> =
  IsAny<T> extends true ? any : T extends Leaf ? T : { [K in keyof T]?: DeepPartial<T[K]> };

/** Recursive `Readonly`, matching the deep-frozen snapshot handed to functional updates. */
export type DeepReadonly<T> =
  IsAny<T> extends true
    ? any
    : T extends Primitive | Function
      ? T
      : T extends ReadonlyArray<infer U>
        ? ReadonlyArray<DeepReadonly<U>>
        : { readonly [K in keyof T]: DeepReadonly<T[K]> };

// ---------------------------------------------------------------------------
// Source configuration
// ---------------------------------------------------------------------------

declare const FLOW_COMPUTE: unique symbol;

/** The frozen marker object returned by {@link flowCompute}. */
export interface Computed<R = unknown> {
  readonly [FLOW_COMPUTE]: true;
  readonly fn: (...args: any[]) => R;
  readonly deps: readonly string[];
}

/**
 * A flat source config. Entries are sorted by shape at construction time:
 * `flowCompute()` markers become computed keys, plain functions become actions,
 * everything else becomes state.
 */
export type SourceConfig = Record<string, unknown>;

/** The state slice of a config — computed keys and actions removed. */
export type StateOf<C> = {
  [K in keyof C as C[K] extends Computed<any> ? never : C[K] extends Function ? never : K]: C[K];
};

/** The action slice of a config. */
export type ActionsOf<C> = {
  [K in keyof C as C[K] extends Computed<any> ? never : C[K] extends Function ? K : never]: C[K];
};

/** Everything readable through `flowGet`/`flowWatch`: state, computed results, and actions. */
export type ReadableOf<C> = StateOf<C> & ActionsOf<C> & {
  [K in keyof C as C[K] extends Computed<any> ? K : never]: C[K] extends Computed<infer R> ? R : never;
};

/** A patch passed to `update()`, or a function producing one from the previous state. */
export type Update<S> =
  | DeepPartial<S>
  | ((prev: DeepReadonly<S>) => DeepPartial<S> | null | undefined | void);

// ---------------------------------------------------------------------------
// FlowSource
// ---------------------------------------------------------------------------

/**
 * The frozen `{ update, destroy }` facade returned by `new FlowSource(...)`.
 * The constructor deliberately does not return the class instance, so `FlowSource`
 * is declared as a constructor type rather than a `class`.
 */
export interface FlowSourceInstance<C extends SourceConfig = SourceConfig> {
  /**
   * Merge a patch into state. Updates within the same microtask are batched into one
   * notification. Resolves once the flush that includes this patch has run.
   */
  update(update: Update<StateOf<C>>): Promise<void>;
  /** Tear down watchers, bindings, and devtools registration for this source. */
  destroy(): void;
}

export declare const FlowSource: {
  new <C extends SourceConfig>(root: Node, config?: C): FlowSourceInstance<C>;
};

// ---------------------------------------------------------------------------
// Functional API
// ---------------------------------------------------------------------------

/**
 * Read a key from the nearest ancestor source that owns it. Returns `undefined` when
 * no source answers. The value type cannot be inferred (see the note at the top of this
 * file) — supply it: `flowGet<Squad[]>(this, 'squads')`.
 */
export declare function flowGet<T = unknown>(source: Node, key: string): T | undefined;

/**
 * Subscribe to a key on the nearest ancestor source that owns it. The callback fires
 * immediately with the current value and again on every change. Returns an unsubscribe
 * function, or `undefined` when no source answered.
 */
export declare function flowWatch<T = unknown>(
  source: Node,
  key: string,
  callback: (value: T) => void,
): (() => void) | undefined;

/** Propagate bindings into a shadow root that would otherwise block event bubbling. */
export declare function flowThrough(shadowRoot: ShadowRoot): void;

/**
 * Declare a computed key. `deps` are dot-paths into the same config; `fn` receives their
 * values positionally, in order.
 *
 * The dep values cannot be inferred — they live in the object literal that contains this
 * call, which TypeScript cannot read mid-literal. Annotate the callback parameters to get
 * the body checked and the result type inferred:
 *
 * ```ts
 * total: flowCompute((price: number, qty: number) => price * qty, ['price', 'qty'])
 * ```
 */
export declare function flowCompute<R>(
  fn: (...args: any[]) => R,
  deps?: readonly string[],
): Computed<R>;

/** Enable devtools broadcasting for this page. Idempotent. */
export declare function flowDevtools(): void;

// ---------------------------------------------------------------------------
// FlowStateComponent
// ---------------------------------------------------------------------------

/**
 * Base class for components that own a source.
 *
 * Declare the config as `sourceConfig`; after `connectedCallback` runs, `source` holds
 * the resulting `FlowSourceInstance`. Pass the config type as `C` for a precisely typed
 * `source`: `class MyEl extends FlowStateComponent<{ count: number }>`.
 */
export declare class FlowStateComponent<C extends SourceConfig = SourceConfig> extends HTMLElement {
  /** Config for this component's own source. Omit to not create one. */
  sourceConfig?: C;
  /** CSS applied to the shadow root, or injected once per tag name in light DOM. */
  styles?: string;
  /** HTML stamped into the shadow root (or the host, in light DOM) after the source is ready. */
  template?: string;
  /** When set, a shadow root is attached automatically before the template is stamped. */
  shadowMode?: 'open' | 'closed';
  /** The source instance, available from `connectedCallback` onward. */
  readonly source: FlowSourceInstance<C> | undefined;

  connectedCallback(): void;
  disconnectedCallback(): void;
}

// ---------------------------------------------------------------------------
// Devtools
// ---------------------------------------------------------------------------

/** One watcher registration, as reported in a {@link Snapshot}. */
export interface SnapshotWatcher {
  key: string;
  /** Human-readable origin of the subscription. */
  source: string | null;
  /** Snapshot id of the watching element's own source, when it has one. */
  sourceFlowId: string | null;
  /** Registry id for a watching element with no source of its own. */
  sourceElId: string | null;
}

/**
 * The devtools payload broadcast over the `flowstate-devtools` BroadcastChannel.
 * Shared contract between `lib/FlowState.js` and `lib/devtools/`.
 */
export interface Snapshot {
  type: 'snapshot';
  id: string;
  rootTag: string;
  shadowHostTag: string;
  isShadow: boolean;
  shadowMode: ShadowRootMode | 'n/a';
  isFlowThrough: boolean;
  label: string | null;
  /** Id of the nearest ancestor source, or `null` at the top of a tree. */
  parentId: string | null;
  /** Structured-clone of state values, or `null` when they are not JSON-serializable. */
  values: Record<string, unknown> | null;
  computedKeys: string[];
  actionKeys: string[];
  watchers: SnapshotWatcher[];
  watcherKeys: string[];
  watcherCount: number;
  flowThroughCount: number;
  timestamp: number;
}
