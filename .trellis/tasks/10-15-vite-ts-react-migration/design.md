# C1 · Technical Design

## 1. 目标目录结构

```
apex-cockpit/
├── index.html              # 仅保留 <div id="app"> + <script type="module" src="/src/main.tsx">
├── package.json            # 真实依赖 + dev/build/typecheck/test 脚本
├── tsconfig.json           # strict
├── vite.config.ts          # base: './'（静态托管友好）+ react 插件
├── src/
│   ├── main.tsx            # 引导：建 store → 挂 React → initializeGame(host)
│   ├── state.ts            # 薄 store（getSnapshot/subscribe/patch），game 与 UI 的唯一接缝
│   ├── hooks/
│   │   ├── useGameState.ts # useSyncExternalStore 封装
│   │   └── useTouchDevice.ts
│   └── ui/
│       ├── App.tsx
│       ├── InfoPanel.tsx / DesktopControls.tsx / MobileControls.tsx / FpsBadge.tsx
├── game/                   # 13 个 .ts，框架无关
│   ├── three-game.ts       # 组合根（本任务仅改类型 + 由 src/main.tsx 调用）
│   ├── game-session.ts / rendering.ts / car.ts / car-model.ts / car-lights.ts
│   ├── world.ts / physics-world.ts / controls.ts / telemetry.ts / follow-camera.ts
│   ├── color.ts / fps-meter.ts
│   └── models/car.glb
├── css/                    # 原样复用（5 文件 539 行）
└── docs/ .trellis/ ...     # 不动
```

Vue 相关文件在迁移完成后删除：`vue-app.js`、`components/*.js`（内容迁移进 `src/ui/`）。

## 2. 依赖清单（版本经实测核实）

| 包 | 版本 | 依据 |
|---|---|---|
| `three` | `0.185.1`（与现 CDN 版本一致） | `index.html:13` |
| `@types/three` | `0.185.4` | **实测 three@0.185.1 发布包内 0 个 `.d.ts`**，必须外挂类型；0.185.x 存在，避免与 0.186 版 skew |
| `@dimforge/rapier3d-compat` | `0.20.0` | 自带 `dist/rapier.d.ts`，无需 @types |
| `react` / `react-dom` | 19.x | JD 与简历主栈一致；`@types/react` / `@types/react-dom` 同版本 |
| `vite` / `@vitejs/plugin-react` | 7.x / 最新 | 本机 node v22.22.3 满足 Vite 7 的 Node ≥22.12 |
| `typescript` | 5.x | strict |
| `vitest` | 最新 | C4 使用；本任务只装不写用例 |

删除：`vue`（全局构建，无 npm 依赖）、import map。

## 3. 接缝契约（本设计最关键的一条）

**问题**：迁移前 `Telemetry` 每帧直写 `vueApp.speed` 等响应式字段（`game/telemetry.js:63-68`），`CarControls` 读 `vueApp.touchControls`（`controls.js:101`）并直接调 `vueApp.resetGame()`（`controls.js:56`）。迁移后必须保留该数据流形状（否则 AC1.3 的行为一致性无从谈起），但不能让 `game/` 依赖 React。

**方案**：`src/state.ts` 导出一个**无框架依赖**的薄 store：

```ts
export type GameState = { speed: number; position: {x:number;y:number;z:number}; rotation: number;
  direction: string; collisions: number; knockedBoxes: number; maxSpeed: number; raceTime: number;
  isRacing: boolean; fps: number; isTouchDevice: boolean;
  touchControls: { forward:boolean; backward:boolean; left:boolean; right:boolean; brake:boolean; jump:boolean };
  boxesStatus: { knocked: boolean }[] };

export function createStore(initial: GameState): {
  getSnapshot(): GameState;            // 同一引用直到 mutate
  patch(partial: Partial<GameState>): void;
  subscribe(listener: () => void): () => void;
};
```

