这是源码解读系列的第二篇，虽然说对于Redux已经有好多文章说的不能再详细了，但是Redux中有一些非常有意思的函数式编程技巧与发布——订阅者模式，这个设计模式对于目前的前端工程是核心，也是面试经常会考到的。我会把redux的注释简单翻译一下，并且其余地方加上我的理解。在这里特别感谢[面试图谱][1]以及[cbbfcd][2]同学，我借鉴了它们分析的要点，两位的链接我会放在最后。
## redux源码分析，基于4.0.0版本
### Componse
首先看一个公共函数Componse。
```javascript
/**
 * Composes single-argument functions from right to left. The rightmost
 * function can take multiple arguments as it provides the signature for
 * the resulting composite function.
 *
 * @param {...Function} funcs The functions to compose.
 * @returns {Function} A function obtained by composing the argument functions
 * from right to left. For example, compose(f, g, h) is identical to doing
 * (...args) => f(g(h(...args))).
 */
 /**
  *从右至左组合单变量函数。为了它们（指单变量函数）组合后的函数的结果，最右边的函数可以调用多个参数作为它的签名（？）
  */

// 这个函数设计的很巧妙，通过传入函数引用的方式让我们完成多个函数的嵌套使用，术语叫做高阶函数
// 通常在redux中我们会这样调用
// compose(
//     applyMiddleware(thunkMiddleware),
//     window.devToolsExtension ? window.devToolsExtension() : f => f
// ) 
// 经过 compose 函数变成了 applyMiddleware(thunkMiddleware)(window.devToolsExtension()())
// 所以在找不到 window.devToolsExtension 时你应该返回一个函数
export default function compose(...funcs) {
  if (funcs.length === 0) {
    return arg => arg
  }

  if (funcs.length === 1) {
    return funcs[0]
  }

  return funcs.reduce((a, b) => (...args) => a(b(...args)))
}
//若有f1,f2,f3三个函数加入
//第二次迭代，a变为f1,b变为f2
//第一次迭代后，a变为(...args) => {return f1(f2(...args))}
//b变为f3
//所以最后形成f1(f2(f3(args)))
```

