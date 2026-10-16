# E1 · ADAS 可视化图层

> 父任务：`.trellis/tasks/10-16-iteration-3-adas` ｜ P0 ｜ 前置：D1（状态总线）、D3（高速舞台 + 确定性路径）

## Goal

把"智驾可视化"这件 JD 核心事做出来：**车道线 + 目标框**，并且用独立 `THREE.Layers` 把 ADAS 几何与 3D 场景解耦（ADAS 不进车体反射、不进辉光暗化 pass）。

## Requirements

| # | 需求 | 说明 |
|---|---|---|
| R1 | `game/adas/layers.ts` | `ADAS_LAYER` 常量 + `markAdas(obj)` / `isAdas(obj)`；主相机启用该层，反射探针与辉光暗化 pass 排除该层 |
| R2 | `game/adas/lanes.ts` | 由高速确定性路径生成车道线（可配置车道宽），并输出**横向误差**（自车相对车道中心，米） |
| R3 | `game/adas/targets.ts` | 目标框**对象池**（预分配、update 期零分配）：位置 + 速度矢量 + 类别 + 置信度 + 真值/感知标记 |
| R4 | `game/adas/manager.ts` | 组合图层：`update(dt, ego, targets, mode)`、`setMode('off'|'truth'|'perception')`、`dispose()` |
| R5 | 集成 | 高速舞台把 kinematic 前车作为目标上报；`GameSession` 仅在舞台提供目标时创建 ADAS 层；UI 提供真值/感知/关闭切换 |
| R6 | 纯数学可测 | 横向误差与车道归属抽成 `game/math/lane-geometry.ts`（无 three/Rapier 依赖） |

## Acceptance Criteria

| 项 | 判据 | 验证方式 |
|---|---|---|
| AC-E1.1 | 高速舞台上可见车道线与目标框，且随前车移动 | `scripts/adas-check.mjs`：开启 ADAS 后 `__APEX_STATS().adasTargets ≥ 1`、车道线网格存在、关闭后为 0 |
| AC-E1.2 | ADAS 几何**不进反射探针**、不进辉光暗化 pass | 代码断言（探针用独立 layers mask）+ 检查脚本读取 `__APEX_STATS().adasLayerExcluded` |
| AC-E1.3 | 对象池在 update 期零分配 | 单测：预分配 N 个后反复 update，池内对象身份不变、数量不变 |
| AC-E1.4 | 横向误差数学正确 | 单测：直道为 0、偏左为正/负一致、跨车道归属正确、边界值 |
| AC-E1.5 | 回归 | 金标准影棚 0 差异、smoke/stability/cluster/stage 不回退 |

## 门禁

- G1：typecheck 0、test 全绿（新增 ≥12 例）。
- G2：build + smoke + stability + cluster + stage 不回退。
- G3：金标准 `--compare` 0 差异（ADAS 是新增图层，不改物理）。
- G4：实测写入本文件；README §十四 增补。

## 实测记录（执行时填写）

`npm run adas` **12/12 通过**。

| 项 | 值 |
|---|---|
| 车道线 / 目标框存在性与开关 | 影棚：无 ADAS、切换器隐藏 ✅；高速：**4 条车道带**（3 车道 4 条边界）、真值模式 **1 个目标**（kinematic 前车）、车道误差 **-0.00 m / 车道 1**（正中）；关闭后 targets 0、`visible=false`；感知模式仍渲染目标（E2 接管噪声后语义会变） |
| 图层隔离验证 | 覆盖层在**第 3 层且不在第 0 层**（`layer: 3, layerIsolated: true`）——第 0 层正是反射探针与默认相机渲染的层，因此 ADAS 不会出现在车体反射里；同时 `collectNonGlowingMeshes` 显式跳过 ADAS，辉光暗化 pass 也不会把覆盖层压黑。单测另断言了 `Layers` 语义本身 |
| 对象池零分配 | 单测：预分配容量正确（每槽 2 个标记）、多次 update 后 `scene.children` **身份不变**、超容量被截断、未用槽隐藏、空列表全部隐藏；几何模板克隆而非共享（避免共享缓冲被改写） |
| 用例数与回归 | 125 → **142**（新增 17：`lane-geometry` 10、`adas-targets` 7）；smoke 21/21、cluster 10/10、stage 12/12、stability 22/22、金标准影棚前缀 301 帧 **0.000e+0** |

### 本轮修掉的真实缺陷

1. **对象池的几何被共享缓冲覆盖**：构造函数末尾用共享的单位立方体几何替换了每槽的 position 属性，导致所有目标框都渲染成原点处的单位立方体（单测"角点应超出中心"抓到的）。改为**模板克隆 + 每槽独立属性**。
2. **车道编号符号不自洽**：`laneCentreOffset` 与 `laneIndexOf` 对"车道 0 在哪一侧"的约定相反（一个把 lane 0 放右侧、一个放左侧）。统一为"lane 0 = 最左 = 正横向偏移"，并把该约定写进 `lane-geometry.ts` 的注释。
