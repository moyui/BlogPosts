## TS 中实践依赖倒置

### 前言

在 1 月份的时候，海君给我们分享了一系列代码结构与设计的原则，其中对于前端难以理解的就是依赖倒置，控制反转与依赖注入。

目前在页面上，不论是 react 还是 vue 都是更加拥抱函数式编程，比较少用到基于面向对象的类式编程。

我们目前越来越多的项目会使用 TS，在未来由于珊瑚海的使用会接触一部分 node 开发。依赖倒置，控制反转与依赖注入这几个概念会越来越常接触。

### 依赖倒置，控制反转与依赖注入

- 依赖倒置原则 - DIP, Dependence Inversion Principle

        上层模块不应该依赖底层模块，它们都应该依赖于抽象。
        抽象不应该依赖于细节，细节应该依赖于抽象。

首先看一段代码

```typescript
interface Post {
  send(someData);
}

class SCF implements Post {
  send(someData) {
    console.log("scf send", someData);
  }
}

class Axios implements Post {
  send(someData) {
    console.log("axios send", someData);
  }
}

class Service {
  private post: Post;

  public Service() {
    this.post = new Axios();
  }

  public send(someData) {
    this.post.send(someData);
  }
}
```

可以看到我们基于 post，实现了 scf 和 axios 的发送接口
但是我们在用的时候，就不得已要去实例化对应的方法（当然我们现实用的时候直接 export 导出实例就好了）

- 控制反转 - IOC, Inversion of Control

问题：

1.  Service 中还是需要去创建请求服务，事实上我们不应该关心 send 的具体内容，我们只需要关心有没有 send 这个方法就可以了。我们需要将控制（创建实例）的过程放在外部。

看一段业务上的代码

```typescript
class FontGenerate() {
    public stategy
    constructor(stategy: any) {
        this.stategy = stategy;
    }

    buildFont() {
        // 这里是获取字体的数据源
        const fontSource = {} as any;
        // 调用变形字体的方案
        const transFormFont = transform(fontSource, this.stategy);
        return transFormFont;
    }
}

// 加点的策略
const pointFont = new FontGenerate(new PointStategy());
```

这样我们就在外部创建了两种策略，并且注入到了产生字体的类中，实现了一定程度上的控制反转。

但是还存在以下问题：

1. 每创建一个策略都要手动 new 一下或者要么全局单例模式 export 导出来，比较麻烦
2. 假如我有好几个 service 都需要 new 策略，那么这些实例分散在各处，不容易统一管理。
3. 不容易解决成环的问题。
   eg: A -> B -> C -> A, 这其中就有了环的存在。

### 改造

基于此我们进行相关改造

我们首先得要让业务类知道我们我们需要什么依赖，改造如下

```typescript
class PointStategy {
  // 省略
}

class FontGenerate() {
    public stategy
    constructor(public readOnly stategy: PointStategy) {}

    buildFont() {
        // 省略
    }
}
```

这样业务类就知道我们要什么策略的类了，但是如何去实例化呢？

这里要引入一个概念，叫做反射。

## 反射

反射（Reflection）其实是通过允许在运行时存取程序数据，以改变程序行为的程序设计技术.

为什么 javascript 之前没有单独的反射概念？

因为有万能的 eval 能够解决动态执行的问题

也有万能的闭包可以部分解决编辑作用域内数据的问题

不过我们在 ts 的严格模式上 eval 是直接被干掉了，我们需要一种新的工具解决反射问题。

### 元数据

    元数据（metadata）
    元数据是用来描述数据的数据（Data that describes other data）

我们举个例子，比如一首歌曲是数据，那么歌曲的格式（mp3/flac/wma），歌曲的分类（jazz，电音，流行），歌曲的大小（size），歌手等，通过这些数据能够唯一确定一首歌曲，那么这些数据就是歌曲的元数据。

感觉是不是和属性有点像，不过元数据的特性在于，它使信息的描述和分类可以实现格式化，而对于属性上面，我们会额外关心：歌曲现在是不是在播放（isPlay）, 歌曲播放的声音大小等这种和歌曲本身相对无关的数据。

ES7/8? 比较新的版本引入了 Reflect 方法，这玩意就是可以结合装饰器实现反射功能

