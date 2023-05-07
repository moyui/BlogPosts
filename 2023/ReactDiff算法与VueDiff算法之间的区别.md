最近在进行复习，由于工作中React和Vue都使用过，这里谈谈React和Vue的diff算法之间的区别

## React diff算法和Vue diff算法之间的区别

### React的diff算法

React由于引入了fiber，所以首先要声明一些概念

1. current Fiber，即当前的Dom节点代表的Fiber结构
2. workInProgress Fiber，即即将要更新的Dom节点代表的Fiber结构
3. JSX对象，即render函数返回的结果。

React diff的本质是比对 1和3，生成2。所以是链表（current Fiber）对比Vnode（JSX），生成新的链表（workInProgress Fiber）。所以再多节点的diff的时候会降级到传统对比，不能使用类似Vue的双端diff

入口处在reconcileChildFibers函数中，React会判断单节点的diff还是多节点的diff

```javascript
// 根据newChild类型选择不同diff函数处理
function reconcileChildFibers(
  returnFiber: Fiber,
  currentFirstChild: Fiber | null,
  newChild: any,
): Fiber | null {

  const isObject = typeof newChild === 'object' && newChild !== null;

  if (isObject) {
    // object类型，可能是 REACT_ELEMENT_TYPE 或 REACT_PORTAL_TYPE
    switch (newChild.$$typeof) {
      case REACT_ELEMENT_TYPE:
        // 调用 reconcileSingleElement 处理
      // // ...省略其他case
    }
  }

  if (typeof newChild === 'string' || typeof newChild === 'number') {
    // 调用 reconcileSingleTextNode 处理
    // ...省略
  }

  if (isArray(newChild)) {
    // 调用 reconcileChildrenArray 处理
    // ...省略
  }

  // 一些其他情况调用处理函数
  // ...省略

  // 以上都没有命中，删除节点
  return deleteRemainingChildren(returnFiber, currentFirstChild);
}
```
这里可以直接看出，当newChild类型为 string number object的时候，会进行单节点的diff，当newChild类型为Array的时候，同级存在多个节点，会进行多节点的diff
 
#### React的单节点diff

首先单节点在这里进行判断

```javascript
  const isObject = typeof newChild === 'object' && newChild !== null;

  if (isObject) {
    // 对象类型，可能是 REACT_ELEMENT_TYPE 或 REACT_PORTAL_TYPE
    switch (newChild.$$typeof) {
      case REACT_ELEMENT_TYPE:
        // 调用 reconcileSingleElement 处理
      // ...其他case
    }
  }
```

然后调用 reconcileSingleElement 函数进行处理

```javascript
function reconcileSingleElement(
  returnFiber: Fiber,
  currentFirstChild: Fiber | null,
  element: ReactElement
): Fiber {
  const key = element.key;
  let child = currentFirstChild;
  
  // 首先判断是否存在对应DOM节点
  while (child !== null) {
    // 上一次更新存在DOM节点，接下来判断是否可复用

    // 首先比较key是否相同
    if (child.key === key) {

      // key相同，接下来比较type是否相同

      switch (child.tag) {
        // ...省略case
        
        default: {
          if (child.elementType === element.type) {
            // type相同则表示可以复用
            // 返回复用的fiber
            return existing;
          }
          
          // type不同则跳出switch
          break;
        }
      }
      // 代码执行到这里代表：key相同但是type不同
      // 将该fiber及其兄弟fiber标记为删除
      deleteRemainingChildren(returnFiber, child);
      break;
    } else {
      // key不同，将该fiber标记为删除
      deleteChild(returnFiber, child);
    }
    child = child.sibling;
  }

  // 创建新Fiber，并返回 ...省略
}
```
这个函数执行以下流程

上次更新的Fiber节点是否存在对应的Dom节点

- 是，则Dom节点是否可以复用
    - 如果可以复用，则将上次更新的Fiber节点的副本作为本次新生成的Fiber节点并且返回
    - 如果不可以复用，则标记Dom需要被删除，且新生成一个Fiber节点并返回
- 否，则新生成一个Fiber节点并返回


复用判断的标准是
1. key相同
2. type相同
上面两个条件需要同时满足

