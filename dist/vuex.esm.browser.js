/*!
 * vuex v3.6.2
 * (c) 2022 Evan You
 * @license MIT
 */
function applyMixin (Vue) {
  const version = Number(Vue.version.split('.')[0]);

  // 将 vuexInit 方法混入(mixin)到 Vue 的 beforeCreate 钩子(Vue2.x) 或 _init 方法(Vue1.x)

  if (version >= 2) {
    Vue.mixin({ beforeCreate: vuexInit });
  } else {
    // 重写 _init 方法
    // override init and inject vuex init procedure
    // for 1.x backwards compatibility.
    const _init = Vue.prototype._init;
    Vue.prototype._init = function (options = {}) {
      options.init = options.init
        ? [vuexInit].concat(options.init)
        : vuexInit;
      _init.call(this, options);
    };
  }

  /**
   * Vuex的init钩子, 会注入到每一个Vue实例的 beforeCreate 钩子中列表中
   * beforeCreate 生命周期钩子执行时, $store 会被注入到对应的Vue实例中, 即 vm.$store
   * Vuex init hook, injected into each instances init hooks list.
   */
  function vuexInit () {
    const options = this.$options;
    // store injection
    if (options.store) {
      // 存在store其实代表的就是Root节点, 直接执行store（function时）或者使用store（非function）
      this.$store = typeof options.store === 'function'
        ? options.store()
        : options.store;
    } else if (options.parent && options.parent.$store) {
      // 子组件(VueComponent实例)直接从父组件(Vue实例)中获取$store, 这样就保证了所有组件都共用了全局的同一份store
      this.$store = options.parent.$store;
    }
  }
}

// Browser / NodeJS / ...
const target = typeof window !== 'undefined'
  ? window
  : typeof global !== 'undefined'
    ? global
    : {};

// 如果安装了 Vue.js devtools 插件, 则会在 window 对象上暴露一个 VUE_DEVTOOLS_GLOBAL_HOOK
// 从全局对象中(比如 window)获取 __VUE_DEVTOOLS_GLOBAL_HOOK__ 插件
const devtoolHook = target.__VUE_DEVTOOLS_GLOBAL_HOOK__;

function devtoolPlugin (store) {
  if (!devtoolHook) return

  store._devtoolHook = devtoolHook;

  // 触发 vuex 的 'vuex:init' 事件, 并将 store 传递给 deltool 插件, 使插件获取 store 的实例
  devtoolHook.emit('vuex:init', store);

  // 订阅 vuex 的 'vuex:travel-to-state' 事件
  devtoolHook.on('vuex:travel-to-state', targetState => {
    store.replaceState(targetState);
  });

  // 订阅 state 的变化
  store.subscribe((mutation, state) => {
    console.log('vuex:mutation');
    devtoolHook.emit('vuex:mutation', mutation, state);
  }, { prepend: true });

  // 订阅 action 
  store.subscribeAction((action, state) => {
    devtoolHook.emit('vuex:action', action, state);
  }, { prepend: true });
}

/**
 * Get the first item that pass the test
 * by second argument function
 *
 * @param {Array} list
 * @param {Function} f
 * @return {*}
 */
function find (list, f) {
  return list.filter(f)[0]
}

/**
 * Deep copy the given object considering circular structure.
 * This function caches all nested objects and its copies.
 * If it detects circular structure, use cached copy to avoid infinite loop.
 *
 * @param {*} obj
 * @param {Array<Object>} cache
 * @return {*}
 */
function deepCopy (obj, cache = []) {
  // just return if obj is immutable value
  if (obj === null || typeof obj !== 'object') {
    return obj
  }

  // if obj is hit, it is in circular structure
  const hit = find(cache, c => c.original === obj);
  if (hit) {
    return hit.copy
  }

  const copy = Array.isArray(obj) ? [] : {};
  // put the copy into cache at first
  // because we want to refer it in recursive deepCopy
  cache.push({
    original: obj,
    copy
  });

  Object.keys(obj).forEach(key => {
    copy[key] = deepCopy(obj[key], cache);
  });

  return copy
}

/**
 * forEach for object
 */
function forEachValue (obj, fn) {
  Object.keys(obj).forEach(key => fn(obj[key], key));
}

function isObject (obj) {
  return obj !== null && typeof obj === 'object'
}

function isPromise (val) {
  return val && typeof val.then === 'function'
}

function assert (condition, msg) {
  if (!condition) throw new Error(`[vuex] ${msg}`)
}

function partial (fn, arg) {
  return function () {
    return fn(arg)
  }
}

// Base data struct for store's module, package with some attribute and method
class Module {
  constructor (rawModule, runtime) {
    this.runtime = runtime;
    // Store some children item
    this._children = Object.create(null);
    // Store the origin module object which passed by programmer
    this._rawModule = rawModule;
    const rawState = rawModule.state;

    // Store the origin module's state
    this.state = (typeof rawState === 'function' ? rawState() : rawState) || {};
  }

