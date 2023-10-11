### 概念

我们首先区分一下什么是可变/不可变数据结构

1. 可变：一个变量创建之后进行修改，如果对应的内存地址为不发生变化，则这个数据类型为可变数据结构
2. 不可变：一个变量创建之后，进行修改返回一个新的内存地址 且 原有的值存储在之前的内存空间中没有发生变化，则这个数据类型为不可变数据结构

js 里面，所有的基本数据类型都是不可变数据类型（number, string, boolean, undefined, null, symbol, bigint）
Array, Function, Object 等则都是可变数据类型

### 为什么要使用不可变数据

在函数式编程中，我们会提及纯函数这个概念。React 则遵循函数式编程范式，所以我们写的 React 组件越纯越好。

在该范式中，我们希望函数是一个不会修改外部数据的闭合功能单元，这样我们只需要关注函数的功能实现，不会影响到外部或者全局的数据修改。

于此，我们针对纯函数的入参和出参希望是一个不可变的数据结构。

那针对 React 本身来看，有以下优点

1. 调试 console.log 不会被可变数据修改
2. 优化 useMemo 等常见优化手段 都是通过浅比较实现的，这样检查就可以非常快
3. 快照 可以展示撤销，重做和显示历史记录的值
4. rerender 在渲染的时候状态可追踪

### 不可变 in React

我们通常在 React 里面写的代码通常是这样

```javascript
setState({
  ...a,
  b: "更新",
});
```

这样整个对象使用不可变的数据结构进行更新，但是如果一旦遇到了复杂结构的话

```javascript
setState({
    ...a,
    b: {
        ...c,
        d: {
            ...e,
            f: '更新在这里'
        }
    }
})
```

我们需要逐级将对应的数据元素给更新，层级比较深，写起来会比较难受
此外，如果我们需要使用splice, reverse等原地修改的方法，也会遇到同样的问题

```javascript
a.splice(1, 'a');
setState([...a]);

a.reverse()
setState([...a]);
```

那么我们就介绍一个常见的库去减少这些操作，即immer

### immer

官方： https://immerjs.github.io/immer/

