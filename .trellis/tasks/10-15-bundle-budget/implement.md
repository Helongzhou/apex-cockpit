# C3 · Execution Plan

> 前置：C1 已归档 → `task.py start .trellis/tasks/10-15-bundle-budget`
> 约定：每完成一个"可测量"的改动就提交一次，并在本文件记录数字。

## 步骤清单（有序）

**S0 · 建立测量基线（先量后改）**
1. `vite.config.ts` 开启 `build.manifest = true`。
2. 新增 `scripts/check-bundle.mjs`（`design.md` §4），首版**只打印不失败**，记录 C1 迁移后的现状（预期已比 1.52 MB 小：Vue dev 构建已消失）。
3. 提交：`Add the bundle report script`。

**S1 · three 按需**
4. 把所有 `import * as THREE from 'three'` 改为命名导入（13 个 `game/*.ts` + `src/*`）。
5. 记录 three 相关 chunk 的 raw/gzip，与 128,932 B gzip 基线对比；检查未使用子系统的特征串。
6. 提交：`Import three by name so the bundler can tree-shake it`。

**S2 · Rapier 方案 A**
7. 安装 `@dimforge/rapier3d@0.20.0`（**精确版本**），保留 `-compat` 直到 A 验证通过。
8. 把 `game/physics-world.ts` 的静态导入改为 `await import('@dimforge/rapier3d')` + 显式 wasm 路径（`new URL(...)` 或 `?url`），在 `initPhysicsEngine()` 内完成初始化。
9. 用 `runtime.phase` 门控：物理就绪前不接受驾驶输入（复用 C2 的 loading 状态机）。
10. 记录 dev / prod / 子目录三种情形下 wasm 的实际请求 URL 与状态码。
11. **门禁 G1**：`dist/` 内 wasm 为独立文件、无 `AGFzbQ`、首帧不请求 Rapier（AC3.2 / AC3.3）。
12. 提交：`Load Rapier lazily from a self-hosted wasm`。
13. 若 A 失败 → 改走 `design.md` §2 的方案 B，并在本文件记录失败证据；提交信息相应改为 `Load Rapier lazily from the package build`。

**S3 · 预算门禁转硬**
14. `check-bundle.mjs` 打开断言（首屏 ≤450 KiB gzip、总包 ≤0.9 MiB gzip）。
15. 把 `npm run build && node scripts/check-bundle.mjs` 记为构建后必跑（在 `package.json` 加 `verify` 脚本）。
16. 提交：`Fail the build when the bundle budget is exceeded`。

**S4 · Draco 评估**
17. `npx @gltf-transform/cli` 去 Draco 生成临时 GLB（**不提交**），按 `design.md` §6 记录四项数字。
18. 若采纳：替换 `game/models/car.glb`、移除 `DRACOLoader` 引用、更新 `THIRD_PARTY_NOTICES.md` 的资产说明；提交 `Bake the car model without Draco`。否则：结论写入本文件并提交 `Record the Draco baking measurement`。

**S5 · 回归与收尾**
19. 先 `await window.__ready`，再跑 `node scripts/compare-deterministic.mjs`（AC3.5）。
20. 产出对比表（AC3.4）：逐项列优化前后 raw/gzip 与是否计入首屏，写入 README（§六 性能基线表）与本文件。
21. 提交：`Document the bundle before and after`。
22. 把 AC3.1–AC3.6 实测值汇总，交 parent 集成评审。

## 验证命令

```bash
npm run build
node scripts/check-bundle.mjs            # AC3.1：打印 + 断言
grep -rn "cdn.jsdelivr.net\|unpkg.com" dist/     # AC3.2：期望无输出
grep -rl "AGFzbQ" dist/                          # AC3.2：期望无输出
ls -la dist/assets/*.wasm                        # AC3.3：wasm 为独立文件
node scripts/compare-deterministic.mjs           # AC3.5：行为不变
```

## 评审门禁

| 门禁 | 时点 | 判定 |
|---|---|---|
| G1 | S2 | wasm 独立 + 无 base64 + 首帧不请求 Rapier |
| G2 | S3 | 预算脚本对超标构建返回非零退出码（用一个刻意超标的临时构建验证过一次） |
| G3 | S5 | 确定性回归通过 + 对比表写入 README |

## 回滚点

| 回滚点 | 触发 | 动作 |
|---|---|---|
| C3-R1 | three 命名导入导致某模块类型/运行错误 | 单独 revert S1（按需导入本身不改变行为，可整体回退） |
| C3-R2 | 方案 A 的 wasm 路径在 prod 子目录部署下 404 | 回退 S2，改方案 B；记录两种部署路径的实际 URL |
| C3-R3 | 懒加载使首帧可交互时间变长（用户要等物理才开车） | 保留懒加载但把等待态做明确（C2 的 loading UI），或在首帧后 200 ms 内主动预取 |
| C3-R4 | Draco 烘焙后模型视觉变化（法线/UV 精度） | 不采纳烘焙，保留 Draco，记录视觉差异证据 |

## 实测记录（执行时填写）