- **game 侧**：`initializeGame(host)` 接收的 `host` 就是 store（及 `resetGame` 回调集合），字段名与今天完全一致 → `telemetry.ts` / `controls.ts` 的改动仅为"把 `vueApp` 换成 `host`"，**逻辑零改动**。
- **UI 侧**：`useGameState()` = `useSyncExternalStore(store.subscribe, store.getSnapshot)`。
- **写入粒度**：保持现状（`telemetry` 20 Hz 写、`controls` 每帧写 `direction`），**本任务不引入不可变快照与固定发布频率** —— 那是迭代 2 的语义重构，此处只保证机制可用且行为等价。

> 这样切分的原因：C1 的验收标准是"行为不变"，而状态语义重构（快照 / 频率解耦 / `VehicleState` 抽取）会改变可观察时序，混在一起会让 AC1.3 无法定责。

## 4. UI 迁移映射

| Vue 现状 | React 目标 | 必须保留的行为 |
|---|---|---|
| `vue-app.js` data/methods + `detectTouchOnly()` | `src/state.ts` + `useTouchDevice.ts` | `matchMedia('(hover: none) and (pointer: coarse)')` ∧ ¬`(any-hover: hover)`；首次 touch/mouse 运行时切换 |
| `components/info-panel.js` | `InfoPanel.tsx` | F12/`` ` `` 切换、`isHidden` 400ms 后置 `display:none` 的两段式动画 |
| `components/desktop-controls.js` | `DesktopControls.tsx` | 按键高亮；Enter 按下 200ms 后自动熄灭 |
| `components/mobile-controls.js` | `MobileControls.tsx` | 摇杆：死区 15、限位 35、`transform` 直接写 DOM；跳跃 50ms interval；4 个按钮事件 |
| `components/fps-counter.js` | `FpsBadge.tsx` | <30 FPS 加 `low` 类 |

**React 侧注意**：摇杆与键盘高亮属于高频 DOM 写入，**不走进 React 状态**（继续直接用 ref 改 `style.transform` / `classList`），否则会引入 Vue 时期不存在的重渲染开销，破坏"行为一致"的可比性。

## 5. 回归基线方法（`?deterministic=1`）

浏览器物理本身依赖帧间隔，若靠手工操作无法复现对比。设计一个**确定性调试模式**：

1. `src/main.tsx` 读取 `location.search`；`deterministic=1` 时：dt 固定为 `1/60`（不读 `THREE.Timer`），`stepper` 每帧恰好推进 1 步，禁用 `resize` 与设备探测。
2. 输入来自脚本化序列（如 `?script=w:0-120,a:120-300,space:60,...`），不读真实键盘。
3. 每帧把 `{frame, speed, position, rotation}` 推入内存数组，跑满 600 帧后 `console.log('DETERMINISTIC_DUMP', JSON.stringify(rows))`，同时支持 `window.__dumpDeterministic()` 供人工抓取。
4. 在**归档基线副本**（`~/Documents/archive/ARCHIVED-three-js-car-example-2026-10-16`，注入同样的 hook）与迁移后版本上各跑一次，逐帧比对。
5. 比对脚本（`scripts/compare-deterministic.mjs`，本任务交付）输出首个越界帧与最大偏差。

> 若因 `@types`/打包差异导致浮点差异超出 1e-6，记录实测容差并在此文件追加说明，**不得直接放宽到"看起来差不多"**。

## 6. 风险与对策

| 风险 | 对策 |
|---|---|
| `three` 的 `addons` 子路径在 Vite 下解析失败 | 统一用 `three/addons/...`（`exports` 已声明 `./addons/*`）；失败则改 `three/examples/jsm/...` |
| React 重渲染导致 HUD 抖动（迁移前 Vue 有依赖追踪） | `useSyncExternalStore` + 组件粒度拆分（FPS 单独订阅 `fps`），必要时 `memo` 分片 |
| 触摸探测顺序差异导致移动端布局跳动 | 保留原判据与"首个 touch/mouse 事件"两条通道，顺序不变 |
| 类型化 `RAPIER` 联调成本高（`JointData` 重载多） | 允许对 Rapier 边界写窄化的本地接口（自己声明所需方法签名），不追求全量类型完备 |
| `game/` 里 `THREE.Timer` 与 C2 的改动重叠 | 本任务不动 `Timer` 的 `connect`（归 C2），只在 `three-game.ts` 保留原样调用 |
