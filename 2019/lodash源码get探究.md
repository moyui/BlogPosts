今天讲讲如何lodash里面的get方法

## 如何实现一个 get 方法

### 1.官方api

参数
object (Object): 要检索的对象。
path (Array|string): 要获取属性的路径。
defaultValue(\*): 如果解析值是 undefined ，这值会被返回。
返回
(\*): 返回解析的值。

例子
var object = { 'a': [{ 'b': { 'c': 3 } }] };

\_.get(object, 'a[0].b.c');
// => 3

\_.get(object, ['a', '0', 'b', 'c']);
// => 3

\_.get(object, 'a.b.c', 'default');
// => 'default';

### 2. 步骤实现

- 入口参数处理
  ![img](https://i.loli.net/2019/11/08/VAlHoeYDcbF7Rux.png)
  构造一个可以导出使用的函数

- 返回值处理
  ![img](https://i.loli.net/2019/11/08/yKpzxiSPJGIAYrv.png)
  在构造函数基础上增加返回值判断，注意 object == null，这里有隐式转换处理，null == null 或者 undefined 直接返回 true

- baseGet
  ![img](https://i.loli.net/2019/11/08/oYCVLOcShGUPKzi.png)
  我们想将传入的字符串转换成数组去遍历，依次查找到深层，如果考虑数组长度为 0， 返回 undefined

- casePath
  ![img](https://i.loli.net/2019/11/08/ZYQMlw8iyha5Euj.png)
  构造数组路径，如果是一个正常的 key 直接返回，不是再去做转换

- isKey
  ![img](https://i.loli.net/2019/11/08/o8RfLHrhgceF7UZ.png)
  判断是否是一个’正常‘的 key

![img](https://i.loli.net/2019/11/08/zb53usDpovMcjIV.png)

    back reference（回溯引用）： 是指模式的后半部分引用在前半部分中定义的子表达式。 \1 对应第1个子表达式，\2 对应第2个子表达式，以此类推，\0对应整个正则表达式。

    position/negative  lookahead （零宽断言）
    (?=exp)零宽度正预测先行断言，它断言自身出现的位置的后面能匹配表达式exp。
    'product_path'.scan
    /(product)(?=_path)/

    (?!exp)零宽度负预测先行断言，断言此位置的后面不能匹配表达式exp。

    匹配后面不是_path
    'product_path'.scan
    /(product)(?!_path)/


    ?: 非获取匹配，匹配冒号后的内容但不获取匹配结果

- stringTopath
  ![img](https://i.loli.net/2019/11/08/WPUSMiyID6uO3Jf.png)
  将定义的 key 转换为数组

  ![img](https://i.loli.net/2019/11/08/oFOQKIX4wukzcpV.png)

### 最佳实践

- 多使用数组类型作为路径参数
![img](https://i.loli.net/2019/11/16/bpETqh6JDzI7ORs.png)

可以看到对于一个大对象的查找与索引，正则是比数组查找要慢很多，即使是lodash第二次做了缓存差异也很大