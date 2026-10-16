# C2 · Technical Design

## 1. 新增模块与职责（全部在 `game/`，框架无关）

| 模块 | 职责 | 对外接口 |
|---|---|---|
| `game/render-loop.ts` | 帧循环宿主：try/catch 包裹、连续异常策略、启停、恢复 | `createRenderLoop({ frame, onError })` → `{ start(), stop(), isRunning, errorCount }` |
| `game/context-monitor.ts` | 监听 canvas 的 `webglcontextlost/restored`，驱动循环与仿真的暂停/恢复 | `createContextMonitor({ canvas, onLost, onRestored })` → `{ dispose(), isLost }` |
| `game/loading.ts` | 可重试、可观测的加载编排（RAPIER init + GLB） | `loadGameAssets({ onPhase })` → `Promise<Assets>`；失败抛带阶段信息的错误 |
| `game/disposables.ts` | 监听器/定时器/资源的统一收集与一次性释放 | `createDisposables()` → `{ add(fn), listen(target, type, handler, opts), dispose() }` |
| `src/ui/RuntimeOverlay.tsx` | 错误态 / 上下文丢失态 / 加载态的可见 UI 与"重试 / 恢复"操作 | 读 store 的 `runtime` 字段 |

`src/state.ts` 增加一个运行时子状态（C1 已建立 store，本任务只扩展字段）：

```ts
runtime: {
  phase: 'loading' | 'ready' | 'fatal' | 'context-lost';
  message?: string;
  detail?: string;          // 错误首行，用于排障
  retry?: () => void;       // 仅在可重试态出现
}
```

## 2. 错误边界契约（R2.1）

- `createRenderLoop` 的 `frame()` 在 try/catch 内执行；**捕获后不再抛出** → 保证 three 的 `WebGLAnimation` 始终能排到下一帧（`docs/research/2026-10-15-external-facts.md` §1 的约束）。
- **阈值策略：连续 1 次异常即进入 `fatal`**。理由：异常后游戏状态可能已不一致，静默继续会掩盖 bug 并产生不可预测画面；1 次即停 + 显式"恢复"入口，比自动重试更容易在面试现场解释。
- `fatal` 时：停止循环 → `runtime.phase='fatal'` → UI 显示错误首行 → 用户点"恢复" → 调用既有 `resetGame(vueApp→host)` 全量重建 → 成功后 `phase='ready'` 并重启循环。
- 恢复入口**幂等**：`isResetting` 期间重复点击直接复用同一个 promise。
- `recover()` 自身也包 try/catch：恢复失败则停留在 `fatal` 并更新 `message`（不允许二次抛出）。

## 3. 上下文丢失契约（R2.2）

| 事件 | 动作 |
|---|---|
| `webglcontextlost`（three 已 `preventDefault`） | `loop.stop()`；`session.pause()`（见下）；`runtime.phase='context-lost'`；记录 `lostAt` |
| `webglcontextrestored` | 丢弃时间基准 `timer.update()`（等价 delta=0）；重建 **`GlowComposer`** 与 **`ReflectionProbe`**（两者都持有 render target）；`session.resume()`；`loop.start()`；`runtime.phase='ready'` |
| 恢复后校验 | 第 1 帧不推进物理（delta=0），第 2 帧起正常；控制台打印恢复耗时，供 AC2.2 取证 |

- **为什么必须重建 composer 与探针**：`GlowComposer` 持有两个 `EffectComposer` 与多个 `WebGLRenderTarget`，`ReflectionProbe` 持有 `WebGLCubeRenderTarget`；three 的 `initGLContext()` 只保证 renderer 自身的 GL 状态重建，**应用层持有 RT 的 `texture` 与 `renderTarget2.texture` 引用必须重新绑定**（`mixPass.uniforms.bloomTexture` 直接引用 bloom 合成器的 RT 纹理，是典型会失效的引用）。
- **仿真暂停**：`GameSession` 增加 `pause()/resume()`，实现为 `renderFrame` 跳过 `stepper.step()` 与 `telemetry.update()`（视觉插值也一并跳过），保证"丢失期间物理步数不增长"，这是 AC2.2 的可测断言。
- **可自动化验证**：AC2.2 用 `renderer.forceContextLoss()` + `forceContextRestore()`（`three.module.js:16589/16599`）驱动，不依赖真实 GPU 掉线；`WEBGL_lose_context` 在无扩展时优雅跳过并记录"未能验证"。