并且执行的时候有一些细微的差别
1. 如果child存在，且key相同但是type不同，说明当前节点（已经通过key找到了）及可能的兄弟节点（剩下的兄弟节点都没有机会）的类型都不一样，所以需要批量删除fiber
2. 如果child存在，但是key不同，则标记当前child进行删除，继续进行遍历


#### React的多节点diff

React的多节点diff入口在这里

```javascript
  if (isArray(newChild)) {
    // 调用 reconcileChildrenArray 处理
    // ...省略
  }
```

这里就不深入源码部分了，我们直接看方法

在多节点的diff中，我们会遇到三个情况

1. 节点更新，包括节点的属性发生变化（加了一个className）与节点的类型更新（从li变成div）
2. 节点新增或者减少
3. 节点的位置发生变化（key移动）

在React的diff设计思路中，通常情况下1的情况大于2或者3，所以diff会优先判断节点是否更新

**注意：** 在上文中我们已经提及了，diff算法是对比currentFiber和生成的JSX即newChildren的数组，是链表和数组进行比较，所以不能使用双指针进行优化

于此，diff算法会进过2轮遍历
1. 处理更新的节点
2. 处理剩下不属于更新的节点

##### 第一轮遍历

将newChildren[i]与oldFiber进行比较，判断是否可以复用

 - 如果可以复用，i++，继续比较newChildren[i]和oldFiber.sibling  如果可以复用则继续进行遍历
 - 如果不可复用，分两种情况
    1. 如果是key不同导致不可以复用，则直接跳出整个遍历，第一轮循环结束
    2. 如果是key相同但是type不同导致不可复用，则将oldFiber标记为删除，继续遍历
 - 如果newChildren遍历完或者oldFiber遍历完，则跳出遍历

#### 第二轮遍历

分类讨论

1. 如果newChildren和Fiber同时遍历完，那diff直接结束
2. 如果newChildren没遍历完，Fiber遍历完了，那意味着剩下的节点都是插入的，标记Placement
3. 与2相反场景，那么说明剩下的节点都是删除的，标记Deletion
4. 如果都没有遍历完，说明节点改变了位置


#### 移动节点讨论

因为判断有节点改变了位置，所以我们不能用索引i对比前后的节点，我们只能使用key作为唯一标记
为了快速的找到key对应的oldFiber，我们将还没有处理的oldFiber存入一个map，key为key，fiber为value
接下来遍历剩余的newChildren，通过newChildren[i].key找原来的oldFiber。

我们还需要找到一个参照物来证明节点是否移动了，在这里我们选取最后一个可复用的节点在oldFiber的位置索引（因为oldFiber不会改变），记为lastPlacedIndex

由于本次更新节点是按照newChildren的顺序排列的，当我们遍历newChildren的时候，如果发现这个节点对应的oldFiber的位置跑到了lastPlacedIndex的前面，说明当前节点移动了位置（原来按照 oldFiber ->  lastPlacedIndex ，现在则是 lastPlacedIndex对应的newFiber -> newFiber ）。我们需要将该节点标记向右移动。其余状态不发生变化

lastPlacedIndex初始为0，每遍历一个可复用的节点，如果oldIndex >= lastPlacedIndex, 则更新lastPlacedIndex为oldIndex


按照例子来看，如果从abcd变为dabc，我们认为只需要将d移动到前面，但是按照React方案，则保持了d不变，将abc分别移动到了d后面。

所以从这点可以看出，为了性能考虑。我们尽量减少节点从后面移动到前面的操作。


### Vue的diff算法

vue的diff算法和react的最大区别在于，vue的diff是对比前后的两个Vnode，所以可以进行双指针优化，其余部分判断单节点和多节点的方案与react没有什么太大区别

入口函数在这里

