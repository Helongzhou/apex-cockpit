# C1 · Execution Plan

> 前置：`task.py validate` 通过 → `task.py start .trellis/tasks/10-15-vite-ts-react-migration`。
> 约定：**一个逻辑改动一个提交**，提交信息用仓库既有风格（英文祈使句、无前缀）。

## 步骤清单（有序）

**S0 · 准备**
1. 确认工作区干净、`main` 与 `origin/main` 同步。
2. `.gitignore`：**移除 `package-lock.json` 忽略**（迁移后 lockfile 必须入库以复现构建）；保留 `node_modules/`、`dist/`。
3. `npm init -y` 后按 `design.md` §2 安装并**精确写版本**（`three@0.185.1`、`@types/three@0.185.4`、`@dimforge/rapier3d-compat@0.20.0`、react/react-dom 19、vite 7、`@vitejs/plugin-react`、typescript 5、vitest）。
4. 提交：`Add the npm toolchain dependencies`。

**S1 · 构建骨架**
5. 新增 `vite.config.ts`（`base: './'`、react 插件）、`tsconfig.json`（strict、`jsx: react-jsx`、`moduleResolution: bundler`、`types: ["vite/client"]`）、四条 npm 脚本。
6. 改写 `index.html`：删除 import map 与 `vue.global.js`，保留 5 个 CSS `<link>` 与 `<div id="app">`，入口改为 `/src/main.tsx`。
7. `src/main.tsx` 最小版本：引 CSS → 建 store → `initializeGame(host)`（此时 `game/` 仍是 `.js`，用 `allowJs` 过渡）。
8. 验证：`npm run typecheck`（allowJs 期）与 `npm run build` 均通过；`dist/` 内 `python3 -m http.server 8080` 能驾驶。
9. 提交：`Add the Vite and TypeScript build skeleton`。

**S2 · `game/` 类型迁移（只加类型，不改逻辑）**
10. 按依赖顺序逐个 `git mv` 并在同一步补类型，每个模块一个提交：
    `color` → `fps-meter` → `physics-world` → `car-model` → `car-lights` → `world` → `car` → `controls` → `telemetry` → `follow-camera` → `rendering` → `game-session` → `three-game`。
11. 每步后跑 `npm run typecheck`；每 3–4 个模块跑一次 `npm run build` + 手动驾驶 30 秒（起步 / 转向 / 跳跃 / 重置 / 切视角）。
12. 提交：每个模块一条 `Type the <module> module`（或按 2–3 个模块合并，视 diff 大小）。
13. **评审门禁 G1**：`game/` 全部 `.ts` 且 strict 通过；grep 确认无 `any`、无 `@ts-ignore`；手动驾驶与 S1 无差异。

**S3 · 接缝（store）**
14. 新增 `src/state.ts`（`design.md` §3 的三个方法）与 `src/hooks/useGameState.ts`。
15. 把 `game/telemetry.ts`、`game/controls.ts`、`game/three-game.ts` 中的 `vueApp` 形参改名为 `host`（类型为 store 接口），**逻辑与写入时机不变**。
16. 提交：`Introduce the game-to-UI store seam`。

**S4 · React UI**
17. `src/ui/App.tsx` + `InfoPanel.tsx` + `DesktopControls.tsx` + `MobileControls.tsx` + `FpsBadge.tsx`；`src/hooks/useTouchDevice.ts` 承载设备探测。
18. 高频 DOM 写入（摇杆 `transform`、按键高亮）继续用 ref/DOM API，不进 React 状态（`design.md` §4）。
19. 删除 `vue-app.js` 与 `components/*.js`；确认 `css/` 未改动（`git diff --stat css/` 必须为空）。
20. **评审门禁 G2**：`design.md` §4 的行为清单逐项手工过一遍（含 F12 面板动画、Enter 高亮 200ms、摇杆死区与限位、跳跃连发、视角/重置按钮、`low` FPS 类）。
21. 提交：`Rewrite the UI layer in React`。

**S5 · 确定性回归**
22. 新增 `?deterministic=1` 支持（`design.md` §5）：固定 dt、脚本化输入、每帧 dump。
23. 在归档基线副本上注入同款 hook（**只改副本，不动仓库**），跑同一脚本各 600 帧。
24. 新增 `scripts/compare-deterministic.mjs`，输出首个越界帧与最大偏差。
25. **评审门禁 G3（AC1.3）**：容差 ≤1e-6 通过；否则记录实测容差与原因并写入本文件"实测记录"。
26. 提交：`Add the deterministic regression harness`。

**S6 · 收尾**
27. 断言：`grep -rn "cdn.jsdelivr.net\|unpkg.com" dist/ index.html` 无命中；`grep -rn "react" game/` 无命中；`diff` 5 个 CSS 文件与原版一致。
28. 全量验证（见下），把结果写入子任务记录，交 parent 做集成评审。

## 验证命令

```bash
npm ci
npm run typecheck                      # tsc --noEmit, strict
npm run build                          # 产出 dist/
node scripts/compare-deterministic.mjs # AC1.3 逐帧比对
grep -rn "cdn.jsdelivr.net\|unpkg.com" dist/ index.html   # 期望无输出
grep -rn "from 'react'\|from \"react\"" game/            # 期望无输出
git diff --stat css/                                     # 期望无输出
```

