# C2 · Make the render loop and asset loading recoverable

> 父任务：`.trellis/tasks/10-15-iteration-1-baseline` ｜ 前置：C1（文件已是 `.ts` / React 结构）

## Goal

消除"一次异常 / 一次资源抖动 / 一次上下文丢失就把页面留在死状态且**没有任何提示**"这一类失败模式：渲染循环具备错误边界与恢复入口，资源加载可重试且有可见状态，重置可重入，事件监听成对注销，时间基准不再被隐藏标签页或上下文丢失污染。

## 事实基线（决定本任务真实范围）

**three@0.185.1 的 `WebGLRenderer` 已内置 renderer 层的上下文丢失处理**（已核对源码）：

```js
canvas.addEventListener( 'webglcontextlost', onContextLost, false );      // :16381
canvas.addEventListener( 'webglcontextrestored', onContextRestore, false ); // :16382
function onContextLost( event ) { event.preventDefault(); _isContextLost = true; }   // :17095
function onContextRestore() { /* 恢复 info/shadowMap 设置 */ initGLContext(); }       // :17105
// render(): if ( _isContextLost === true ) return;                        // :17612
this.forceContextLoss() / this.forceContextRestore()                       // :16589 / :16599
```

因此本任务的上下文丢失工作**不是从零实现**，而是四件应用层的事：① 对用户**可观测**；② 丢失期间的**仿真与循环策略**；③ 恢复后的**时基**不能跳；④ 用 `forceContextLoss/forceContextRestore` 做**可自动化的回归证明**。

> ⚠️ 文档纠偏（本任务交付项之一）：`README.md` §七 P0-3 与 `docs/.../codebase-analysis.md` 中"WebGL 上下文丢失零处理"的表述不准确 —— 准确说法是"renderer 层由 three 处理，**应用层缺少可观测状态、时基与循环策略，且从未被验证过**"。两处措辞需在 S6 修正。

## Requirements

- **R2.1 错误边界**：`renderFrame` 内抛出的任何异常都不得导致渲染循环永久停止；异常被捕获、计数、上报到 UI；达到阈值后进入 **fatal** 状态并提供"恢复"入口。
- **R2.2 上下文丢失可观测 + 策略明确**：canvas 收到 `webglcontextlost` 时，UI 必须显示明确状态；丢失期间**暂停仿真**（不空烧物理）；`webglcontextrestored` 后自动续帧，且恢复过程不得产生时间跳变或画面异常（**含后处理链与反射探针**）。
- **R2.3 加载可重试**：`RAPIER.init()` 与 GLB 加载的失败**不得被永久缓存**；失败时向用户显示可读错误与"重试"操作，重试须真正重新发起加载。
- **R2.4 重置可重入**：连按 `Enter` 或并发触发的重置不得产生泄漏会话（Rapier `World`、几何、render target 计数必须回到基线）。
- **R2.5 监听器成对**：所有 `addEventListener` 在释放路径上都必须有配对的注销；含 `vue-app.js:126-131`（4 个）与 `mobile-controls.js:120-127`（6 个）两处已知缺口。
- **R2.6 时基正确**：`THREE.Timer` 必须调用 `connect(document)`；隐藏标签页恢复后首帧 delta 归零；上下文恢复后首帧 delta 归零。
- **R2.7 resize 不抖动**：拖拽窗口不得每个 resize 事件都重建帧缓冲；设备像素比变化需被响应。

## Acceptance Criteria

- [ ] **AC2.1** 在 `renderFrame` 内注入 `throw new Error('injected')`：页面不冻结，UI 显示错误态，点"恢复"后能重新进入可驾驶状态；控制台无未捕获异常。
- [ ] **AC2.2** 调用 `renderer.forceContextLoss()`：UI 显示上下文丢失状态、仿真暂停（物理步数停止增长）；随后 `forceContextRestore()`：≤60 s（实测应远快于此）内自动恢复渲染，画面（含辉光与车身反射）与原状态一致，且首帧无位移跳变。
- [ ] **AC2.3** 用 DevTools 把 `game/models/car.glb` 或 Rapier wasm 置为 404：出现可读错误与"重试"按钮；恢复网络后点重试能成功进入游戏；**同一页面内不再出现"永久失败"**。
- [ ] **AC2.4** 连续触发 20 次重置：`world` 实例数、`renderer.info.memory.geometries/textures`、事件监听计数在结束后回到基线 ±5%。
- [ ] **AC2.5** 监听器计数断言通过（dev 构建下暴露 `__listenerCount()`，注册数 == 注销数）。
- [ ] **AC2.6** 隐藏标签页 30 s 再切回：首帧 delta ≈ 0（日志断言），车辆位置无跳变；物理累加器不出现 `MAX_STEPS` 截断。
- [ ] **AC2.7** 连续拖拽窗口 10 s：`EffectComposer` 的 render target 重建次数 < 10（当前实现为每次 resize 事件重建）。
- [ ] **AC2.8** 文档纠偏完成：`README.md` §七 P0-3 与代码库分析报告对应条目改为准确表述（见上文引用块）。

## Constraints

- 不改变迁移后的既有渲染参数（`dpr` 上限 1、`antialias:false`、`MSAA=0`、辉光/探针参数）。
- 恢复路径必须**幂等**：重复调用 `recover()` / 连续 `restored` 事件不得产生双份循环或双份会话。
- 错误 UI 不得阻塞 canvas 输入（恢复后无需刷新页面）。
- 依赖 C1 的 `src/state.ts` 暴露运行时状态；`game/` 仍不得 import React。

## Out of Scope

包体与预算脚本（C3）、规范回填与单测（C4）、`renderer.info` 性能面板（迭代 3）、`reset` 的业务语义变更（只做重入保护）。
