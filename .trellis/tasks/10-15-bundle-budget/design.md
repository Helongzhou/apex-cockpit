# C3 · Technical Design

## 1. 元凶定位（全部实测，证据见 `docs/research/2026-10-15-external-facts.md`）

| 载荷 | raw | gzip | 说明 |
|---|---|---|---|
| jsDelivr `@dimforge/rapier3d-compat@0.20.0/+esm` | 2,855,554 B | 1,083,388 B | **CDN 的 esm 打包器把同目录 wasm 内联成 base64**（文件内 `AGFzbQ` 命中，单行 2.86M 字符） |
| compat 包自身 `dist/rapier.mjs` | 2,791 KB | — | 内联是 **compat 的设计目标**（无需 bundler 处理 wasm） |
| compat 包 `dist/rapier_wasm3d_bg.wasm` | 1,974 KB | — | 同一包内**也存在独立 wasm** |
| `@dimforge/rapier3d@0.20.0`（非 compat） | — | — | wasm 作为**独立资产** `/rapier_wasm3d_bg.wasm`（1,974 KB）发布，JS 侧为 wasm-bindgen glue |
| three 整包 | 650,153 B | 128,932 B | 未摇树 |
| Vue 全局 **dev** 构建 | 601,662 B | 134,032 B | C1 换 React 后此项消失（prod 版仅 170,605 / 62,100） |
| Draco 解码器 | 285,747 B | 88,115 B | 仅为解一个 90 KB 的模型 |
| car.glb | 90,048 B | 90,048 B | 已 Draco |

**结论**：首屏 1.52 MB gzip 里最大的一项（1.08 MB gzip）来自"**base64 内联的 wasm**"，而它不是 Rapier 的必然形态，是 **compat 包 + CDN esm 打包**的叠加结果。这意味着换用非 compat 包 + 自托管 wasm 可以获得约 33% 的字节收益，且让 wasm 与 glue 并行加载。

## 2. 方案选择

**方案 A（首选）**：改用 `@dimforge/rapier3d@0.20.0`（非 compat，**锁定 0.20.0 以保持物理行为**）
- wasm 通过 wasm-bindgen 的初始化入口显式传入路径：`init(new URL('@dimforge/rapier3d/rapier_wasm3d_bg.wasm', import.meta.url))` 或 Vite 的 `?url` 导入 —— 两种写法都让 **Vite 把 wasm 作为独立资产复制进 `dist/` 并在产物中保留 URL**。
- 用 `await import('@dimforge/rapier3d')` 动态导入 → 首屏不加载。
- 服务器按二进制返回并 gzip/brotli（`python3 -m http.server` 直接可跑；部署时由托管方压缩）。

**方案 B（回退）**：保留 `-compat`，但改为**从包内动态 `import()`**（不再走 CDN `+esm`）
- 首屏同样不含 Rapier，实现成本最低；但仍有 2.79 MB 的 JS 解析与 base64 解码成本，且 gzip 后比 A 大。
- **触发条件**：A 的 wasm 路径在 `dev` 与 `build` 两种模式下任一无法正确解析，且 0.5 天内无法解决。

**决策与证据要求**：采纳哪个方案必须在 `implement.md` 的"实测记录"里写明（含 dev/prod 两种模式下 wasm 请求的实际 URL 与 HTTP 状态）。

## 3. 首屏集合的定义（预算口径）

**首屏（计入 450 KB gzip 预算）**：
`index.html` + 入口 JS 的**静态 import 闭包** + 5 个 CSS + `car.glb` + （若保留 Draco）解码器 wasm。

**总包（计入 0.9 MB gzip 预算）**：`dist/` 下所有文件，含懒加载 chunk、Rapier glue 与 wasm。

**不计入首屏**：任何 `dynamicImports` 到达的文件（Rapier glue/wasm 属此类）。

## 4. 预算脚本设计（不引入新依赖）

`scripts/check-bundle.mjs`：

1. 读取 `dist/.vite/manifest.json`（构建时开启 `build.manifest = true`）→ 用 **Vite 官方 manifest** 做入口闭包，不自己写 import 解析：
   - 首屏集合 = `manifest['index.html']` 的 `file` + `css[]` + 递归 `imports[]`；
   - 懒加载集合 = 递归 `dynamicImports[]`（含其 `css`）。
2. 追加资产：`index.html` 自身、`car.glb`、以及"若解码器被静态引用则计入"的 Draco wasm。
3. gzip 体积用 `node:zlib.gzipSync`（级别 9）计算，与项目既有口径一致。
4. 断言：`首屏 gzip ≤ 450 KiB`、`总包 gzip ≤ 0.9 MiB`；失败时打印逐文件明细并以退出码 1 结束。
5. 同时打印"对比模式"：给定 `--baseline` 参数时输出优化前后差异表。

> 为什么用 manifest 而不是自己解析：manifest 是 Vite 的稳定产物契约，能正确处理 `imports`/`dynamicImports`/`css`/共享 chunk，避免自研解析在分包变化时低估首屏。

## 5. three 按需（R3.1）

- `game/*.ts` 与 `src/*` 一律使用**命名导入**（`import { Scene, WebGLRenderer, Timer } from 'three'`），避免 `import * as THREE`（虽可摇树，但命名导入让边界更明确、也便于静态检查）。
- 证据要求（AC3.1 附带）：列出 `dist/` 中 three 相关 chunk 的 raw/gzip，并与未摇树的 128,932 B gzip 对比；chunk 内**不得出现未使用子系统的特征串**（如 WebGPU/TSL 相关标识）。

## 6. Draco 烘焙评估（R3.6）

用一次性工具（`npx @gltf-transform/cli`，**不进 `package.json`**）把 `car.glb` 去 Draco：

| 记录项 | 期望形式 |
|---|---|
| 烘焙后 GLB raw/gzip | 实测 |
| 省掉的解码器 | 285,747 B raw / 88,115 B gzip + 解码耗时 |
| 首屏净变化 | 上述两项之差 |
| 启动耗时变化 | 三次测量的中位数 |

结论规则：**净首屏 gzip 减少 ≥20 KB 且启动更快** → 采纳（并把产物替换进 `game/models/`，同时更新 `THIRD_PARTY_NOTICES.md` 的资产说明）；否则记"不采纳"及数字。无论采纳与否，结论与数字都要进 `implement.md`。

## 7. 风险与对策

| 风险 | 对策 |
|---|---|
| 非 compat 包的 wasm 路径在 `file://` / 子路径部署下解析失败 | `vite.config.ts` 设 `base: './'`（C1 已定），并在 `implement.md` 记录 dev/prod/子目录三种情形下的实际 URL |
| `.wasm` MIME 类型不被宿主服务器识别 | 预算脚本与验收都要求 `python3 -m http.server` 通过（其按扩展名返回 application/wasm） |
| 动态导入 Rapier 后，物理未就绪时用户已开车 | `runtime.phase` 门控：`ready` 之前不接受驾驶输入（复用 C2 的 loading 状态机），避免空指针 |
| 懒加载破坏 C1 的确定性回归 | 回归脚本必须先 `await window.__ready`；`implement.md` 明确该步骤 |
| 预算脚本因分包变化而口径漂移 | 只依赖 Vite manifest（稳定契约），并把"首屏集合"打印出来人工可核对 |
