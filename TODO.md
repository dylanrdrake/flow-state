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


what if a flow-list uses an array of primitves like: [1, 2, 3]. How would flow-li refer to them?
flow-li-to-<prop/attr>, parsed as null so use value directly?