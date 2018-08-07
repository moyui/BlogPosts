这是blog迁移到Github上的第一篇文章，至于为什么要迁移到Github，主要是服务器在国外，比较慢，又不稳定，头疼ing。

## lodash源码分析——deepclone，基于4.17.10版本
这是源码分析的第一篇文章，首先，我不太想谈大家讲的比较多的，比如debounce、throttle等等。

其次，我会从源码阅读初心者的角度(自己就是233)基本上一句一句分析，当中也有一些自己没法理解的地方，也希望各位能够指正。

最后，通过写作提高一下语言表达能力，我才不会说我高考语文的黑历史呢（哼

接下来就是正文了。不愿意看源码的可以直接调到最后一段看总结，愿意看源代码的建议不要跳着看，流程我都梳理过了,但是还是建议对照[lodash源码](https://github.com/lodash/lodash)比对着看。

### 入口
入口函数调用`cloneDeep.js`
```javascript
function cloneDeep(value) {
  return baseClone(value, CLONE_DEEP_FLAG | CLONE_SYMBOLS_FLAG)
}
```
很简单、后面的两个掩码位代表是否进行深拷贝与是否复制symbol类型。

### baseClone
前往`.internal/baseClone.js`并调用baseClone。
```javascript
/**
 * 
 * @param {*} value  要克隆的值(对象本身)
 * @param {number} bitmask 掩码 1为deep clone 2为flatten inherited prop(扁平化继承的属性) 3为clone symbols
 * @param {Function} customizer 要定制clone的函数
 * @param {string} key 值的键(其中一个)
 * @param {*} object 值的父对象 
 * @param {*} stack 追踪遍历的对象和他们克隆相对物(?)
 */
function baseClone(value, bitmask, customizer, key, object, stack) {
    let result;
    const isDeep = bitmask & CLONE_DEEP_FLAG
    const isFlat = bitmask & CLONE_FLAT_FLAG
    const isFull = bitmask & CLONE_SYMBOLS_FLAG

    if (customizer) {
        //在有定制clone函数的情况下,如果父对象存在就将key，object，stack传入，不是就单独传value
        result = object ? customizer(value, key, object, stack) : customizer(value)
    }

    if (result !== undefined) {
        return result;
    }

    //判断要克隆的值是否是对象，是就直接返回要克隆的值
    if (!isObject(value)) {
        return value;
    }
```
### isObject
看一下工具函数`../isObject.js`
```javascript
function isObject(value) {
    const type = typeof value;
    return value != null && (type == 'object' || type ='function');
}
```
### baseClone
回到baseClone
```javascript
//判断是否为数组并且得到tag;
const isArr = Array.isArray(value);
const tag = getTag(value)
```
### getTag
`getTag.js`，`baseGetTag.js`
```javascript
//这里我们先前往getTag.js文件看看
let getTag = baseGetTag;
//...好吧，继续前往baseGetTag.js文件
/**
 * 
 * @param {*} value 要查询的值 
 */
function baseGetTag(value) {
    if (value == null) {
        //后面返回的和Object.prototype.toString.call()保持一致
        return value === undefined ? '[object Undefined]' : '[objectNull]';
    }
```
这里的symToStringTag 是该文件顶部判断浏览器支不支持symbol即现代浏览器 支持调用Symbol.toStringTag属性，见下。
```javascript
const symToStringTag = typeof Symbol != 'undefined' ? Symbol.toStringTag : undefined
```
不支持返回undefined(这里我觉得变成void 0更好)。
        
有关于symbol.toStringTag，由MDN查询后得知,是用来返回特定的类型标签的，对于内置的JS对象类型比如String，Boolean，Null等不需要该属性就可以使用(调用OBject.prototype.call.toString时)。
        
而对于ES6之后新出现的对象类型比如Map,function*(generatorFunction),Promise等会返回特定标签。
        
但是对于自己利用class创建的类似不会有特定标签的，只会返回[object Object],所以可以自己加上
```javascript
class ValidatorClass {
    get [Symbol.toStringTag]() {
        return 'Validator'
    }
}
```
继续看吧
```javascript
    //保证无symbol标签有并且tag在值内
    if (!(symToStringTag) && symToStringTag in Object(value)) {
        //直接返回Object.prototype.toString.call(value)
        return toString.call(value);
    }
    //新出现的对象类型
    //判断tag是value本身属性?
    const isOwn = hasOwnProperty.call(value, symToStringTag);
    //找到当前tag
    const tag = value[symToStringTag];
    let unmasked = false;
    try {
        //这个标签的descripter
        /**
         * writable	false
         * enumerable false
         * configurable	false
         */
         //也就是说正常情况下是不可写的，会抛出错误
        value[symToStringTag] = undefined
        unmasked = true; 
    } catch(e) {}
    const result = toString.call(value);
    if (unmasked) {
        if (isOwn) {
            value[symToStringTag] = tag;
        } else {
            delete value[symToStringTag];
        }
    }
    //兜了一圈发现还是返回了toString.call(value)
    return result
}
//回到getTag.js
//这段大致判断返回的tag与预设的是不是一致
if ((DataView && getTag(new DataView(new ArrayBuffer(1))) !=dataViewTag) ||
(getTag(new Map) != mapTag) ||
(getTag(Promise.resolve()) != promiseTag) ||
(getTag(new Set) != setTag) ||
(getTag(new WeakMap) != weakMapTag)) {
    //只需判断一次就可以了,这种写法可见于判断浏览器能力的写法，比如AddEventListener
    getTag = (value) => {
        const result = baseGetTag(value)//Object.prototype.toString.call(value);
        //是对象返回构造器指针，不是就是undefined
        const Ctor = result == objectTag ? value.constructor :undefined;
        //字符串形式
        const ctorString = Ctor ? `${ctor}` : '';
        if (ctorString) {
            switch (ctorString) {
                case dataViewCtorString: return dataViewTag
                case mapCtorString: return mapTag
                case promiseCtorString: return promiseTag
                case setCtorString: return setTag
                case weakMapCtorString: return weakMapTag
            }
        }
    }
    //最后反正还是返回了对应的Tag
    return result;
}
```
### baseClone
返回`baseClone.js`
```javascript
if (isArr) {
    result = initCloneArray(value);
    //数组且不是deep clone
    if (!isDeep) {
        return copyArray(value, result);
    }
```
刚刚调用了initCloneArray函数(baseClone同文件下)与`copyArray.js`，我们分别看。
### initCloneArray
```javascript
function initCloneArray(array) {
    //得到数组长度
    const { length } = array;

    //构造相同长度的数组
    const result = new array.constructor(length);

    //判断长度存在并且保证数组的第一个值为字符串并且判断在数组非原型链上是否有index属性。(不太明白，希望有人能够指教)
    if (length && typeof array[0] == 'string' && hasOwnProperty.call(array, 'index')) {
        //复制index、input属性
        result.index = array.index;
        result.input = array.input;
    }

    return result;
}
```
### copyArray
```javascript
//简单的复制了一遍
function copyArray(source, array) {
    let index = -1;
    const length =source.length;
    array || (array = new Array(length));
    while (++index < length) {
        array[index] = source[index];
    }
    return array;
}
```
### baseClone
```javascript
} else {
        const isFunc = typeof value == 'function';

        if (isBuffer(value)) {
            return cloneBuffer(value, isDeep);
        }

        //如果是对象、类数组、或者是函数并且没有父对象
        if (tag == objectTag || tag == argsTag || (isFunc && !object)) {
            //如果需要扁平化或者是函数，返回空对象，不然调用。
            result = (isFlat || isFunc) ? {} : initCloneObject(value);
```
### initCloneObject
```javascript
function initCloneObject(object)
    //首先是函数，并且自己不在自己的原型链上，也就是说明这个函数不得到的(调用new Function?)
    //这地方理解可能有问题，请多多指教
    return (typeof object.constructor == 'function' !isPrototype(object))
        ? Object.create(Object.getPrototypeOf(object)) : {
    //./isPrototype.js
    //本质上实现了一个instanceof,只不过是测试自己是否在自己的原型链上
    function isPrototype(value) {
        const Ctor = value && value.constructor;
        //寻找对应原型，第一个应该就是Function.prototype了
        const proto = (typeof Ctor == 'function' Ctor.prototype) || Object.prototype;
        return value === proto;
    }
}
```
所以上面这一段代码其实不会拷贝函数,因为函数和空对象都返回{}

回到baseClone
### baseClone
```javascript
        if (!isDeep) {
            return isFlat
            ? copySymbolsIn(value, baseAssignIn(result, value))
            : copySymbols(value, baseAssign(result, value))
        } 
    } else {
        //cloneableTags中，只有error和weakmap返回false
        //也就是说函数或者error或者weakmap
        if (isFunc || !cloneableTags[tag]) {
            //父对象存在返回value，不然就是空
            return object ? value : {}
        }
        result = initCloneByTag(value, tag, isDeep);
    }
}
stack || (stack = new Stack);
```
接下来是重点...(终于到重点了

刚刚上面这段代码完成了两件事情，一是cloneByTag，这是针对一些非常规类型的，值得学习

第二，构造了一个栈，用来解决拷贝中有环的情况，至于为什么要自己构造数据结构，主要是保证兼容性与便利。
### initCloneByTag
```javascript
//正确辨别元素类型
const argsTag = '[object Arguments]'
const arrayTag = '[object Array]'
const boolTag = '[object Boolean]'
const dateTag = '[object Date]'
const errorTag = '[object Error]'
const mapTag = '[object Map]'
const numberTag = '[object Number]'
const objectTag = '[object Object]'
const regexpTag = '[object RegExp]'
const setTag = '[object Set]'
const stringTag = '[object String]'
const symbolTag = '[object Symbol]'
const weakMapTag = '[object WeakMap]'

const arrayBufferTag = '[object ArrayBuffer]'
const dataViewTag = '[object DataView]'
const float32Tag = '[object Float32Array]'
const float64Tag = '[object Float64Array]'
const int8Tag = '[object Int8Array]'
const int16Tag = '[object Int16Array]'
const int32Tag = '[object Int32Array]'
const uint8Tag = '[object Uint8Array]'
const uint8ClampedTag = '[object Uint8ClampedArray]'
const uint16Tag = '[object Uint16Array]'
const uint32Tag = '[object Uint32Array]'

//哪一些是能用的,
const cloneableTags = {}
cloneableTags[argsTag] = cloneableTags[arrayTag] =
cloneableTags[arrayBufferTag] = cloneableTags[dataViewTag] =
cloneableTags[boolTag] = cloneableTags[dateTag] =
cloneableTags[float32Tag] = cloneableTags[float64Tag] =
cloneableTags[int8Tag] = cloneableTags[int16Tag] =
cloneableTags[int32Tag] = cloneableTags[mapTag] =
cloneableTags[numberTag] = cloneableTags[objectTag] =
cloneableTags[regexpTag] = cloneableTags[setTag] =
cloneableTags[stringTag] = cloneableTags[symbolTag] =
cloneableTags[uint8Tag] = cloneableTags[uint8ClampedTag] =
cloneableTags[uint16Tag] = cloneableTags[uint32Tag] = true
cloneableTags[errorTag] = cloneableTags[weakMapTag] = false

const hasOwnProperty = Object.prototype.hasOwnProperty;

function initCloneByTag(object, tag, isDeep) {
    const Ctor = object.constructor;// ...返回创建该实例对象的Object构造函数的引用。。
    //例如 var o = {} o.constructor === Object var a =[] a.constructor === Array 
    //这里涉及到原型链， 比如o的原型链即__proto__调用内部[[prototype]]指向Object.prototype,在Object.prototy上找到了constructor属性，该属性指向Object;
    switch (tag) {
        case arrayBufferTag:break;//先不管
        //如果是布尔与时间类型
        case boolTag:
        case dateTag:
            return new Ctor(+object);//+转换为数字true -> 1 
            //这里涉及到类型转换
            //如果是布尔类型，调用内部ToNumber，如果是object，调用内部ToPrimitive（即先调用valueof，再调用toString）
        case dataViewTag:
            return cloneDateView(object, isDeep); //这里先不管
        
        case float32Tag: case float64Tag:
            return cloneTypedArray(object, isDeep);//这里一般也用不到，不管。
        
        case mapTag:
            return new Ctor;
        
        case numberTag:
        case stringTag:
            return new Ctor(object);

        case regexpTag:
            return cloneRegExp(object);//稍后进行研究

            //./cloneRegExp.js
            const reFlags = /\w*$/;
            //w匹配任意一个包括下划线的任何单词字符等价于[A-Za-z0-9_]
            function cloneRegExp(regexp) {
                const result = new regexp.constructor(regexp.source, reFlags.exec());//返回当前匹配的文本;
                result.lastIndex = regexp.lastIndex; //表示下一次匹配的开始位置
                return result;
            }
        
        case setTag:
            return new Ctor;
        
        case symbolTag:
            return cloneSymbol(object);
            //./cloneSymbol.js
            const symbolValueOf = Symbol.prototype.valueOf;
            function cloneSymbol(symbol) {
                return symbolValueOf ? Object(symbolValueOf.call(symbol)) : {};
            }
    }
}
```

### stack
```javascript
//./stack.js
const LARGE_ARRAY_SIZE = 200;
class Stack {
    constructor(entires) {
        const data = this.__data__ = new ListCache(entires);
        //./ListCache.js
        class ListCache {
            //传入的entires应该为数组
            //这里大致存放数据结构: [[key,value],[key,value]...]
            constructor(entires) {
                let index = -1;
                //判断传入实体的长度
                const length = entires == null ? 0 : entires.length;
                this.clear();
                while (++index < length) {
                    const entry = entires[index];
                    this.set(entry[0], entry[1]);
                }
            }
            clear() {
                //有一个没有声明的data属性？还是浏览器内置指针？
                this.__data__ = [];
                //这种隐式声明方式我不太喜欢
                this.size = 0;
            }
            delete(key) {
                const data = this.__data__;
                const index = assocIndexOf(data, key);
                // ./assocIndexOf.js
                //简单来说实现了方法：Array.prototype.lastIndexOf
                function assocIndexOf(array, key) {
                    let { length } = array;
                    //从后向前遍历
                    while(length --) {
                        //寻找出存放的键
                        if (eq(array[length][0], key)) {
                            //../eq.js
                            //判断两者是否相等,并且防止NaN的情况
                            function eq(value, other) {
                                return value === other || (value !==value && other !== other)
                            }
                            return length;
                        }
                    }
                    return -1;
                }
                if (index < 0) return false;
                const lastIndex = data.length - 1;
                //如果下标与当前链表最后一位一致则调用data.pop()
                //不然就直接切出去..所以我觉得直接调用data.splice不好嘛?
                if (index == lastIndex) data.pop();
                else data.splice(index, 1);
                --this.size;
                return true;
            }
            get(key) {
                const data = this.__data__;
                const index = assocIndexOf(data, key);
                return index < 0 ? undefined : data[index][1];
            }
            has(key) {
                return assocIndexOf(this.__data__, key) > -1
            }
            set(key, value) {
                const data = this.__data__;
                //寻找这个键在链表中存不存在
                const index = assocIndexOf(data, key);
                if (index < 0) {
                    ++this.size;
                    data.push([key,value])
                } else {
                    data[index][1] = value;
                }
                //返回整个实例
                return this;
            }
        }
        this.size = data.size;
    }
    clear() {
        this.__data__ = new ListCache;
        this.size = 0;
    }
    delete(key) {
        const data = this.__data__
        //data['delete']就是找到了ListCache中的delete方法
        //并且直接调用并传入key;
        const result = data['delete'](key)
    
        this.size = data.size
        return result
    }
    get(key) {
        return this.__data__.get(key);
    }
    has(key) {
        return this.__data__.has(key);
    }
    set(key, value) {
        let data = this.__data__
        if (data instanceof ListCache) {
            const pairs = data.__data__;
            //满足不是Map且没越界
            if (!Map || (pairs.length < LARGE_ARRAY_SIZE - 1)) {
                pairs.push([key, value]);
                this.size = ++data.size;
                return this;
            }
            //满了就用MapData(不参考了，自己看吧)
            data = this.__data__ = new MapCache(pairs);
        }
        data.set(key,value)
        this.size = data.size;
        return this;
    }
}
```

### baseClone
```javascript
//如果这个值遍历到过(说明deepclone中有环)
const stacked = stack.get(value);
if (stacked) {
    return stacked;
}
//设置value与result;即key与value;
stack.set(value, result);
if (tag == setTag) {
    value.forEach((subValue, key) => {
        //递归
        result.set(key,baseClone(subValue, bitmask, customizer, key, value, stack))
    })
    return result;
}
if (isTypedArray(value)) {
    return result;
}
```

到这里解决了环的问题了，接下来是拷贝比如symbol类型等
```javascript
    const keysFunc = isFull
        ? (isFlat ? getAllKeysIn : getAllkeys)
        : (isFlat ? keysIn : keys);

        //./getAllKeys
        function getAllKeys(object) {
            const result = keys(object);
            if (!Array.isArray(object)) {
                result.push(...getSymbols(object))
            }
            return result;
        }

            //getSymbol.js
            const getSymbols = !Object.getOwnPropertySymbols ? () => [] : (object) => {
                if (object == null) return [];
                object = Object(object);

                return filter(Object.getOwnPropertySymbols(object), (symbol) => 
                    Object.prototype.propertyIsEnumerable.call(object, symbol)
                )
            }

        //../key.js
        function keys(object) {
            return isArrayLike(object)
                ? arrayLikeKeys(object)
                : Object.keys(Object(object));
        }

                //./isArrayLike.js
                function isArrayLike(value) {
                    return value != null && typeof value != 'function' && isLength(value.length);
                }

                    //./isLength
                    function isLength(value) {
                        return typeof value == 'number' &&
                            value > -1 && value % 1 == 0 && value <= MAX_SAFEINTEGER //9007199254740991
                    }
                
                //arrayLikeKeys.js
                //基本上是遍历了一遍,有兴趣可以自己看一下源码


    const props = isArr ? undefined : keysFunc(value);

    arrayEach(props || value, (subValue, key) => {
        if (props) {
            key = subValue
            subValue = value[key];
        }
        assignValue(result, key, baseClone(subValue, bitmask, customizer, key, value, stack))
    });


    //./assignValue.js
    function assignValue(object, key, value) {
        const objValue = object[key];

        //同一个键对应两个值冲突
        if (!(object.hasOwnProperty(key) && eq(objValue , value))) {
            //值可用
            if (value !== 0 || (1 / value) == (1 / objValue)) {
                baseAssignValue(object, key, value);
            }
        //或者值为未定义并且键不在对象中
        } else if (value === undefined && !(key in object)) {
            baseAssignValue(object, key, value);
        }
    }

    //.baseAssignValue.js
    function baseAssignValue(object, key, value) {
        if (key == '__proto__') {
            Object.defineProperty(object, key, {
                'configurable': true,
                'enumerable': true,
                'value': value,
                'writeable': true
            });
        } else {
            object[key] = value;
        }
    }
    return result;
}
```
### 总结
lodash的深拷贝方法是相对完善和严谨的，对于特殊的数据类型，环，兼容性等等都考虑到了。但是对于function类型，依然是引用。并且，也没有深拷贝在原型链上的属性。实现的方式主要是以Object.prototype.toString.call得到tag，再分类处理，环由stack解决，symbol由Object.getOwnPropertySymbols方法解决。

写作完成与2018年7月22日