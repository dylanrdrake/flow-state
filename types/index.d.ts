/**
 * Type definitions for flow-state.
 *
 * How values are typed:
 *
 * 1. `flowGet` / `flowWatch` take a DOM Node and a key object. The owning `FlowSource` is
 *    still resolved at runtime from the node's position in the DOM; the key object is what
 *    carries the value type. Keys come from a source (`source.squads`) or, when the source
 *    cannot be imported, from `flowScope<MyComponent>()`.
 * 2. The HTML attribute bindings (`flow-prop`, `flow-attr`, `flow-if`, `flow-ul`,
 *    `flow-li-prop`, `flow-li-attr`) live in template strings and get no coverage.
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

// ---------------------------------------------------------------------------
// Keys
// ---------------------------------------------------------------------------

declare const FLOW_KEY: unique symbol;

/**
 * What `flowGet` / `flowWatch` take to name a value: `source.count`, `scope.user.name`.
 * It stands for the dot-path and carries the type of the value there. For an object value
 * each property is the key one level down. It is not the value itself.
 */
export type FlowKey<T> =
  IsAny<T> extends true
    ? UntypedKey
    : { readonly [FLOW_KEY]: T } & (
        NonNullable<T> extends Leaf
          ? {}
          : { readonly [K in keyof NonNullable<T> & string]-?: FlowKey<NonNullable<T>[K]> }
      );

/** A key with no type information: any property is another untyped key. */
export interface UntypedKey {
  readonly [FLOW_KEY]: any;
  readonly [name: string]: UntypedKey;
}

/** One key per readable entry of a config: state, computed results and actions. */
export type KeysOf<C> =
  IsAny<C> extends true
    ? { readonly [name: string]: UntypedKey }
    : { readonly [K in keyof ReadableOf<C> & string]: FlowKey<ReadableOf<C>[K]> };

/** A patch passed to `update()`, or a function producing one from the previous state. */
export type Update<S> =
  | DeepPartial<S>
  | ((prev: DeepReadonly<S>) => DeepPartial<S> | null | undefined | void);

// ---------------------------------------------------------------------------
// FlowSource
// ---------------------------------------------------------------------------

/**
 * The frozen object returned by `new FlowSource(...)`: `update`, `destroy`, and one key
 * per config entry (`source.count`). The constructor deliberately does not return the class
 * instance, so `FlowSource` is declared as a constructor type rather than a `class`.
 */
export type FlowSourceInstance<C extends SourceConfig = SourceConfig> = KeysOf<C> & {
  /**
   * Merge a patch into state. Updates within the same microtask are batched into one
   * notification. Resolves once the flush that includes this patch has run.
   */
  update(update: Update<StateOf<C>>): Promise<void>;
  /** Tear down watchers, bindings, and devtools registration for this source. */
  destroy(): void;
};

/** Names a config cannot use as keys, because the source has methods by those names. */
type ReservedKeys = { update?: never; destroy?: never };

export declare const FlowSource: {
  new <C extends SourceConfig & ReservedKeys>(root: Node, config?: C): FlowSourceInstance<C>;
};

// ---------------------------------------------------------------------------
// Functional API
// ---------------------------------------------------------------------------

/**
 * Read a key from the nearest ancestor source that owns it. Returns `undefined` when
 * no source answers. The value type comes from the key: `flowGet(this, board.squads)`.
 */
export declare function flowGet<T>(source: Node, key: FlowKey<T>): T | undefined;

/**
 * Subscribe to a key on the nearest ancestor source that owns it. The callback fires
 * immediately with the current value and again on every change. Returns an unsubscribe
 * function, or `undefined` when no source answered.
 */
export declare function flowWatch<T>(
  source: Node,
  key: FlowKey<T>,
  callback: (value: T) => void,
): (() => void) | undefined;

/**
 * Keys for a source that cannot be imported, such as a component's own source. Name the
 * component (or its config type) and the keys are typed from its `sourceConfig`:
 *
 * ```ts
 * export const boardScope = flowScope<SquadBoard>();
 * flowGet(this, boardScope.squads);
 * ```
 *
 * With no type argument every property is an untyped key, which is what plain JavaScript gets.
 */
export declare function flowScope<T = any>(): IsAny<T> extends true
  ? { readonly [name: string]: UntypedKey }
  : T extends { sourceConfig?: infer C }
    ? KeysOf<NonNullable<C>>
    : KeysOf<T>;

/**
 * Link a shadow root into the sources above it, so their bindings reach inside. Needed for a
 * closed shadow root, and for an open one attached after its host was already in the DOM.
 */
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
 * the resulting `FlowSourceInstance`.
 *
 * `source` is typed from the type argument `C`, not from the `sourceConfig` field (a class
 * cannot type one of its members from another through `this`). Without `C`, `source` is
 * untyped:
 *
 * ```ts
 * type CounterConfig = { count: number };
 * class MyEl extends FlowStateComponent<CounterConfig> { sourceConfig = { count: 0 }; }
 * ```
 *
 * The `sourceConfig` field is checked against `C`: a missing key or a wrong value type is an
 * error. A key in the field that `C` does not list is not an error, but `source` will not
 * know about it.
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
