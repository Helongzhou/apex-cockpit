# C4 · Execution Plan

> 前置：C1 已归档（若 C2/C3 仍在进行，先确认它们不触碰本任务要搬移的函数）→ `task.py start .trellis/tasks/10-15-specs-and-tests`
> 原则：**先搬移 → 再补测 → 最后按真实代码写规范**（顺序不能反，否则规范写的是想象）。

## 步骤清单（有序）

**S1 · 纯函数抽取（只搬移）**
1. 新建 `game/math/vehicle-math.ts`，从 `game/car.ts` 搬入并导出：
   `makeAckermann`（`car.js:393-401`）、`boxInertia`（`:383-390`）、`cylinderInertia`（`:376-380`）。
   - `car.ts` 改为从新模块导入；**公式与常量保持逐字一致**，`Car` 的构造参数不变。
2. 新建 `game/math/geometry.ts`，从 `game/car-model.ts` 搬入并导出：
   `filterTriangles`（`:170-200`）、`normalizeNodeName`（`:101-104`）。
   - 注意 `filterTriangles` 依赖 `THREE.BufferGeometry` / `Float32BufferAttribute`，测试需可 import three（jsdom 环境不需要 WebGL，纯 CPU 操作）。
3. 新建 `game/math/input-mapping.ts`，从 `game/controls.ts` 搬入并导出：
   `describeDirection`（`:135-138`）与 `DIRECTION_LABELS`（`:22-29`）。
4. 从 `game/follow-camera.ts` 搬入 `clampSpeed`（`:126-128`）到 `game/math/vehicle-math.ts`（或 `math/scalar.ts`）。
5. 记录 `git diff` 证据：搬移后的实现与搬移前**函数体逐字一致**（用 `git diff -M --color-moved` 或人工核对并在提交信息中说明）。
6. 提交：`Extract the pure helpers into testable modules`。
7. **门禁 G1**：`npm run typecheck` 通过 + `node scripts/compare-deterministic.mjs` 通过（证明纯搬移）。

**S2 · 单测**
8. 配置 vitest（`vitest.config.ts` 或复用 `vite.config.ts` 的 `test` 段），环境 `node`（纯函数不需要 DOM）。
9. 写入用例（≥12），建议分组：
   | 被测 | 用例要点 |
   |---|---|
   | `makeAckermann` | 0 角（退化：`tan(0)` → 无穷大，需定义并断言实际行为）、正/负角、内轮角度 > 外轮角度、轮距/轴距变化时的单调性 |
   | `boxInertia` | 三个主轴公式、立方体对称性、质量线性 |
   | `cylinderInertia` | 绕轴 = ½mr²、横向公式、长度趋零时的极限 |
   | `filterTriangles` | 保留/剔除计数、`position/normal/uv` 属性布局、无 `uv` 时不写该属性 |
   | `PhysicsStepper` | 大 delta 被截断为 8 步、`elapsedSeconds` 单调、累加器余量 < timestep |
   | `describeDirection` | 无输入 → `—`、单输入、多输入组合与顺序 |
   | `clampSpeed` | 上/下界与中间值 |
   | `normalizeNodeName` | `Cube.075` → `Cube075`、无点号不变 |
10. 提交：`Add unit tests for the extracted helpers`。
11. **门禁 G2**：`npm run test` ≥12 绿；覆盖率 ≥80%（`test:coverage` 可复现）。

**S3 · 规范回填（按真实代码写）**
12. `.trellis/spec/frontend/directory-structure.md`：目录约定（`game/` 框架无关、`src/ui/` React、`src/state.ts` 唯一接缝、`game/math/` 纯函数、测试文件位置、静态资产位置），每条带真实路径。
13. `.trellis/spec/frontend/type-safety.md`：strict 基线、禁止 `any`/`@ts-ignore`、Rapier 边界的窄接口写法、`@types/three` 与运行时版本对齐的要求（0.185.x）、`.d.ts` 缺失的应对。
14. `.trellis/spec/frontend/state-management.md`：状态归属（`src/state.ts` 薄 store / 组件本地状态 / DOM 直写三类各自的适用场景，含"摇杆与按键高亮走 DOM 直写"这一真实约定）、`useSyncExternalStore` 用法、`game/` 不得 import React。
15. `.trellis/spec/frontend/quality-guidelines.md`：提交粒度与信息风格（英文祈使句、无前缀）、必跑命令（typecheck/test/build/check-bundle/compare-deterministic）、禁止模式（`any`、静默 `catch`、渲染循环内未捕获异常、`document` 级监听不移除）、错误处理约定（fatal 态必须可见）。
16. 每份文件填完后立刻 grep 自检（`To fill`/`TBD`/`待填` 必须为 0），并抽 3 条规范在代码里验证引用有效。
17. 提交：`Fill the frontend specs from the real code`。

