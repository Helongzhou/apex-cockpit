# Hook 约定

> 目前只有两个自定义 hook。它们是本项目里 React 与"非 React 世界"相接的全部位置。

---

## 1. 现状

| Hook | 文件 | 作用 | 关键点 |
|---|---|---|---|
| `useGameState` | `src/hooks/useGameState.ts` | 订阅 store 并返回 `GameHost` 快照 | `useSyncExternalStore(store.subscribe, store.getVersion, store.getVersion)`，第三个参数保证首次渲染一致 |
| `useTouchDevice` | `src/hooks/useTouchDevice.ts` | 设备形态探测（能力查询 + 首次真实输入纠偏） | 用 `matchMedia('(hover: none) and (pointer: coarse)')` 与 `(any-hover: hover)` 组合；`touchstart` / `mousedown` 首次触发时切换模式 |

---

## 2. 约定

1. **所有 DOM 监听器必须经 `game/listeners.ts` 的 `listen()` 注册**，并在 effect cleanup 里 `releaseAll()`。这样 `window.__listenerCount()` 才能证明"注册数 == 注销数"。
2. **effect 依赖要收敛到稳定值**：`useTouchDevice(host)` 的依赖是 `[host]`（store 的 state 对象自始至终是同一个 Proxy），因此只注册一次。
3. **不在 effect 里做逐帧工作**：逐帧逻辑属于 `game/` 的渲染循环；hook 只做"接线"和"清理"。
4. **异步初始化要能取消**：`App` 的启动 effect 用 `disposed` 标志防止"chunk 加载完成后组件已卸载"的竞态（`src/ui/App.tsx`）。
5. **不在 hook 里持有游戏对象**：hook 只接触 `store` / `host` / DOM。

---

## 3. 反模式

- ❌ 用 `useEffect` + `setState` 同步每帧数据（会把渲染频率与帧率绑定）。
- ❌ 忘记 cleanup，或用 `AbortController` 之外的第三种释放方式（项目统一走 `listen()`）。
- ❌ 在 hook 内静态 `import` 游戏模块（必须走 `src/game-bridge.ts` 的动态导入，否则首屏重新变大）。