  get namespaced () {
    return !!this._rawModule.namespaced
  }

  addChild (key, module) {
    this._children[key] = module;
  }

  removeChild (key) {
    delete this._children[key];
  }

  getChild (key) {
    return this._children[key]
  }

  hasChild (key) {
    return key in this._children
  }

  update (rawModule) {
    this._rawModule.namespaced = rawModule.namespaced;
    if (rawModule.actions) {
      this._rawModule.actions = rawModule.actions;
    }
    if (rawModule.mutations) {
      this._rawModule.mutations = rawModule.mutations;
    }
    if (rawModule.getters) {
      this._rawModule.getters = rawModule.getters;
    }
  }

  forEachChild (fn) {
    forEachValue(this._children, fn);
  }

  forEachGetter (fn) {
    if (this._rawModule.getters) {
      forEachValue(this._rawModule.getters, fn);
    }
  }

  forEachAction (fn) {
    if (this._rawModule.actions) {
      forEachValue(this._rawModule.actions, fn);
    }
  }

  forEachMutation (fn) {
    if (this._rawModule.mutations) {
      forEachValue(this._rawModule.mutations, fn);
    }
  }
}

class ModuleCollection {
  constructor (rawRootModule) {
    // register root module (Vuex.Store options)
    this.register([], rawRootModule, false);
  }

  get (path) {
    return path.reduce((module, key) => {
      return module.getChild(key)
    }, this.root)
  }

  getNamespace (path) {
    let module = this.root;
    return path.reduce((namespace, key) => {
      module = module.getChild(key);
      return namespace + (module.namespaced ? key + '/' : '')
    }, '')
  }

  update (rawRootModule) {
    update([], this.root, rawRootModule);
  }

  register (path, rawModule, runtime = true) {
    {
      assertRawModule(path, rawModule);
    }

    const newModule = new Module(rawModule, runtime);
    if (path.length === 0) {
      this.root = newModule;
    } else {
      const parent = this.get(path.slice(0, -1));
      parent.addChild(path[path.length - 1], newModule);
    }

    // 注册嵌套的 modules
    // register nested modules
    if (rawModule.modules) {
      forEachValue(rawModule.modules, (rawChildModule, key) => {
        // 递归注册
        this.register(path.concat(key), rawChildModule, runtime);
      });
    }
  }

  unregister (path) {
    const parent = this.get(path.slice(0, -1));
    const key = path[path.length - 1];
    const child = parent.getChild(key);

    if (!child) {
      {
        console.warn(
          `[vuex] trying to unregister module '${key}', which is ` +
          `not registered`
        );
      }
      return
    }

    if (!child.runtime) {
      return
    }

    parent.removeChild(key);
  }

  isRegistered (path) {
    const parent = this.get(path.slice(0, -1));
    const key = path[path.length - 1];

    if (parent) {
      return parent.hasChild(key)
    }

    return false
  }
}

function update (path, targetModule, newModule) {
  {
    assertRawModule(path, newModule);
  }

  // update target module
  targetModule.update(newModule);

  // update nested modules
  if (newModule.modules) {
    for (const key in newModule.modules) {
      if (!targetModule.getChild(key)) {
        {
          console.warn(
            `[vuex] trying to add a new module '${key}' on hot reloading, ` +
            'manual reload is needed'
          );
        }
        return
      }
      update(
        path.concat(key),
        targetModule.getChild(key),
        newModule.modules[key]
      );
    }
  }
}

const functionAssert = {
  assert: value => typeof value === 'function',
  expected: 'function'
};

const objectAssert = {
  assert: value => typeof value === 'function' ||
    (typeof value === 'object' && typeof value.handler === 'function'),
  expected: 'function or object with "handler" function'
};

const assertTypes = {
  getters: functionAssert,
  mutations: functionAssert,
  actions: objectAssert
};

function assertRawModule (path, rawModule) {
  Object.keys(assertTypes).forEach(key => {
    if (!rawModule[key]) return

    const assertOptions = assertTypes[key];

    forEachValue(rawModule[key], (value, type) => {
      assert(
        assertOptions.assert(value),
        makeAssertionMessage(path, key, type, value, assertOptions.expected)
      );
    });
  });
}

function makeAssertionMessage (path, key, type, value, expected) {
  let buf = `${key} should be ${expected} but "${key}.${type}"`;
  if (path.length > 0) {
    buf += ` in module "${path.join('.')}"`;
  }
  buf += ` is ${JSON.stringify(value)}.`;
  return buf
}

let Vue; // bind on install