**S4 · 收尾**
18. `package.json` 增加 `test` / `test:coverage`；README §十 补"如何跑测试"一行。
19. 提交：`Document how to run the test suite`。
20. 汇总 AC4.1–AC4.5 实测（用例数、覆盖率、规范条数与引用数），交 parent。

## 验证命令

```bash
npm run typecheck
npm run test                 # 期望 ≥12 passed
npm run test:coverage        # 抽取模块 ≥80%
node scripts/compare-deterministic.mjs
grep -rn "To fill\|TBD\|待填" .trellis/spec/frontend/   # 期望无输出
```

## 评审门禁

| 门禁 | 时点 | 判定 |
|---|---|---|
| G1 | S1 | 纯搬移：typecheck 通过且确定性回归通过；函数体逐字一致有证据 |
| G2 | S2 | ≥12 用例绿 + 覆盖率达标 |
| G3 | S3 | 四份规范无模板残留、每条有真实引用、无"空想规范" |

## 回滚点

| 回滚点 | 触发 | 动作 |
|---|---|---|
| C4-R1 | 抽取后确定性回归失败（说明搬移不纯） | 逐个模块 revert 到失败前一步，用二分定位；**不得**通过调整测试期望掩盖 |
| C4-R2 | 某函数因闭包/私有依赖无法干净抽出 | 该函数保留原处并降级为"不测"，在规范里记录为已知偏差；其余继续 |
| C4-R3 | 规范与代码冲突且改代码超范围 | 规范写成"当前实现 + 已知偏差"两段式，偏差项登记为后续任务 |

## 实测记录（执行时填写）

| 项 | 值 |
|---|---|
| 抽取出的模块与函数清单 | `game/math/vehicle-math.ts`：`cylinderInertia` / `boxInertia` / `makeAckermann`（自 `car.ts`）、`clampSymmetric`（自 `follow-camera.ts` 的 `clampSpeed`，改为传入 limit 以免依赖相机常量）；`game/math/geometry.ts`：`normalizeNodeName` / `filterTriangles`（自 `car-model.ts`）；`game/math/input-mapping.ts`：`NO_DIRECTION` / `Action` / `DIRECTION_LABELS` / `describeDirection`（自 `controls.ts`）；`game/math/physics-stepper.ts`：`PhysicsStepper`（自 `physics-world.ts`，**额外抽取**：原模块 import Rapier，而 Rapier 的 wasm 在 node 里无法 import，不抽就无法单测） |
| 纯搬移证据 | 抽取后 `npm run typecheck` 0 错误、`npm run build` 通过、`compare-deterministic` **max\|delta\| = 0.000e+0**（601 帧）—— 说明抽取未改变任何行为 |
| 用例数 / 覆盖率 | **45 个用例 / 6 个文件**（目标 ≥12）；覆盖率 **语句 93.33%、分支 87.23%、函数 92.85%、行 93.8%**（目标 ≥80）；`game/math/**` 四个模块均为 **100%** |
| 覆盖率工具 | 需补装 `@vitest/coverage-v8@5.0.4`（vitest 5 的 coverage provider 是独立包）；`reporter` 必须用合法的 `text-summary`（写 `summary` 会被 istanbul 当成包名去 import 并报 ERR_MODULE_NOT_FOUND） |
| 规范条数与引用 | 6 份规范共 **359 行 / 约 40 条规则**，全部带真实路径或可执行命令；自检 `grep -rn "To fill\|TBD\|待填" .trellis/spec/frontend/` **无输出**；抽查 5 处引用（`game/listeners.ts`、`src/game-bridge.ts`、`game/render-loop.ts`、`scripts/measure-budget.mjs`、`game/math/vehicle-math.ts`）全部存在 |
| 已知偏差条目 | ① `clampSymmetric` 相对原 `clampSpeed` 增加了 `limit` 参数（原实现闭包捕获 `FOLLOW.maxCameraSpeed`，直接搬移会把相机常量拖进纯函数模块）；② 规范语言选**中文**（项目决策 A5），因此改写了 `index.md` 里"文档必须英文"的模板说明；③ 除计划要求的 4 份规范外，一并回填了 `component-guidelines.md` / `hook-guidelines.md`，否则 `index.md` 的 "To fill" 自检无法清零 |
| 测试暴露的问题 | 单测第一轮 3 条失败，其中 **2 条是我的断言写错**（阿克曼反向转向时内外轮互换；长轴距会收窄角度差，外轮角度反而可能变大），**1 条是断言过度**（`unsubscribe` 后监听器不再被调用，但版本号仍应随状态变化增长）。三条均改为反映真实语义，未修改被测代码 |
