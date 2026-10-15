# C2 · Execution Plan

> 前置：C1 已归档（`game/` 全 `.ts`、React UI 就位、`src/state.ts` 可用）→ `task.py start .trellis/tasks/10-15-runtime-recovery`
> 约定：一个逻辑改动一个提交；每个 S 步骤结束都要跑 `npm run typecheck`。

## 步骤清单（有序）

**S0 · 取证基线（先记录"改前"）**
1. 手动执行 `renderer.forceContextLoss()` / `forceContextRestore()`（控制台），记录当前表现：是否静默、仿真是否继续、恢复后辉光与车身反射是否正常。截图或控制台输出留档，作为 AC2.2 的"改前"证据。
2. 在 `renderFrame` 内注入一次 throw，记录"循环永久停止"的现场（three 不再排帧），作为 AC2.1 的"改前"证据。
3. 记录当前 `renderer.info.memory` 与事件监听数量，作为 AC2.4/AC2.5 的基线。

**S1 · 可释放性与 resize**
4. 新增 `game/disposables.ts`；把 `three-game.ts` 的 `resize` 与 canvas click、`follow-camera.ts`、`controls.ts` 的监听改为经 disposables 注册。
5. `src/hooks/useTouchDevice.ts` 与 `src/ui/MobileControls.tsx`（C1 迁移产物）改为 `AbortController` + `useEffect` cleanup 一次性注销。
6. resize 改为 `ResizeObserver` + rAF 合并；DPR 变化用 `matchMedia('(resolution: …dppx)')` 监听并重设 `setPixelRatio`。
7. 暴露 dev-only `window.__listenerCount()`（`{ added, removed }`）。
8. 提交：`Register and release DOM listeners through one disposer`。
9. **门禁 G1**：AC2.5 通过（计数平衡）；AC2.7 通过（拖拽 10 s 重建 < 10 次）。

**S2 · 错误边界**
10. 新增 `game/render-loop.ts`（try/catch + 连续异常阈值 1 + 启停 + `recover()`），替换 `three-game.ts` 里直接 `setAnimationLoop(renderFrame)` 的三处调用。
11. `src/state.ts` 增加 `runtime` 子状态；新增 `src/ui/RuntimeOverlay.tsx`（fatal 态展示错误首行 + "恢复"按钮）。
12. 提交：`Wrap the render loop in an error boundary`。
13. **门禁 G2**：AC2.1 通过（注入异常不冻结、可恢复、控制台无未捕获异常）。

**S3 · 加载可重试**
14. 新增 `game/loading.ts`；移除 `physics-world.ts` 的 `engineReady` 与 `car-model.ts` 的 `modelPromise` 反模式（缓存成功结果、失败清空、并发共享 in-flight）。
15. 接入退避重试（3 次：300/900/2700 ms），只对网络/解码类错误重试；`GLTFLoader` 走 `LoadingManager.onProgress` 报百分比，RAPIER 只报阶段文案。
16. `RuntimeOverlay` 增加 loading / retry 态与"第 N/3 次重试"提示。
17. 提交：`Make asset loading retryable and visible`。
18. **门禁 G3**：AC2.3 通过（404 注入 → 可见错误 → 恢复网络 → 重试成功，同一页面内不出现永久失败）。

**S4 · 重置重入**
19. `three-game.ts` 的 `resetGame` 串行化（`resetChain` + "有更新请求则跳过本轮"），并对 `isResetting` 期间的重复调用复用同一 promise。
20. 提交：`Serialize game resets`。

**S5 · 上下文丢失与时基**
21. 新增 `game/context-monitor.ts`：绑定 `webglcontextlost/restored`，驱动循环停止与 `GameSession.pause()/resume()`。
22. `GameSession` 增加 `pause()/resume()`：跳过 `stepper.step()`、`telemetry.update()` 与视觉插值，保证丢失期间物理步数不增长。
23. 恢复流程固定顺序：`timer.update()`（丢弃大 delta）→ 新建 `GlowComposer` → `setScene(scene, camera)` → 新建 `ReflectionProbe` → `attachToMesh(car.mesh)` → `session.resume()` → `loop.start()`。
24. `three-game.ts` 补 `timer.connect(document)`（依据 `docs/research/2026-10-15-external-facts.md` §2）。
25. 提交：`Recover the render loop from WebGL context loss`。
26. **门禁 G4**：AC2.2（丢失可观测 + 仿真暂停 + 恢复后画面与首帧无跳变）与 AC2.6（隐藏标签页 30 s 回归首帧 delta≈0）双通过。

**S6 · 文档纠偏与收尾**
27. 修正 `README.md` §七 P0-3 与 `docs/superpowers/specs/2026-10-15-codebase-analysis.md` 中"WebGL 上下文丢失零处理"的表述（改为"renderer 层由 three 处理，应用层缺少可观测性/时基/循环策略且未被验证"）。
28. 提交：`Correct the context-loss wording in the docs`。
29. 全量回归：重跑 C1 的 `scripts/compare-deterministic.mjs`（迁移与恢复改动不得改变可观察行为）。
30. 把 AC2.1–AC2.8 的实测值写入本文件"实测记录"，交 parent。

## 验证命令

```bash
npm run typecheck && npm run build
node scripts/compare-deterministic.mjs      # C1 交付，确认未破坏行为不变性
# 手动/控制台注入
#   renderer.forceContextLoss(); renderer.forceContextRestore();
#   window.__listenerCount(); window.__dumpDeterministic?.(true)
```

## 评审门禁

| 门禁 | 时点 | 判定 |
|---|---|---|
| G1 | S1 | AC2.5 计数平衡、AC2.7 重建次数达标 |
| G2 | S2 | AC2.1 注入异常不冻结且可恢复 |
| G3 | S3 | AC2.3 加载失败可重试、无永久失败 |
| G4 | S5 | AC2.2 上下文恢复完整（含辉光/反射）、AC2.6 时基不跳 |
| G5 | S6 | 文档纠偏完成 + 确定性回归仍通过 |

## 回滚点

| 回滚点 | 触发 | 动作 |
|---|---|---|
| C2-R1 | disposables 改造导致监听丢失（输入失效） | 单独 revert S1，保留其余步骤；监听缺口回到"已知问题"清单 |
| C2-R2 | 错误边界把可恢复错误也判为 fatal，演示受阻 | 调阈值为 3 并记录理由；**不得**改为静默吞掉异常 |
| C2-R3 | composer/探针重建后画面异常且 0.5 天内无法定位 | 回滚 S5 的"重建"部分，保留"可观测 + 暂停"；把画面问题写成新任务并在 README 标注限制 |
| C2-R4 | 重试退避导致演示等待过久 | 演示构建把退避降为 200/500/1000 ms（用 `import.meta.env.DEV` 区分），生产保留原值 |

## 实测记录（执行时填写）

| 项 | 值 |
|---|---|
| AC2.1 异常注入恢复耗时 | （待填） |
| AC2.2 上下文恢复耗时 / 首帧位移偏差 | （待填） |
| AC2.4 20 次重置后 world/几何/纹理计数 | （待填） |
| AC2.5 监听器 added/removed | （待填） |
| AC2.6 隐藏 30 s 后首帧 delta | （待填） |
| AC2.7 拖拽 10 s 的 RT 重建次数 | （待填） |
