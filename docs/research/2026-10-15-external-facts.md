# 外部事实核查（迭代 1 依据）

> 用途：迭代 1 各子任务的 research 上下文。本文只记录**可复核的事实**，不写结论性建议。
> 核查日期：2026-10-15 ｜ 核查者：HelongZhou（AI 协助）
> 复核方式：直接下载固定版本的产物并读源码 / 实测 HTTP 载荷尺寸。

---

## 1. three.js 0.185.1：渲染循环在异常下的行为

**事实**：`WebGLRenderer.setAnimationLoop` 内部由 `WebGLAnimation` 驱动，其帧回调实现为「先调用用户回调，再排下一帧」：

```js
// three@0.185.1 build/three.module.js, function WebGLAnimation() 内部
function onAnimationFrame( time, frame ) {
    animationLoop( time, frame );
    requestId = context.requestAnimationFrame( onAnimationFrame );
}
```

**推论约束**：`animationLoop` 抛出的异常会使 `requestAnimationFrame` 永不再次调用 → 渲染循环**永久停止**，且不会自动恢复。

**对 Apex Cockpit 的适用点**：`game/three-game.js:85` 的 `renderFrame()` 直接作为回调传入 `renderer.setAnimationLoop(renderFrame)`（`:32` 与 `:52`）。

来源：<https://cdn.jsdelivr.net/npm/three@0.185.1/build/three.module.js>（650,153 B）

---

## 2. three.js 0.185.1：`THREE.Timer` 的页面可见性保护需要显式 connect

**事实**：`Timer` 构造函数只初始化 `_document = null` 与 `_pageVisibilityHandler = null`；只有调用 `connect(document)` 才会注册 `visibilitychange` 监听：

```js
// three@0.185.1 build/three.core.js:50746
function handleVisibilityChange() {
    if ( this._document.hidden === false ) this.reset();
}

// class Timer
connect( document ) {
    this._document = document;
    if ( document.hidden !== undefined ) {
        this._pageVisibilityHandler = handleVisibilityChange.bind( this );
        document.addEventListener( 'visibilitychange', this._pageVisibilityHandler, false );
    }
}
```

`connect` 的文档注释明写：*"Calling this method is not mandatory to use the timer but enables the usage of the Page Visibility API to avoid large time delta values."*

**对 Apex Cockpit 的适用点**：`game/three-game.js:15` 为 `const timer = new THREE.Timer();`，全库 grep 无 `connect(` 调用 → 该保护**未生效**；隐藏标签页恢复后首帧 `getDelta()` 等于整个隐藏时长。

来源：<https://cdn.jsdelivr.net/npm/three@0.185.1/build/three.core.js>（1,443,056 B）

---

## 3. three.js：`renderer.info.autoReset` 的计数语义

**事实**：`WebGLRenderer.info.autoReset` 默认为 `true`，其计数在**每次 `renderer.render()` 调用后重置**。

**对 Apex Cockpit 的适用点**：一帧内存在多次 `render()`（阴影 pass、辉光 composer、最终 composer、反射探针的 cube 面），直接读取 `renderer.info.render.calls` 只能得到"最后一次 render"的数字；要统计整帧必须 `autoReset = false` 并在帧首手动 `reset()`。

来源：three.js 源码 `WebGLRenderer` / `WebGLInfo`；与 `game/rendering.js:113-134`、`:161-190` 的调用路径结合使用。

---

## 4. Rapier 0.20.0：`+esm` 入口把 wasm 以 base64 内联

**事实**（实测下载 jsDelivr 的 ESM 打包产物）：

| 项 | 值 |
|---|---|
| `https://cdn.jsdelivr.net/npm/@dimforge/rapier3d-compat@0.20.0/+esm` | **2,855,554 B**（gzip 1,083,388 B） |
| 是否内联 wasm | **是** —— 文件内存在 `AGFzbQ`（wasm 魔数的 base64 前缀），且最长行达 2,855,188 字符（单行 base64 载荷） |
| 包内独立 wasm 文件（jsDelivr API 列出的 `dist/rapier_wasm3d_bg.wasm`） | 1,974 KB |
| 包内 ESM glue（`dist/rapier_wasm3d.js`） | 238 KB |