![immer.png](https://immerjs.github.io/immer/assets/images/immer-4002b3fd2cfd3aa66c62ecc525663c0d.png)

从图中可以看出，这个库会基于我们目前的状态生成一份草稿（draft）， 在草稿上我们可以使用任意方法去修改，生成next。最后会比对修改结果去支持自动不可变数据的状态更新。

那么怎么使用：

```javascript
const baseState = [
    {
        title: "Learn TypeScript",
        done: true
    },
    {
        title: "Try Immer",
        done: false
    }
]

const nextState = produce(baseState, draftState => {
    draftState.push({title: "Tweet about it"})
    draftState[1].done = true
})
```

官方甚至 单独针对React提供了一个hooks useImmmer
```javascript
import { useImmer } from "use-immer";

  const [todos, setTodos] = useImmer([
    {
      id: "React",
      title: "Learn React",
      done: true
    },
    {
      id: "Immer",
      title: "Try Immer",
      done: false
    }
  ]);

  setTodos((draft) => {
      draft.push({
        id: "todo_" + Math.random(),
        title: "A new todo",
        done: false
      });
    });
```

首先我们看个手写immer
```javascript
const state = {
  phone: "1-770-736-8031 x56442",
  website: "hildegard.org",
  company: {
    name: "Romaguera-Crona",
    catchPhrase: "Multi-layered client-server neural-net",
    bs: "harness real-time e-markets",
  },
};

function immer(state, thunk) {
  let copies = new Map(); // Map 的 key 可以是一个对象，非常适合用来缓存被修改的对象
  // 核心代码就在这里
  const handler = {
    get(target, prop) {
      // @ts-ignore
      return new Proxy(target[prop], handler);
    },
    set(target, prop, value) {
      const copy = { ...target }; // 浅拷贝
      copy[prop] = value; // 给拷贝对象赋值
      copies.set(target, copy);
    },
  };
  function finalize(state) {
    const result = { ...state };
    Object.keys(state).map((key) => {
      const copy = copies.get(state[key]);
      if (copy) {
        result[key] = copy;
      } else {
        result[key] = state[key];
      }
    });
    return result;
  }
  // @ts-ignore
  const proxy = new Proxy(state, handler);
  thunk(proxy);
  return finalize(copy);
}

const copy = immer(state, (draft) => {
  draft.website = "www.google.com";
});
```




那接下来我们直接看下immer里面是怎么操作的

github: https://github.com/immerjs/immer

```javascript
// package.json

"source": "src/immer.ts",
```

那接下来我们去immer.ts中，这里有一堆方法，最核心的还是这个方法
```javascript
const immer = new Immer();
export const produce: IProduce = immer.produce
```

代码只有200行不到，我们完整看下
```javascript

export class Immer implements ProducersFns {
	autoFreeze_: boolean = true
	useStrictShallowCopy_: boolean = false

    //这里是一些参数控制
	constructor(config?: {autoFreeze?: boolean; useStrictShallowCopy?: boolean}) {
		if (typeof config?.autoFreeze === "boolean")
			this.setAutoFreeze(config!.autoFreeze)
		if (typeof config?.useStrictShallowCopy === "boolean")
			this.setUseStrictShallowCopy(config!.useStrictShallowCopy)
	}

//  * @param {any} base - 原始数据
//  * @param {Function} recipe - 修改数据操作的函数
//  * @param {Function} patchListener - optional 回调函数（patch用来记录修改的步骤，以达到精准更新的目的）
//  * @returns {any} 返回新的数据状态，如果没有修改，则返回原始数据 
	produce: IProduce = (base: any, recipe?: any, patchListener?: any) => {
		// curried invocation   // 科里化调用
		if (typeof base === "function" && typeof recipe !== "function") {
			const defaultBase = recipe
			recipe = base

			const self = this  // 保存当前的this指向
			return function curriedProduce(
				this: any,
				base = defaultBase,
				...args: any[]
			) {
                // 调用传入的参数，返回结果
				return self.produce(base, (draft: Drafted) => recipe.call(this, draft, ...args)) // prettier-ignore
			}
		}

        // 参数校验，可以忽略
		if (typeof recipe !== "function") die(6)
		if (patchListener !== undefined && typeof patchListener !== "function")
			die(7)

		let result

		// Only plain objects, arrays, and "immerable classes" are drafted.
        // 判断对象是不是可以草稿修改，即只有普通对象，数组和immerable类可以编辑
		if (isDraftable(base)) {
			const scope = enterScope(this)  // 使用scope 来区分不同的层级，以便处理嵌套数据中的层级关系
			const proxy = createProxy(base, undefined) // immer的核心就是利用Proxy来对数据进行拦截
			let hasError = true
			try {
				result = recipe(proxy) // 把代理传入进去
				hasError = false
			} finally {
				// finally instead of catch + rethrow better preserves original stack
				if (hasError) revokeScope(scope)
				else leaveScope(scope)
			}
			usePatchesInScope(scope, patchListener)
			return processResult(result, scope)
		} else if (!base || typeof base !== "object") {
			result = recipe(base)
			if (result === undefined) result = base
			if (result === NOTHING) result = undefined
			if (this.autoFreeze_) freeze(result, true)
			if (patchListener) {
				const p: Patch[] = []
				const ip: Patch[] = []
				getPlugin("Patches").generateReplacementPatches_(base, result, p, ip)
				patchListener(p, ip)
			}
			return result
		} else die(1, base)
	}

	produceWithPatches: IProduceWithPatches = (base: any, recipe?: any): any => {
		// curried invocation
		if (typeof base === "function") {
			return (state: any, ...args: any[]) =>
				this.produceWithPatches(state, (draft: any) => base(draft, ...args))
		}

		let patches: Patch[], inversePatches: Patch[]
		const result = this.produce(base, recipe, (p: Patch[], ip: Patch[]) => {
			patches = p
			inversePatches = ip
		})
		return [result, patches!, inversePatches!]
	}

	createDraft<T extends Objectish>(base: T): Draft<T> {
		if (!isDraftable(base)) die(8)
		if (isDraft(base)) base = current(base)
		const scope = enterScope(this)
		const proxy = createProxy(base, undefined)
		proxy[DRAFT_STATE].isManual_ = true
		leaveScope(scope)
		return proxy as any
	}

	finishDraft<D extends Draft<any>>(
		draft: D,
		patchListener?: PatchListener
	): D extends Draft<infer T> ? T : never {
		const state: ImmerState = draft && (draft as any)[DRAFT_STATE]
		if (!state || !state.isManual_) die(9)
		const {scope_: scope} = state
		usePatchesInScope(scope, patchListener)
		return processResult(undefined, scope)
	}

	/**
	 * Pass true to automatically freeze all copies created by Immer.
	 *
	 * By default, auto-freezing is enabled.
	 */
	setAutoFreeze(value: boolean) {
		this.autoFreeze_ = value
	}

	/**
	 * Pass true to enable strict shallow copy.
	 *
	 * By default, immer does not copy the object descriptors such as getter, setter and non-enumrable properties.
	 */
	setUseStrictShallowCopy(value: boolean) {
		this.useStrictShallowCopy_ = value
	}

	applyPatches<T extends Objectish>(base: T, patches: Patch[]): T {
		// If a patch replaces the entire state, take that replacement as base
		// before applying patches
		let i: number
		for (i = patches.length - 1; i >= 0; i--) {
			const patch = patches[i]
			if (patch.path.length === 0 && patch.op === "replace") {
				base = patch.value
				break
			}
		}
		// If there was a patch that replaced the entire state, start from the
		// patch after that.
		if (i > -1) {
			patches = patches.slice(i + 1)
		}

		const applyPatchesImpl = getPlugin("Patches").applyPatches_
		if (isDraft(base)) {
			// N.B: never hits if some patch a replacement, patches are never drafts
			return applyPatchesImpl(base, patches)
		}
		// Otherwise, produce a copy of the base state.
		return this.produce(base, (draft: Drafted) =>
			applyPatchesImpl(draft, patches)
		)
	}
}
```



```javascript
function createScope(
	parent_: ImmerScope | undefined,
	immer_: Immer
): ImmerScope {
	return {
		drafts_: [],
		parent_,
		immer_,
		// Whenever the modified draft contains a draft from another scope, we
		// need to prevent auto-freezing so the unowned draft can be finalized.
		canAutoFreeze_: true,
		unfinalizedDrafts_: 0
	}
}
export function enterScope(immer: Immer) {
	return (currentScope = createScope(currentScope, immer))
}
```

```javascript
export function createProxyProxy<T extends Objectish>(
	base: T,
	parent?: ImmerState
): Drafted<T, ProxyState> {
	const isArray = Array.isArray(base)
	const state: ProxyState = {
		type_: isArray ? ArchType.Array : (ArchType.Object as any),
		// Track which produce call this is associated with.
		scope_: parent ? parent.scope_ : getCurrentScope()!,
		// True for both shallow and deep changes.
		modified_: false,
		// Used during finalization.
		finalized_: false,
		// Track which properties have been assigned (true) or deleted (false).
		assigned_: {},
		// The parent draft state.
		parent_: parent,
		// The base state.
		base_: base,
		// The base proxy.
		draft_: null as any, // set below
		// The base copy with any updated values.
		copy_: null,
		// Called by the `produce` function.
		revoke_: null as any,
		isManual_: false
	}

	// the traps must target something, a bit like the 'real' base.
	// but also, we need to be able to determine from the target what the relevant state is
	// (to avoid creating traps per instance to capture the state in closure,
	// and to avoid creating weird hidden properties as well)
	// So the trick is to use 'state' as the actual 'target'! (and make sure we intercept everything)
	// Note that in the case of an array, we put the state in an array to have better Reflect defaults ootb
	let target: T = state as any
	let traps: ProxyHandler<object | Array<any>> = objectTraps
	if (isArray) {
		target = [state] as any
		traps = arrayTraps
	}

    // 这里用了revocable而不是直接new Proxy 是为了便于撤销这个代理对象，提高性能
	const {revoke, proxy} = Proxy.revocable(target, traps)
	state.draft_ = proxy as any
	state.revoke_ = revoke
	return proxy as any
}
```

这个代码就是代理object的各个方法
```javascript
/**
 * Object drafts
 */
export const objectTraps: ProxyHandler<ProxyState> = {
	get(state, prop) {
		if (prop === DRAFT_STATE) return state

		const source = latest(state)
		if (!has(source, prop)) {
			// non-existing or non-own property...
			return readPropFromProto(state, source, prop)
		}
		const value = source[prop]
		if (state.finalized_ || !isDraftable(value)) {
			return value
		}
		// Check for existing draft in modified state.
		// Assigned values are never drafted. This catches any drafts we created, too.
		if (value === peek(state.base_, prop)) {
			prepareCopy(state)
			return (state.copy_![prop as any] = createProxy(value, state))
		}
		return value
	},
	has(state, prop) {
		return prop in latest(state)
	},
	ownKeys(state) {
		return Reflect.ownKeys(latest(state))
	},
	set(
		state: ProxyObjectState,
		prop: string /* strictly not, but helps TS */,
		value
	) {
		const desc = getDescriptorFromProto(latest(state), prop)
		if (desc?.set) {
			// special case: if this write is captured by a setter, we have
			// to trigger it with the correct context
			desc.set.call(state.draft_, value)
			return true
		}
		if (!state.modified_) {
			// the last check is because we need to be able to distinguish setting a non-existing to undefined (which is a change)
			// from setting an existing property with value undefined to undefined (which is not a change)
			const current = peek(latest(state), prop)
			// special case, if we assigning the original value to a draft, we can ignore the assignment
			const currentState: ProxyObjectState = current?.[DRAFT_STATE]
			if (currentState && currentState.base_ === value) {
				state.copy_![prop] = value
				state.assigned_[prop] = false
				return true
			}
			if (is(value, current) && (value !== undefined || has(state.base_, prop)))
				return true
			prepareCopy(state)
			markChanged(state)
		}

		if (
			(state.copy_![prop] === value &&
				// special case: handle new props with value 'undefined'
				(value !== undefined || prop in state.copy_)) ||
			// special case: NaN
			(Number.isNaN(value) && Number.isNaN(state.copy_![prop]))
		)
			return true

		// @ts-ignore
		state.copy_![prop] = value
		state.assigned_[prop] = true
		return true
	},
	deleteProperty(state, prop: string) {
		// The `undefined` check is a fast path for pre-existing keys.
		if (peek(state.base_, prop) !== undefined || prop in state.base_) {
			state.assigned_[prop] = false
			prepareCopy(state)
			markChanged(state)
		} else {
			// if an originally not assigned property was deleted
			delete state.assigned_[prop]
		}
		if (state.copy_) {
			delete state.copy_[prop]
		}
		return true
	},
	// Note: We never coerce `desc.value` into an Immer draft, because we can't make
	// the same guarantee in ES5 mode.
	getOwnPropertyDescriptor(state, prop) {
		const owner = latest(state)
		const desc = Reflect.getOwnPropertyDescriptor(owner, prop)
		if (!desc) return desc
		return {
			writable: true,
			configurable: state.type_ !== ArchType.Array || prop !== "length",
			enumerable: desc.enumerable,
			value: owner[prop]
		}
	},
	defineProperty() {
		die(11)
	},
	getPrototypeOf(state) {
		return getPrototypeOf(state.base_)
	},
	setPrototypeOf() {
		die(12)
	}
}
```

通过上面的代码描述，我们可以知道：
    immer通过Proxy对象进行数据劫持
    通过patch来记录修改记录，以达到精准更新