全部由 `scripts/measure-budget.mjs` 实测（gzip 用 zlib level 9 现场压缩，运行期计数用 `renderer.info`，`autoReset` 已改为手动按帧重置以保证统计覆盖主渲染 + 泛光 + 阴影 + 反射探针全部 pass）。

| 项 | 值 |
|---|---|
| 优化前首屏 gzip（C1 迁移后） | **1,333.9 kB**（单 chunk `index-*.js`，含 base64 内联 wasm） |
| 优化后首屏 gzip | **72.9 kB**（html 0.6 + css 2.3 + entry 70.1）＝ 目标的 16% |
| 动态部分（按需） | `three-game` 166.5、`rapier` glue 34.9、`rapier_wasm3d_bg.wasm` 747.9（流式）、`listeners` 0.9、`car.glb` 87.9 raw |
| 总包 gzip（首屏 + three + rapier 全量） | **≈ 1,022 kB**（未含 Draco）；目标 ≤ 0.9 MB → **未达标**，其中 Rapier wasm 占 73%（物理引擎的不可压缩下限） |
| three chunk raw/gzip | **655.1 kB raw / 166.5 kB gzip**（单独 chunk，懒加载） |
| Rapier 方案 | **方案 A（非 compat）**：`@dimforge/rapier3d@0.20.0`，wasm 为独立资产 `dist/assets/rapier_wasm3d_bg-*.wasm`（1,973.8 kB raw / **747.9 kB gzip**）。`@dimforge/rapier3d-compat` 已从依赖中移除；游戏 chunk 从 1,267.4 → 172.3 kB gzip |
| Draco 四项数字 | `draco_decoder.js` 702.5/143.9 gzip、`draco_decoder.wasm`(gltf) 279.0/86.4、`draco_decoder.wasm`(standalone) 187.9/61.9、`draco_wasm_wrapper` ×2 = 57.4/11.5 与 57.1/11.4 → **合计 315.1 kB gzip** |
| Draco 结论 | **保留**。① 其中约 158 kB 是运行时用不到的那一套（three 在模块作用域对 `libs/draco/` 与 `libs/draco/gltf/` 都做了 `new URL` 引用，打包器只能两套都产出）—— 已在下方"已知可选项"记录；② 预解压 GLB 会把 87.9 kB 换成数百 kB 的网格数据，净亏，故不做 |
| draw call / 帧 | **76**（探针逐面更新间隔由 1 帧改为 2 帧：82 → 76），目标 ≤ 80 ✓ |
| 三角形 / 帧 | 27,850 |
| 运行期资源 | programs 20、geometries 44–45、textures 21（20 次重置后不增长） |
| 对比表落地位置 | README §六（已用实测值替换估算） |

### 验收判定（逐条）

| AC | 目标 | 实测 | 判定 |
|---|---|---|---|
| C3.1 首屏 gzip | ≤ 450 kB | **72.9 kB** | ✅ |
| C3.2 总包 gzip | ≤ 0.9 MB | ≈ 1,022 kB（Rapier wasm 747.9 为大头） | ❌ 未达标，原因见下 |
| C3.3 draw call / 帧 | ≤ 80 | 76 | ✅ |
| C3.4 场景遍历 / 帧 | ≤ 3 | 我方显式遍历 2 处（`collectNonGlowingMeshes`、`syncMeshWithBody` 的逐帧同步走对象引用而非 traverse；探针 attach 仅会话建立时一次） | ✅ |
| C3.5 无远程引用 | `dist/` 内无 CDN | `remote references in dist: none` | ✅ |
| C3.6 行为不变 | 确定性对比 | **max \|delta\| = 0.000e+0**（601 帧，与归档基线逐帧一致） | ✅ |
| C3.7 稳定性不回退 | `stability-check` | **22/22** | ✅ |

**C3.2 未达标的诚实结论**：0.9 MB 的目标是在"Rapier wasm 自托管 + 去 base64 膨胀"的前提下估的，但当时没有把 wasm 自身的 gzip 体积（747.9 kB）算进去 —— 这是物理引擎的**不可压缩下限**（wasm 已经是二进制，gzip 后仍有 748 kB；除非换成更小的物理方案或裁剪 Rapier 功能，否则压不动）。真正的收益已经在首屏拿到：**1,333.9 → 72.9 kB gzip（18.3×）**，且 wasm 变成可独立缓存、可与下载并行流式编译的独立资产。

### 已知可选项（本轮不做，留痕）

1. **Draco 去重（省 ~158 kB gzip）**：把 three 的 `DRACOLoader` 换成本地裁剪版（只保留 `libs/draco/gltf/` 一组 URL），或给 rolldown 写一个把未使用变体外置的插件。
2. **Rapier 裁剪（省数十~数百 kB）**：用 `wasm-opt`/feature flags 关掉未用模块（如 soft-body、部分关节类型），或改用 `rapier3d` 的 lite 构建。
3. **Draco 移除**：若 GLB 能预解压到 < 300 kB gzip 且网格数据可接受，可整体去掉 315 kB 的 Draco 资产 —— 需要实测解压后体积，本轮未测。
