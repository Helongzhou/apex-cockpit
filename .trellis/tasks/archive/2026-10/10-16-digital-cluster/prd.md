# D2 · 数字仪表（DOM/CSS overlay）

> 父任务：`.trellis/tasks/10-16-iteration-2-data-layer`
> 优先级：P0 ｜ 预估：2 天 ｜ 前置：D1（车辆状态层与总线）已归档

## Goal

把 D1 产出的车辆状态变成**第一块真正的 HMI**：数字仪表。硬约束是**不引入第二个渲染上下文**（不用 canvas 画仪表，避免与 3D 抢主线程），全部用 DOM/CSS + transform。

## Requirements

| # | 需求 | 说明 |
|---|---|---|
| R1 | `src/ui/cluster/SpeedGauge.tsx` | 指针式车速表：刻度 0–40 km/h（本 demo 物理上限 36 km/h：`MAX_SPEED` 80 世界单位/s = 10 m/s = 36 km/h，见 `game/math/units.ts`），附 m/s 副读数 |
| R2 | `src/ui/cluster/GearIndicator.tsx` | P / R / N / D，当前挡位高亮；挡位来自 `VehicleState.gear`（由纵向量与加速度判定，非硬编码） |
| R3 | `src/ui/cluster/PowerBar.tsx` | 中零功率条：正值为驱动、负值为制动/回收；数值来自 `powerKw = m·a·v` |
| R4 | `src/ui/cluster/AdasStatusIcons.tsx` | 状态图标，**只显示真实信号**：碰撞告警、倒车、驻车、行驶中。迭代 3 的 ADAS 图层接入后在此扩展，本任务不放占位假图标 |
| R5 | `src/ui/scene-switcher.tsx` | 舞台切换 UI，读 `host.stage` 与 `host.setStage()`；本任务只注册影棚舞台，D3 加入高速后按钮自动出现 |
| R6 | `css/cluster.css` | 新样式文件；沿用现有 `z-index: 1000` 层级惯例与玻璃拟态视觉语言 |
| R7 | 数据通路 | 仪表读 `GameHost.vehicle`（20 Hz 快照，由 `Telemetry` 从总线写入）。**不让 React 订阅 60 Hz 的总线**：那会让渲染频率与帧率绑定 |

## Acceptance Criteria

| 项 | 判据 | 验证方式 |
|---|---|---|
| AC-D2.1 | 四种读数（车速 / 挡位 / 功率 / 状态图标）都随真实驾驶变化，且与 `VehicleState` 一致 | `scripts/cluster-check.mjs`：驱动脚本化输入，断言车速表与 HUD 车速一致、挡位 N→D 切换、功率随加速为正 |
| AC-D2.2 | 20 Hz 刷新不引入掉帧：**主线程 JS 帧时间** p95 增量 ≤ 0.5 ms | 新增 `?cluster=off` 开关，对比开/关的每帧 JS 时间（p50 / p95） |
| AC-D2.3 | 不引入第二个渲染上下文 | `grep -rn "getContext\|<canvas" src/ui/cluster/` 无输出；页面 canvas 元素数量为 1 |
| AC-D2.4 | 仪表只用 transform/opacity 更新（不触发布局） | 代码审查 + `cluster-check` 断言写入样式后 `document.body.scrollHeight` 不变 |
| AC-D2.5 | 单元测试覆盖纯映射逻辑 | `tests/cluster-mapping.test.ts` ≥ 8 例 |

## Steps

1. 扩展 `GameHost`：新增 `vehicle`（20 Hz 快照）与 `stage` / `setStage`。
2. `Telemetry.updateHud()` 逐字段写入 `host.vehicle`（逐字段写，保持"只在真的变化时通知"的 store 语义）。
3. 抽出纯映射函数到 `src/ui/cluster/mapping.ts`（车速→指针角度、功率→条宽、挡位→激活项、状态→图标集合），便于单测。
4. 四个仪表组件 + `scene-switcher.tsx` + `css/cluster.css`，全部 transform/opacity 驱动。
5. 在 `App` 里挂载（有数据后显示）。
6. `?cluster=off` 开关用于 AC-D2.2 对比。
7. `tests/cluster-mapping.test.ts` 覆盖映射边界（0、上限、超限、负功率、NaN 防御）。
8. `scripts/cluster-check.mjs`：浏览器实测读数一致性 + 无 canvas + 布局不被触碰 + 帧时间对比表。

