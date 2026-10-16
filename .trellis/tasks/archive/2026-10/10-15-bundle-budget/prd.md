# C3 · Cut the first-load payload and add a bundle budget gate

> 父任务：`.trellis/tasks/10-15-iteration-1-baseline` ｜ 前置：C1（Vite 构建就位）

## Goal

把实测的 **4.48 MB raw / 1.52 MB gzip** 首屏载荷压到预算内，并把预算变成**可自动断言的脚本**而不是人工目测：首屏（不含 Rapier）**≤450 KB gzip**、总包 **≤0.9 MB gzip**，同时给出可复现的前后对比表。

## Requirements

- **R3.1 three 按需**：不得整包引入；以 Vite/rollup 的 tree-shaking 结果为准，并给出"用了哪些导出、摇掉了多少"的证据（构建产物中 three 相关 chunk 的体积）。
- **R3.2 Rapier 不进首屏**：Rapier 必须在首帧可交互之后异步加载（动态 `import()`），且**不再使用 jsDelivr `+esm`**（该产物把 1,974 KB 的 wasm 以 base64 内联成 2,855,554 B）。
- **R3.3 wasm 以二进制交付**：wasm 作为独立资产交付（可被服务器 gzip/brotli），不以 base64 形式进入 JS。
- **R3.4 预算门禁**：`scripts/check-bundle.mjs` 对 `dist/` 计算首屏与总包 gzip 体积，超预算以非零退出码失败；输出逐文件明细。
- **R3.5 行为不变**：包体改动不得改变可观察行为（C1 的确定性回归必须继续通过）。
- **R3.6 Draco 决策留痕**：是否离线烘焙 GLB 必须基于实测给出结论与数字，允许结论为"不做"。

## Acceptance Criteria

- [ ] **AC3.1** `node scripts/check-bundle.mjs` 通过，并打印首屏 ≤450 KB gzip、总包 ≤0.9 MB gzip 的实测值。
- [ ] **AC3.2** `dist/` 内不存在 `cdn.jsdelivr.net` / `unpkg.com` 引用，也不存在 base64 wasm（grep 断言：无 `AGFzbQ`）。
- [ ] **AC3.3** 首帧可交互时不加载 Rapier：网络面板（或构建产物分析）证明 Rapier glue + wasm 均在首屏之后请求；`dist/` 内 wasm 为独立文件。
- [ ] **AC3.4** 对比表产出：逐项（three / React+应用 / CSS / GLB / Draco / Rapier glue / Rapier wasm）列出优化前后 raw 与 gzip，并标注哪些进入首屏。
- [ ] **AC3.5** C1 的 `scripts/compare-deterministic.mjs` 在包体改动后仍通过（Rapier 版本与物理参数未变）。
- [ ] **AC3.6** Draco 烘焙评估有结论：给出"烘焙后 GLB 体积 / 省掉的解码器体积 / 首屏净变化 / 启动耗时变化"四项数字，并明确采纳或不采纳及理由。

## Constraints

- **Rapier 版本锁定 `0.20.0`**（当前项目版本），不得为了包体升级到 0.21（会改变物理行为，破坏 R3.5）。
- 不引入 `vite-plugin-wasm` 之类新插件，除非自托管方案在无插件下被证明不可行（并记录证据）。
- 不改渲染参数与视觉参数（那是迭代 3 的质量档工作）。
- 预算针对 **gzip**（与实测口径一致）；brotli 值可附带记录但不作为门禁。

## Out of Scope

自适应质量档 / 动态分辨率 / LOD / 实例化合批（迭代 3 的渲染预算工作）、纹理压缩、CDN + SRI 方案（已被自托管取代）、服务端渲染或预渲染。