**要点**：base64 相对二进制的体积膨胀约 33%；且浏览器必须先下完整 JS 才能开始解码，无法与 glue 并行流式加载。

来源：<https://data.jsdelivr.com/v1/packages/npm/@dimforge/rapier3d-compat@0.20.0>（文件清单）+ 上述 URL 实测。

---

## 5. 首屏载荷基线（2026-10-15 实测）

| 载荷 | raw | gzip |
|---|---|---|
| `three@0.185.1/build/three.module.js` | 650,153 B | 128,932 B |
| `vue@3/dist/vue.global.js`（**dev 构建**） | 601,662 B | 134,032 B |
| `vue@3/dist/vue.global.prod.js`（对照） | 170,605 B | 62,100 B |
| `@dimforge/rapier3d-compat@0.20.0/+esm` | 2,855,554 B | 1,083,388 B |
| `three@0.185.1/.../libs/draco/draco_decoder.wasm` | 285,747 B | 88,115 B |
| `game/models/car.glb`（仓库内，已 Draco） | 90,048 B | 90,048 B |
| **合计** | **4,483,164 B** | **1,524,515 B** |

方法：`curl -o file` 取字节数，`gzip -9 -c | wc -c` 取压缩后字节数。GLB 已压缩，按 raw 计入 gzip 列。

来源：实测；项目侧证据 `index.html:10-19`、`game/car-model.js:7-8`。

---

## 6. WebGL 上下文丢失与恢复的规范行为

**事实**：`HTMLCanvasElement` 会派发 `webglcontextlost`（可取消事件；对 `WebGLRenderingContext`/`WebGL2RenderingContext` 调用 `preventDefault()` 才能允许后续恢复）与 `webglcontextrestored`（上下文恢复后派发，此时必须重建纹理/缓冲等 GPU 资源）。

**对 Apex Cockpit 的适用点**：全库 grep `webglcontextlost`、`webglcontextrestored`、`forceContextLoss` **零命中** —— 当前无任何处理，画布丢失即停在最后一帧且无提示。

来源：MDN *WebGL context lost and restore* 与 WHATWG WebGL 规范（`webglcontextlost` / `webglcontextrestored`）。

---

## 7. 构建工具链：本机可用版本

| 项 | 版本 | 约束 |
|---|---|---|
| node | **v22.22.3** | Vite 7 要求 Node 20.19+ / 22.12+ → 满足 |
| npm | 10.9.8 | — |
| pnpm | 11.4.0 | — |
| `vite` | 未安装（registry 可达，实测 200） | `npm i -D vite` 可行 |
| `node_modules` | 不存在 | 迁移后首次安装 |
| python3 | 3.13.12 | 静态服务器可用（`-m http.server` exit 0） |

来源：本机实测；<https://registry.npmjs.org/vite> 可达性 200。

---

## 8. 发布通道可达性（本机实测）

| 目标 | 结果 |
|---|---|
| `github.com:22` / `ssh.github.com:443` / `github.com:443` | 全部**可达** |
| `ssh -T git@github.com` | `Hi Helongzhou! You've successfully authenticated` |
| `git push -u origin main` | 成功（`* [new branch] main -> main`） |
| `registry.npmjs.org` / `cdn.jsdelivr.net` / `unpkg.com` | HTTP 200 |

注：更早的一次 `curl https://github.com` 曾返回 000（瞬时失败），据此得出的"GitHub 不可达"结论**已被本次实测推翻**。

---

## 9. 待复核项（当前无定论，留给对应子任务实测）

1. **Draco 离线烘焙的净收益**：GLB 由 90,048 B（Draco）变为未压缩 glTF 后的体积增长，与省掉 285,747 B 解码器 + 解码耗时之间的权衡，需实测（归 C3）。
2. **Rapier 自托管 wasm 的压缩后体积**：以 1,974 KB 二进制为基准按典型 brotli/gzip 比例估算，需实测（归 C3）。
3. **`EXT_disjoint_timer_query_webgl2` 的本机可用性**（影响性能面板能否报真实 GPU 耗时，归迭代 3）。
