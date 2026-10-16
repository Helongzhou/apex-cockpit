# C1 · Migrate to Vite, TypeScript and React 19

> 父任务：`.trellis/tasks/10-15-iteration-1-baseline`

## Goal

把仓库从"无构建 + CDN import map + Vue 3 全局构建"迁移到由真实依赖清单驱动的 **Vite + TypeScript + React 19** 工程：`game/` 13 个模块转 TS（**只加类型、不改逻辑**），672 行 Vue UI 层重写为 React 组件 + 一个薄 store，539 行 CSS 原样复用，产物为纯静态 `dist/`。

## Requirements

- **R1.1 依赖真实化**：`package.json` 具备可安装的 `dependencies` / `devDependencies` 与 lockfile；不再依赖 `index.html` 的 import map 与任何运行时 CDN。
- **R1.2 四条脚本**：`dev`（Vite dev server）、`build`（产出 `dist/`）、`typecheck`（`tsc --noEmit`，strict）、`test`（vitest，C4 接入；本任务至少保证脚本存在且不报错）。
- **R1.3 类型覆盖**：`game/` 全部模块为 `.ts` 且参与 strict 检查；新增代码不得使用 `any`（`unknown` + 收窄替代），不得使用 `@ts-ignore`（必要时用带说明的 `@ts-expect-error`）。
- **R1.4 UI 等价**：`info-panel` / `desktop-controls` / `mobile-controls` / `fps-counter` 四个组件的**可见行为与交互**与迁移前一致，含 F12/`` ` `` 调试面板切换、滑入滑出动画、触摸设备探测与运行时切换、虚拟摇杆与 4 个触摸按钮。
- **R1.5 分层约束**：`game/` 不得 import React 或任何 UI 框架代码；UI 层通过一个薄 store 订阅游戏状态。
- **R1.6 行为不变**：五条操作链可观察行为与归档基线一致。

## Acceptance Criteria

- [ ] **AC1.1** `npm ci && npm run typecheck` 全绿（`strict: true`），且 `game/**/*.ts` 无 `any` / 无 `@ts-ignore`。
- [ ] **AC1.2** `npm run build` 成功产出 `dist/`，其中不含对 `cdn.jsdelivr.net` / `unpkg.com` 的引用（grep 断言）；在 `dist/` 内 `python3 -m http.server 8080` 可直接驾驶。
- [ ] **AC1.3** `?deterministic=1` 模式（见 `design.md` §5）下，同一输入脚本跑 600 帧，车速 / 位置 / 朝向序列与归档基线**逐帧一致**（数值容差 ≤1e-6，实测值记录留档；若更大则记录实际容差并说明原因）。
- [ ] **AC1.4** 四条 UI 组件的行为清单逐项通过（面板切换与动画、设备探测与热切换、摇杆死区 15px 与 35px 限位、跳跃 50ms 连发与松开即停、视角与重置按钮）。
- [ ] **AC1.5** `game/` 无 React import（grep 断言）；`index.html` 不再包含 import map 与 CDN `<script>`。
- [ ] **AC1.6** CSS 文件与迁移前逐字节一致（`diff` 断言：5 个文件、539 行）。

## Constraints

- **只加类型不改逻辑**：`game/` 的算法、常量、关节参数、更新顺序一律不动；发现必须改动时先在 `implement.md` 记录并单独提交，便于 revert。
- **上游资产不动**：`game/models/car.glb`、`THIRD_PARTY_NOTICES.md`、`LICENSE`、`README.en.md` 不改（README 状态更新归 parent 的 AC6）。
- **不改渲染行为**：`dpr` 上限 1、`antialias:false`、`MSAA_SAMPLES=0`、辉光与反射参数保持原值（包体优化归 C3，稳定性改动归 C2）。
- **顺序**：本任务是 C2/C3/C4 的前置，退出前不打 tag、不进下一任务。

## Out of Scope

错误边界 / 上下文恢复 / 加载重试（C2）、包体优化与预算脚本（C3）、规范回填与单测（C4）、以及迭代 2 的状态总线语义重构（本任务只建**机制**，不做快照与频率语义）。
