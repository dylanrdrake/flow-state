Open from the virtualization work (branch `virtualize`):

- Test in Firefox and Safari. The real-browser checks ran in Chromium only.
- `flow-ul` re-render is about 20% slower (every swapped node passes through the MutationObserver). Keyed rendering that reuses items would fix it.
- Mount got slower: perf lab d4 x b3 mounts in 10.8ms vs 9.1ms before, and 15.0ms vs 6.3ms with shadow DOM; subtree churn 3.1ms vs 2.1ms. Indexing and observing at mount is the cost. Not yet profiled.
- The tutorial page logs 24 console errors (predates the virtualization work).
- Per-key subscriptions in the source tree: an update visits every reachable descendant source for each changed key. Only matters with thousands of sources.



server side rendering
turing complete JSON? project tracker?



if a bindng binds a computed value that returns an object, allow it to access the keys of the returned object in the binding key string

ie:
// Parent
this.#source = new FlowSource({
    stats: flowCompute((items) => ({
        total: state.items.length,
        avg: avg(state.items.map(i => i.total))
    }), [items])
})

// Child
<span flow-watch-stats-total-to-prop="innerHTML"-></span>



should the initial value fire of watchers be removed and require explicit use of flowGet to get an initial value then set your watcher.  More explicit, no hidden behavior?