https://developer.mozilla.org/zh-CN/docs/Web/JavaScript/Reference/Global_Objects/Reflect

不过着实兼容性有问题，IE 全部版本都是原生不支持的。

在这里为了方便元数据使用，ts 推荐引入 reflect-metadata 包;

具体配置如下 需要开启装饰器特性和 metadata 特性

```json
{
  "compilerOptions": {
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true
  }
}
```

```bash
npm install reflect-metadata
```

导入，就可以愉快的使用了，demo 如下

```typescript
import "reflect-metadata";

@Reflect.metadata("role", "admin")
class Post {}

const metadata = Reflect.getMetadata("role", Post);

console.log(metadata); // admin
```

回到正题，我们如何解决动态实例化 prop 参数，这里我们尝试写一个 IOC（控制反转）容器

```typescript
type Constructor<T = any> = new (...args: any[]) => T;

const Injectable = (): ClassDecorator => (target) => {};

class OtherService {
  a = 1;
}

@Injectable()
class TestService {
  constructor(public readonly otherService: OtherService) {}

  testMethod() {
    console.log(this.otherService.a);
  }
}

const Factory = <T>(target: Constructor<T>): T => {
  // 获取所有注入的服务
  const providers = Reflect.getMetadata("design:paramtypes", target); // [OtherService]
  const args = providers.map((provider: Constructor) => new provider());
  // @ts-ignore
  return new target(...args);
};

Factory(TestService).testMethod(); // 1
```

这就是一个最基本的 ioc 容器 实现，可以看到我们做了以下几个事情

1. 搞了一个空的的 inject 装饰器实现，只是为了获取 target
2. 要被注入的 service: otherservice
3. 类似我们上面的方案，在 testService 上面增加类装饰器
4. 实现了一个工厂函数
   - 通过 design:paramtypes(ts 支持的语法) 获取 constructor 的参数列表
   - 遍历参数列表，实例化
   - 注入到服务中

extra: 如果不用 reflect 的实现，我们可以怎么做（提示：Angular1 的实现, 参考文章：https://segmentfault.com/a/1190000008626680 ）

那这个就是一个最基本的 ioc 容器了，可是实际应用中我们不会这么单纯只是 A -> B, 更多的以下结构

调用链：

那我们就需要解析整个的调用链

### 调用链

考虑一个模块封装如下

```typescript
@Module({
  imports: [ModuleA],
  controllers: [Controller],
  providers: [Service],
})
export class AppModule {}
```

可以看到我们定义了一个叫做 module 的装饰器在这个 AppModule 上面，我们先不管里面的 ModuleA, Controller, Service。这个装饰器是干啥用的？

思考一下，我们处理模块依赖的时候项目还没有启动，本质上我们是拿不到 AppModule 里面的运行逻辑的，即使是一个空 class，所以和我们上面动态拿 constructor 里面的入参情况是完全不一样的，那个是运行时。

我们这里还是用到 metadata 的方案，只不过我们将整个导入的逻辑保存在这个类的元数据上面，这样我们不用执行这个类，只要通过静态的导入导出就可以知道这个模块的调用链。

看一下 Module 的实现

```typescript
export function Module(metadata: any) {
  // 省略..
  return (target: Function) => {
    // 遍历所有给到的metadata
    for (const property in metadata) {
      if (metadata.hasOwnProperty(property)) {
        Reflect.defineMetadata(property, metadata[property], target);
      }
    }
  };
}
```

可以看到我们把所有的 metadata 丢了进去进行对象遍历，然后通过 defineMetadata 方法加上元数据，这个方法是不是有点像 Object.defineProperty? 其实确实是比较类似的

然后我们去解析调用链

```typescript
class Container {
  public modules = new Map();

  public addModule(module, scope) {
    // 获取module的token和所有的元数据
    const { type, dynamicMetadata, token } = await this.moduleCompiler.compile(
      metatype
    );
    // 如果命中了缓存，直接返回缓存的module
    if (this.modules.has(token)) {
      return this.modules.get(token);
    }
    // 实例化新的module
    const moduleRef = new Module(type, this);
    moduleRef.token = token;
    this.modules.set(token, moduleRef);

    // 添加所有的metadata
    await this.addDynamicMetadata(
      token,
      dynamicMetadata,
      [].concat(scope, type)
    );
    return moduleRef;
  }

  // 实例化所有的依赖
  public initialInstace(target) {
    const providers = Reflect.getMetadata("design:paramtypes", target); // [OtherService]
    const args = providers.map((provider: Constructor) => new provider());
    // @ts-ignore
    return args;
  }
}
```

