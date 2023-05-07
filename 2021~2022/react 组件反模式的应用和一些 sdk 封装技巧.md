## react 组件反模式的应用和一些 sdk 封装技巧

事先说明，本文参考了 antd-mobile 作者写的文章，根据个人理解自己做了修改调整

### react 组件反模式的应用

#### 受控组件与非受控组件

大家都知道, react 刚开始兴起的时候，在官方的划分上就有受控组件和非受控组件的区分，最开始的时候是自身持有状态的组件称之为非受控组件，状态是通过 props 传下来的被称之为受控组件，比较明显但是不强制的特征是受控组件大多数是函数组件, 非受控组件大多数是 class 组件。

到了 hooks 的时代, 大家都变成函数式，就只能通过状态来区分了

这个逻辑没明白的可以参考这篇文章： https://goshacmd.com/controlled-vs-uncontrolled-inputs-react/

#### 需求来了

现在有一个需求，我们要合理的设计组件

比如这个小区组件，我们需要用户输入之后然后做校验，错误的内容要展示在下面的文案上

那我们可以不假思索滴写出来这样的代码

```jsx
import React, { useState } from "react";

function Community() {
  const [value, setValue] = useState("");
  const [content, setContent] = useState("");

  const onInputChange = (e) => {
    setValue(e.target.value);
    // 校验一下内容是不是合法, 省略了大量逻辑
    if (isValid) {
      setContent("合法内容");
    } else {
      setContent("非合法内容");
    }
  };

  return (
    <div>
      <input value={value} onChange={onInputChange} />
      <span>{content}</span>
    </div>
  );
}

export default React.memo(Community);
```

可以看到，这个是一个很典型的非受控组件（Community)。 我们把 input 框的内容和内容校验之后返回的结果封装在了一起，看起来很完美，这个组件也可以拿出去复用。小伙伴们都说好。

#### 需求有变化

突然有一天产品告诉我，我们这里展示的文案，可能不是等用户选了才展示的，是一进来就有提示，并且这个提示是动态下发的。然后后端告诉你，这个字段可能是和业务强相关的，换了个页面用这个组件就没有了。

按照我们以往的套路，就需要进行状态提升，把 content 的状态放到父级上，但是我们这个组件已经给别人复用了，状态提升就破坏了组件的封装，这个时候怎么办呢。

一般按照我们常规思路就有以下两种方法

1. 使用 refs 把设置状态的方法勾出去

```jsx
import React, { useState, useImperativeHandle } from "react";

function Community(refs) {
  const [value, setValue] = useState("");
  const [content, setContent] = useState("");

  const onInputChange = (e) => {
    setValue(e.target.value);
    // 校验一下内容是不是合法, 省略了大量逻辑
    if (isValid) {
      setContent("合法内容");
    } else {
      setContent("非合法内容");
    }
  };

  // 加这个
  useImperativeHandle(refs, () => {
    setContent;
  });

  return (
    <div>
      <input value={value} onChange={onInputChange} />
      <span>{content}</span>
    </div>
  );
}

// 加forwardRef
export default React.memo(React.forwardRef(Community));
```

2. 使用 useEffect 同步内外的状态

```jsx
import React, { useEffect, useRef } from "react";
import Comp from "../2/comp";

function Index() {
  const communityRef = useRef(null);

  useEffect(() => {
    communityRef.current.setContent("这是我想要的提示");
  }, []);

  return <Comp refs={communityRef}></Comp>;
}


export default Index;
```

看上去我们使用了 2 种方法，都解决了问题

但是经验丰富的老司机一下子就觉得不对了

- demo2 的问题在使用了 refs, 本质上是破坏了组件的封装和数据流动，采用人工干预的方案实现需求
- demo3 的问题在于三点，一个是内容只能从父组件传递到子组件，子组件没有和父组件的内容做同步，可能会产生同步 bug，给后人埋坑；第二个是从父组件传下来的内容优先级始终是最高的，换句话说就是肯定是父组件的状态覆盖了子组件的状态。如果后面产品再提一个需求，让你子组件里面的**部分**选择优先级比父组件高，那你就抓瞎了；第三个是性能问题，子组件状态的同步始终比父组件晚一个周期（useEffect）会产生一点性能问题和无法预知的 bug。

现在三网发布的很多组件都是通过 refs 去写的，有没有更好的解决办法呢

#### 问题的本质？

问题的本质实际上是封装对于我们是必要的，但是外部状态的侵入也是必要的，本质上我们在做**反模式**的需求，一个内容的渲染是有 2 个数据源产生的。

.... 仔细想想，刚刚这句话对吗？ ....

