# 状态管理约定

> 本项目**没有**引入 Redux/Zustand/MobX。状态按"变化频率 + 谁需要读"分成三类，边界清晰。

---

## 1. 三类状态（以及第四类：不属于 React 的状态）

| 类别 | 存放位置 | 更新频率 | 读取方式 | 真实例子 |
|---|---|---|---|---|
| **跨层共享状态** | `src/state.ts` 的薄 store（深层响应式 Proxy） | 20 Hz（遥测节流） | `useGameState(store)` → `useSyncExternalStore` | `speed`、`position`、`rotation`、`knockedBoxes`、`runtime.phase` |
| **组件本地状态** | `useState` | 事件驱动（低频） | 直接读 | `DesktopControls` 的按键高亮、`InfoPanel` 的 `debugVisible` / `isHidden` |
| **高频输入（不进 React）** | 直接写 DOM + 写 store 字段 | 每个 pointermove | `ref.current.style.transform` | `MobileControls` 的摇杆位移 |
| **游戏运行时状态** | `game/` 模块内部（`session`、`world`、`car`） | 每帧 | 不暴露给 UI，只通过 `GameHost` 输出结果 | Rapier world、相机、composer |

---

## 2. 接缝：`GameHost`

`game/types.ts` 定义 `GameHost` 接口，`src/state.ts` 的 store 状态就是它的实现，`game/` 侧只把它当作普通对象读写：

```ts
// game 侧写（不 import React）
host.speed = kmh;
host.runtime.phase = 'fatal';

// UI 侧读（订阅变更）
const { speed } = useGameState(store);
```

- 游戏层是**写入方**，UI 是**读取方 + 命令发起方**（`host.resetGame()` / `host.retry()` / `host.toggleView()`）。
- 命令实现挂在 `src/app.ts` 的 `createGameHost()` 里，反向依赖通过 `loadGame()` 动态导入游戏模块。

---

## 3. 为什么遥测走 store，而摇杆不走

- **store 的写入门槛是"人眼可感知的变化"**：遥测本身已按 20 Hz 节流（`game/telemetry.ts`），且 store 只在 `Object.is` 判定真的变化时才通知（与 Vue 的 `hasChanged` 语义一致）。
- **每帧变化的值一律不进 React**：摇杆位移、相机插值、物理步进都直接在 `game/` 或 DOM 上完成。React 的协调开销在 60 fps 下不可接受，这是上游 Vue 版本就已经确立的性能约定。
- 帧率例外：`fps` 每秒只写一次，进 store 没有压力。

---

## 4. 订阅约定

```ts
// src/hooks/useGameState.ts
export function useGameState(store: Store<GameHost>): GameHost {
    return useSyncExternalStore(store.subscribe, store.getVersion, store.getVersion);
}
```

- 只暴露"读整个 host + 版本号"这一种形态：组件拿到的永远是当前快照，避免选择器造成的订阅碎片化。
- `store.getVersion()` 只增不减，且**只反映状态是否真的变化**；`unsubscribe` 后版本仍会因状态变化而增长（版本号描述状态，不描述订阅者数量），这一点由 `tests/state.test.ts` 固定。

---

## 5. 常见错误（本项目真实踩过/差点踩到）

1. **把每帧变化的量塞进 store**：会让 React 每帧重渲染，直接吃掉帧率预算。
2. **在 `game/` 里 import React 的 hook**：破坏分层（`grep` 门禁会拦住）。
3. **在组件卸载时忘记退订 / 忘移监听器**：`game/listeners.ts` 是所有 DOM 监听器的唯一入口，必须用返回的 handle 释放；`window.__listenerCount().active` 是它的守门断言（20 次重置后必须回到基线）。
4. **把游戏对象（world / mesh）放进 store**：Proxy 会深度包装它们，既拖慢访问，又让 three 内部的 `isMesh` 等身份判断失效。store 里只放纯数据。
