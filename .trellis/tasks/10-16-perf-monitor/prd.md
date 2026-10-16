# E3 · 性能监控面板

> 父任务：`.trellis/tasks/10-16-iteration-3-adas` ｜ P1 ｜ 前置：E1/E2

## Goal

把"性能"从口头说法变成**现场可演示的数字**：帧时间分位数（p50/p95/p99）、fps、`renderer.info` 计数、物理子步数、ADAS 目标数、包体基线。这也是 JD 里"性能工具"的直接证据。

## Requirements

| # | 需求 | 说明 |
|---|---|---|
| R1 | `game/math/stats.ts`（纯） | `percentile` / `mean` / `summarize`：对环形缓冲副本求分位数，NaN 安全 |
| R2 | `game/perf-monitor.ts`（纯） | 环形缓冲（容量 240 = 4 s@60Hz）采样**帧间隔**与**脚本耗时**两条序列，零分配 |
| R3 | 物理步数 | `PhysicsStepper` 暴露 `stepsLastFrame` / `totalSteps`（可测：大 delta 时被 `MAX_STEPS_PER_FRAME` 截断） |
| R4 | 数据通路 | 游戏以 **≤4 Hz** 把快照写进 `host.perf`（逐字段写，保持 store"仅真变化才通知"语义）；React 不订阅逐帧数据 |
| R5 | 面板 | `src/ui/perf-panel/PerfPanel.tsx` + `css/perf-panel.css`：**F9** 开关（F12 已被车辆数据面板占用，偏差写入记录）、只用文本与 transform |
| R6 | 包体基线 | `scripts/measure-budget.mjs --write` 生成 `src/dev/bundle-baseline.ts`，面板展示**由脚本生成**的数字（不会与真实包体漂移） |

## Acceptance Criteria

| 项 | 判据 | 验证方式 |
|---|---|---|
| AC-E3.1 | 面板可现场演示：F9 开/关，展示帧时间 p50/p95/p99、fps、draw calls、triangles、几何/纹理/程序数、物理步数、ADAS 计数、包体基线 | `scripts/perf-check.mjs` 断言字段存在且随时间更新 |
| AC-E3.2 | 分位数与均值正确、边界（空样本 / 单样本 / NaN）安全 | 单测 ≥10 例 |
| AC-E3.3 | 面板开销可控：写入频率 ≤4 Hz，且只改文本 | 代码审查 + 检查脚本读取"最近一次面板刷新时间" |
| AC-E3.4 | 回归 | 金标准 / smoke / cluster / stage / stability / adas 全绿 |

## 门禁

- G1：typecheck 0、test 全绿（新增 ≥12）。
- G2：既有 6 套浏览器检查不回退。
- G3：金标准 0 差异。
- G4：实测写入本文件；README §14.3 增补。

## 实测记录（执行时填写）

`npm run perf` **14/14 通过**。

| 项 | 值 |
|---|---|
| 面板字段与刷新 | F9 开/关 + ✕ 关闭均生效；面板展示**帧时间 p50/p95/p99/max、面板 fps 与 HUD fps、脚本耗时 p50/p95/max、draw calls、triangles、geometries/textures/programs、物理子步（本帧/累计）、ADAS 目标数、包体基线（首屏 76.1 kB / 游戏 chunk 119.3 kB / wasm 合计 896.2 kB）**；驾驶时数字确实变化 |
| 刷新率（AC-E3.3） | 面板数据来自**4 Hz 快照**：间隔 120 ms 两次采样文本**完全一致**，证明面板不会随帧重渲染（这条比"看帧时间没变"更直接） |
| 分位数正确性 | 单测 11 例：nearest-rank（100 样本窗口的 p50/p95/p99 = 50/95/99）、空样本返回 0 而非 NaN、越界分数被夹紧、NaN/负占位被剔除、单样本 |
| 监控器 | 单测 8 例：空窗口 fps=0（非 NaN）、fps 由均值间隔反推（16.6667 ms → ~60 fps）、**帧间隔序列与脚本耗时序列互不污染**、只保留配置窗口、物理子步累计、reset、scratch 复用 |
| 物理步数统计 | `PhysicsStepper` 暴露 `stepsLastFrame` / `totalSteps`；大 delta 被 `MAX_STEPS_PER_FRAME` 截断的行为已有既有单测覆盖（本任务只增计数） |
| 新增用例与回归 | 155 → **173**（新增 18：stats 11、perf-monitor 8，其中 1 例重叠统计）；smoke 21/21、cluster 10/10、stage 12/12、adas 15/15、金标准影棚前缀 301 帧 **0.000e+0**、stability 22/22 |
| 包体基线不漂移 | `scripts/measure-budget.mjs --write`（`npm run budget`）生成 `src/dev/bundle-baseline.ts`，面板展示的是**由脚本实测并写入**的数字，手改无效 |

### 本轮修掉的问题

1. `measure-budget.mjs` 的 `--write` 分支里两个错误：在**非 async 的 `reduce` 回调里用 `await`**（语法错误，`node --check` 抓不到因为它是运行时解析…实际会直接抛）、以及**忘记 import `writeFile`**。都已修正。
2. draw call 实测为 **82**（本任务测量运行），高于 ≤80 预算：经排查是**视锥剔除差异**（同一场景在 76–82 之间随相机视角浮动，历史测量为 76）。如实记录为区间，并说明压到 80 以下的可行手段（塔/墙 `InstancedMesh`、进一步减少探针 pass），本任务不做。

### 与计划的偏差

- 计划建议性能面板复用 **F12**，但 F12 已被车辆数据面板占用，因此改用 **F9**（并在面板上标注按键），避免一个快捷键触发两个面板。
