距离上一篇文章已经有两个礼拜多了，一边在准备秋招一边还在写文章真是有点累呢。

history库是封装了有关于路由的核心部分，实现了地址前进后退等一系列关键操作，是*-router的依赖。
### history库
接下来我们看一下history库,回忆一下我们是怎么和Router组件相结合的。
#### BrowserHistory
```javascript
import { Router } from 'react-router';
import createBrowserHistory from 'history/createBrowerHistory';//HashRouter也是一样的
const history = createBrowserHistory();
  <Router history={history}>
    <App />
  </Router>
```
可以看到直接调用函数生成history对象。
首先我们看一下最终生成的history对象。
```javascript
  const history = {
    length: globalHistory.length,//返回当前session的history个数
    action: "POP",//默认为pop
    location: initialLocation,//Object
    createHref,//接下来一系列方法
    push,
    replace,
    go,
    goBack,
    goForward,
    block,
    listen
  };
```
源码中的实现：
```javascript
import warning from "warning";
import invariant from "invariant";
import { createLocation } from "./LocationUtils";
import {
  addLeadingSlash,
  stripTrailingSlash,
  hasBasename,
  stripBasename,
  createPath
} from "./PathUtils";
import createTransitionManager from "./createTransitionManager";
import {
  canUseDOM,
  getConfirmation,
  supportsHistory,
  supportsPopStateOnHashChange,
  isExtraneousPopstateEvent
} from "./DOMUtils";

const PopStateEvent = "popstate";
const HashChangeEvent = "hashchange";

const getHistoryState = () => {
  try {
    //一般控制台打印出的都是null
    //经过overstackflow,发现webkit内核浏览器没有实现
    //https://stackoverflow.com/questions/8439145/reading-window-history-state-object-in-webkit
    //state必须由pushState或者replaceState产生，不然就是null
    return window.history.state || {};
  } catch (e) {
    // IE 11 sometimes throws when accessing window.history.state
    // See https://github.com/ReactTraining/history/pull/289
    return {};
  }
};

/**
 * Creates a history object that uses the HTML5 history API including
 * pushState, replaceState, and the popstate event.
 */
const createBrowserHistory = (props = {}) => {
  invariant(canUseDOM, "Browser history needs a DOM");

  const globalHistory = window.history;//这边拿到全局的history对象
  const canUseHistory = supportsHistory();
  const needsHashChangeListener = !supportsPopStateOnHashChange();

  const {
    forceRefresh = false,
    getUserConfirmation = getConfirmation,
    keyLength = 6
  } = props;
  //这边会传入一个基地址，一般传入的props为空，所以也就没有基地址
  const basename = props.basename
    ? stripTrailingSlash(addLeadingSlash(props.basename))
    : "";
  //这个函数时获取封装之后的location
  const getDOMLocation = historyState => {
    const { key, state } = historyState || {};
    //可以在控制台打印出window.location看一下
    const { pathname, search, hash } = window.location;
    //将域名后的部分拼接起来
    let path = pathname + search + hash;

    warning(
      !basename || hasBasename(path, basename),
      "You are attempting to use a basename on a page whose URL path does not begin " +
        'with the basename. Expected path "' +
        path +
        '" to begin with "' +
        basename +
        '".'
    );

    if (basename) path = stripBasename(path, basename);
    //看一下createLoaction，在下方
    return createLocation(path, state, key);
  };

  const createKey = () =>
    Math.random()
      .toString(36)
      .substr(2, keyLength);

  const transitionManager = createTransitionManager();
  //这个地方更新了history，length，并添加上了监听器
  const setState = nextState => {
    Object.assign(history, nextState);

    history.length = globalHistory.length;

    transitionManager.notifyListeners(history.location, history.action);
  };

  const handlePopState = event => {
    // Ignore extraneous popstate events in WebKit.
    if (isExtraneousPopstateEvent(event)) return;

    handlePop(getDOMLocation(event.state));
  };

  const handleHashChange = () => {
    handlePop(getDOMLocation(getHistoryState()));
  };

  let forceNextPop = false;

  const handlePop = location => {
    if (forceNextPop) {
      forceNextPop = false;
      setState();
    } else {
      const action = "POP";

      transitionManager.confirmTransitionTo(
        location,
        action,
        getUserConfirmation,
        ok => {
          if (ok) {
            setState({ action, location });
          } else {
            revertPop(location);
          }
        }
      );
    }
  };

  const revertPop = fromLocation => {
    const toLocation = history.location;

    // TODO: We could probably make this more reliable by
    // keeping a list of keys we've seen in sessionStorage.
    // Instead, we just default to 0 for keys we don't know.

    let toIndex = allKeys.indexOf(toLocation.key);

    if (toIndex === -1) toIndex = 0;

    let fromIndex = allKeys.indexOf(fromLocation.key);

    if (fromIndex === -1) fromIndex = 0;

    const delta = toIndex - fromIndex;

    if (delta) {
      forceNextPop = true;
      go(delta);
    }
  };

  const initialLocation = getDOMLocation(getHistoryState());
  let allKeys = [initialLocation.key];

  // Public interface
  //创建一个路由pathname
  const createHref = location => basename + createPath(location);
  //实现push方法，是类似于栈结构push进去一个新的路由
  const push = (path, state) => {
    warning(
      !(
        typeof path === "object" &&
        path.state !== undefined &&
        state !== undefined
      ),
      "You should avoid providing a 2nd state argument to push when the 1st " +
        "argument is a location-like object that already has state; it is ignored"
    );
    //这边将动作更换
    const action = "PUSH";
    //创建location对象，这个函数的解析在下面
    const location = createLocation(path, state, createKey(), history.location);
    //这边是更新路由前的确认操作，transition部分解析也在下面
    transitionManager.confirmTransitionTo(
      location,
      action,
      getUserConfirmation,
      ok => {
        if (!ok) return;

        const href = createHref(location);
        const { key, state } = location;
        //可以使用就将路由推入
        if (canUseHistory) {
          //这个地方只是地址栏进行更新，但是浏览器不会加载页面
          globalHistory.pushState({ key, state }, null, href);
          //强制刷新选项
          if (forceRefresh) {
            window.location.href = href;
          } else {
            const prevIndex = allKeys.indexOf(history.location.key);
            const nextKeys = allKeys.slice(
              0,
              prevIndex === -1 ? 0 : prevIndex + 1
            );

            nextKeys.push(location.key);
            allKeys = nextKeys;
            //setState更新history对象
            setState({ action, location });
          }
        } else {
          warning(
            state === undefined,
            "Browser history cannot push state in browsers that do not support HTML5 history"
          );
          //不能用就直接刷新
          window.location.href = href;
        }
      }
    );
  };

  //replace操作，这是直接替换路由
  const replace = (path, state) => {
    warning(
      !(
        typeof path === "object" &&
        path.state !== undefined &&
        state !== undefined
      ),
      "You should avoid providing a 2nd state argument to replace when the 1st " +
        "argument is a location-like object that already has state; it is ignored"
    );

    const action = "REPLACE";
    const location = createLocation(path, state, createKey(), history.location);

    transitionManager.confirmTransitionTo(
      location,
      action,
      getUserConfirmation,
      ok => {
        if (!ok) return;

        const href = createHref(location);
        const { key, state } = location;

        if (canUseHistory) {
          globalHistory.replaceState({ key, state }, null, href);

          if (forceRefresh) {
            window.location.replace(href);
          } else {
            const prevIndex = allKeys.indexOf(history.location.key);

            if (prevIndex !== -1) allKeys[prevIndex] = location.key;

            setState({ action, location });
          }
        } else {
          warning(
            state === undefined,
            "Browser history cannot replace state in browsers that do not support HTML5 history"
          );

          window.location.replace(href);
        }
      }
    );
  };

  const go = n => {
    globalHistory.go(n);
  };

  const goBack = () => go(-1);

  const goForward = () => go(1);

  let listenerCount = 0;
  //这边是监听window.histoty对象上的几个事件
  const checkDOMListeners = delta => {
    listenerCount += delta;

    if (listenerCount === 1) {
      window.addEventListener(PopStateEvent, handlePopState);

      if (needsHashChangeListener)
        window.addEventListener(HashChangeEvent, handleHashChange);
    } else if (listenerCount === 0) {
      window.removeEventListener(PopStateEvent, handlePopState);

      if (needsHashChangeListener)
        window.removeEventListener(HashChangeEvent, handleHashChange);
    }
  };

  let isBlocked = false;

  const block = (prompt = false) => {
    const unblock = transitionManager.setPrompt(prompt);

    if (!isBlocked) {
      checkDOMListeners(1);
      isBlocked = true;
    }

    return () => {
      if (isBlocked) {
        isBlocked = false;
        checkDOMListeners(-1);
      }

      return unblock();
    };
  };

  const listen = listener => {
    const unlisten = transitionManager.appendListener(listener);
    checkDOMListeners(1);

    return () => {
      checkDOMListeners(-1);
      unlisten();
    };
  };

  //这边是最终导出的history对象
  const history = {
    length: globalHistory.length,//返回当前session的history个数
    action: "POP",
    location: initialLocation,//Object
    createHref,//接下来一系列方法
    push,
    replace,
    go,
    goBack,
    goForward,
    block,
    listen
  };

  return history;
};

export default createBrowserHistory;
```

