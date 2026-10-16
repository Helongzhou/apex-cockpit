# Iteration 1 — TypeScript baseline, runtime stability, first bundle cut

## Goal

把 `apex-cockpit` 从"无构建 + CDN import map + Vue 全局构建"的 Demo 基线，推进到**能被可靠运行、能被量化、能被讲述**的工程基线：真实构建链（Vite + TypeScript + React 19）、可恢复的运行时（渲染循环 / 资源加载 / WebGL 上下文）、首屏包体第一刀，以及回填的前端规范与首批单测。

本任务为 **parent**：持有需求集、任务地图与跨子任务验收标准，**自身不承担实现**。

## 背景与依据

| 依据 | 位置 |
|---|---|
| 目标岗位 JD：TypeScript + Three.js/WebGL、性能优化（帧率/内存/加载/包体/耗电/算力）、车机适配与闪退、维护现有代码、规范制定与工具开发 | 会话内 JD 截图（座舱工程师 · 3D 可视化） |
| 迭代规划：迭代 1 的交付物、改动文件清单、可量化验收、风险与砍单顺序 | `docs/superpowers/specs/2026-10-15-iteration-plan.md` §1、§5、§8 |
| 代码库分析：待修的 P0/P1 发现（含 file:line 证据） | `docs/superpowers/specs/2026-10-15-codebase-analysis.md` §5 |
| 外部事实核查（three 循环异常语义、Timer 可见性保护、Rapier 内联 wasm、上下文丢失规范） | `docs/research/2026-10-15-external-facts.md` |

## Requirements

**R1 构建与类型**：仓库必须由真实依赖清单驱动（`package.json` + lockfile），具备 `dev` / `build` / `typecheck` / `test` 四条脚本，源码以 TypeScript 编写且通过 strict 类型检查，构建产物为纯静态 `dist/`。

**R2 运行时恢复能力**：渲染循环内任何异常不得导致画面永久停止；WebGL 上下文丢失后必须能自动恢复并续帧；资源加载失败必须可重试且对用户可见；重置操作必须可重入；所有事件监听在释放时必须成对注销。

**R3 首屏与总包预算**：首屏（不含 Rapier）gzip ≤ **450 KB**，总包 gzip ≤ **0.9 MB**，并由一条可重复执行的脚本自动断言，而不是人工目测。

**R4 行为不变性**：迁移不得改变可观察的驾驶行为。五条操作链（键盘起步、A/D 转向、空格跳跃、Enter 重置、C 键与移动端视角切换、触摸摇杆）在迁移前后的车速 / 位置 / 朝向曲线必须一致。

**R5 规范与测试沉淀**：`.trellis/spec/frontend/` 四份规范由空模板变为**能指向真实代码**的约定；纯逻辑模块具备至少 12 个单测用例。

**R6 文档与语言**：面向人的文档以中文为主，代码标识与注释保持英文；README 的"当前状态 / 计划新增"分界不得被模糊。

## Constraints

- **时间**：迭代 1 预算 5 个工作日（规划第 3 节）内完成；超出时按规划 §7 的砍单顺序降级。
- **不得回退既有资产**：`game/models/car.glb`、`css/`（539 行）、`THIRD_PARTY_NOTICES.md`、`LICENSE` 与其署名链必须保留；上游基线副本（`~/Documents/archive/ARCHIVED-three-js-car-example-2026-10-16`）保留作回归对照，不删除。
- **演示优先**：任何中间态都必须保持"可本地起一个静态服务器就能演示"的能力（对应按"现场跑 demo"设计的评估方式）。
- **Trellis 流程**：实现只在对应子任务 `task.py start` 之后进行；提交走 Phase 3.4 批量提交。

## Acceptance Criteria（跨子任务，parent 层面把关）

- [ ] **AC1** `npm run typecheck` 全绿（strict），`npm run test` 全绿（≥12 用例），`npm run build` 成功产出 `dist/`，且 `python3 -m http.server` 直接可跑该产物。
- [ ] **AC2** 五条操作链与归档基线**行为一致**（逐帧曲线比对记录归档在子任务内）。
- [ ] **AC3** 异常注入（在 `renderFrame` 内抛出）不产生永久停帧；强制 `WEBGL_lose_context.loseContext()` 后 ≤60 s 回到可交互；CDN 失败注入后能从可见错误态重试成功。
- [ ] **AC4** `scripts/check-bundle.mjs` 一键执行并断言首屏 ≤450 KB gzip、总包 ≤0.9 MB gzip，且产出优化前后对比表。
- [ ] **AC5** `.trellis/spec/frontend/` 四份规范无 "To fill"/"TBD" 残留，每条规范至少引用一处仓库真实代码。
- [ ] **AC6** README 的"已完成 / 计划新增"与代码真实状态一致（迭代 1 完成后更新"当前状态"一节）。

## Task Map

| 子任务 | 目录 | 优先级 | 交付 |
|---|---|---|---|
| C1 迁移到 Vite + TypeScript + React 19 | `.trellis/tasks/10-15-vite-ts-react-migration` | P0 | 可类型检查、可构建、可静态部署的工程基线（R1、R4） |
| C2 渲染循环与加载可恢复 | `.trellis/tasks/10-15-runtime-recovery` | P0 | 错误边界 / 上下文恢复 / 加载重试与错误态 / 重置重入 / 监听器与 Timer 修复（R2） |
| C3 首屏包体与预算门禁 | `.trellis/tasks/10-15-bundle-budget` | P1 | three 按需、Rapier 懒加载与 wasm 自托管、预算脚本与对比表（R3） |
| C4 规范回填与测试种子 | `.trellis/tasks/10-15-specs-and-tests` | P1 | 四份规范 + ≥12 单测 + 可测模块抽取（R5） |

**顺序**：C1 →（C2 ∥ C3）→ C4。父子结构本身不是依赖系统，此顺序写在各子任务的 `prd.md` / `implement.md` 中。

## Out of Scope

迭代 2/3 的内容一律不做：`VehicleState` 与状态总线、数字仪表、高速公路舞台、ADAS 目标框 / 车道线 / 规划轨迹、性能面板、感知数据源与噪声层。**迭代 1 只换地基，不新增业务功能。**

## Notes

- 本任务不直接改代码；集成评审与 AC1–AC6 的把关在四个子任务归档后由 parent 执行（见 `implement.md`）。
- 子任务的 acceptance 必须各自可测；跨子任务的标准写在这里，避免在子任务里重复定义。
