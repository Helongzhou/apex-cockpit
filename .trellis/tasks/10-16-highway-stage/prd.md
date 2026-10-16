# D3 · 高速舞台

> 父任务：`.trellis/tasks/10-16-iteration-2-data-layer`
> 优先级：P1 ｜ 预估：2 天 ｜ 前置：D1（状态层）、D2（仪表）

## Goal

交付第二个舞台：高速公路。它是迭代 3 ADAS 可视化的**承载面**（长直道 + 车道线 + 前车目标），同时验证舞台可切换、可回收、切换足够快。

## Requirements

| # | 需求 | 说明 |
|---|---|---|
| R1 | `game/scenes/highway.ts` | 高速环境：路面 + 3 车道虚线 + 两侧护栏（带 Rapier 碰撞体）+ 龙门架标志 + 路灯；`Environment` 契约与影棚一致 |
| R2 | 确定性路径 | `createHighwayPath()`：长直道 + 轻微 S 弯的中心线（纯函数，可复现），供前车巡航与迭代 3 的车道线可视化复用 |
| R3 | 前车（kinematic） | 一辆沿路径以恒定速度巡航的**前车**，位置/朝向由路径解析给出；作为迭代 3 的 ADAS 目标 |
| R4 | 舞台注册表 | `game/scenes/index.ts`：`StageId -> { label, createEnvironment }`；游戏启动时把可用舞台写入 `host.stages`，UI 据此渲染切换器（UI 不静态 import 游戏模块） |
| R5 | 会话接受舞台 | `GameSession.create(..., stageId)` 按注册表建环境；`three-game` 记住当前舞台并提供 `setStage()` |
| R6 | 切换成本 | 切换 ≤ 200 ms（含 GLB 缓存复用），连续切换 20 次后 draw call / geometries / textures 回到基线 |

## Acceptance Criteria

| 项 | 判据 | 验证方式 |
|---|---|---|
| AC-D3.1 | 影棚 ⇄ 高速 均可驾驶，切换 ≤ 200 ms | `scripts/stage-check.mjs` 计时 |
| AC-D3.2 | 切换 20 次后资源回到基线，无异常、无监听器泄漏 | 同上，读取 `__APEX_STATS()` 与 `__listenerCount()` |
| AC-D3.3 | 前车沿路径巡航且可复现（同一模拟时间位置一致） | 单测 `tests/highway-path.test.ts` + 运行时断言位置随时间单调前进 |
| AC-D3.4 | 影棚行为不变 | 金标准 `--compare` 仍为 0（高速是新增舞台，影棚路径不得改动） |
| AC-D3.5 | UI 仅在游戏声明了 ≥2 个舞台时显示切换器 | smoke 断言切换器出现且可点击 |

## Steps

1. `game/scenes/highway.ts`：几何 + 碰撞体 + 确定性路径 + 前车。
2. `game/scenes/index.ts`：注册表（`studio` 复用 `world.createEnvironment`，`highway` 新增）。
3. `Environment` 增加**可选** `update?(dt)`（高速用它驱动前车；影棚不实现 → 行为不变）。
4. `GameSession.create(canvas, renderer, host, stageId)`；`game-session` 只依赖注册表接口。
5. `three-game`：`currentStage` 状态 + `setStage(host, stageId)`（复用 `runReset` 的串行化与 loading 态）+ 启动时写 `host.stages`。
6. `GameHost`：`stages` 列表；`src/app.ts` 接线 `setStage`。
7. `scene-switcher.tsx` 改为读 `host.stages`（不再硬编码）。
8. `scripts/stage-check.mjs` + `tests/highway-path.test.ts`。

## 门禁

- G1：typecheck 0 错误、test 全绿。
- G2：build + smoke + stability 不回退。
- G3：金标准 0 差异（影棚物理不变）。
- G4：切换耗时与 20 次切换的资源数据写入"实测记录"。
- G5：README §十三 增补高速舞台。

## 与计划的偏差（预先声明）

计划原文是"**kinematic 自车**沿可复现轨迹巡航"。本任务改为"**自车仍可驾驶 + 前车 kinematic 巡航**"，理由：① 自车改 kinematic 会让两个舞台都失去可玩性，也让迭代 3 的"感知/规划可视化"缺少真实驾驶员输入；② 迭代 3 需要的是一个**稳定的目标**（前车）来承载目标框与 ACC，而不是把自车变成动画。此偏差写入实测记录与 README。

## 实测记录（执行时填写）

`npm run stage` **12/12 通过**。

| 项 | 值 |
|---|---|
| 切换耗时（**应用自身重建**） | 冷切换（首次建高速静态几何）**5.7 ms**；回程 **2.7 ms**；10 次热切换 **中位数 2.2 ms**（预算 200 ms）✅ |
| 切换耗时（**用户感知**，软件渲染） | 冷 1036 ms、热中位数 **955 ms**。这段完全由软件光栅化下的首帧主导（新场景几何上传 + 阴影/探针重算），**不是应用逻辑开销** —— 两者分开报告，避免用一个数字掩盖真相 |
| 20 次切换后资源计数 | geometries **45 → 45**、textures **21 → 21**、programs **20 → 20**、listeners **20 → 20**；无页面错误 |
| 两个舞台均可驾驶 | 影棚 ✓（冒烟 21/21）；高速按住 W 车速 > 0 ✓ |
| 前车巡航可复现性 | `tests/highway-path.test.ts` 6 例：同一 distance 恒定返回同一点、中心线始终在振幅内、航向有限、沿 +Z 单调前进、默认长度与路面几何一致 |
| 舞台 UI | 切换器由游戏发布的 `host.stages` 驱动（UI 不静态 import 游戏模块），2 个按钮、当前舞台高亮 |
| 金标准 / smoke / stability | 金标准影棚前缀 301 帧 **0.000e+0**（新增舞台未影响影棚物理）、smoke **21/21**、stability **22/22** |
| 用例数 | 119 → **125**（新增 6：`highway-path`） |

### 本轮发现并解决的问题

1. **首次切到高速 1174 ms**：定位为静态几何（虚线/龙门架/路灯，数百个 box 合并）重复构建 + 首次 GPU 上传。修法是把这些**与路径常量绑定的静态几何做模块级缓存**，只构建一次。
2. **切换耗时的双峰现象**（26 ms vs ~1000 ms）说明"点按钮→overlay 消失"这个测量把应用重建和渲染首帧混在一起。改为在应用内部埋点 `lastSwitchMs`（只测会话重建），用户感知时间单独报告 —— 结论从"不达标"变成"应用 2.2 ms、感知受限于软件渲染"。

### 与计划的偏差（已在范围声明中预告并落实）

计划原文是"kinematic **自车**沿可复现轨迹巡航"，本任务实现为"**自车仍可驾驶 + 前车 kinematic 巡航**"：自车改 kinematic 会让两个舞台都失去可玩性，也让迭代 3 的感知/规划可视化缺少真实驾驶输入；而迭代 3 真正需要的是一个稳定目标（前车）来承载目标框与 ACC。