#### LoactionUtils
这边是createLocation的实现
```javascript
export const createLocation = (path, state, key, currentLocation) => {
  let location;
  if (typeof path === "string") {
    // Two-arg form: push(path, state)
    //这边主要分离路由中?与#的部分，如果是hash存在#就去掉并返回路径
    location = parsePath(path);
    location.state = state;
  } else {
    // One-arg form: push(location)
    location = { ...path };

    if (location.pathname === undefined) location.pathname = "";
    //以下都是补足url的相关操作
    if (location.search) {
      if (location.search.charAt(0) !== "?")
        location.search = "?" + location.search;
    } else {
      location.search = "";
    }

    if (location.hash) {
      if (location.hash.charAt(0) !== "#") location.hash = "#" + location.hash;
    } else {
      location.hash = "";
    }

    if (state !== undefined && location.state === undefined)
      location.state = state;
  }

  try {
    location.pathname = decodeURI(location.pathname);
  } catch (e) {
    if (e instanceof URIError) {
      throw new URIError(
        'Pathname "' +
          location.pathname +
          '" could not be decoded. ' +
          "This is likely caused by an invalid percent-encoding."
      );
    } else {
      throw e;
    }
  }

  if (key) location.key = key;//这边的key是之前解构location中的key,这个值是个随机值

  if (currentLocation) {
    // Resolve incomplete/relative pathname relative to current location.
    //解析不完整/相对路径关联现在的地址
    if (!location.pathname) {
      location.pathname = currentLocation.pathname;
    } else if (location.pathname.charAt(0) !== "/") {
      location.pathname = resolvePathname(
        location.pathname,
        currentLocation.pathname
      );
    }
  } else {
    // When there is no prior location and pathname is empty, set it to /
    //如果没有优先的地址并且路径名为空，就是根地址
    if (!location.pathname) {
      location.pathname = "/";
    }
  }

  return location;
};
```
#### createTransitionManager
```javascript
const createTransitionManager = () => {
  let prompt = null;
  //prompt是提示的意思吗？
  const setPrompt = nextPrompt => {
    warning(prompt == null, "A history supports only one prompt at a time");

    prompt = nextPrompt;

    return () => {
      if (prompt === nextPrompt) prompt = null;
    };
  };

  const confirmTransitionTo = (
    location,
    action,
    getUserConfirmation,
    callback
  ) => {
    // 如果另一个事务开始了但我们还是正在确认前面一个，我们会以一个古怪？的状态结束。找出最好的方法来处理。
    // TODO: If another transition starts while we're still confirming
    // the previous one, we may end up in a weird state. Figure out the
    // best way to handle this.
    if (prompt != null) {
      const result =
      //所以说prompt是个函数
        typeof prompt === "function" ? prompt(location, action) : prompt;

      if (typeof result === "string") {
        if (typeof getUserConfirmation === "function") {
          getUserConfirmation(result, callback);
        } else {
          warning(
            false,
            "A history needs a getUserConfirmation function in order to use a prompt message"
          );

          callback(true);
        }
      } else {
        //取消事务
        // Return false from a transition hook to cancel the transition.
        callback(result !== false);
      }
    } else {
      callback(true);
    }
  };

  let listeners = [];
  //添加订阅事件
  const appendListener = fn => {
    let isActive = true;

    const listener = (...args) => {
      if (isActive) fn(...args);
    };

    listeners.push(listener);

    return () => {
      isActive = false;
      //防止重复事件
      listeners = listeners.filter(item => item !== listener);
    };
  };
  //通知监听器
  const notifyListeners = (...args) => {
    //遍历并调用每个监听器上注册的事件
    listeners.forEach(listener => listener(...args));
  };

  return {
    setPrompt,
    confirmTransitionTo,
    appendListener,
    notifyListeners
  };
};

export default createTransitionManager;
```
接下来简单看一看hash与memory的实现，主要看一看不同的部分
#### createHashHistory
```javascript
const HashChangeEvent = "hashchange";

const HashPathCoders = {
  hashbang: {
    encodePath: path =>
      path.charAt(0) === "!" ? path : "!/" + stripLeadingSlash(path),
    decodePath: path => (path.charAt(0) === "!" ? path.substr(1) : path)
  },
  noslash: {
    encodePath: stripLeadingSlash,
    decodePath: addLeadingSlash
  },
  slash: {
    encodePath: addLeadingSlash,
    decodePath: addLeadingSlash
  }
};

const getHashPath = () => {
  //这边给出了不用window.location.hash的原因是firefox会预解码
  // We can't use window.location.hash here because it's not
  // consistent across browsers - Firefox will pre-decode it!
  const href = window.location.href;
  const hashIndex = href.indexOf("#");//找到#号出现的位置，并去掉
  return hashIndex === -1 ? "" : href.substring(hashIndex + 1);
};

const pushHashPath = path => (window.location.hash = path);

const replaceHashPath = path => {
  const hashIndex = window.location.href.indexOf("#");

  window.location.replace(
    window.location.href.slice(0, hashIndex >= 0 ? hashIndex : 0) + "#" + path
  );
};

const createHashHistory = (props = {}) => {
  invariant(canUseDOM, "Hash history needs a DOM");

  const globalHistory = window.history;
  const canGoWithoutReload = supportsGoWithoutReloadUsingHash();

  const { getUserConfirmation = getConfirmation, hashType = "slash" } = props;
  const basename = props.basename
    ? stripTrailingSlash(addLeadingSlash(props.basename))
    : "";

  const { encodePath, decodePath } = HashPathCoders[hashType];

  const getDOMLocation = () => {
    //创建一个hash路由
    let path = decodePath(getHashPath());

    warning(
      !basename || hasBasename(path, basename),
      "You are attempting to use a basename on a page whose URL path does not begin " +
        'with the basename. Expected path "' +
        path +
        '" to begin with "' +
        basename +
        '".'
    );

    if (basename) path = stripBasename(path, basename);
    //这个函数之前看到过的
    return createLocation(path);
  };

  const transitionManager = createTransitionManager();

  const setState = nextState => {
    Object.assign(history, nextState);

    history.length = globalHistory.length;

    transitionManager.notifyListeners(history.location, history.action);
  };

  let forceNextPop = false;
  let ignorePath = null;

  const handleHashChange = () => {
    const path = getHashPath();
    const encodedPath = encodePath(path);

    if (path !== encodedPath) {
      // Ensure we always have a properly-encoded hash.
      replaceHashPath(encodedPath);
    } else {
      const location = getDOMLocation();
      const prevLocation = history.location;

      if (!forceNextPop && locationsAreEqual(prevLocation, location)) return; // A hashchange doesn't always == location change.
      //hash变化不会总是等于地址变化

      if (ignorePath === createPath(location)) return; // Ignore this change; we already setState in push/replace.
      //如果我们在push/replace中setState就忽视

      ignorePath = null;

      handlePop(location);
    }
  };

  const handlePop = location => {
    if (forceNextPop) {
      forceNextPop = false;
      setState();
    } else {
      const action = "POP";

      transitionManager.confirmTransitionTo(
        location,
        action,
        getUserConfirmation,
        ok => {
          if (ok) {
            setState({ action, location });
          } else {
            revertPop(location);
          }
        }
      );
    }
  };

  const revertPop = fromLocation => {
    const toLocation = history.location;

    // TODO: We could probably make this more reliable by
    // keeping a list of paths we've seen in sessionStorage.
    // Instead, we just default to 0 for paths we don't know.
    //注释说可以用sessiongStorage使得路径列表更可靠

    let toIndex = allPaths.lastIndexOf(createPath(toLocation));

    if (toIndex === -1) toIndex = 0;

    let fromIndex = allPaths.lastIndexOf(createPath(fromLocation));

    if (fromIndex === -1) fromIndex = 0;

    const delta = toIndex - fromIndex;

    if (delta) {
      forceNextPop = true;
      go(delta);
    }
  };

  // Ensure the hash is encoded properly before doing anything else.
  const path = getHashPath();
  const encodedPath = encodePath(path);

  if (path !== encodedPath) replaceHashPath(encodedPath);

  const initialLocation = getDOMLocation();
  let allPaths = [createPath(initialLocation)];

  // Public interface
  //hash路由
  const createHref = location =>
    "#" + encodePath(basename + createPath(location));

  const push = (path, state) => {
    warning(
      state === undefined,
      "Hash history cannot push state; it is ignored"
    );

    const action = "PUSH";
    const location = createLocation(
      path,
      undefined,
      undefined,
      history.location
    );

    transitionManager.confirmTransitionTo(
      location,
      action,
      getUserConfirmation,
      ok => {
        if (!ok) return;
        //获取当前路径并比较有没有发生变化
        const path = createPath(location);
        const encodedPath = encodePath(basename + path);
        const hashChanged = getHashPath() !== encodedPath;

        if (hashChanged) {
          // We cannot tell if a hashchange was caused by a PUSH, so we'd
          // rather setState here and ignore the hashchange. The caveat here
          // is that other hash histories in the page will consider it a POP.
          ignorePath = path;
          pushHashPath(encodedPath);

          const prevIndex = allPaths.lastIndexOf(createPath(history.location));
          const nextPaths = allPaths.slice(
            0,
            prevIndex === -1 ? 0 : prevIndex + 1
          );

          nextPaths.push(path);
          allPaths = nextPaths;

          setState({ action, location });
        } else {
          warning(
            false,
            "Hash history cannot PUSH the same path; a new entry will not be added to the history stack"
          );

          setState();
        }
      }
    );
  };

  const replace = (path, state) => {
    warning(
      state === undefined,
      "Hash history cannot replace state; it is ignored"
    );

    const action = "REPLACE";
    const location = createLocation(
      path,
      undefined,
      undefined,
      history.location
    );

    transitionManager.confirmTransitionTo(
      location,
      action,
      getUserConfirmation,
      ok => {
        if (!ok) return;

        const path = createPath(location);
        const encodedPath = encodePath(basename + path);
        const hashChanged = getHashPath() !== encodedPath;

        if (hashChanged) {
          // We cannot tell if a hashchange was caused by a REPLACE, so we'd
          // rather setState here and ignore the hashchange. The caveat here
          // is that other hash histories in the page will consider it a POP.
          ignorePath = path;
          replaceHashPath(encodedPath);
        }

        const prevIndex = allPaths.indexOf(createPath(history.location));

        if (prevIndex !== -1) allPaths[prevIndex] = path;

        setState({ action, location });
      }
    );
  };

  const go = n => {
    warning(
      canGoWithoutReload,
      "Hash history go(n) causes a full page reload in this browser"
    );

    globalHistory.go(n);
  };

  const goBack = () => go(-1);

  const goForward = () => go(1);

  const history = {
    length: globalHistory.length,
    action: "POP",
    location: initialLocation,
    createHref,
    push,
    replace,
    go,
    goBack,
    goForward,
    block,
    listen
  };

  return history;
};

export default createHashHistory;

```
#### createMemoryHistory
本质上是创建对象，将路径存放置对象中，有兴趣的可以自己探索一下