可以看到我们首先创建了一个 IOC 容器的类，包含了 addModule（解析所有模块和元数据）， initialInstace（实例化）。这个方法和我们上面的 factory 基本是一致的。

然后我们看一下执行过程

```typescript
async function initialize(module) {
  // 省略一些代码
  await dependenciesScanner.scan(module);
  await instanceLoader.createInstancesOfDependencies();
}
```

非常简单，基本上就两步操作 一个是扫描所有的模块（深度遍历），一个是去执行所有扫描到的模块的依赖（constructor）。这边缺少了最后一步，将依赖注入到实例，这个是执行模块的时候才用到，我们这里就不谈了。

我们看下 dependenciesScanner.scan

```typescript
export class DependenciesScanner {
  public async scan(module) {
    // 省略代码 注册核心module
    await this.scanForModules(module);
    await this.scanModulesForDependencies();
  }

  public async scanForModules(
    moduleDefinition:
  ): Promise<Module[]> {
    // 自己模块的插入
    const moduleInstance = await this.insertModule(moduleDefinition, scope);
    // 拿到所有的import模块
    const modules = this.reflectMetadata(
      moduleDefinition,
      'imports'
    );
    let registeredModuleRefs = [];
    // 递归遍历
    for (const [index, innerModule] of modules.entries()) {
      // In case of a circular dependency (ES module system), JavaScript will resolve the type to `undefined`.
      // 递归调用scanForModules
      const moduleRefs = await this.scanForModules(
        innerModule,
        [].concat(scope, moduleDefinition),
        ctxRegistry
      );
      // 拼在一起
      registeredModuleRefs = registeredModuleRefs.concat(moduleRefs);
    }
    if (!moduleInstance) {
      return registeredModuleRefs;
    }
    // 返回所有的module
    return [moduleInstance].concat(registeredModuleRefs);
  }

  public async insertModule(
    moduleDefinition: any,
  ): Promise<Module | undefined> {
    // 省略
    // 这个container就是IOC容器的类
    return this.container.addModule(moduleToAdd, scope);
  }

  // 这边就是从元数据上面拿到所有的参数，放入容器中
  public async scanModulesForDependencies(
    modules: Map<string, Module> = this.container.getModules(),
  ) {
    for (const [token, { metatype }] of modules) {
      await this.reflectImports(metatype, token, metatype.name);
      this.reflectProviders(metatype, token);
      this.reflectControllers(metatype, token);
      this.reflectExports(metatype, token);
    }
  }
}
```

scanForModules： 扫描所有的 module，加入容器中，中间 scanForModules -> insertModule -> reflectMetadata -> modules.entries() -> scanForModules 进行这样的深度遍历

scanModulesForDependencies： 扫描所有的依赖，放入容器中


继续看 instanceLoader.createInstancesOfDependencies

```typescript
export class instanceLoader {
  public async createInstancesOfDependencies(
    modules: Map<string, Module> = this.container.getModules()
  ) {
    // 省略
    // 这里就是实例化所有的module
    await this.createInstances(modules);
  }

  private async createInstances(modules: Map<string, Module>) {
    await Promise.all(
      [...modules.values()].map(async (moduleRef) => {
        // 这三个函数其实是一样的，本质都是实例化不同的插件
        await this.createInstancesOfProviders(moduleRef);
        await this.createInstancesOfInjectables(moduleRef);
        await this.createInstancesOfControllers(moduleRef);
      })
    );
  }

  public createInstancesOfProviders(module) {
    // 这里面的过程比较复杂，就是去解析不同环境下的参数和方法
    // 最后调用初始化实例，在源代码上是单独通过inject类来实现的
    container.initialInstace(module);
  }
}
```

这整个流程就是在node端（国外）非常火的nest.js 框架的源码中处理模块依赖和IOC的过程。

官网：https://nestjs.com/ （猫咪好可爱）

这个也是基于ts依赖倒置的实现， 怎么样，你学会了吗？
