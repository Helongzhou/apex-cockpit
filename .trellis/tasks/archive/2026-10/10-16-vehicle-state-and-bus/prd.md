# D1 · VehicleState signals and the state bus

> 父任务：`.trellis/tasks/10-16-iteration-2-data-layer`
> 优先级：P0 ｜ 预估：2.5 天 ｜ 前置：迭代 1 已归档

## Goal

把"每帧隐式变量"变成显式的、可单测的信号与事件总线，并顺手修掉单位换算与帧率依赖两处根因问题。

## Requirements

| # | 需求 | 证据来源 |
|---|---|---|
| R1 | `game/vehicle-state.ts`：`VehicleState` 快照（`speedMps`、`speedKmh`、`accelLongitudinal`、`accelLateral`、`yawRate`、四轮 `wheelSpeed`、`steerAngle`、`gear`、`collision`）+ 纯函数 `deriveVehicleState(previous, sample, dt)` | 分析报告 U1/U2、F1–F4 |
| R2 | `game/state-bus.ts`：`createStateBus<T>()`（发布快照 + 订阅 + 版本号）；`StateSource` 接口使"JSON 回放 / 实时模拟器"可互换 | 迭代计划 §6.1 |
| R3 | 控制 / 相机 / 车辆更新 delta 化：`controls.update(dt)`、`follow-camera.update(dt)`、车辆视觉更新接受 dt | 分析报告 F1–F4（"每帧常量"在 144 Hz 下会变成 2.4 倍） |
| R4 | `telemetry.ts` 改为发布事件（`collision`、`boxKnocked`、`raceStart`）+ 20 Hz 快照，不再直接写 HUD 字段 | 迭代计划 §6.1 |
| R5 | `UNITS_PER_METER` 真正参与换算：HUD 车速 / 最高速 / 位置显示与物理单位一致 | 分析报告 U1/U2 |
| R6 | 单测：`tests/vehicle-state.test.ts`、`tests/unit-conversion.test.ts`、`tests/state-bus.test.ts`，且 `vehicle-state.ts` 覆盖率 ≥ 80% | 迭代计划 §6.2 |

## Acceptance Criteria

| 项 | 判据 | 验证方式 |
|---|---|---|
| AC-D1.1 | `npm run typecheck` 0 错误、`npm run test` 全绿且用例数 ≥ 25 | 命令输出 |
| AC-D1.2 | `vehicle-state.ts` 行覆盖率 ≥ 80% | `npm run test:coverage` |
| AC-D1.3 | 单位换算误差 0：给定物理速度 v(m/s)，HUD 数值严格等于 `v / UNITS_PER_METER * 3.6` | 单测断言（含 0、负值倒车、极值） |
| AC-D1.4 | 帧率无关：同一脚本化输入在 30 / 60 / 144 Hz 下采样 `speedKmh` 曲线，最大偏差 ≤ 容差（附实测值） | `scripts/frame-rate-compare.mjs` |
| AC-D1.5 | 数据可插拔：`StateSource` 的回放实现能把 JSON 快照序列喂给 UI，UI 零改动 | 单测 + `?replay=` 最小接线 |
| AC-D1.6 | 事件化：碰撞 / 撞箱 / 起跑以事件发布，消费者无需轮询 | 单测断言订阅回调 |

## Steps

1. `game/vehicle-state.ts`：快照类型 + 纯推导函数（有限差分求加速度、由轮速推车速、由转向角与轴距推横摆角速度理论值、挡位判定）。
2. `game/state-bus.ts`：`createStateBus`（发布 / 订阅 / 版本）、`StateSource` 接口、`ReplaySource`。
3. 接线：`game-session` 每帧 `sample` → `deriveVehicleState` → `bus.publish`；`telemetry` 退化为消费者（事件 + 20 Hz 快照）。
4. delta 化：`controls.update(dt)`、`follow-camera.update(dt)`、`car.updateVisuals(state, dt)`；"每帧常量" → "每秒常量 × dt"。
5. 单位：由 `physics-world` 导出 `UNITS_PER_METER`，telemetry 与 UI 显示统一使用。
6. `?replay=` 最小接线：`src/dev/replay-source.ts` 读 `window.__APEX_REPLAY` 喂 bus。
7. 测试：`tests/vehicle-state.test.ts`、`tests/unit-conversion.test.ts`、`tests/state-bus.test.ts`。
8. `scripts/frame-rate-compare.mjs`：三种固定 dt（1/30、1/60、1/144）跑同一脚本化输入，输出速度曲线对比与最大偏差。
9. **重新录制确定性基线**并说明差异来源（delta 化会改变数值；迭代 1 的 `det-baseline.json` 仅作历史证据）。

## 门禁

- G1：`npm run typecheck && npm run test` 全绿。
- G2：`npm run build && npm run smoke && npm run stability` 不回退（15/15、22/22）。
- G3：AC-D1.4 对比表写入本文件"实测记录"，含容差与结论。
- G4：README §十二 增补迭代 2 数据层说明（不写迭代 3 内容）。

## 回滚点

若 delta 化导致手感明显变化：保留 `vehicle-state.ts` / `state-bus.ts`（纯新增、零风险）并单独回滚 delta 化提交，把"帧率无关"推到迭代 3。

## 实测记录（执行时填写）

| 项 | 值 |
|---|---|
| 用例数 / 覆盖率 | （待填） |
| 单位换算误差 | （待填） |
| 30/60/144 Hz 最大偏差与容差 | （待填） |
| 事件化后 telemetry 的职责边界 | （待填） |