```javascript
return function patch (oldVnode, vnode, hydrating, removeOnly) {
  if (isUndef(vnode)) {
    if (isDef(oldVnode)) invokeDestroyHook(oldVnode)
    return
  }

  let isInitialPatch = false
  const insertedVnodeQueue = []

  if (isUndef(oldVnode)) {
    // empty mount (likely as component), create new root element
    isInitialPatch = true
    createElm(vnode, insertedVnodeQueue)
  } else {
    const isRealElement = isDef(oldVnode.nodeType)
    // 判断是否是相同节点
    if (!isRealElement && sameVnode(oldVnode, vnode)) {
      // patch existing root node
      // 这种情况是新旧节点相同，则更新一大堆东西，包括props，listeners，slot啊
      patchVnode(oldVnode, vnode, insertedVnodeQueue, removeOnly)
    //  如果不相同
    } else {
      if (isRealElement) {
         // ...
      }
        // 创建了新节点
      // replacing existing element
      const oldElm = oldVnode.elm
      const parentElm = nodeOps.parentNode(oldElm)

      // create new node
      createElm(
        vnode,
        insertedVnodeQueue,
        // extremely rare edge case: do not insert if old element is in a
        // leaving transition. Only happens when combining transition +
        // keep-alive + HOCs. (#4590)
        oldElm._leaveCb ? null : parentElm,
        nodeOps.nextSibling(oldElm)
      )

      // update parent placeholder node element, recursively
      // 更新父的占位符节点
      if (isDef(vnode.parent)) {
        let ancestor = vnode.parent
        const patchable = isPatchable(vnode)
        while (ancestor) {
          for (let i = 0; i < cbs.destroy.length; ++i) {
            cbs.destroy[i](ancestor) // 找到父节点之后，执行各个module的destroy的钩子函数
          }
          ancestor.elm = vnode.elm
          if (patchable) {
            for (let i = 0; i < cbs.create.length; ++i) {
              cbs.create[i](emptyNode, ancestor) // 如果当前占位符可以挂载，则执行module的create钩子函数
            }
            // #6513
            // invoke insert hooks that may have been merged by create hooks.
            // e.g. for directives that uses the "inserted" hook.
            const insert = ancestor.data.hook.insert
            if (insert.merged) {
              // start at index 1 to avoid re-invoking component mounted hook
              for (let i = 1; i < insert.fns.length; i++) {
                insert.fns[i]()
              }
            }
          } else {
            registerRef(ancestor)
          }
          ancestor = ancestor.parent
        }
      }

      // destroy old node
      // 删除了旧节点
      if (isDef(parentElm)) {
        removeVnodes(parentElm, [oldVnode], 0, 0)
      } else if (isDef(oldVnode.tag)) {
        invokeDestroyHook(oldVnode)
      }
    }
  }

  invokeInsertHook(vnode, insertedVnodeQueue, isInitialPatch)
  return vnode.elm
}
```

更新节点的方案在这里
```javascript
function patchVnode (oldVnode, vnode, insertedVnodeQueue, removeOnly) {
  if (oldVnode === vnode) {
    return
  }

  const elm = vnode.elm = oldVnode.elm

  if (isTrue(oldVnode.isAsyncPlaceholder)) {
    if (isDef(vnode.asyncFactory.resolved)) {
      hydrate(oldVnode.elm, vnode, insertedVnodeQueue)
    } else {
      vnode.isAsyncPlaceholder = true
    }
    return
  }

  // reuse element for static trees.
  // note we only do this if the vnode is cloned -
  // if the new node is not cloned it means the render functions have been
  // reset by the hot-reload-api and we need to do a proper re-render.
  if (isTrue(vnode.isStatic) &&
    isTrue(oldVnode.isStatic) &&
    vnode.key === oldVnode.key &&
    (isTrue(vnode.isCloned) || isTrue(vnode.isOnce))
  ) {
    vnode.componentInstance = oldVnode.componentInstance
    return
  }

  /**  执行prepatch函数  */
  // 这里就是调用prepatch函数执行updateChildComponent方法，更新props，listeners，slots等等
  let i
  const data = vnode.data
  if (isDef(data) && isDef(i = data.hook) && isDef(i = i.prepatch)) {
    i(oldVnode, vnode)
  }
 /**  执行prepatch函数结束  */

 /** 完成patch过程 */
  const oldCh = oldVnode.children
  const ch = vnode.children
  if (isDef(data) && isPatchable(vnode)) {
    for (i = 0; i < cbs.update.length; ++i) cbs.update[i](oldVnode, vnode)
    if (isDef(i = data.hook) && isDef(i = i.update)) i(oldVnode, vnode)
  }
  // 判断是不是文本节点
  if (isUndef(vnode.text)) {
    // 如果不是文本节点
    if (isDef(oldCh) && isDef(ch)) {
      // 关键函数在这里，执行updateChildren，后面重点讲
      if (oldCh !== ch) updateChildren(elm, oldCh, ch, insertedVnodeQueue, removeOnly)
    // 如果只有ch存在，代表是旧节点都不需要了，直接生成新节点
    } else if (isDef(ch)) {
      if (isDef(oldVnode.text)) nodeOps.setTextContent(elm, '')
      addVnodes(elm, null, ch, 0, ch.length - 1, insertedVnodeQueue)
      // 如果只有旧节点存在，则更新为空，删除旧节点
    } else if (isDef(oldCh)) {
      removeVnodes(elm, oldCh, 0, oldCh.length - 1)
      // 这种情况是旧节点是文本节点的时候
    } else if (isDef(oldVnode.text)) {
      nodeOps.setTextContent(elm, '')
    }
    // 如果是文本节点，则直接替换文本
  } else if (oldVnode.text !== vnode.text) {
    nodeOps.setTextContent(elm, vnode.text)
  }
  // 执行postpatch钩子函数
  if (isDef(data)) {
    if (isDef(i = data.hook) && isDef(i = i.postpatch)) i(oldVnode, vnode)
  }
   /** 完成patch过程结束 */
}
```