class Store {
  constructor (options = {}) {
    // 比如通过 script 标签引入的形式, 会自动执行 install 方法
    // Auto install if it is not done yet and `window` has `Vue`.
    // To allow users to avoid auto-installation in some cases,
    // this code should be placed here. See #731
    if (!Vue && typeof window !== 'undefined' && window.Vue) {
      install(window.Vue);
    }

    {
      assert(Vue, `must call Vue.use(Vuex) before creating a store instance.`);
      assert(typeof Promise !== 'undefined', `vuex requires a Promise polyfill in this browser.`);
      assert(this instanceof Store, `store must be called with the new operator.`);
    }

    const {
      // 插件默认是空数组
      plugins = [],
      // 严格模式默认是 false
      strict = false
    } = options;

    // store internal state
    
    // 一个开关, 用来判断严格模式下是否是用 mutation 修改 state
    // true: 允许在 mutation 中修改 state; false: 默认值, 严格模式下, 在 mutation 之外修改 state 会抛出异常
    this._committing = false;
    // 用来存放处理后的用户自定义的 actoins
    this._actions = Object.create(null);
    // 存放 actions 的订阅者
    this._actionSubscribers = [];
    // 用来存放处理后的用户自定义的 mutations
    this._mutations = Object.create(null);
    // 用来存放处理后的用户自定义的 getters
    this._wrappedGetters = Object.create(null);
    // module 收集器, 构造模块树形结构
    this._modules = new ModuleCollection(options);
    // 用于存储模块命名空间的关系
    this._modulesNamespaceMap = Object.create(null);
    // 存放订阅者
    this._subscribers = [];
    // 用于使用 $watch 观测 getters
    this._watcherVM = new Vue();
    // 用来存放生成的本地 getters 的缓存
    this._makeLocalGettersCache = Object.create(null);

    // bind commit and dispatch to self
    const store = this;
    const { dispatch, commit } = this;
    // 将 dispatch 与 commit 调用的 this 绑定为 store 对象本身,
    // 否则在组件内部 this.dispatch 时的 this 会指向组件的 vm ?

    this.dispatch = function boundDispatch (type, payload) {
      return dispatch.call(store, type, payload)
    };
    this.commit = function boundCommit (type, payload, options) {
      return commit.call(store, type, payload, options)
    };

    // 严格模式(使 Vuex store 进入严格模式, 在严格模式下, 任何 mutation 处理函数以外修改 Vuex state 都会抛出错误)
    // strict mode
    this.strict = strict;

    // 根模块的 state
    const state = this._modules.root.state;
    
    // 初始化 module.
    // 这将会递归地注册所有的 sub-modules, 并且收集所有 module 的 getters 到 _wrappedGetters 中去.
    // this._modules.root 代表根 module 独有保存的 module 对象
    
    // init root module.
    // this also recursively registers all sub-modules
    // and collects all module getters inside this._wrappedGetters
    installModule(this, state, [], this._modules.root);
    
    // 使用 Vue 内部的响应式将 state 转为响应式属性, 
    // 同时也将 _wrappedGetters 注册为 计算属性. 
    // initialize the store vm, which is responsible for the reactivity
    // (also registers _wrappedGetters as computed properties)
    resetStoreVM(this, state);

    // 应用插件
    // apply plugins
    plugins.forEach(plugin => plugin(this));

    // devtool 插件
    const useDevtools = options.devtools !== undefined ? options.devtools : Vue.config.devtools;
    if (useDevtools) {
      devtoolPlugin(this);
    }
  }

  get state () {
    return this._vm._data.$$state
  }

  set state (v) {
    {
      assert(false, `use store.replaceState() to explicit replace store state.`);
    }
  }

  // 调用 mutation 的 commit 方法
  commit (_type, _payload, _options) {
    // check object-style commit
    const {
      type,
      payload,
      options
    } = unifyObjectStyle(_type, _payload, _options);

    const mutation = { type, payload };
    // 取出 type 对应的 mutation 方法
    const entry = this._mutations[type];
    if (!entry) {
      {
        console.error(`[vuex] unknown mutation type: ${type}`);
      }
      return
    }

    // 执行 mutation 中的所有方法
    this._withCommit(() => {
      entry.forEach(function commitIterator (handler) {
        handler(payload);
      });
    });

    // 通知所有订阅者
    this._subscribers
      .slice() // shallow copy to prevent iterator invalidation if subscriber synchronously calls unsubscribe
      .forEach(sub => sub(mutation, this.state));

    if (
      
      options && options.silent
    ) {
      console.warn(
        `[vuex] mutation type: ${type}. Silent option has been removed. ` +
        'Use the filter functionality in the vue-devtools'
      );
    }
  }

