# Iteration 2 · Vehicle state data layer, digital cluster and highway stage

> 父任务：迭代 2（`docs/superpowers/specs/2026-10-15-iteration-plan.md` §6）
> 目标一句话：让数据**有地方来、有地方去**，并长出第一块 HMI（数字仪表）与第二个舞台（高速）。
> 依赖：迭代 1 已完成（Vite + TS + React 19 基线、错误边界 / 上下文恢复 / 加载重试、首屏 72.9 kB gzip、45 单测、6 份规范）。

## Goal

把散落在各模块里的"每帧隐式变量"收敛成**可单测、可订阅、可插拔**的数据层，并在此基础上：
1. 修掉迭代 1 分析里遗留的单位换算错误（`UNITS_PER_METER` 定义了却没用）；
2. 把控制 / 相机 / 车辆更新**delta 化**，使同一操作序列在 30 / 60 / 144 Hz 下结果一致；
3. 交付数字仪表（DOM/CSS overlay，不引入第二个渲染上下文）；
4. 交付高速舞台（kinematic 自车 + Rapier 环境），并支持舞台切换。

## Requirements

| # | 需求 | 归属 |
|---|---|---|
| R1 | `game/vehicle-state.ts`：纯计算的车辆信号（m/s 与 km/h 车速、纵/横加速度、横摆角速度、四轮转速、转向角、挡位、碰撞事件），不依赖 Three/Rapier/DOM | D1 |
| R2 | `game/state-bus.ts`：单一数据源 + 订阅，Three 侧与 UI 侧同等消费；JSON 回放与实时模拟器可互换 | D1 |
| R3 | 控制 / 相机 / 车辆更新全部 delta 化（时间步进而非"每帧常量"） | D1 |
| R4 | `game/telemetry.ts` 输出从"直接改 HUD 字段"改为"发布事件 + 快照" | D1 |
| R5 | `UNITS_PER_METER` 真正参与单位换算，HUD 显示值 = 物理速度 × (1/UNITS_PER_METER) × 3.6 | D1 |
| R6 | 数字仪表：车速表、挡位、功率条、智驾状态图标（数据驱动，非硬编码） | D2 |
| R7 | 舞台切换 UI（影棚 ⇄ 高速） | D2 |
| R8 | `game/scenes/highway.ts`：kinematic 自车沿可复现轨迹巡航，环境物交 Rapier；`GameSession` 接受 scene 工厂 | D3 |

## Acceptance Criteria

| 项 | 验收 | 归属 |
|---|---|---|
| AC2.1 帧率无关 | 同一操作序列在 30 / 60 / 144 Hz 下，车速-时间曲线与相机跟随误差在容差内一致（给出对比表） | D1 |
| AC2.2 单位正确 | HUD 显示值 = 物理速度 × (1/`UNITS_PER_METER`) × 3.6，误差 0；Top Speed 与理论值对得上 | D1 |
| AC2.3 仪表 | 20 Hz 刷新无掉帧（帧时间 p95 不因仪表上升超过 0.5 ms）；挡位 / 告警由数据驱动 | D2 |
| AC2.4 舞台切换 | 影棚 ⇄ 高速 ≤ 200 ms，切换 20 次后内存与 draw call 回到基线 | D3 |
| AC2.5 数据可插拔 | 状态源接口化：JSON 回放与实时模拟器可互换，UI 不改 | D1 |
| AC2.6 测试 | 单测 ≥ 25 用例；`vehicle-state` 覆盖率 ≥ 80% | D1 |

## Constraints

- 不引入新的状态库 / 渲染上下文：仪表坚持 DOM/CSS + transform（canvas 绘制会与 3D 抢主线程）。
- `game/` 继续禁止 import React；跨层只经 `GameHost` 接缝。
- 迭代 1 的行为不变性门禁继续生效：任何改动后 `npm run deterministic -- --compare` 必须仍能解释差异（delta 化会**有意**改变数值，因此迭代 2 需重新录制基线并说明差异来源）。
- 每个子任务独立可归档、可 revert；一个逻辑改动一个提交（英文祈使句、无前缀）。

## Out of Scope

- ADAS 目标框 / 车道线 / 规划轨迹（迭代 3）
- 感知噪声模型（迭代 3）
- 真实车机部署与发布通道（迭代 3）
- 多屏联动、语音交互、完整设计系统
