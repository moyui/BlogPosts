上一篇文章我们点好了react-router的前置天赋history，这次我们就

## react-router源码解读，基于4.3.1

### react-router 与 react-router-dom的区别
平时我们常用导入方式是`import { Link } from 'react-router-dom'`,那么与react-router有什么区别呢？其实react-router-dom是在react-router之上封装了一层，用以适配浏览器环境下的路由。本次我们不单纯阅读react-router，同时还阅读react-rotuer-dom的部分。我在括号中标注了源码是哪一部分。

### Router（react-router-dom）
```javascript
//react-router-dom/Router.js
//可以看到直接使用的react-router
import { Router } from "react-router";
export default Router;
```
下面我都不会删除原来的英文注释，但是会加上自己的注释便于理解。
```javascript
//react-router/Router.js
import warning from "warning";
import invariant from "invariant";
import React from "react";
import PropTypes from "prop-types";

/**
 * The public API for putting history on context.
 * 这个公共的API用来将history放入Context向下传递
 */
class Router extends React.Component {
  static propTypes = {
    history: PropTypes.object.isRequired,
    children: PropTypes.node
  };

  static contextTypes = {
    router: PropTypes.object
  };

  static childContextTypes = {
    router: PropTypes.object.isRequired
  };

    //这是React传递Context比较老的方式，React官方其实是不推荐使用的，在多级向下传递时如果子组件有shouldCompoentUpdate方法时会比较容易出现问题：会导致更深子组件可能无法re-render从而拿不到最新的Context。所以在16.3React将该API进行了更新。
    //说了那么多一句源码都没讲...(
    //传入的history混入(mixin)进context中，很常见的技术，如果了解过Vue的就非常明白了，Vue组合代码的方式就是mixin。
    //这个人好啰嗦(
  getChildContext() {
    return {
      router: {
        ...this.context.router,
        history: this.props.history,
        route: {
          location: this.props.history.location,
          match: this.state.match
        }
      }
    };
  }

  state = {
    match: this.computeMatch(this.props.history.location.pathname)
  };

  //初始化match对象并返回
  computeMatch(pathname) {
    return {
      path: "/",
      url: "/",
      params: {},
      isExact: pathname === "/"
    };
  }

  componentWillMount() {
    const { children, history } = this.props;
    //所以这个地方就明白了，Router下只能有一个children
    invariant(
      children == null || React.Children.count(children) === 1,
      "A <Router> may have only one child element"
    );

    // Do this here so we can setState when a <Redirect> changes the
    // location in componentWillMount. This happens e.g. when doing
    // server rendering using a <StaticRouter>.
    //这样做我们可以在componentWillMount中当有<Redirect>改变地址是触发设置setState，这发生在我们用<StaticRouter>进行服务端渲染的时候。

    //有兴趣的同学可以先跳过这一部分，看一下我上一篇文章关于history库的实现。这里简单介绍一下。
    //history库是利用发布订阅模式实现的监听和触发。当history.push或者history.replace执行监听器。因为注册监听函数的同时还开启了对 popstate 事件的监听，所以回退、前进之类的操作同样会触发监听器
    //所以在组件挂载前注册监听函数，触发后会更新match。
    //在React16.3之后的版本中，虽然还是可以用，但是这个生命周期函数包括下面的willreceiveProps已经不推荐使用了，可以预期在react-router代码可能会大幅度改动
    this.unlisten = history.listen(() => {
      this.setState({
        match: this.computeMatch(history.location.pathname)
      });
    });
  }

//这个地方是说不能够改变history对象
  componentWillReceiveProps(nextProps) {
    warning(
      this.props.history === nextProps.history,
      "You cannot change <Router history>"
    );
  }
//取消监听
  componentWillUnmount() {
    this.unlisten();
  }

  render() {
    const { children } = this.props;
    //返回仅有的一个子集
    return children ? React.Children.only(children) : null;
  }
}

export default Router;

```