## 4. 加载契约（R2.3）

- 移除两处"缓存 Promise 本身"的反模式（`physics-world.js:24-28` 的 `engineReady`、`car-model.js:41-46` 的 `modelPromise`）：
  - 缓存**成功结果**；失败时清空缓存并抛出**带阶段信息**的错误（`stage: 'engine' | 'model'`）。
  - 并发调用共享同一个 in-flight promise（保持原有的去重收益），但失败后该 promise 被丢弃。
- **重试策略**：`attempts: 3`，指数退避 `300/900/2700 ms`，仅对网络/解码类错误重试；全部失败后 `runtime.phase='fatal'` 且带 `retry`。
- **可见状态**：`loading` 阶段文案（`engine` → `model` → `ready`）；`GLTFLoader` 走 `LoadingManager.onProgress` 提供百分比，`RAPIER.init()` 无进度回调 → 只显示阶段文案（如实反映能力边界，不伪造进度条）。

## 5. 重置重入与监听器（R2.4 / R2.5）

- `resetGame()` 串行化：模块级 `let resetChain: Promise<void> = Promise.resolve()`，新调用返回 `resetChain = resetChain.then(runReset)`；`runReset` 前置检查"是否已有更新的 reset 在排队"，若有则跳过本轮（避免无意义重建）。
- 监听器统一经 `game/disposables.ts` 注册：
  - `game/three-game.ts` 的 `resize`（改为 `ResizeObserver` + rAF 合并）、`setupCanvasFocus` 的 click；
  - `game/follow-camera.ts`、`game/controls.ts` 已有 `dispose()` → 改为向 disposables 注册或保留但补充断言；
  - `src/hooks/useTouchDevice.ts`（C1 迁移后的 4 个 window 监听）与 `MobileControls.tsx`（C1 迁移后的 6 个 document 监听）→ 在 `useEffect` cleanup 中通过 `AbortController.signal` 一次性注销。
- **可测断言**：dev 构建下 `window.__listenerCount()` 返回 `{ added, removed }`（在 `disposables` 内累计），AC2.5 直接读。

## 6. 时基与 resize（R2.6 / R2.7）

- `game/three-game.ts`：`const timer = new THREE.Timer(); timer.connect(document);`（依据 `docs/research/2026-10-15-external-facts.md` §2）。
- resize：`ResizeObserver` 回调只置 `pendingSize`，在下一帧开头统一 `setSize`（rAF 合并）；另用 `matchMedia('(resolution: Xdppx)')` 监听 DPR 变化并重新 `setPixelRatio`。
- 恢复/可见性两类事件后都先 `timer.update()` 丢弃一个周期（等价 delta=0），避免大 delta 一次性补步。

## 7. 风险与对策

| 风险 | 对策 |
|---|---|
| 重建 `GlowComposer` 后 `setScene` 丢失 → 黑屏 | 恢复流程固定顺序：新建 composer → `setScene(session.scene, session.camera)` → 新建探针 → `attachToMesh(car.mesh)` → 再 `loop.start()`；顺序写入 `context-monitor` 注释 |
| `forceContextLoss()` 在无 `WEBGL_lose_context` 扩展的环境不可用 | 检测扩展；不可用时跳过自动验证并在记录中标注"未验证"，不伪装通过 |
| 错误边界把真实 bug 藏起来 | fatal 态必须展示错误首行 + `console.error` 完整堆栈；`detail` 不进静默日志 |
| 重试退避在演示中显得"卡住" | UI 在重试期间显示"第 N/3 次重试"，避免无反馈等待 |
| 恢复路径与 C3 的懒加载入口重叠 | `loading.ts` 的接口由 C2 定义；C3 只替换 Rapier 的**获取方式**（自托管 wasm），不改阶段语义 |