  // 调用 action 的 dispatch 方法
  dispatch (_type, _payload) {
    // check object-style dispatch
    const {
      type,
      payload
    } = unifyObjectStyle(_type, _payload);

    const action = { type, payload };
    // actions 中取出 type 对应的 action
    const entry = this._actions[type];
    if (!entry) {
      {
        console.error(`[vuex] unknown action type: ${type}`);
      }
      return
    }

    try {
      // 通知所有订阅者 ( before )
      this._actionSubscribers
        .slice() // shallow copy to prevent iterator invalidation if subscriber synchronously calls unsubscribe
        .filter(sub => sub.before)
        .forEach(sub => sub.before(action, this.state));
    } catch (e) {
      {
        console.warn(`[vuex] error in before action subscribers: `);
        console.error(e);
      }
    }

    // 是数组则包装 Promise 形成一个新的 Promise, 只有一个则直接返回第0个
    const result = entry.length > 1
      ? Promise.all(entry.map(handler => handler(payload)))
      : entry[0](payload);

    return new Promise((resolve, reject) => {
      result.then(res => {
        try {
          // 通知所有订阅者 ( after )
          this._actionSubscribers
            .filter(sub => sub.after)
            .forEach(sub => sub.after(action, this.state));
        } catch (e) {
          {
            console.warn(`[vuex] error in after action subscribers: `);
            console.error(e);
          }
        }
        resolve(res);
      }, error => {
        try {
          // 通知订阅者中的 error 处理函数以捕获分发 action 的时候被抛出的错误
          this._actionSubscribers
            .filter(sub => sub.error)
            .forEach(sub => sub.error(action, this.state, error));
        } catch (e) {
          {
            console.warn(`[vuex] error in error action subscribers: `);
            console.error(e);
          }
        }
        reject(error);
      });
    })
  }

  // 订阅 mutation, 返回取消订阅的函数. 详情参看官方文档介绍
  subscribe (fn, options) {
    return genericSubscribe(fn, this._subscribers, options)
  }

  // 订阅 action
  subscribeAction (fn, options) {
    const subs = typeof fn === 'function' ? { before: fn } : fn;
    return genericSubscribe(subs, this._actionSubscribers, options)
  }

  // 观察一个 getter 方法. 这里用的是 vm.$watch api
  watch (getter, cb, options) {
    {
      assert(typeof getter === 'function', `store.watch only accepts a function.`);
    }
    return this._watcherVM.$watch(() => getter(this.state, this.getters), cb, options)
  }

  replaceState (state) {
    this._withCommit(() => {
      this._vm._data.$$state = state;
    });
  }

  // 注册一个动态 module，当业务进行异步加载的时候, 可以通过该接口进行注册动态 module
  registerModule (path, rawModule, options = {}) {
    // 转为数组
    if (typeof path === 'string') path = [path];

    {
      assert(Array.isArray(path), `module path must be a string or an Array.`);
      assert(path.length > 0, 'cannot register the root module by using registerModule.');
    }

    // 注册
    this._modules.register(path, rawModule);
    // 初始化 module
    installModule(this, this.state, path, this._modules.get(path), options.preserveState);
    // 通过 vm 重置 store
    // reset store to update getters...
    resetStoreVM(this, this.state);
  }

  // 注销一个动态module
  unregisterModule (path) {
    if (typeof path === 'string') path = [path];

    {
      assert(Array.isArray(path), `module path must be a string or an Array.`);
    }

    // 注销
    this._modules.unregister(path);
    this._withCommit(() => {
      // 获取父级的state
      const parentState = getNestedState(this.state, path.slice(0, -1));
      // 从父级中删除
      Vue.delete(parentState, path[path.length - 1]);
    });
    // 重置 store
    resetStore(this);
  }

  hasModule (path) {
    if (typeof path === 'string') path = [path];

    {
      assert(Array.isArray(path), `module path must be a string or an Array.`);
    }

    return this._modules.isRegistered(path)
  }

  hotUpdate (newOptions) {
    this._modules.update(newOptions);
    resetStore(this, true);
  }

  _withCommit (fn) {
    const committing = this._committing;
    this._committing = true;
    fn();
    this._committing = committing;
  }
}

function genericSubscribe (fn, subs, options) {
  if (subs.indexOf(fn) < 0) {
    // prepend 属性存在且为 true, 则将其添加到数组的最开始, 否则添加到末尾
    options && options.prepend
      ? subs.unshift(fn)
      : subs.push(fn);
  }
  // 返回 unsubscribe 函数, 用于卸载订阅
  return () => {
    const i = subs.indexOf(fn);
    if (i > -1) {
      subs.splice(i, 1);
    }
  }
}

// 重置 store
function resetStore (store, hot) {
  store._actions = Object.create(null);
  store._mutations = Object.create(null);
  store._wrappedGetters = Object.create(null);
  store._modulesNamespaceMap = Object.create(null);
  const state = store.state;
  // init all modules
  installModule(store, state, [], store._modules.root, true);
  // reset vm
  resetStoreVM(store, state, hot);
}