## 评审门禁

| 门禁 | 时点 | 判定 |
|---|---|---|
| **G1** | S2 结束 | 全部 `.ts` + strict 通过 + 无 `any`/`@ts-ignore` + 手动驾驶无差异 |
| **G2** | S4 结束 | `design.md` §4 行为清单逐项通过；`css/` 零 diff |
| **G3** | S5 结束 | AC1.3 逐帧比对通过（或记录实测容差与原因） |

## 回滚点

| 回滚点 | 触发 | 动作 |
|---|---|---|
| C1-R1 | S1 后构建不可用 | `git revert` S1 提交，退回 CDN 基线（保留 S0 依赖清单，无害） |
| C1-R2 | S2 中某模块类型化发现必须改逻辑 | 停下、记录差异为新任务；该模块保留 `.js`（`allowJs` 下继续可跑），不硬塞 |
| C1-R3 | S4 后 UI 行为退化无法在 0.5 天内修复 | `git revert` S4 提交，退回"S3 + Vue 组件"中间态（S3 的 store 对 Vue 同样可用），另开任务重做 UI |
| C1-R4 | S5 比对持续不一致且非容差问题 | 保留 S1–S4，标记 AC1.3 未过并把差异写成新任务；**不得**通过放宽容差使门禁变绿 |

## 实测记录（执行时填写）

| 项 | 值 |
|---|---|
| AC1.1 `tsc --noEmit` | 通过（strict，0 错误）。迁移起点为 13 个模块共 **579** 条错误，逐模块清零 |
| AC1.1 `any` / `@ts-ignore` | `game/` 与 `src/` 内 grep 零命中 |
| AC1.2 `dist/` 无 CDN 引用 | 通过（`grep -rlo "cdn.jsdelivr.net\|unpkg.com" dist/` 无输出） |
| AC1.2 静态可跑 | 通过（`python3 -m http.server` 下 index 与全部 assets 均 200） |
| **AC1.3 最大偏差** | **0.000e+0**（601 帧 × 8 个物理量，与归档基线逐帧完全一致） |
| AC1.3 首个越界帧 | 无 |
| AC1.3 采用的容差与理由 | 1e-6；实测为 0，未放宽 |
| AC1.4 UI 行为 | `scripts/ui-smoke.mjs` **14/14 通过**（面板开关与动画、F12、速度读数、按键高亮、W 驱动、C 视角、Enter 重置回出生点、移动端控件与摇杆、桌面控件隐藏、无页面错误） |
| AC1.5 分层约束 | 通过（`game/` 内无 react import） |
| AC1.6 CSS 零改动 | 通过（`git diff --stat -- css/` 空，5 文件 539 行原样复用） |
| `dist/` 首屏体积（未优化，供 C3 对照） | `assets/index-*.js` 3,740.62 kB raw / **1,333.90 kB gzip**；`index-*.css` 9.12 kB / 2.09 kB gzip；`car-*.glb` 90.04 kB；Draco 解码器已随构建本地化（285.74 kB + 192.42 kB wasm + 719.41 kB js，按需加载） |

### 与计划的执行偏差（留痕）

1. **S1 与 S3 合并**：`src/state.ts`（薄 store）随构建骨架一起落地，避免先写一个一次性的临时 host 对象。接缝语义未变（`game/` 只把 `vueApp` 形参改名为 `host`）。
2. **S2 一次性迁移而非逐模块提交**：原计划按依赖序逐个模块迁移并提交，但一次性 `git mv` 全部 `.js → .ts` 后，未迁移模块在 `strict` 下必然报错，中间提交无法通过类型检查。改为单次提交 `Type the game modules`（14 文件，+576/−291），并在提交前验证 `typecheck`、`build`、`css` 零 diff。
3. **新增两处 dev 接缝**：`initializeGame(host, options)` 增加 `fixedDeltaSeconds` 与 `onFrame(frame, session)`，仅在确定性回归时使用；无 options 时行为与迁移前完全一致（AC1.3 的零差异即为证据）。
4. **新增 Playwright 依赖与两个脚本**：`scripts/compare-deterministic.mjs`（含自带静态服务器与基线插桩兼容层）、`scripts/ui-smoke.mjs`。浏览器二进制装在 `.playwright-browsers/`（已 gitignore），可用 `PLAYWRIGHT_BROWSERS_PATH` 覆盖。
5. **归档基线被插桩**：`ARCHIVED-three-js-car-example-2026-10-16/game/three-game.js` 的 `renderFrame` 加了固定 dt 与 `window.__APEX_ON_FRAME` 钩子，仅用于本次逐帧对比；工作区源码未受影响。
6. **修正两处上游资产引用**：GLB 改为 `?url` 导入（否则不会进 `dist/`）、Draco 解码器去掉 CDN `setDecoderPath` 改用 three 自带的 `new URL(...)` 资源（否则产物里残留 jsdelivr 字符串，且离线不可用）。