接下来看一下route组件的实现
### route(react-router)
```javascript
//判断子组件是否为空
const isEmptyChildren = children => React.Children.count(children) === 0;

/**
 * The public API for matching a single path and rendering.
 */
class Route extends React.Component {
  static propTypes = {
    computedMatch: PropTypes.object, // private, from <Switch>
    path: PropTypes.string,
    exact: PropTypes.bool,
    strict: PropTypes.bool,
    sensitive: PropTypes.bool,
    component: PropTypes.func,
    render: PropTypes.func,
    children: PropTypes.oneOfType([PropTypes.func, PropTypes.node]),
    location: PropTypes.object
  };

  static contextTypes = {
    router: PropTypes.shape({
      history: PropTypes.object.isRequired,
      route: PropTypes.object.isRequired,
      staticContext: PropTypes.object
    })
  };

  static childContextTypes = {
    router: PropTypes.object.isRequired
  };
  //这边同样使用了context，这边mixin了当前的路由和匹配，mixin进入this.context.router，下面会马上用到。
  getChildContext() {
    return {
      router: {
        ...this.context.router,
        route: {
          location: this.props.location || this.context.router.route.location,
          match: this.state.match
        }
      }
    };
  }

  state = {
    match: this.computeMatch(this.props, this.context.router)//这边就用到了context
  };
  //看一下match是如何计算的
  //这边看一下官方文档，exact表示精确匹配、严格一致，strict表示结尾斜线一致，sensitive表示大小写一致
  computeMatch(
    { computedMatch, location, path, strict, exact, sensitive },
    router
  ) {
    if (computedMatch) return computedMatch; // <Switch> already computed the match for us
    //这边说明了如果有Switch计算match是在Switch中的
    invariant(
      router,
      "You should not use <Route> or withRouter() outside a <Router>"
    );

    const { route } = router;
    //如果有location参数就用
    const pathname = (location || route.location).pathname;
    //可以返回去上面看看参数的含义
    return matchPath(pathname, { path, strict, exact, sensitive }, route.match);
  }

  componentWillMount() {
    //这边就说明了component的渲染方式与render的渲染方式不能同时用，下面也是指渲染方式。
    warning(
      !(this.props.component && this.props.render),
      "You should not use <Route component> and <Route render> in the same route; <Route render> will be ignored"
    );
    //component与children不能一起用，忽视children
    warning(
      !(
        this.props.component &&
        this.props.children &&
        !isEmptyChildren(this.props.children)
      ),
      "You should not use <Route component> and <Route children> in the same route; <Route children> will be ignored"
    );
    //render与children不能一起用,忽视children
    warning(
      !(
        this.props.render &&
        this.props.children &&
        !isEmptyChildren(this.props.children)
      ),
      "You should not use <Route render> and <Route children> in the same route; <Route children> will be ignored"
    );
  }

  componentWillReceiveProps(nextProps, nextContext) {
    //下面就说明了如果你一开始传入location，你之后传入就不行了，这也是从非受控组件到受控组件的突变，所以是不行的。
    warning(
      !(nextProps.location && !this.props.location),
      '<Route> elements should not change from uncontrolled to controlled (or vice versa). You initially used no "location" prop and then provided one on a subsequent render.'
    );

    warning(
      !(!nextProps.location && this.props.location),
      '<Route> elements should not change from controlled to uncontrolled (or vice versa). You provided a "location" prop initially but omitted it on a subsequent render.'
    );
    //发现路由变化就重新计算match
    this.setState({
      match: this.computeMatch(nextProps, nextContext.router)
    });
  }

  render() {
    const { match } = this.state;
    const { children, component, render } = this.props;
    const { history, route, staticContext } = this.context.router;
    const location = this.props.location || route.location;
    const props = { match, location, history, staticContext };
    //componet是由createElement渲染的
    if (component) return match ? React.createElement(component, props) : null;
    //render就是正常render
    if (render) return match ? render(props) : null;
    //不管match与否都会渲染children模式
    if (typeof children === "function") return children(props);

    if (children && !isEmptyChildren(children))
      return React.Children.only(children);

    return null;
  }
}

export default Route;
```
接下来是Link组件
### Link(react-router-dom)
```javascript
//这边判断这几个键是不是被触发了
const isModifiedEvent = event =>
  !!(event.metaKey || event.altKey || event.ctrlKey || event.shiftKey);

/**
 * The public API for rendering a history-aware <a>.
 */
class Link extends React.Component {
  static propTypes = {
    onClick: PropTypes.func,
    target: PropTypes.string,
    replace: PropTypes.bool,
    to: PropTypes.oneOfType([PropTypes.string, PropTypes.object]).isRequired,
    innerRef: PropTypes.oneOfType([PropTypes.string, PropTypes.func])
  };

  static defaultProps = {
    replace: false
  };

  static contextTypes = {
    router: PropTypes.shape({
      history: PropTypes.shape({
        push: PropTypes.func.isRequired,
        replace: PropTypes.func.isRequired,
        createHref: PropTypes.func.isRequired
      }).isRequired
    }).isRequired
  };
  //用户的点击事件
  handleClick = event => {
    if (this.props.onClick) this.props.onClick(event);

    if (
      !event.defaultPrevented && // onClick prevented default //没阻止默认事件
      event.button === 0 && // ignore everything but left clicks 左点击
      !this.props.target && // let browser handle "target=_blank" etc. 没有换页打开
      !isModifiedEvent(event) // ignore clicks with modifier keys
    ) {
      //这边阻止默认事件
      event.preventDefault();

      const { history } = this.context.router;
      const { replace, to } = this.props;
      //这边就是history库的内容，调用的同时会触发notifyListener去通知window.history上的操作（这些注册在history库上）执行。
      if (replace) {
        history.replace(to);
      } else {
        history.push(to);
      }
    }
  };

  render() {
    //innerRef是获取dom节点
    const { replace, to, innerRef, ...props } = this.props; // eslint-disable-line no-unused-vars

    invariant(
      this.context.router,
      "You should not use <Link> outside a <Router>"
    );

    invariant(to !== undefined, 'You must specify the "to" property');

    const { history } = this.context.router;
    //这边创建一个新的路径
    const location =
      typeof to === "string"
        ? createLocation(to, null, null, history.location)
        : to;

    const href = history.createHref(location);
    return (
      //最后还是以a标签渲染
      <a {...props} onClick={this.handleClick} href={href} ref={innerRef} />
    );
  }
}

export default Link;
```

