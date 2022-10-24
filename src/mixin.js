export default function (Vue) {
  const version = Number(Vue.version.split('.')[0])

  // 将 vuexInit 方法混入(mixin)到 Vue 的 beforeCreate 钩子(Vue2.x) 或 _init 方法(Vue1.x)

  if (version >= 2) {
    Vue.mixin({ beforeCreate: vuexInit })
  } else {
    // 重写 _init 方法
    // override init and inject vuex init procedure
    // for 1.x backwards compatibility.
    const _init = Vue.prototype._init
    Vue.prototype._init = function (options = {}) {
      options.init = options.init
        ? [vuexInit].concat(options.init)
        : vuexInit
      _init.call(this, options)
    }
  }

  /**
   * Vuex的init钩子, 会注入到每一个Vue实例的 beforeCreate 钩子中列表中
   * beforeCreate 生命周期钩子执行时, $store 会被注入到对应的Vue实例中, 即 vm.$store
   * Vuex init hook, injected into each instances init hooks list.
   */
  function vuexInit () {
    const options = this.$options
    // store injection
    if (options.store) {
      // 存在store其实代表的就是Root节点, 直接执行store（function时）或者使用store（非function）
      this.$store = typeof options.store === 'function'
        ? options.store()
        : options.store
    } else if (options.parent && options.parent.$store) {
      // 子组件(VueComponent实例)直接从父组件(Vue实例)中获取$store, 这样就保证了所有组件都共用了全局的同一份store
      this.$store = options.parent.$store
    }
  }
}
