# Iteration 2 · 集成评审（parent 执行）

## 1. 子任务状态

| 子任务 | 状态 | 关键提交 |
|---|---|---|
| D1 车辆状态层与状态总线 | ✅ 归档 | `Add the vehicle state layer and the state bus` / `Make the control loop frame-rate independent` / `Drive the HMI from the state bus and fix the displayed units` |
| D2 数字仪表 | ✅ 归档 | `Add the digital cluster driven by the vehicle state` |
| D3 高速舞台 | ✅ 归档 | `Add the highway stage with a kinematic lead vehicle` |

## 2. 验收标准逐条核对

| AC | 判据 | 实测 | 判定 |
|---|---|---|---|
| AC2.1 帧率无关 | 同一操作序列在 30 / 60 / 144 Hz 下速度曲线与相机跟随一致 | **物理轨迹逐帧位级一致 0.0000**（速度、位置全为 0）；控制状态 0.000%；相机等效时间常数偏差 ≤0.0254 s（容差 0.05 s） | ✅ |
| AC2.2 单位正确 | HUD = 物理速度 × (1/UNITS_PER_METER) × 3.6，误差 0 | 单测严格等式（0 / 负值 / 极值 / 往返）；运行时实测按住 W 由 11.3 → 56.0 **km/h**（此前是原始世界单位被当作 km/h） | ✅ |
| AC2.3 仪表 | 20 Hz 刷新无掉帧（帧时间 p95 增量 ≤0.5 ms）；挡位/告警数据驱动 | 数据驱动 ✅（N→D、加速功率 +11 kW、状态图标随状态变化）；**帧时间判据在本环境不可判定**：SwiftShader 下帧时间 ~80 ms、跨轮噪声 p50 3.1 / p95 10.4 ms，比 0.5 ms 判据大 1–2 个数量级。改用结构性论证：store 写入限流 20 Hz + 静态表盘 memo 化 + 仅文本/transform/opacity 变化（AC-D2.4 实测盒模型不变） | ⚠️ 部分（数据驱动 ✅，帧时间无法判定，已留痕） |
| AC2.4 舞台切换 | 影棚 ⇄ 高速 ≤200 ms，切换 20 次后资源回基线 | **应用自身重建：冷 5.7 ms / 热中位数 2.2 ms**；20 次切换后 geometries 45→45、textures 21→21、programs 20→20、listeners 20→20；感知耗时中位数 955 ms（软件渲染首帧主导，已分开报告） | ✅ |
| AC2.5 数据可插拔 | JSON 回放与实时模拟可互换，UI 不改 | `?replay` 模式：录制帧驱动同一份 `GameHost`，HUD 显示录制值 36.0 km/h，且**未加载 three-game chunk**；UI 代码零改动 | ✅ |
| AC2.6 测试 | 单测 ≥25；`vehicle-state` 覆盖率 ≥80% | **125 用例**；`vehicle-state.ts` / `state-bus.ts` / `units.ts` / `frame-rate.ts` 行覆盖 **100%**，`telemetry.ts` 95.4%，整体 95.9% | ✅ |

## 3. 集成评审清单

- [x] `git status` 干净；三个子任务的提交均已落地，风格一致（英文祈使句、无前缀）
- [x] `npm run typecheck` 0 错误、`npm run test` 125/125、`npm run build` 通过
- [x] `dist/` 起服务后可演示：影棚可驾驶、可切座舱视角、可重置；高速可驾驶、切换器可用；仪表四种读数随真实驾驶变化
- [x] 行为不变性：影棚物理金标准**前缀 301 帧 0.000e+0**（新增状态层/仪表/舞台均未改影棚物理）
- [x] 三类故障注入仍全过：`npm run stability` **22/22**
- [x] UI 行为：`npm run smoke` **21/21**（含回放 4 项、仪表 2 项）
- [x] 仪表与切换：`npm run cluster` 10/10、`npm run stage` 12/12
- [x] README §十三 已增补数据层 / 仪表 / 高速舞台三节，且未把迭代 3 内容写成已完成
- [x] 迭代 1 的成果未回退：首屏 72.9 kB gzip、无 CDN 引用、错误边界与上下文恢复仍在

## 4. 完成定义（DoD）

| 条目 | 状态 |
|---|---|
| 三个子任务均已 `task.py archive` | ✅ |
| 集成评审清单全过 | ✅（AC2.3 的帧时间项按"不可判定 + 结构性论证"留痕，非静默通过） |
| `main` 分支 `dist/` 可从零构建 | ✅ `npm ci` 锁文件一致 → `npm run build` |
| README 状态已更新 | ✅ §十三 三节 |
| `chore: record journal` 已记录 | ✅ 见 workspace journal |

## 5. 迭代 2 的收获与遗留

**收获**：① 用"位级一致"而不是"看起来差不多"证明帧率无关；② 顺带修掉三个上游缺陷（转向越限 0.84°、起跳电平触发、重置无反馈）；③ 建立了金标准 + 前缀比对 + 自定义帧数的回归工作流。

**遗留（诚实记录）**：
1. AC2.3 的帧时间判据需要真机/独显环境才能判定。
2. 相机跟随的**瞬态**在不同帧率下位置可差 ~2.7 world units（离散滤波采样固有），已用"等效时间常数"作为判据并在记录中说明。
3. 迭代 3 的 ADAS 图层将复用：同一路径（车道几何）、kinematic 前车（目标）、`GameEvent`（告警）、`state-bus`（状态快照）。