到这里最基本的三个组件介绍完了，接下来是Switch与Redirect了解一下
### Switch(react-router)
```javascript
/**
 * The public API for rendering the first <Route> that matches.
 */
class Switch extends React.Component {
  static contextTypes = {
    router: PropTypes.shape({
      route: PropTypes.object.isRequired
    }).isRequired
  };

  static propTypes = {
    children: PropTypes.node,
    //这个地方和上面是类似的，传入一个location，不再监听当前的location，常见于动画中
    location: PropTypes.object
  };

  componentWillMount() {
    invariant(
      this.context.router,
      "You should not use <Switch> outside a <Router>"
    );
  }
  //这边和上面一样
  componentWillReceiveProps(nextProps) {
    warning(
      !(nextProps.location && !this.props.location),
      '<Switch> elements should not change from uncontrolled to controlled (or vice versa). You initially used no "location" prop and then provided one on a subsequent render.'
    );

    warning(
      !(!nextProps.location && this.props.location),
      '<Switch> elements should not change from controlled to uncontrolled (or vice versa). You provided a "location" prop initially but omitted it on a subsequent render.'
    );
  }
  
  render() {
    const { route } = this.context.router;
    const { children } = this.props;
    const location = this.props.location || route.location;

    let match, child;
    //这边只会执行第一次匹配到的，注意match参数
    React.Children.forEach(children, element => {
      if (match == null && React.isValidElement(element)) {
        const {
          path: pathProp,
          exact,
          strict,
          sensitive,
          from
        } = element.props;
        const path = pathProp || from;

        child = element;
        //这个函数的解析在下面
        match = matchPath(
          location.pathname,
          { path, exact, strict, sensitive },
          route.match
        );
      }
    });
    //这边把location传给子组件
    return match
      ? React.cloneElement(child, { location, computedMatch: match })
      : null;
  }
}

export default Switch;


//这边有一个matchPath的函数
import pathToRegexp from "path-to-regexp";

const patternCache = {};
const cacheLimit = 10000;
let cacheCount = 0;
//这边匹配并且缓存，超过上限就放弃？
const compilePath = (pattern, options) => {
  //这边看只有8种组合？truetrueture，truefalsefalse。。
  const cacheKey = `${options.end}${options.strict}${options.sensitive}`;
  const cache = patternCache[cacheKey] || (patternCache[cacheKey] = {});
  //从cache取数据
  if (cache[pattern]) return cache[pattern];

  const keys = [];
  const re = pathToRegexp(pattern, keys, options);
  const compiledPattern = { re, keys };

  if (cacheCount < cacheLimit) {
    cache[pattern] = compiledPattern;
    cacheCount++;
  }

  return compiledPattern;
};

/**
 * Public API for matching a URL pathname to a path pattern.
 */
const matchPath = (pathname, options = {}, parent) => {
  if (typeof options === "string") options = { path: options };

  const { path, exact = false, strict = false, sensitive = false } = options;

  if (path == null) return parent;
  //解析path
  const { re, keys } = compilePath(path, { end: exact, strict, sensitive });
  //这边match是一个数组
  const match = re.exec(pathname);

  if (!match) return null;

  const [url, ...values] = match;
  const isExact = pathname === url;

  if (exact && !isExact) return null;

  return {
    path, // the path pattern used to match
    url: path === "/" && url === "" ? "/" : url, // the matched portion of the URL
    isExact, // whether or not we matched exactly
    //在这个地方获得匹配的参数
    params: keys.reduce((memo, key, index) => {
      memo[key.name] = values[index];
      return memo;
    }, {})
  };
};

export default matchPath;
```

