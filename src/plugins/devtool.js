// Browser / NodeJS / ...
const target = typeof window !== 'undefined'
  ? window
  : typeof global !== 'undefined'
    ? global
    : {}

// 如果安装了 Vue.js devtools 插件, 则会在 window 对象上暴露一个 VUE_DEVTOOLS_GLOBAL_HOOK
// 从全局对象中(比如 window)获取 __VUE_DEVTOOLS_GLOBAL_HOOK__ 插件
const devtoolHook = target.__VUE_DEVTOOLS_GLOBAL_HOOK__

export default function devtoolPlugin (store) {
  if (!devtoolHook) return

  store._devtoolHook = devtoolHook

  // 触发 vuex 的 'vuex:init' 事件, 并将 store 传递给 deltool 插件, 使插件获取 store 的实例
  devtoolHook.emit('vuex:init', store)

  // 订阅 vuex 的 'vuex:travel-to-state' 事件
  devtoolHook.on('vuex:travel-to-state', targetState => {
    store.replaceState(targetState)
  })

  // 订阅 state 的变化
  store.subscribe((mutation, state) => {
    console.log('vuex:mutation')
    devtoolHook.emit('vuex:mutation', mutation, state)
  }, { prepend: true })

  // 订阅 action 
  store.subscribeAction((action, state) => {
    devtoolHook.emit('vuex:action', action, state)
  }, { prepend: true })
}