function resetStoreVM (store, state, hot) {
  // 存放之前的 vm 对象
  const oldVm = store._vm;

  // bind store public getters
  store.getters = {};
  // reset local getters cache
  store._makeLocalGettersCache = Object.create(null);
  const wrappedGetters = store._wrappedGetters;
  const computed = {};

  // 将对 store.getters.someProp 的访问代理到 store._vm.someProp, 即 Vue 实例的 computed 属性
  forEachValue(wrappedGetters, (fn, key) => {
    // use computed to leverage its lazy-caching mechanism
    // direct inline function use will lead to closure preserving oldVm.
    // using partial to return function with only arguments preserved in closure environment.
    computed[key] = partial(fn, store);
    Object.defineProperty(store.getters, key, {
      get: () => store._vm[key],
      enumerable: true // for local getters
    });
  });

  // 使用 Vue 将 state 转换为 `响应式`, 
  // use a Vue instance to store the state tree
  // suppress warnings just in case the user has added
  // some funky global mixins

  const silent = Vue.config.silent;
  // Vue.config.silent 暂时设置为true的目的是在new一个Vue实例的过程中不会报出一切警告
  Vue.config.silent = true;
  // 通过 new Vue() 的形式将 state 转换为响应式, 同时将 getters 转为 computed
  store._vm = new Vue({
    data: {
      $$state: state
    },
    // example: vm.$store.getters.userInfo -> vm.$store._vm.userInfo ( 计算属性 )
    computed
  });
  Vue.config.silent = silent;

  // enable strict mode for new vm
  if (store.strict) {
    // 开启严格模式后, 在 mutation 之外修改 state 会抛出异常.
    enableStrictMode(store);
  }

  if (oldVm) {
    // 解除旧 vm 的 state 的引用, 以及销毁旧的 Vue 对象
    if (hot) {
      // dispatch changes in all subscribed watchers
      // to force getter re-evaluation for hot reloading.
      store._withCommit(() => {
        oldVm._data.$$state = null;
      });
    }
    Vue.nextTick(() => oldVm.$destroy());
  }
}

function installModule (store, rootState, path, module, hot) {
  // 是否是根 module
  const isRoot = !path.length;
  // 获取 module 的命名空间
  const namespace = store._modules.getNamespace(path);

  // 如果有 namespace 则在 _modulesNamespaceMap 中注册
  // register in namespace map
  if (module.namespaced) {
    if (store._modulesNamespaceMap[namespace] && true) {
      console.error(`[vuex] duplicate namespace ${namespace} for the namespaced module ${path.join('/')}`);
    }
    store._modulesNamespaceMap[namespace] = module;
  }

  // set state
  if (!isRoot && !hot) {
    const parentState = getNestedState(rootState, path.slice(0, -1));
    const moduleName = path[path.length - 1];
    store._withCommit(() => {
      {
        if (moduleName in parentState) {
          console.warn(
            `[vuex] state field "${moduleName}" was overridden by a module with the same name at "${path.join('.')}"`
          );
        }
      }
      Vue.set(parentState, moduleName, module.state);
    });
  }

  const local = module.context = makeLocalContext(store, namespace, path);

  // 遍历注册 mutations
  module.forEachMutation((mutation, key) => {
    const namespacedType = namespace + key;
    registerMutation(store, namespacedType, mutation, local);
  });

  // 遍历注册 actions
  module.forEachAction((action, key) => {
    const type = action.root ? key : namespace + key;
    const handler = action.handler || action;
    registerAction(store, type, handler, local);
  });

  // 遍历注册 getters
  module.forEachGetter((getter, key) => {
    const namespacedType = namespace + key;
    registerGetter(store, namespacedType, getter, local);
  });

  // 递归安装 module
  module.forEachChild((child, key) => {
    installModule(store, rootState, path.concat(key), child, hot);
  });
}

/**
 * make localized dispatch, commit, getters and state
 * if there is no namespace, just use root ones
 */
