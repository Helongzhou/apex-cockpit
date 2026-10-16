# C4 · Fill the frontend specs and seed the test suite

> 父任务：`.trellis/tasks/10-15-iteration-1-baseline` ｜ 前置：C1（结构定型）；与 C2/C3 的产物不冲突

## Goal

把 JD 第 6 条"技术规范制定与技术沉淀"落成可检查的产物：`.trellis/spec/frontend/` 中的四份规范由空模板变为**能指向真实代码**的约定；把散落在业务模块里的纯函数抽到可测模块，并以 vitest 建立首批回归网（≥12 用例）。

## Requirements

- **R5.1 规范回填（4 份）**：`directory-structure.md`、`type-safety.md`、`state-management.md`、`quality-guidelines.md` 必须写**本项目实际遵守的约定**，每条约定至少给出一处仓库内真实文件的引用；不得写空想规范、不得保留模板占位。
- **R5.2 纯函数抽取**：把以下逻辑从业务模块抽到 `game/math/`（或等价的可测模块），**公式与常量逐字不变**：Ackermann 转向、长方体惯量、圆柱惯量、三角形过滤（按质心）、方向文案映射、速度钳制、节点名归一化。
- **R5.3 单测**：`npm run test`（vitest）≥12 用例，覆盖上列纯逻辑的边界（0 角 / 负角 / 极端角、累加器上限、属性布局、无输入与多输入组合）。
- **R5.4 脚本与门禁**：`test` 脚本可用；测试文件与被测模块同目录或集中于 `tests/`（在 `directory-structure.md` 中定死一种并遵守）。
- **R5.5 行为不变**：抽取是纯搬移，C1 的确定性回归必须继续通过。

## Acceptance Criteria

- [ ] **AC4.1** 四份规范文件内**无** `To fill` / `TBD` / `待填` 残留（grep 断言）；每份至少 3 条约定，每条带 `path:line` 引用。
- [ ] **AC4.2** `npm run test` 全绿且用例数 ≥12（打印实际数量）；对抽取出的模块行覆盖率 ≥80%（vitest `--coverage` 可复现）。
- [ ] **AC4.3** `node scripts/compare-deterministic.mjs` 仍通过（纯搬移不改变行为）。
- [ ] **AC4.4** `npm run typecheck` 通过，且新模块无 `any`。
- [ ] **AC4.5** `package.json` 具备 `test`、`test:coverage` 脚本；README §十（开发约定）补一行"如何跑测试"，指向真实命令。

## Constraints

- **只搬移、不重构**：抽取过程中不得"顺手"改公式、改常量、改调用顺序；发现必要的逻辑修正 → 记录为新任务，不在本任务里做。
- **规范写实**：规范描述代码**当前**的样子；与代码不一致处要么改代码（超范围）要么把差异写成"已知偏差"。例如"`game/` 不得 import React"是 C1 已确立的真实约束，可写入规范；而"必须用 hooks 管理所有状态"若代码里用了 ref 直接写 DOM，**不得**写成规范。
- **不引入测试框架之外的新依赖**：仅 `vitest`（+ `@vitest/coverage-v8` 若需要覆盖率）。
- **范围**：本任务只填 4 份规范；`component-guidelines.md` 与 `hook-guidelines.md` 留到迭代 2（届时 React 组件面更大，规范才写得实）。

## Out of Scope

`component-guidelines.md` / `hook-guidelines.md` 回填、E2E / 视觉回归测试、CI 流水线搭建（仓库当前无 CI；若后续加入，`test`/`typecheck` 脚本已就绪即可接入）、渲染性能测试（迭代 3 的性能面板负责）。