### CreateStore
```javascript
/**
 * Creates a Redux store that holds the state tree.
 * The only way to change the data in the store is to call `dispatch()` on it.
 *
 * There should only be a single store in your app. To specify how different
 * parts of the state tree respond to actions, you may combine several reducers
 * into a single reducer function by using `combineReducers`.
 *创造一个store对应state tree，改变他的唯一方式是调用dispatch。app中应该只有一个store，你可以结合几个reducers来组合成。
 */

 export default function createStore(reducer, preloadedState, enhancer) {
    // 一般 preloadedState 用的少，判断类型，如果第二个参数是函数且没有第三个参数，就调换位置
    if (typeof preloadedState === 'function' && typeof enhancer === 'undefined') {
      enhancer = preloadedState
      preloadedState = undefined
    }
    // 判断 enhancer 是否是函数，不是函数就抛出错误
    if (typeof enhancer !== 'undefined') {
      if (typeof enhancer !== 'function') {
        throw new Error('Expected the enhancer to be a function.')
      }
      // 类型没错的话，先执行 enhancer，然后再执行 createStore 函数
      //enhancer一般就是我们用componse之后组合的增强器。
      return enhancer(createStore)(reducer, preloadedState)
    }
    // 判断 reducer 是否是函数
    if (typeof reducer !== 'function') {
      throw new Error('Expected the reducer to be a function.')
    }
    // 当前 reducer 即你写入的所有reducer
    let currentReducer = reducer
    // 当前State
    let currentState = preloadedState
    // 当前监听函数数组
    let currentListeners = []
    // 这是一个很重要的设计，为的就是每次在遍历监听器的时候保证 currentListeners 数组不变
    // 可以考虑下只存在 currentListeners 的情况，如果我在某个 subscribe 中再次执行 subscribe
    // 或者 unsubscribe，这样会导致当前的 currentListeners 数组大小发生改变，从而可能导致索引出错。
    //即也是一种纯函数，保证不修改原数组
    let nextListeners = currentListeners
    // reducer 是否正在执行
    let isDispatching = false
    // 如果 currentListeners 和 nextListeners 相同，下个处理事件为当前事件的复制。
    function ensureCanMutateNextListeners() {
      if (nextListeners === currentListeners) {
        nextListeners = currentListeners.slice()
      }
    }

    //Store上的getState方法
    function getState() {
        if (isDispatching) {
          throw new Error(
            'You may not call store.getState() while the reducer is executing. ' +
              'The reducer has already received the state as an argument. ' +
              'Pass it down from the top reducer instead of reading it from the store.'
          )
        }
    
        return currentState
      }
    
    /**
     *有两个警告
     * 1.订阅只是一个在dispatch调用前的快照，如果你在监听器唤醒之前订阅或者解除订阅
     * 这不会影响正在dispatch的进度，然而，下一次dispatch之后，就会使用最近的订阅与解除订阅列表
     * 2.监听器不会探测到所有state的变化、state可能在监听器触发之前之前就已经被更新多次通过dispatch
     * 然而，能够保证所有的监听器在dispatch开始调用之前和最新的state之前注册
     * 主要应用在react-redux中监听数据变化
     */
    function subscribe(listener) {
        if (typeof listener !== 'function') {
          throw new Error('Expected the listener to be a function.')
        }
    
        if (isDispatching) {
          throw new Error(
            'You may not call store.subscribe() while the reducer is executing. ' +
              'If you would like to be notified after the store has been updated, subscribe from a ' +
              'component and invoke store.getState() in the callback to access the latest state. ' +
              'See https://redux.js.org/api-reference/store#subscribe(listener) for more details.'
          )
        }
    
        let isSubscribed = true
        //判断下次处理事件和当前处理事件是否相同
        ensureCanMutateNextListeners()
        nextListeners.push(listener)
        //返回取消订阅函数
        return function unsubscribe() {
          if (!isSubscribed) {
            return
          }
    
          if (isDispatching) {
            throw new Error(
              'You may not unsubscribe from a store listener while the reducer is executing. ' +
                'See https://redux.js.org/api-reference/store#subscribe(listener) for more details.'
            )
          }
    
          isSubscribed = false
          //找到下次处理事件数组中的index并移除
          ensureCanMutateNextListeners()
          const index = nextListeners.indexOf(listener)
          nextListeners.splice(index, 1)
        }
      }

      //dispatch触发函数
      function dispatch(action) {
        if (!isPlainObject(action)) {
          throw new Error(
            'Actions must be plain objects. ' +
              'Use custom middleware for async actions.'
          )
        }
    
        if (typeof action.type === 'undefined') {
          throw new Error(
            'Actions may not have an undefined "type" property. ' +
              'Have you misspelled a constant?'
          )
        }
    
        if (isDispatching) {
          throw new Error('Reducers may not dispatch actions.')
        }
    
        try {
          isDispatching = true
          currentState = currentReducer(currentState, action)//生成新的state
        } finally {
          isDispatching = false
        }
        //这边是将马上要调用的事件赋值并调用
        const listeners = (currentListeners = nextListeners)
        for (let i = 0; i < listeners.length; i++) {
          const listener = listeners[i]
          listener()
        }
    
        return action
      }
      //替换readucer用
      function replaceReducer(nextReducer) {
        if (typeof nextReducer !== 'function') {
          throw new Error('Expected the nextReducer to be a function.')
        }
    
        currentReducer = nextReducer
        dispatch({ type: ActionTypes.REPLACE })
      }
      //观察者
      function observable() {
        const outerSubscribe = subscribe
        return {
          /**
           * The minimal observable subscription method.
           * @param {Object} observer Any object that can be used as an observer.
           * The observer object should have a `next` method.
           * @returns {subscription} An object with an `unsubscribe` method that can
           * be used to unsubscribe the observable from the store, and prevent further
           * emission of values from the observable.
           */
          subscribe(observer) {
            if (typeof observer !== 'object' || observer === null) {
              throw new TypeError('Expected the observer to be an object.')
            }
    
            function observeState() {
              if (observer.next) {
                observer.next(getState())
              }
            }
    
            observeState()
            //传入的实质是监听器
            const unsubscribe = outerSubscribe(observeState)
            return { unsubscribe }
          },
    
          [$$observable]() {
            return this
          }
        }
      }
    
      // When a store is created, an "INIT" action is dispatched so that every
      // reducer returns their initial state. This effectively populates
      // the initial state tree.
      dispatch({ type: ActionTypes.INIT })
    
      return {
        dispatch,
        subscribe,
        getState,
        replaceReducer,
        [$$observable]: observable
      }
    }

```
### CombineReducers
```javascript
// 传入一个 object
//在用的时候类似于{1:1,2:2}
export default function combineReducers(reducers) {
    // 获取该 Object 的 key 值
     const reducerKeys = Object.keys(reducers)
     // 过滤后的 reducers
     const finalReducers = {}
     // 获取每一个 key 对应的 value
     // 在开发环境下判断值是否为 undefined
     // 然后将值类型是函数的值放入 finalReducers
     for (let i = 0; i < reducerKeys.length; i++) {
       const key = reducerKeys[i]
   
       if (process.env.NODE_ENV !== 'production') {
         if (typeof reducers[key] === 'undefined') {
           warning(`No reducer provided for key "${key}"`)
         }
       }
   
       if (typeof reducers[key] === 'function') {
         finalReducers[key] = reducers[key]
       }
     }
     // 拿到过滤后的 reducers 的 key 值
     const finalReducerKeys = Object.keys(finalReducers)
     
     // 在开发环境下判断，保存不期望 key 的缓存用以下面做警告  
     let unexpectedKeyCache
     if (process.env.NODE_ENV !== 'production') {
       unexpectedKeyCache = {}
     }
       
     let shapeAssertionError
     try {
     // 该函数解析在下面
       assertReducerShape(finalReducers)
     } catch (e) {
       shapeAssertionError = e
     }
   // combineReducers 函数返回一个函数，也就是合并后的 reducer 函数
   // 该函数返回总的 state
   // 并且你也可以发现这里使用了闭包，函数里面使用到了外面的一些属性
     return function combination(state = {}, action) {
       if (shapeAssertionError) {
         throw shapeAssertionError
       }
       // 该函数解析在下面
       if (process.env.NODE_ENV !== 'production') {
         const warningMessage = getUnexpectedStateShapeWarningMessage(
           state,
           finalReducers,
           action,
           unexpectedKeyCache
         )
         if (warningMessage) {
           warning(warningMessage)
         }
       }
       // state 是否改变
       let hasChanged = false
       // 改变后的 state
       const nextState = {}
       for (let i = 0; i < finalReducerKeys.length; i++) {
       // 拿到相应的 key
         const key = finalReducerKeys[i]
         // 获得 key 对应的 reducer 函数
         const reducer = finalReducers[key]
         // state 树下的 key 是与 finalReducers 下的 key 相同的
         // 所以你在 combineReducers 中传入的参数的 key 即代表了 各个 reducer 也代表了各个 state
         const previousStateForKey = state[key]
         // 然后执行 reducer 函数获得该 key 值对应的 state
         const nextStateForKey = reducer(previousStateForKey, action)
         // 判断 state 的值，undefined 的话就报错
         if (typeof nextStateForKey === 'undefined') {
           const errorMessage = getUndefinedStateErrorMessage(key, action)
           throw new Error(errorMessage)
         }
         // 然后将 value 塞进去
         nextState[key] = nextStateForKey
         // 如果 state 改变
         hasChanged = hasChanged || nextStateForKey !== previousStateForKey
       }
       // state 只要改变过，就返回新的 state
       return hasChanged ? nextState : state
     }
   }
//核心思想是state与reducer是分开的，先检验reducer是否有效，在将每次的传入的reducer加上action生成state，与原来的state比较，返回state


   // 这是执行的第一个用于抛错的函数
function assertReducerShape(reducers) {
    // 将 combineReducers 中的参数遍历
      Object.keys(reducers).forEach(key => {
        const reducer = reducers[key]
        // 给他传入一个 action
        const initialState = reducer(undefined, { type: ActionTypes.INIT })
        // 如果得到的 state 为 undefined 就抛错
        if (typeof initialState === 'undefined') {
          throw new Error(
            `Reducer "${key}" returned undefined during initialization. ` +
              `If the state passed to the reducer is undefined, you must ` +
              `explicitly return the initial state. The initial state may ` +
              `not be undefined. If you don't want to set a value for this reducer, ` +
              `you can use null instead of undefined.`
          )
        }
        // 再过滤一次，考虑到万一你在 reducer 中给 ActionTypes.INIT 返回了值
        // 传入一个随机的 action 判断值是否为 undefined
        const type =
          '@@redux/PROBE_UNKNOWN_ACTION_' +
          Math.random()
            .toString(36)
            .substring(7)
            .split('')
            .join('.')
        if (typeof reducer(undefined, { type }) === 'undefined') {
          throw new Error(
            `Reducer "${key}" returned undefined when probed with a random type. ` +
              `Don't try to handle ${
                ActionTypes.INIT
              } or other actions in "redux/*" ` +
              `namespace. They are considered private. Instead, you must return the ` +
              `current state for any unknown actions, unless it is undefined, ` +
              `in which case you must return the initial state, regardless of the ` +
              `action type. The initial state may not be undefined, but can be null.`
          )
        }
      })
    }
    
    function getUnexpectedStateShapeWarningMessage(
      inputState,
      reducers,
      action,
      unexpectedKeyCache
    ) {
      // 这里的 reducers 已经是 finalReducers
      const reducerKeys = Object.keys(reducers)
      const argumentName =
        action && action.type === ActionTypes.INIT
          ? 'preloadedState argument passed to createStore'
          : 'previous state received by the reducer'
      
      // 如果 finalReducers 为空
      if (reducerKeys.length === 0) {
        return (
          'Store does not have a valid reducer. Make sure the argument passed ' +
          'to combineReducers is an object whose values are reducers.'
        )
      }
        // 如果你传入的 state 不是对象
      if (!isPlainObject(inputState)) {
        return (
          `The ${argumentName} has unexpected type of "` +
          {}.toString.call(inputState).match(/\s([a-z|A-Z]+)/)[1] +
          `". Expected argument to be an object with the following ` +
          `keys: "${reducerKeys.join('", "')}"`
        )
      }
        // 将参入的 state 于 finalReducers 下的 key 做比较，过滤出多余的 key
      const unexpectedKeys = Object.keys(inputState).filter(
        key => !reducers.hasOwnProperty(key) && !unexpectedKeyCache[key]
      )
    
      unexpectedKeys.forEach(key => {
        unexpectedKeyCache[key] = true
      })
    
      if (action && action.type === ActionTypes.REPLACE) return
    
    // 如果 unexpectedKeys 有值的话
      if (unexpectedKeys.length > 0) {
        return (
          `Unexpected ${unexpectedKeys.length > 1 ? 'keys' : 'key'} ` +
          `"${unexpectedKeys.join('", "')}" found in ${argumentName}. ` +
          `Expected to find one of the known reducer keys instead: ` +
          `"${reducerKeys.join('", "')}". Unexpected keys will be ignored.`
        )
      }
    }