function makeLocalContext (store, namespace, path) {
  const noNamespace = namespace === '';

  const local = {
    dispatch: noNamespace ? store.dispatch : (_type, _payload, _options) => {
      const args = unifyObjectStyle(_type, _payload, _options);
      const { payload, options } = args;
      let { type } = args;

      if (!options || !options.root) {
        type = namespace + type;
        if ( !store._actions[type]) {
          console.error(`[vuex] unknown local action type: ${args.type}, global type: ${type}`);
          return
        }
      }

      return store.dispatch(type, payload)
    },

    commit: noNamespace ? store.commit : (_type, _payload, _options) => {
      const args = unifyObjectStyle(_type, _payload, _options);
      const { payload, options } = args;
      let { type } = args;

      if (!options || !options.root) {
        type = namespace + type;
        if ( !store._mutations[type]) {
          console.error(`[vuex] unknown local mutation type: ${args.type}, global type: ${type}`);
          return
        }
      }

      store.commit(type, payload, options);
    }
  };

  // getters and state object must be gotten lazily
  // because they will be changed by vm update
  Object.defineProperties(local, {
    getters: {
      get: noNamespace
        ? () => store.getters
        : () => makeLocalGetters(store, namespace)
    },
    state: {
      get: () => getNestedState(store.state, path)
    }
  });

  return local
}

function makeLocalGetters (store, namespace) {
  if (!store._makeLocalGettersCache[namespace]) {
    const gettersProxy = {};
    const splitPos = namespace.length;
    Object.keys(store.getters).forEach(type => {
      // skip if the target getter is not match this namespace
      if (type.slice(0, splitPos) !== namespace) return

      // extract local getter type
      const localType = type.slice(splitPos);

      // Add a port to the getters proxy.
      // Define as getter property because
      // we do not want to evaluate the getters in this time.
      Object.defineProperty(gettersProxy, localType, {
        get: () => store.getters[type],
        enumerable: true
      });
    });
    store._makeLocalGettersCache[namespace] = gettersProxy;
  }

  return store._makeLocalGettersCache[namespace]
}

function registerMutation (store, type, handler, local) {
  const entry = store._mutations[type] || (store._mutations[type] = []);
  entry.push(function wrappedMutationHandler (payload) {
    handler.call(store, local.state, payload);
  });
}

// 注册 action
function registerAction (store, type, handler, local) {
  // 取出 type 对应的 actions (数组)
  const entry = store._actions[type] || (store._actions[type] = []);
  // 对 handler 处理函数进行包装
  entry.push(function wrappedActionHandler (payload) {
    let res = handler.call(store, {
      dispatch: local.dispatch,
      commit: local.commit,
      getters: local.getters,
      state: local.state,
      rootGetters: store.getters,
      rootState: store.state
    }, payload);
    // 判断是否是 Promise
    if (!isPromise(res)) {
      // 不是 Promise 则将其转为 Promise
      res = Promise.resolve(res);
    }
    if (store._devtoolHook) {
      // 存在 devtool 插件时, emit vuex:error 事件给 devtool
      return res.catch(err => {
        store._devtoolHook.emit('vuex:error', err);
        throw err
      })
    } else {
      return res
    }
  });
}

function registerGetter (store, type, rawGetter, local) {
  if (store._wrappedGetters[type]) {
    {
      console.error(`[vuex] duplicate getter key: ${type}`);
    }
    return
  }
  store._wrappedGetters[type] = function wrappedGetter (store) {
    return rawGetter(
      local.state, // local state
      local.getters, // local getters
      store.state, // root state
      store.getters // root getters
    )
  };
}

// 深度监听严格模式下 state 的修改, 在 mutation 修改 state 会抛出异常
function enableStrictMode (store) {
  store._vm.$watch(function () { return this._data.$$state }, () => {
    {
      assert(store._committing, `do not mutate vuex store state outside mutation handlers.`);
    }
  }, { deep: true, sync: true });
}

function getNestedState (state, path) {
  return path.reduce((state, key) => state[key], state)
}

function unifyObjectStyle (type, payload, options) {
  if (isObject(type) && type.type) {
    options = payload;
    payload = type;
    type = type.type;
  }

  {
    assert(typeof type === 'string', `expects string as the type, but found ${typeof type}.`);
  }

  return { type, payload, options }
}

// Vuex 插件的 install 方法, 供 Vue.use 调用安装插件
function install (_Vue) {
  // 避免重复安装
  if (Vue && _Vue === Vue) {
    {
      console.error(
        '[vuex] already installed. Vue.use(Vuex) should be called only once.'
      );
    }
    return
  }
  Vue = _Vue;
  // 将 vuexInit 方法混入(mixin)到 Vue 的 beforeCreate 钩子(Vue2.x) 或 _init 方法(Vue1.x)
  applyMixin(Vue);
}

/**
 * Reduce the code which written in Vue.js for getting the state.
 * @param {String} [namespace] - Module's namespace
 * @param {Object|Array} states # Object's item can be a function which accept state and getters for param, you can do something for state and getters in it.
 * @param {Object}
 * @example
 * 
 * computed: {
 *   // 使用方法一, 简写( 当映射的计算属性的名称与 state 的子节点名称相同时 ): 
 *   ...mapState(['userId', 'siteId'])
 * 
 *   // 使用方法二:
 *   ...mapState({
 *     uid: state => state.userId,
 *   })
 * }
 */
