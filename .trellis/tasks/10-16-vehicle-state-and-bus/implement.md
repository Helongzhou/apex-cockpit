# D1 · VehicleState signals and the state bus

> 父任务：`.trellis/tasks/10-16-iteration-2-data-layer`
> 优先级：P0 ｜ 预估：2.5 天 ｜ 前置：迭代 1 已归档

## Goal

把"每帧隐式变量"变成显式的、可单测的信号与事件总线，并顺手修掉单位换算与帧率依赖两处根因问题。

## Requirements

| # | 需求 | 证据来源 |
|---|---|---|
| R1 | `game/vehicle-state.ts`：`VehicleState` 快照（`speedMps`、`speedKmh`、`accelLongitudinal`、`accelLateral`、`yawRate`、四轮 `wheelSpeed`、`steerAngle`、`gear`、`collision`) + 纯函数 `deriveVehicleState(previous, sample, dt)` | 分析报告 U1/U2、F1–F4 |
| R2 | `game/state-bus.ts`：`createStateBus<T>()`（发布快照 + 订阅 + 版本号），Three 侧与 UI 侧同等消费；`StateSource` 接口使"JSON 回放 / 实时模拟器"可互换 | 迭代计划 §6.1 |
| R3 | 控制 / 相机 / 车辆更新 delta 化：`controls.update(dt)`、`follow-camera.update(dt)`、车辆视觉更新接受 dt | 分析报告 F1–F4（"每帧常量"在 144 Hz 下会变成 2.4 倍强度） |
| R4 | `telemetry.ts` 改为发布事件（`collision`、`boxKnocked`、`raceStart`）+ 20 Hz 快照，不再直接写 HUD 字段 | 迭代计划 §6.1 |
| R5 | `UNITS_PER_METER` 真正参与换算：HUD 车速 / 最高速 / 位置显示与物理单位一致 | 分析报告 U1/U2 |
| R6 | 单测：`tests/vehicle-state.test.ts`、`tests/unit-conversion.test.ts`，且 `vehicle-state.ts` 覆盖率 ≥ 80% | 迭代计划 §6.2 |

## Acceptance Criteria

| 项 | 判据 | 验证方式 |
|---|---|---|
| AC-D1.1 | `npm run typecheck` 0 错误、`npm run test` 全绿且用例数 ≥ 25 | 命令输出 |
| AC-D1.2 | `vehicle-state.ts` 行覆盖率 ≥ 80% | `npm run test:coverage` |
| AC-D1.3 | 单位换算误差 0：给定物理速度 v(m/s)，HUD 数值严格等于 `v / UNITS_PER_METER * 3.6` | 单测断言（含边界：0、负值倒车、极值） |
| AC-D1.4 | 帧率无关：同一脚本化输入在 30 / 60 / 144 Hz 下采样 `speedKmh` 曲线，最大偏差 ≤ 容差（记录实测值与容差） | 新增 `scripts/frame-rate-compare.mjs`，复用确定性 harness 的固定 dt |
| AC-D1.5 | 数据可插拔：`StateSource` 的"回放"实现能把一份 JSON 快照序列喂给 UI，UI 代码零改动 | 单测 + 一个 `?replay=` 参数的最小接线 |
| AC-D1.6 | 事件化：碰撞 / 撞箱 / 起跑 以事件发布，且消费者（HUD、后续 ADAS 层）无需轮询 | 单测断言订阅回调 |

## Steps

1. `game/vehicle-state.ts`：定义快照类型与纯推导函数（含有限差分求加速度、由轮速推车速、由转向角与轴距推横摆角速度的理论值）。
2. `game/state-bus.ts`：`createStateBus`（发布 / 订阅 / 版本）、`StateSource` 接口、`ReplaySource`（读 JSON 快照序列）。
3. 接线：`game-session` 每帧组装 `sample` → `deriveVehicleState` → `bus.publish`；`telemetry` 退化为消费者（事件 + 20 Hz 快照）。
4. delta 化：`controls.update(dt)`、`follow-camera.update(dt)`、`car.updateVisuals(state, dt)`；把"每帧常量"改成"每秒常量 × dt"。
5. 单位：`physics-world` 导出 `UNITS_PER_METER` 并在 telemetry 与 UI 显示处统一使用。
6. `?replay=` 接线（最小）：`src/dev/replay-source.ts` 读 `window.__APEX_REPLAY` 喂 bus。
7. 测试：`tests/vehicle-state.test.ts`（信号正确性 / 有限差分 / 挡位判定 / 边界）、`tests/unit-conversion.test.ts`（换算矩阵）、`tests/state-bus.test.ts`（订阅 / 版本 / 回放源）。
8. `scripts/frame-rate-compare.mjs`：以 30/60/144 Hz 三种固定 dt 跑同一脚本化输入，输出速度曲线对比表与最大偏差。
9. **重新录制确定性基线**并说明差异来源（delta 化会改变数值；旧基线 `det-baseline.json` 只作迭代 1 的证据保留）。