### Redirect
```javascript
/**
 * The public API for updating the location programmatically
 * with a component.
 */
class Redirect extends React.Component {
  static propTypes = {
    computedMatch: PropTypes.object, // private, from <Switch>
    push: PropTypes.bool,
    from: PropTypes.string,
    to: PropTypes.oneOfType([PropTypes.string, PropTypes.object]).isRequired
  };

  static defaultProps = {
    push: false
  };

  static contextTypes = {
    router: PropTypes.shape({
      history: PropTypes.shape({
        push: PropTypes.func.isRequired,
        replace: PropTypes.func.isRequired
      }).isRequired,
      staticContext: PropTypes.object
    }).isRequired
  };
  //这个是在SSR的情况下判断用的，判断是不是服务端渲染
  isStatic() {
    return this.context.router && this.context.router.staticContext;
  }
  //这边就是判断组件加载的时间
  componentWillMount() {
    invariant(
      this.context.router,
      "You should not use <Redirect> outside a <Router>"
    );

    if (this.isStatic()) this.perform();
  }

  componentDidMount() {
    if (!this.isStatic()) this.perform();
  }
  //re-render之后触发，判断是不是重定向到当前的route
  componentDidUpdate(prevProps) {
    const prevTo = createLocation(prevProps.to);
    const nextTo = createLocation(this.props.to);

    if (locationsAreEqual(prevTo, nextTo)) {
      warning(
        false,
        `You tried to redirect to the same route you're currently on: ` +
          `"${nextTo.pathname}${nextTo.search}"`
      );
      return;
    }

    this.perform();
  }
  //计算路径
  computeTo({ computedMatch, to }) {
    if (computedMatch) {
      if (typeof to === "string") {
        return generatePath(to, computedMatch.params);
      } else {
        return {
          ...to,
          pathname: generatePath(to.pathname, computedMatch.params)
        };
      }
    }

    return to;
  }
  //改变历史堆栈记录，并重定向
  perform() {
    const { history } = this.context.router;
    const { push } = this.props;
    const to = this.computeTo(this.props);

    if (push) {
      history.push(to);
    } else {
      history.replace(to);
    }
  }

  render() {
    return null;
  }
}

export default Redirect;
```

最后是Prompt，NavLink，常用的高阶组件withRouter，和StaticRouter

### Prompt(react-router)
这个组件的作用是当在导航离开页面前提示用户（比如表单没有填充完整等）
```javascript
class Prompt extends React.Component {
  static propTypes = {
    when: PropTypes.bool,
    message: PropTypes.oneOfType([PropTypes.func, PropTypes.string]).isRequired
  };

  static defaultProps = {
    when: true
  };

  static contextTypes = {
    router: PropTypes.shape({
      history: PropTypes.shape({
        block: PropTypes.func.isRequired
      }).isRequired
    }).isRequired
  };
  //设置message
  enable(message) {
    if (this.unblock) this.unblock();

    this.unblock = this.context.router.history.block(message);
  }

  disable() {
    if (this.unblock) {
      this.unblock();
      this.unblock = null;
    }
  }

  componentWillMount() {
    invariant(
      this.context.router,
      "You should not use <Prompt> outside a <Router>"
    );

    if (this.props.when) this.enable(this.props.message);
  }
  //当when的值改变后触发
  componentWillReceiveProps(nextProps) {
    if (nextProps.when) {
      if (!this.props.when || this.props.message !== nextProps.message)
        this.enable(nextProps.message);
    } else {
      this.disable();
    }
  }
  //卸载的时候就直接disable
  componentWillUnmount() {
    this.disable();
  }
  //返回是null
  render() {
    return null;
  }
}

export default Prompt;
```

### NavLink
这个组件的作用是激活的时候就会对渲染的元素添加样式，感觉不是很常用啊。
```javascript
/**
 * A <Link> wrapper that knows if it's "active" or not.
 * 一个link包裹组件并且知道自己是否激活中
 */