```
### ApplyMiddleware
```javascript
//通常middleware是一个数组,所以调用这个函数应该这样写 
//applyMiddleware(...middlewares)(createStore)(...args)
export default function applyMiddleware(...middlewares) {
    return createStore => (...args) => {
    // 这里执行 createStore 函数，把 applyMiddleware 函数最后次调用的参数传进来
      const store = createStore(...args)
      let dispatch = () => {
        throw new Error(
          `Dispatching while constructing your middleware is not allowed. ` +
            `Other middleware would not be applied to this dispatch.`
        )
      }
   // 每个中间件都应该有这两个函数
      const middlewareAPI = {
        getState: store.getState,
        dispatch: (...args) => dispatch(...args)
      }
      // 把 middlewares 中的每个中间件都传入 middlewareAPI
      const chain = middlewares.map(middleware => middleware(middlewareAPI))
       // 和之前一样，从右至左调用每个中间件，然后传入 store.dispatch
      dispatch = compose(...chain)(store.dispatch)
  
      return {
        ...store,
        dispatch
      }
    }
  }

```

### BindActionCreators
```javascript
function bindActionCreator(actionCreator, dispatch) {
    return function() {
      return dispatch(actionCreator.apply(this, arguments))
    }
  }
  
  /**
   * Turns an object whose values are action creators, into an object with the
   * same keys, but with every function wrapped into a `dispatch` call so they
   * may be invoked directly. This is just a convenience method, as you can call
   * `store.dispatch(MyActionCreators.doSomething())` yourself just fine.
   *
   * For convenience, you can also pass a single function as the first argument,
   * and get a function in return.
   *转换一个值为action creators的对象，转换成有着相同keys的对象，但是每个函数都被一个dispatch调用包裹着，为了能够让它们直接唤醒。这个只是一个便利的方法。你可以直接`store.dispatch(MyActionCreators.doSomething())` 这样调用。
   */  
  export default function bindActionCreators(actionCreators, dispatch) {
    
    //如果第一个参数actionCreators为function类型  
    //把actionCreators,dispatch传入bindActionCreator函数并返回
    if (typeof actionCreators === 'function') {
      return bindActionCreator(actionCreators, dispatch);
    }
      
    //如果第actionCreators不是object类型 或者是null 则抛出错误
    if (typeof actionCreators !== 'object' || actionCreators === null) {
      throw new Error('bindActionCreators expected an object or a function, instead received ' + (actionCreators === null ? 'null' : typeof actionCreators) + '. ' + 'Did you write "import ActionCreators from" instead of "import * as ActionCreators from"?');
    }
    
    // 遍历得到所有key
    var keys = Object.keys(actionCreators);
    var boundActionCreators = {};
    
    //注入dispatch与actionCreator
    for (var i = 0; i < keys.length; i++) {
      var key = keys[i];
      var actionCreator = actionCreators[key];
      if (typeof actionCreator === 'function') {
        boundActionCreators[key] = bindActionCreator(actionCreator, dispatch);
      }
    }
    
    //返回 boundActionCreators
    return boundActionCreators;
  }
```

[1]: https://yuchengkai.cn/docs/zh/frontend/react.html#redux-%E6%BA%90%E7%A0%81%E5%88%86%E6%9E%90      "面试图谱" 
[2]: https://github.com/cbbfcd/all-of-javascript/tree/master/%E8%AF%BB%E8%AF%BB%E6%BA%90%E7%A0%81%EF%BC%8C%E6%80%9D%E8%80%83%E4%BA%BA%E7%94%9F/redux "cbbfcd" 