const mapState = normalizeNamespace((namespace, states) => {
  /**
   * 保存 key 到 fn 的映射结果, 最终会被注入到 Vue 的 computed 中
   * example:
   * 
   * res = {
   *   userId: function mappedState() {
   *     // ... 
   *   }
   * }
   */
  const res = {};
  if ( !isValidMap(states)) {
    console.error('[vuex] mapState: mapper parameter must be either an Array or an Object');
  }

  normalizeMap(states).forEach(({ key, val }) => {
    res[key] = function mappedState () {
      // this 指 vm 实例
      let state = this.$store.state;
      let getters = this.$store.getters;
      if (namespace) {
        const module = getModuleByNamespace(this.$store, 'mapState', namespace);
        if (!module) {
          return
        }
        state = module.context.state;
        getters = module.context.getters;
      }
      return typeof val === 'function'
        ? val.call(this, state, getters)
        : state[val]
    };
    // mark vuex getter for devtools
    res[key].vuex = true;
  });
  return res
});

/**
 * 将组件中的 methods 映射为 store.commit 调用
 * 
 * Reduce the code which written in Vue.js for committing the mutation
 * @param {String} [namespace] - Module's namespace
 * @param {Object|Array} mutations # Object's item can be a function which accept `commit` function as the first param, it can accept another params. You can commit mutation and do any other things in this function. specially, You need to pass anthor params from the mapped function.
 * @return {Object}
 * @example
 * 
 * methods: {
 *   ...mapMutations(['increment']), // 将 this.increment 映射为 this.$store.commit('increment')
 *   // or 
 *   ...mapMutations({
 *     add: 'increment', // 将 this.add 映射为 this.$store.commit('increment')
 *   })
 * }
 */
const mapMutations = normalizeNamespace((namespace, mutations) => {
  const res = {};
  if ( !isValidMap(mutations)) {
    console.error('[vuex] mapMutations: mapper parameter must be either an Array or an Object');
  }
  normalizeMap(mutations).forEach(({ key, val }) => {
    res[key] = function mappedMutation (...args) {
      // Get the commit method from store
      let commit = this.$store.commit;
      if (namespace) {
        const module = getModuleByNamespace(this.$store, 'mapMutations', namespace);
        if (!module) {
          return
        }
        commit = module.context.commit;
      }
      return typeof val === 'function'
        ? val.apply(this, [commit].concat(args))
        : commit.apply(this.$store, [val].concat(args))
    };
  });
  return res
});

/**
 * Reduce the code which written in Vue.js for getting the getters
 * @param {String} [namespace] - Module's namespace
 * @param {Object|Array} getters
 * @return {Object}
 */
const mapGetters = normalizeNamespace((namespace, getters) => {
  const res = {};
  if ( !isValidMap(getters)) {
    console.error('[vuex] mapGetters: mapper parameter must be either an Array or an Object');
  }
  normalizeMap(getters).forEach(({ key, val }) => {
    // The namespace has been mutated by normalizeNamespace
    val = namespace + val;
    res[key] = function mappedGetter () {
      if (namespace && !getModuleByNamespace(this.$store, 'mapGetters', namespace)) {
        return
      }
      if ( !(val in this.$store.getters)) {
        console.error(`[vuex] unknown getter: ${val}`);
        return
      }
      return this.$store.getters[val]
    };
    // mark vuex getter for devtools
    res[key].vuex = true;
  });
  return res
});

/**
 * Reduce the code which written in Vue.js for dispatch the action
 * @param {String} [namespace] - Module's namespace
 * @param {Object|Array} actions # Object's item can be a function which accept `dispatch` function as the first param, it can accept anthor params. You can dispatch action and do any other things in this function. specially, You need to pass anthor params from the mapped function.
 * @return {Object}
 */
const mapActions = normalizeNamespace((namespace, actions) => {
  const res = {};
  if ( !isValidMap(actions)) {
    console.error('[vuex] mapActions: mapper parameter must be either an Array or an Object');
  }
  normalizeMap(actions).forEach(({ key, val }) => {
    res[key] = function mappedAction (...args) {
      // get dispatch function from store
      let dispatch = this.$store.dispatch;
      if (namespace) {
        const module = getModuleByNamespace(this.$store, 'mapActions', namespace);
        if (!module) {
          return
        }
        dispatch = module.context.dispatch;
      }
      return typeof val === 'function'
        ? val.apply(this, [dispatch].concat(args))
        : dispatch.apply(this.$store, [val].concat(args))
    };
  });
  return res
});

/**
 * Rebinding namespace param for mapXXX function in special scoped, and return them by simple object
 * @param {String} namespace
 * @return {Object}
 */