const NavLink = ({
  to,
  exact,
  strict,
  location,
  activeClassName,
  className,
  activeStyle,
  style,
  isActive: getIsActive,
  "aria-current": ariaCurrent,
  ...rest
}) => {
  const path = typeof to === "object" ? to.pathname : to;

  // Regex taken from: https://github.com/pillarjs/path-to-regexp/blob/master/index.js#L202
  const escapedPath = path && path.replace(/([.+*?=^!:${}()[\]|/\\])/g, "\\$1");
  //返回了一个包裹着link的Route组件
  return (
    <Route
      path={escapedPath}
      exact={exact}
      strict={strict}
      location={location}
      children={({ location, match }) => {
        const isActive = !!(getIsActive ? getIsActive(match, location) : match);

        return (
          <Link
            to={to}
            className={
              isActive
                ? [className, activeClassName].filter(i => i).join(" ")
                : className
            }
            style={isActive ? { ...style, ...activeStyle } : style}
            aria-current={(isActive && ariaCurrent) || null}
            {...rest}
          />
        );
      }}
    />
  );
};

export default NavLink;
```

### withRouter
常用的高阶函数，主要和redux配合使用
```javascript
/**
 * A public higher-order component to access the imperative API
 * 命令式api
 */
const withRouter = Component => {
  const C = props => {
    const { wrappedComponentRef, ...remainingProps } = props;
    return (
      //在外面包了一层Route
      <Route
        children={routeComponentProps => (
          <Component
            {...remainingProps}
            {...routeComponentProps}
            ref={wrappedComponentRef}
          />
        )}
      />
    );
  };

  C.displayName = `withRouter(${Component.displayName || Component.name})`;
  C.WrappedComponent = Component;
  C.propTypes = {
    wrappedComponentRef: PropTypes.func
  };
  //这个函数是外部引用的，这个插件你也可以在react-redux中找到
  //简单介绍一下作用
  //将Component中的静态方法绑定到C上
  return hoistStatics(C, Component);
};

export default withRouter;
```

### StaticRouter
```javascript
const addLeadingSlash = path => {
  return path.charAt(0) === "/" ? path : "/" + path;
};

const addBasename = (basename, location) => {
  if (!basename) return location;

  return {
    ...location,
    pathname: addLeadingSlash(basename) + location.pathname
  };
};

const stripBasename = (basename, location) => {
  if (!basename) return location;

  const base = addLeadingSlash(basename);

  if (location.pathname.indexOf(base) !== 0) return location;

  return {
    ...location,
    pathname: location.pathname.substr(base.length)
  };
};

const createURL = location =>
  typeof location === "string" ? location : createPath(location);

const staticHandler = methodName => () => {
  invariant(false, "You cannot %s with <StaticRouter>", methodName);
};

const noop = () => {};

/**
 * The public top-level API for a "static" <Router>, so-called because it
 * can't actually change the current location. Instead, it just records
 * location changes in a context object. Useful mainly in testing and
 * server-rendering scenarios.
 * 为什么叫做静态的原因，是不会实际改变location，而是在一个上下文对象中记录路径改变
 */
class StaticRouter extends React.Component {
  static propTypes = {
    basename: PropTypes.string,
    context: PropTypes.object.isRequired,
    location: PropTypes.oneOfType([PropTypes.string, PropTypes.object])
  };

  static defaultProps = {
    basename: "",
    location: "/"
  };

  static childContextTypes = {
    router: PropTypes.object.isRequired
  };

  getChildContext() {
    return {
      router: {
        staticContext: this.props.context
      }
    };
  }

  createHref = path => addLeadingSlash(this.props.basename + createURL(path));
  //这些都是模仿浏览器的行为
  handlePush = location => {
    const { basename, context } = this.props;
    context.action = "PUSH";
    context.location = addBasename(basename, createLocation(location));
    context.url = createURL(context.location);
  };

  handleReplace = location => {
    const { basename, context } = this.props;
    context.action = "REPLACE";
    context.location = addBasename(basename, createLocation(location));
    context.url = createURL(context.location);
  };

  handleListen = () => noop;

  handleBlock = () => noop;

  componentWillMount() {
    warning(
      //没有history
      !this.props.history,
      "<StaticRouter> ignores the history prop. To use a custom history, " +
        "use `import { Router }` instead of `import { StaticRouter as Router }`."
    );
  }

  render() {
    const { basename, context, location, ...props } = this.props;

    const history = {
      createHref: this.createHref,
      action: "POP",
      location: stripBasename(basename, createLocation(location)),
      push: this.handlePush,
      replace: this.handleReplace,
      go: staticHandler("go"),
      goBack: staticHandler("goBack"),
      goForward: staticHandler("goForward"),
      listen: this.handleListen,
      block: this.handleBlock
    };

    return <Router {...props} history={history} />;
  }
}

export default StaticRouter;
```