## 门禁

- G1：`npm run typecheck && npm run test` 全绿。
- G2：`npm run build && npm run smoke && npm run stability` 不回退（15/15、22/22）。
- G3：AC-D1.4 的对比表落地到本文件"实测记录"，含容差与结论。
- G4：README §十二 增补迭代 2 的数据层说明（不含迭代 3 内容）。

## 回滚点

- 若 delta 化导致手感明显变化：保留 `vehicle-state.ts` / `state-bus.ts`（纯新增，零风险）并单独回滚 delta 化那一个提交，把"帧率无关"推到迭代 3。

## 实测记录（执行时填写）

### 已完成（步骤 1/2/4/7/8 + 金标准工作流）

| 项 | 值 |
|---|---|
| 新增模块 | `game/math/units.ts`（单位换算单一入口）、`game/math/frame-rate.ts`（每帧常量 → 时间基）、`game/vehicle-state.ts`（纯信号推导）、`game/state-bus.ts`（总线 + 可插拔状态源 + 回放源） |
| 用例数 / 覆盖率 | **96 用例**（D1 新增 54：vehicle-state 25、state-bus 11、frame-rate 12、unit-conversion 6）；`vehicle-state.ts` / `state-bus.ts` / `units.ts` / `frame-rate.ts` 行覆盖 **100%**，整体 96.5% |
| 单位换算误差 | **0**（严格等式：`worldSpeedToKmh(80) === 36`、负值倒车、0、往返换算均以 12 位精度断言） |
| **AC-D1.4 帧率无关** | **30 / 60 / 144 Hz 物理轨迹逐帧位级一致（max\|delta\| = 0.0000，速度与位置均为 0）**；控制状态（电机目标 / 转向角）偏差 **0.000%**（满量程）；相机等效时间常数偏差 ≤ **0.0254 s**（容差 0.05 s） |
| AC-D1.2 | `vehicle-state.ts` 行覆盖率 100% ≥ 80% ✅ |
| AC-D1.3 | 单位换算误差 0 ✅ |
| 关键修复 1 | 控制 / 相机 / 车辆视觉的"每帧常量"全部改为时间基：`perSecondRate` / `decayFactor` / `smoothingFactor` / `clampStep`，并保证 **60 Hz 下严格恒等**（`smoothingFactor` 在 `frames === 1` 时直接返回原因子，因为 `1-(1-k)` 在二进制浮点下会差 1 ulp） |
| 关键修复 2 | 控制更新移入**物理子步**（`PhysicsStepper.step(dt, onSubstep)`），使输入在任意渲染帧率下都落在同一个 120 Hz 网格上 —— 这是 30/60/144 Hz 位级一致的根本原因 |
| 关键修复 3 | 上游的转向角会**越出自身上限**（`if (a < MAX) a += 0.05` → 最终 0.80 rad vs 上限 0.7854 rad，差 0.84°）。修正为精确封顶；这也是与迭代 1 基线唯一的有意行为差异 |
| 关键修复 4 | `holdJump()` 是电平触发（每调用一次加一次冲量），按住 0.1 s 在 144 Hz 下会加 14 次、30 Hz 只有 3 次。改为**每秒冲量预算**（60/s，即原 60 fps 行为） |
| 金标准工作流 | 新增 `baselines/physics-golden.json`（601 帧）+ `npm run golden` / `npm run frame-rate`；`compare-deterministic.mjs` 头部说明"有意行为变更需同提交重录并说明原因，禁止放宽容差"。金标准复跑严格可复现（0.000e+0） |
| 与迭代 1 基线的差异 | 首帧分歧 frame 11，最大 6.19e+1（vy）。**这不是回归**：输入采样模型由"渲染帧边界"改为"物理子步网格"，且修了转向上限。迭代 1 的归档基线继续作为历史证据保留 |