const createNamespacedHelpers = (namespace) => ({
  mapState: mapState.bind(null, namespace),
  mapGetters: mapGetters.bind(null, namespace),
  mapMutations: mapMutations.bind(null, namespace),
  mapActions: mapActions.bind(null, namespace)
});

/**
 * Normalize the map
 * normalizeMap([1, 2, 3]) => [ { key: 1, val: 1 }, { key: 2, val: 2 }, { key: 3, val: 3 } ]
 * normalizeMap({a: 1, b: 2, c: 3}) => [ { key: 'a', val: 1 }, { key: 'b', val: 2 }, { key: 'c', val: 3 } ]
 * @param {Array|Object} map
 * @return {Object}
 */
function normalizeMap (map) {
  if (!isValidMap(map)) {
    return []
  }
  return Array.isArray(map)
    ? map.map(key => ({ key, val: key }))
    : Object.keys(map).map(key => ({ key, val: map[key] }))
}

/**
 * Validate whether given map is valid or not
 * @param {*} map
 * @return {Boolean}
 */
function isValidMap (map) {
  return Array.isArray(map) || isObject(map)
}

/**
 * Return a function expect two param contains namespace and map. it will normalize the namespace and then the param's function will handle the new namespace and the map.
 * @param {Function} fn
 * @return {Function}
 */
function normalizeNamespace (fn) {
  return (namespace, map) => {
    if (typeof namespace !== 'string') {
      map = namespace;
      namespace = '';
    } else if (namespace.charAt(namespace.length - 1) !== '/') {
      namespace += '/';
    }
    return fn(namespace, map)
  }
}

/**
 * Search a special module from store by namespace. if module not exist, print error message.
 * @param {Object} store
 * @param {String} helper
 * @param {String} namespace
 * @return {Object}
 */
function getModuleByNamespace (store, helper, namespace) {
  const module = store._modulesNamespaceMap[namespace];
  if ( !module) {
    console.error(`[vuex] module namespace not found in ${helper}(): ${namespace}`);
  }
  return module
}

// Credits: borrowed code from fcomb/redux-logger

function createLogger ({
  collapsed = true,
  filter = (mutation, stateBefore, stateAfter) => true,
  transformer = state => state,
  mutationTransformer = mut => mut,
  actionFilter = (action, state) => true,
  actionTransformer = act => act,
  logMutations = true,
  logActions = true,
  logger = console
} = {}) {
  return store => {
    let prevState = deepCopy(store.state);

    if (typeof logger === 'undefined') {
      return
    }

    if (logMutations) {
      store.subscribe((mutation, state) => {
        const nextState = deepCopy(state);

        if (filter(mutation, prevState, nextState)) {
          const formattedTime = getFormattedTime();
          const formattedMutation = mutationTransformer(mutation);
          const message = `mutation ${mutation.type}${formattedTime}`;

          startMessage(logger, message, collapsed);
          logger.log('%c prev state', 'color: #9E9E9E; font-weight: bold', transformer(prevState));
          logger.log('%c mutation', 'color: #03A9F4; font-weight: bold', formattedMutation);
          logger.log('%c next state', 'color: #4CAF50; font-weight: bold', transformer(nextState));
          endMessage(logger);
        }

        prevState = nextState;
      });
    }

    if (logActions) {
      store.subscribeAction((action, state) => {
        if (actionFilter(action, state)) {
          const formattedTime = getFormattedTime();
          const formattedAction = actionTransformer(action);
          const message = `action ${action.type}${formattedTime}`;

          startMessage(logger, message, collapsed);
          logger.log('%c action', 'color: #03A9F4; font-weight: bold', formattedAction);
          endMessage(logger);
        }
      });
    }
  }
}

function startMessage (logger, message, collapsed) {
  const startMessage = collapsed
    ? logger.groupCollapsed
    : logger.group;

  // render
  try {
    startMessage.call(logger, message);
  } catch (e) {
    logger.log(message);
  }
}

function endMessage (logger) {
  try {
    logger.groupEnd();
  } catch (e) {
    logger.log('—— log end ——');
  }
}

function getFormattedTime () {
  const time = new Date();
  return ` @ ${pad(time.getHours(), 2)}:${pad(time.getMinutes(), 2)}:${pad(time.getSeconds(), 2)}.${pad(time.getMilliseconds(), 3)}`
}

function repeat (str, times) {
  return (new Array(times + 1)).join(str)
}

function pad (num, maxLength) {
  return repeat('0', maxLength - num.toString().length) + num
}

var index = {
  Store,
  install,
  version: '3.6.2',
  mapState,
  mapMutations,
  mapGetters,
  mapActions,
  createNamespacedHelpers,
  createLogger
};

export default index;
export { Store, createLogger, createNamespacedHelpers, install, mapActions, mapGetters, mapMutations, mapState };
//# sourceMappingURL=vuex.esm.browser.js.map
