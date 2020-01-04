今天讲讲如何 lodash 里面的 merge 方法

## 如何实现一个 merge 方法

### 1.官方实现

\_.merge(object, [sources])

object (Object): 目标对象。
[sources](...Object): 来源对象。
(Object): 返回 object.

```javascript
var object = {
  a: [{ b: 2 }, { d: 4 }]
};

var other = {
  a: [{ c: 3 }, { e: 5 }]
};

_.merge(object, other);
// => { 'a': [{ 'b': 2, 'c': 3 }, { 'd': 4, 'e': 5 }] }
```

### 2. 步骤实现

#### 目录结构

相对于 get，merge 的目录相对复杂，入口文件以及相关构成如下

<pre>
 |——merge.js  #merge的入口文件
 |
 |——.internal——baseAssignValue.js 复制主函数
             ——createAssigner.js 对于多个source的遍历器
             ——baseFor.js 构造器
             ——baseMerge.js merge内部主函数
             ——baseMergeDeep.js 对于 对象/数组/typearray的递归复制函数
</pre>

#### 具体实现

脑海中复现一个大致思路
约定如下：我们将来源对象称之为 source，目标元素称之为 object
对于一次单个复制我们定义为一个 source 元素 merge 到 object 的过程
对于一次完成的 merge 我们可以认为是在多个 source 情况下所进行的多次单个复制操作

1. 一次单个复制

- 判断 source 元素当前遍历到的 key 是否是 undefiend
- 目标元素是否有对应 key
- 是否覆盖目标元素的对应 key
- 对于值复制与引用复制如何分别进行处理
- 对于引用复制，如果引用对象存在环结构（对象 a a.b = 对象 b 对象 b b.a = 对象 a）如何处理

2. 完整复制

- 对于多个 source 的处理

#### 源码阅读

- 入口函数

```javascript
// createAssigner 对于多个source的遍历处理
// baseMerge 合并一个source的主入口函数
const merge = createAssigner((object, source, srcIndex) => {
  baseMerge(object, source, srcIndex);
});
```

- createAssigner

```javascript
function createAssigner(assigner) {
  return (object, ...sources) => {
    let index = -1;
    // rest语法，判断参数多少 => 0
    let length = sources.length;
    // 只会执行一次

    // 省略中间部分.....
    while (++index < length) {
      // 执行复制函数
      assigner();
    }
    return object;
  };
}
```

- baseMerge

```javascript
function baseMerge(object, source, srcIndex, customizer, stack) {
  // 如果输入与源相同就return
  if (object === source) {
    return;
  }
  // 对于传入的object遍历每一个key
  baseFor(
    source,
    (srcValue, key) => {
      // 如果是引用类型,就构造一个栈防止成环
      if (isObject(srcValue)) {
        // 形成统一的stack
        stack || (stack = new Stack());
        // clone
        baseMergeDeep(
          object,
          source,
          key,
          srcIndex,
          baseMerge,
          customizer,
          stack
        );
      } else {
        // 值复制拷贝
        assignMergeValue(object, key, newValue);
      }
    },
    keysIn
  );
}
```

- assignMergeValue

```javascript
function assignMergeValue(object, key, value) {
  // 这里存在赋值规则，如果相同的值不为undefined并且相同不做复制 || 值为undefined但是对应的key已经在对象里了不做复制
  if (
    (value !== undefined && !eq(object[key], value)) ||
    (value === undefined && !(key in object))
  ) {
    // 复制
    baseAssignValue(object, key, value);
  }
}
```

- baseMergeDeep

```javascript
function baseMergeDeep(
  object,
  source,
  key,
  srcIndex,
  mergeFunc,
  customizer,
  stack
) {
  const objValue = object[key];
  const srcValue = source[key];
  const stacked = stack.get(srcValue);
  // 如果在栈保存的就直接assign
  if (stacked) {
    // 复制对应引用
    assignMergeValue(object, key, stacked);
    return;
  }
  const isArr = Array.isArray(srcValue);
  if (isArr) {
    if (Array.isArray(objValue)) {
      newValue = objValue;
    } else if (isArrayLikeObject(objValue)) {
      // 遍历拷贝
      newValue = copyArray(objValue);
    } else {
      newValue = [];
    }
  }
  // 如果是object或者argument的话
  else if (isPlainObject(srcValue) || isArguments(srcValue)) {
    newValue = objValue;
    if (isArguments(objValue)) {
      newValue = toPlainObject(objValue);
    } else if (typeof objValue === "function" || !isObject(objValue)) {
      newValue = initCloneObject(srcValue);
    }
  }
  // Recursively merge objects and arrays (susceptible to call stack  limits).
  stack.set(srcValue, newValue);
  stack["delete"](srcValue);
  assignMergeValue(object, key, newValue);
}
```

## 最佳实践与思考

- 对于需要深度 merge 的时候采用，浅 merge 请考虑 Object.assign/\_.assign

- 对于 undefiend 的处理，undefiend 对应的 key 在复制的时候会被跳过

- 利用函数式编程形成的封装函数 遍历 source 与复制的拆分/遍历 key 与 value 复制的拆分

- 回环处理，利用栈保存已经遍历过的值，最后在处理到回环部分的时候交由普通复制函数处理引用

## 有趣的问题

- JSON.parse(JSON.stringify(data)) 与 merge 有多慢

JSON.parse(JSON.stringify(data)) - 0.12499996228143573
merge - 2.9150000191293657