判断节点是否可以复用的方案也在这里

```javascript
function sameVnode (a, b) {
  return (
    a.key === b.key && (
      (
        a.tag === b.tag &&
        a.isComment === b.isComment &&
        isDef(a.data) === isDef(b.data) &&
        sameInputType(a, b)
      ) || (
        isTrue(a.isAsyncPlaceholder) &&
        a.asyncFactory === b.asyncFactory &&
        isUndef(b.asyncFactory.error)
      )
    )
  )
}
```
同样是判断了key相同，tag相同（type相同）

那我们像react总结下流程

首先判断是不是相同节点
  - 是，则可以复用，进入后续流程，并执行钩子函数
    - 如果新节点是文本节点，则直接进行文本替换
    - 如果不是，则
        - 如果旧节点也不是，则进入updateChildren比较
        - 如果只有旧节点，则删除旧节点
        - 如果只有新节点，则添加新节点
        - 如果旧节点是文本节点，则删除文本

  - 不是，则不可以复用，直接创建新节点并且删除旧节点（类似react）

比较类似react，多了文本节点的判断

#### Vue的多节点diff

vue的多节点diff是典型的双端diff，代码和实现都比较容易理解

```javascript
function updateChildren (parentElm, oldCh, newCh, insertedVnodeQueue, removeOnly) {
  let oldStartIdx = 0
  let newStartIdx = 0
  let oldEndIdx = oldCh.length - 1
  let oldStartVnode = oldCh[0]
  let oldEndVnode = oldCh[oldEndIdx]
  let newEndIdx = newCh.length - 1
  let newStartVnode = newCh[0]
  let newEndVnode = newCh[newEndIdx]
  let oldKeyToIdx, idxInOld, vnodeToMove, refElm

  // removeOnly is a special flag used only by <transition-group>
  // to ensure removed elements stay in correct relative positions
  // during leaving transitions
  const canMove = !removeOnly

  if (process.env.NODE_ENV !== 'production') {
    checkDuplicateKeys(newCh)
  }

  while (oldStartIdx <= oldEndIdx && newStartIdx <= newEndIdx) {
    if (isUndef(oldStartVnode)) {
      oldStartVnode = oldCh[++oldStartIdx] // Vnode has been moved left
    } else if (isUndef(oldEndVnode)) {
      oldEndVnode = oldCh[--oldEndIdx]
    } else if (sameVnode(oldStartVnode, newStartVnode)) {
      patchVnode(oldStartVnode, newStartVnode, insertedVnodeQueue)
      oldStartVnode = oldCh[++oldStartIdx]
      newStartVnode = newCh[++newStartIdx]
    } else if (sameVnode(oldEndVnode, newEndVnode)) {
      patchVnode(oldEndVnode, newEndVnode, insertedVnodeQueue)
      oldEndVnode = oldCh[--oldEndIdx]
      newEndVnode = newCh[--newEndIdx]
    } else if (sameVnode(oldStartVnode, newEndVnode)) { // Vnode moved right
      patchVnode(oldStartVnode, newEndVnode, insertedVnodeQueue)
      canMove && nodeOps.insertBefore(parentElm, oldStartVnode.elm, nodeOps.nextSibling(oldEndVnode.elm))
      oldStartVnode = oldCh[++oldStartIdx]
      newEndVnode = newCh[--newEndIdx]
    } else if (sameVnode(oldEndVnode, newStartVnode)) { // Vnode moved left
      patchVnode(oldEndVnode, newStartVnode, insertedVnodeQueue)
      canMove && nodeOps.insertBefore(parentElm, oldEndVnode.elm, oldStartVnode.elm)
      oldEndVnode = oldCh[--oldEndIdx]
      newStartVnode = newCh[++newStartIdx]
    } else {
      if (isUndef(oldKeyToIdx)) oldKeyToIdx = createKeyToOldIdx(oldCh, oldStartIdx, oldEndIdx)
      idxInOld = isDef(newStartVnode.key)
        ? oldKeyToIdx[newStartVnode.key]
        : findIdxInOld(newStartVnode, oldCh, oldStartIdx, oldEndIdx)
      if (isUndef(idxInOld)) { // New element
        createElm(newStartVnode, insertedVnodeQueue, parentElm, oldStartVnode.elm, false, newCh, newStartIdx)
      } else {
        vnodeToMove = oldCh[idxInOld]
        if (sameVnode(vnodeToMove, newStartVnode)) {
          patchVnode(vnodeToMove, newStartVnode, insertedVnodeQueue)
          oldCh[idxInOld] = undefined
          canMove && nodeOps.insertBefore(parentElm, vnodeToMove.elm, oldStartVnode.elm)
        } else {
          // same key but different element. treat as new element
          createElm(newStartVnode, insertedVnodeQueue, parentElm, oldStartVnode.elm, false, newCh, newStartIdx)
        }
      }
      newStartVnode = newCh[++newStartIdx]
    }
  }
  if (oldStartIdx > oldEndIdx) {
    refElm = isUndef(newCh[newEndIdx + 1]) ? null : newCh[newEndIdx + 1].elm
    addVnodes(parentElm, refElm, newCh, newStartIdx, newEndIdx, insertedVnodeQueue)
  } else if (newStartIdx > newEndIdx) {
    removeVnodes(parentElm, oldCh, oldStartIdx, oldEndIdx)
  }
}
```