刚刚这句话对，但也不完全。仔细思考一下，我们要的不是父组件与子组件自身都有对 content 的状态的掌握，而是要父组件与组件对于 content 状态的掌握权，换言之，我们部分的时候是要父组件控制 content 的状态，部分时候是需要子组件自己控制 state 的状态。

#### 权限的切换

回头看我们两个 demo，demo2 也就是方案 1，使用 refs 肯定是走不通了，用了 refs 就凉了，反倒是方案 2，使用 state 到 props 的传递，看起来问题很多，但是有改造的机会。

### 内外状态的同步

首先我们得明确告诉组件，你现在应该是使用父级传下来的状态还是子传下来的状态，最好的方案还是判断父组件有没有传状态

```jsx
import React, { useState, useEffect } from "react";

function Community(props) {
  const isControlled = props.content === void 0;
  //   const [value, setValue] = useState("");
  const [content, setContent] = useState(props.content || ''); // 这里初始化使用外面的状态

  useEffect(() => {
    if (isControlled) {
      // 这里将父级的内容同步到子组件上
      setContent(props.content);
    }
  }); // 这里依赖不能加，我们时刻要保持调用useEffect去更新状态, 使用isControlled主动去判断

  return (
    <div>
      <input
        // value={value}
        onChange={() => {
          if (!isControlled) {
            // 为了精简，这里的逻辑省略了
            setContent("某些内容");
            // 内外状态同步
            // 回调函数，同步给父组件
            props.onChange("某些内容");
          }
        }}
      />
      <span>{content}</span>
    </div>
  );
}

export default React.memo(Community);
```

我们通过判断父给子传的 props 是不是 undefined（void 0）来判断是不是父组件控制还是子组件控制，可以轻易切换父子的 state 控制权，要注意 useEffect 的依赖和父组件回调函数

但是依然还存在使用 useEffect 的渲染性能问题和状态同步问题

那明确了这两点，我们逐步改造

1. 状态同步

比较容易解决的是状态同步问题：我们实际上也不用那么严格地同步内外状态，只要保证：如果组件此时处于受控模式，那么直接使用来自外部的状态。

demo5

2. 性能问题

这个就有点麻烦了，我们现在是再第一次 render 之后，再调用 useEffect 再渲染一遍，那如果我们希望在 render 过程中直接更新完最后的结果，是不是就可以避免二次渲染？

我们使用了 useEffect 必然会多进行一次渲染，这个例子中组件比较简单还好，但是如果是非常复杂的组件比如筛选器，大表单等，每次都要重复渲染，可能会带来性能问题

所以方案是不用 useEffect，一时间比较难以想到解决方案

如果是 react 老司机可能会知道，我们的问题在于子组件的状态使用了 useState 进行管理，useState 的特点就是更新内容会触发重渲，那如果我们不用 useState 呢

使用 refs 和 forceupdate 代替

```jsx
import React, { useRef, useState } from "react";

function Community(props) {
  const isControlled = props.content === void 0;

  const contentRef = useRef(props.content);

  if (isControlled) {
    contentRef.current = props.content;
  }
  // const finalContent = isControlled ? props.content : contentRef.current; 你会发现这个也不需要了

  const [_, setUpdate] = useState({}); // 这里可以使用已经封装好的useForceUpdate代替
  const forceUpdate = () => {
    setUpdate({});
  };

  return (
    <div>
      <input
        // value={value}
        onChange={() => {
          if (!isControlled) {
            // 为了精简，这里的逻辑省略了
            // 这里存在小bug，如果每次调用触发的content都是一样的，但是由于使用了forceUpdate，还是会重复调用一次
            contentRef.current = "某些内容";
            // 强制更新
            forceUpdate();
            // 内外状态同步
            // 回调函数，同步给父组件
            props.onChange("某些内容");
          }
        }}
      />
      <span>{finalContent}</span>
    </div>
  );
}
export default React.memo(Community);
```

#### 问题之外

到此，我们把这个业务场景下的组件问题彻底解决了，antd 和 antd-mobile 里面是大量的使用了这种模式去处理内外状态的控制权，再此就不多赘述了

但是我们会发现，这种业务场景实际上是相当多的，所以我们是不是也抽象出来一个 hooks 去处理这种情况？

```jsx
import { useRef } from "react";

function usePropsValue({ value, defaultValue, onChange }) {
  const isControlled = value === void 0;
  const update = useForceUpdate();
  const stateRef = useRef(isControlled ? value : defaultValue);
  if (isControlled) {
    stateRef.current = value;
  }
  const setState = (nextValue) => {
    if (nextValue === stateRef.current) return;
    stateRef.current = nextValue;
    update();
    onChange(stateRef.current);
  };
  return [stateRef.current, setState];
}
```

