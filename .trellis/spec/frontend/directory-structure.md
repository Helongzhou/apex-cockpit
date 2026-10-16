# 目录结构与分层约定

> 本文件描述**当前代码的真实约定**，不是理想设计。每条规则都给出可验证的路径。

---

## 1. 顶层树

```
├── index.html              # 唯一 HTML 入口，只留 <div id="app"> 与 /src/main.tsx
├── css/                    # 手写样式，5 个原样沿用 + 1 个新增（runtime-overlay.css）
├── game/                   # 框架无关的游戏层：Three.js + Rapier，禁止 import React
│   ├── math/               # 纯函数（无 three/Rapier/DOM 依赖，单测直接覆盖）
│   ├── models/car.glb      # 静态资产，经 `?url` 导入（否则不会进 dist/）
│   └── *.ts                # 会话、物理、渲染、输入、遥测、加载、错误边界
├── src/                    # React 外壳
│   ├── state.ts            # 唯一的跨层接缝（薄 store）
│   ├── app.ts              # 初始状态 + 命令接线（resetGame / toggleView / retry）
│   ├── game-bridge.ts      # 游戏模块图的动态导入（首屏瘦身）
│   ├── hooks/              # 自定义 hooks
│   ├── ui/                 # 组件，一个组件一个文件
│   └── dev/                # 仅开发/回归用的接线（确定性 harness）
├── scripts/                # 可执行的验证脚本（浏览器自动化 + 预算测量）
├── tests/                  # vitest 单测，文件名与被测模块同名
├── docs/                   # 分析报告、迭代计划、外部事实核验
└── .trellis/               # 任务、规范、工作流（本文件所在处）
```

---

## 2. 分层规则（可验证）

| 规则 | 理由 | 验证方式 |
|---|---|---|
| `game/` **不得** import `react`/`react-dom` | 游戏层要能脱离 UI 独立测试与复用（也便于将来换 UI 框架） | `grep -rn "from 'react" game/` 必须无输出 |
| `src/state.ts` 是唯一的跨层数据接缝 | `game/` 只认识 `GameHost` 接口（`game/types.ts`），不认识组件 | `grep -rn "from '../src\|from '../../src" game/` 必须无输出 |
| 纯计算放 `game/math/`，且不得依赖 three / Rapier / DOM | 可被 node 环境的 vitest 直接加载（Rapier 的 wasm 在 node 里无法 import） | `tests/*.test.ts` 直接 import `game/math/*`，无需 mock |
| 静态资产必须经打包器导入 | 直接写相对路径字符串不会进 `dist/` | `game/car-model.ts:9` 的 `import CAR_MODEL_URL from './models/car.glb?url'` |
| 测试文件名与被测模块同名 | 便于反查覆盖关系 | `tests/vehicle-math.test.ts` ↔ `game/math/vehicle-math.ts` |
| 一次性验证逻辑放 `scripts/`，不进 `game/` | 回归脚本要在浏览器里跑真实产物，不应进入运行时包 | `scripts/{ui-smoke,stability-check,compare-deterministic,measure-budget}.mjs` |

---

## 3. 允许的例外

- `src/app.ts` 会 import `game/math/input-mapping.js` 复用 `NO_DIRECTION` 常量：方向占位符必须与游戏层一致，重复定义会产生漂移。
- `game/listeners.ts` 在模块末尾挂 `window.__listenerCount`：这是**有意的**调试/断言接缝（AC2.5 依赖它），成本只有一行，无副作用。
- `game/three-game.ts` 暴露 `window.__APEX_STATS` 与 `window.__APEX_INJECT_FRAME_ERROR`：前者供预算与性能面板使用，后者是唯一能验证渲染循环错误边界的手段（见 `scripts/stability-check.mjs`）。

---

## 4. 命名与文件

- 模块文件名：`kebab-case`（`follow-camera.ts`、`physics-stepper.ts`）。
- 组件文件：`PascalCase.tsx`（`InfoPanel.tsx`、`RuntimeOverlay.tsx`）。
- 导出：优先具名导出，当前全部为具名导出，保持一致。
- CSS 类名与上游保持一致（迁移类任务不得改类名，见 `quality-guidelines.md`）。