代码虽然长，但是还是容易理解

1. 比较旧头指针和新头指针，如果一样，则同时++
2. 比较旧尾指针和新尾指针，如果一样，则同时--
3. 比较旧头指针和新尾指针，如果一样，则旧头指针++，新尾指针--，同时需要移动下位置，移动到旧尾指针的尾节点位置，即sibling
3. 比较新头指针和旧尾指针，如果一样，则新头指针++，旧尾指针--，同时需要移动下位置，移动到旧头指针的头节点位置，即before

直到 oldStartIdx <= oldEndIdx 并且 newStartIdx <= newEndIdx，就说明处理完了所有节点

一样的定义同上，key相同且type相同

还有一种情况，就是双端都没有可复用节点的情况，就只能在旧节点数据中找，找到了把他移动到对应位置，并且原位置是undefined，如果没找到就说明要新生存一个节点了

因为有了一些undefined的旧节点，所以要加上空节点的处理逻辑

最后一个判断的情况是，如果oldvnode多了或者newvnode多了，则将oldvalue删除或者new vnode新增。

这样就是一个完整的 diff 算法了，包括查找可复用节点和移动节点、新增和删除节点。
而且因为从两侧查找节点，会比简单 diff 算法性能更好一些。比如ABCD到DABC，双端diff只需要移动D一个节点即可