### 已完成（步骤 1–8 全部）

**运行时接线（步骤 3/5/6）**

| 项 | 实现 | 证据 |
|---|---|---|
| 状态推导进运行时 | `GameSession.publishVehicleState()` 每帧组装 `VehicleSample`（位置 / 速度 / 航向 / 转向角 / 质量 / 轴距）→ `deriveVehicleState(上一帧状态, sample, dt, 碰撞标志)` → `bus.publish()` | `game/game-session.ts` |
| 总线是唯一数据源 | `GameSession` 持有 `StateBus<VehicleState, GameEvent>`；`Telemetry` 不再自己采样车，改为**订阅**总线（`bus.subscribe` + `bus.onEvent`） | `game/telemetry.ts` |
| 单位进 HUD（修 U1/U2） | HUD 车速 = `state.speedKmh`（物理 km/h），位置 = `state.positionMeters`（米），阈值全部由 `worldSpeedToMps` / `worldUnitsToMeters` 换算自原世界单位常量 | 浏览器实测：按住 W 后 11.3 → 25.4 → 40.6 → 56.0 **km/h**（此前是原始世界单位被当成 km/h 显示） |
| 事件化（AC-D1.6） | `collision` / `boxKnocked` / `raceStart` 作为 `GameEvent` 发布；HUD 计数由事件驱动，不再轮询 | `tests/telemetry.test.ts` 7 例 + 运行时日志 `Collision detected! Speed change: 67.55 km/h, Total collisions: 1` |
| 数据可插拔（AC-D1.5） | `src/dev/replay-source.ts` + `isReplayMode()`：`window.__APEX_REPLAY` 存在时 **完全不加载游戏模块**，由录制帧驱动同一份 `GameHost` 字段 | `ui-smoke` 新增 4 项：ready 态到达、HUD 显示录制值 **36.0 km/h**、**未加载 three-game chunk**、无页面错误 |

**验收结果**

| AC | 判据 | 实测 | 判定 |
|---|---|---|---|
| AC-D1.1 | typecheck 0 错误、用例 ≥25 | 0 错误；**103 用例 / 11 文件** | ✅ |
| AC-D1.2 | `vehicle-state.ts` 覆盖率 ≥80% | **100%**（`state-bus.ts` 100%、`telemetry.ts` 95.4%、整体 95.9%） | ✅ |
| AC-D1.3 | 单位换算误差 0 | 严格等式断言（0 / 负值 / 极值 / 往返）；运行时 HUD 实测为 km/h | ✅ |
| AC-D1.4 | 30/60/144 Hz 曲线一致 | **物理轨迹逐帧位级一致 0.0000**；控制状态 0.000%；相机等效时间常数偏差 ≤0.0254 s | ✅ |
| AC-D1.5 | 回放与实时可互换，UI 零改动 | 回放模式下 4 项检查通过，且**游戏 chunk 未被加载** | ✅ |
| AC-D1.6 | 事件化，消费者无需轮询 | 事件订阅单测 7 例 + 运行时日志改为 km/h 输出 | ✅ |

**门禁复核**：`typecheck` 0 错误；`test` 103/103；`build` 通过；`smoke` **19/19**；`stability` **22/22**；金标准 `--compare` **0.000e+0**（遥测/总线重写未触碰物理，这一条本身就是回归证据）。

### 本轮发现的问题

1. **重置竞态的真实成因**：重置期间 UI 不显示任何状态，导致冒烟脚本"等 overlay 消失"实际等于没等，按下的 W 落在会话重建窗口里被丢弃。修法：`runReset` 也进入可见的 `loading` 态（顺带是更好的 UX），并把冒烟的固定墙钟等待改为条件等待（软件渲染下帧率越低，同样墙钟对应的仿真时间越少）。
2. 测试暴露的两处**我自己写错的断言**（不是代码问题）：同步连发多次 publish 时忽略了 20 Hz 节流；掉速刚好等于阈值（上游是严格大于）。已用可控时钟 + 明确高于阈值的用例修正。
3. `GameSession.update()` 增加了 `onSubstep` 钩子（回归 harness 用它把输入注入到物理网格上），这与 C2 的 `GameOptions.onSubstep` 形成一条完整的"时间基输入"通道。