这样我们就可以直接使用了。over ～

### sdk 封装技巧

#### 单例模式

大多数情况下，sdk 挂载之后就无需二次加载，同时重新 new 的时候会得到原先的实例从而保持上下文稳定

这里提供两种常见的用于适合 js 的封装手法，仅作为参考

```jsx
class SDK {
  a: any;
  constructor(props) {
    this.a = props.any;
  }
  anyMethods() {
    return void 0;
  }
}

let instance = null as any;
export default (props) => {
  if (instance) return instance;
  instance = new SDK(props);
  return instance;
};
```

借助

1. 构造函数如果内部有 return 会直接用 return 返回的东西做实例
2. js 模块封装的特性

```jsx
class SDK {
  a: any;

  private static instance: any = null;

  constructor(props) {
    if (SDK.instance) {
        return SDK.instance;
    }
    SDK.instance = this;
    this.a = props.any;
  }

  anyMethods() {
    return void 0;
  }
}
```

借助

1. ts 的静态方法/变量的能力

#### 委托模式

在我们工作的环境下，大多数情况都是需要封装来自 teg 的 sdk 方法，并且有的时候还需要透穿到最顶层，这里介绍一个包 delegates 可以轻松的帮助我们把底层 sdk 的方法委托到顶层

https://www.npmjs.com/package/delegates

```jsx
import * as delegate from "delegates";

const othersdk = {
  otherValue: "11111",
  otherMethods: () => void 0,
} as any;

class SDK {
  otherMethods: null;

  constructor() {
    delegate.auto(this, othersdk, "otherValue");
    delegate.auto(this, othersdk, "otherMethods");
  }
}
```

如果熟悉 koa 的小伙伴可以联想到 koa 中的 ctx.request/ctx.response 的方法能够在 ctx 上面直接使用和修改，其实也是用了这个包

#### 控制权转移

前端很多时候都需要借助第三方 sdk 的能力去封装一些功能，但是第三方 sdk 都是使用异步去加载的，很多时候我们需要等待第三方 sdk 加载完之后才能做一些事情

这个时候大多数我们选择的方法是使用 promise 链，但是有些场景我们请求的方法和回调方法是分离的，不太合适使用 promise 链写在一个函数里面，例如

```jsx
class SDK {
    hasReady: boolean;
    sdk: any;
    
    constructor() {
        loadScript('anyscript', () => {
          this.hasReady = true
          this.sdk = window.SDK()
        })
      }
      // init
      public init(options, callback) {
        if (!this.hasReady) {
          setTimeout(() => {
            this.sdk.init(options, callback)
          }, 100)
        } else {
          this.sdk.init(options, callback)
        }
      }
}
```

可能是先挂载 sdk，然后让用户自己去 init，那么在这个情况下就没办法通过 promise 链直接全写了

聪明的小伙伴一下子就想到了使用 generator 或者 async await 进行改写，这里我就用 generator 了，参考如下

```jsx
class SDK {
  ite: any;
  sdk: any;

  constructor(options, callback) {
    this.ite = this.load(options, callback);
    // 启动生成器
    this.ite.next();
  }

  *load(options, callback) {
    yield this.initSdk();
    yield this.init(options, callback);
  }

  initSdk() {
    loadScript("anyscript", () => {
      this.sdk = window.SDK();
      this.ite.next();
    });
  }

  // init
  init(options, callback) {
    // do any operate
    this.sdk.init(options, callback);
  }
}
```

但是存在一些问题

1. constructor 方法不能用迭代器
2. init 操作给提前了

这里有另外一种方法可以快速通用的解决这个问题，使用封装的 promise 去转移控制权

```jsx
export class Deferred<T> {
  promise: Promise<T>;

  resolve!: (value: T | PromiseLike<T>) => void;

  reject!: (reason?: any) => void;

  constructor() {
    this.promise = new Promise((resolve, reject) => {
      this.resolve = resolve;
      this.reject = reject;
    });
  }
}

const initDefer = new Deferred<void>();

class SDK {
  hasReady: boolean;
  sdk: any;

  constructor() {
    loadScript("anyscript", () => {
      this.hasReady = true;
      this.sdk = window.SDK();
      initDefer.resolve();
    });
  }
  // init
  public async init(options, callback) {
    await initDefer.promise;
    this.sdk.init(options, callback);
  }
}
```

虽然还是使用了 async 但是 async 大多数情况下都是使用 promise 去模拟的，垫片不算很大，大多数项目也都在用

优点是代码非常简洁，不会有多余的心智负担