## 门禁

- G1：`typecheck` 0 错误、`test` 全绿。
- G2：`build` + `smoke`（含新增仪表检查）+ `stability` 不回退。
- G3：金标准 `--compare` 仍为 0 差异（仪表是纯 UI，不得影响物理）。
- G4：AC-D2.2 的帧时间对比表写入"实测记录"；若软件渲染下噪声大于 0.5 ms 无法分辨，如实说明并给出结构性论证。
- G5：README §十三 增补仪表说明。

## 回滚点

仪表全部是新增文件 + `GameHost` 加字段：若帧时间结论不达标，保留数据通路（D1 成果）并单独回滚仪表组件。

## 实测记录（执行时填写）

| 项 | 值 |
|---|---|
| 仪表读数与状态一致性 | `scripts/cluster-check.mjs` **10/10**：车速表与 HUD 同值（2.2 vs 2.2 km/h）、起步时挡位 N→**D**、加速时功率 **+11 kW**（正）、状态图标显示"▶ 行驶中 ⏱ 计时中"；无页面错误 |
| 帧时间 p50 / p95（仪表开 / 关） | 交错 4 轮 × 240 帧：p50 开 80.75 / 关 86.80 ms，p95 开 89.10 / 关 93.60 ms → 差值 **−6.05 ms / −4.50 ms**（"开"反而更快，物理上不可能），**跨轮噪声 p50 3.10 ms / p95 10.40 ms**。结论：**本环境不可判定 0.5 ms 量级**（软件光栅化 ~12 fps，噪声比判据大 1–2 个数量级） |
| 结构性论证（替代帧时间测量） | ① store 写入被限流在 20 Hz（`HUD_UPDATE_INTERVAL_MS`），不是每帧；② 静态表盘已 `memo` 化，刻度/标签不重建；③ 每帧只改文本与 `transform`/`opacity`，AC-D2.4 已实测仪表盒模型在行驶中完全不变（402×196 → 402×196） |
| canvas 数量 / 是否新增渲染上下文 | 页面 canvas 数 **1**（仅 3D 画布）；`grep -rn "getContext\|<canvas" src/ui/cluster/` 无输出 |
| 用例数与覆盖 | `tests/cluster-mapping.test.ts` **16 例**（≥8 达标）；总用例 119 → **119 全绿**（新增 16） |
| 回归 | smoke **21/21**（新增 2 项仪表断言）、stability **22/22**、金标准 **前缀 301 帧 0.000e+0**（仪表是纯 UI，物理未变） |

### 本轮发现的问题

1. **AC-D2.4 的断言范围写错**：最初拿整页 `document.body.scrollHeight` 判断"布局未被触碰"，但调试面板调试文字变化本身就会改变它。改为只看仪表自身的盒模型（`getBoundingClientRect` + `clientWidth/Height`）。
2. **AC-D2.2 的测量方法**：单轮对比会被机器负载漂移淹没（首轮测出"仪表开更快 12 ms"这种不可能的结果）。改为**交错 4 轮 + 噪声基准**，并诚实把结论标为不可判定，而不是硬凑一个绿。
3. **金标准超时并非回归**：机器负载 7.5 时 600 帧跑不完 300 s。为 harness 增加 `--frames N`（前缀比对，附进度上报）与更宽的等待，并用 301 帧前缀复证物理未变；比对脚本现在会明确标注"prefix run"并在前缀过短时报错。
4. 静态表盘 `memo` 化是被测量推着做出来的真实优化（原本每次 20 Hz 更新都重建 ~30 个 SVG 节点）。
