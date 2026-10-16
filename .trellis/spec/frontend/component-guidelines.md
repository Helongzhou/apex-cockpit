# 组件约定

> 本项目只有 6 个组件，全部是"展示 + 把事件转成命令"，不含业务逻辑。

---

## 1. 组件清单与职责

| 组件 | 文件 | 输入 | 输出 |
|---|---|---|---|
| `App` | `src/ui/App.tsx` | `store`、`host`、`options`（确定性回归用） | 组合 DOM 顺序 + 启动游戏 + 卸载时 `disposeGame()` |
| `InfoPanel` | `src/ui/InfoPanel.tsx` | `store`、`isTouchDevice` | 车辆数据 / 统计面板，F12 与 `` ` `` 切换 |
| `FpsBadge` | `src/ui/FpsBadge.tsx` | `store` | `NN FPS`，低于 30 加 `low` 类 |
| `DesktopControls` | `src/ui/DesktopControls.tsx` | `isTouchDevice` | 按键提示与高亮 |
| `MobileControls` | `src/ui/MobileControls.tsx` | `host`、`isTouchDevice` | 摇杆 + 4 个动作按钮，写 `host.touchControls` / 调 `host.resetGame()` |
| `RuntimeOverlay` | `src/ui/RuntimeOverlay.tsx` | `store` | loading / fatal / context-lost 状态与重试按钮 |

---

## 2. 约定

1. **依赖注入，不用 Context**：需要状态的组件显式接收 `store`（读）或 `host`（写）。项目规模小，Context 只会增加间接层。
2. **DOM 顺序即布局顺序**：`App` 里的顺序（面板 → FPS → canvas → 控件 → 覆盖层）与上游 `index.html` 一致，CSS 依赖这个顺序。
3. **类名必须与 CSS 对齐**：迁移类任务中，类名和 DOM 结构逐字保留（`git diff --stat -- css/` 为空即为证据）。
4. **`className` 拼接用模板字符串显式表达状态**，例如：

```tsx
const panelClass = (side: string) =>
    `panel panel-${side}${debugVisible ? ' visible' : ''}${isHidden ? ' hidden' : ''}`;
```

5. **面板开关是两阶段动画**：先切 `visible`，400 ms 后再切 `hidden`（`display: none`），与上游 Vue 实现一致；用 `useRef` 保存可见性镜像，避免 `keydown` 监听器随状态重注册。
6. **只用 `useState` / `useEffect` / `useRef` / `useSyncExternalStore`**，没有引入状态库或样式方案。
7. **无障碍**：状态覆盖层用 `role="status"`；按钮用真实 `<button>`（`debug-button`、`hide-button`、`runtime-retry`）。

---

## 3. 反模式

- ❌ 在组件里直接 `import` 游戏模块 → 会把 three/Rapier 拖回首屏（必须经 `src/game-bridge.ts` 动态导入）。
- ❌ 在组件里读 `renderer` / `session` 等游戏对象 → 游戏对象只存在于 `game/`。
- ❌ 为高频输入加 `useState`（摇杆位移走 DOM 直写，见 `state-management.md`）。
- ❌ 新增内联样式；除上游已有的 1 处（`<h3 style={{ color: '#a78bfa' }}>`）外，样式一律写在 `css/`。
