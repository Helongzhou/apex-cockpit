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

| 项 | 值 |
|---|---|
| 优化前首屏 gzip（C1 迁移后） | （待填） |
| 优化后首屏 / 总包 gzip | （待填） |
| three chunk raw/gzip | （待填） |
| Rapier：采纳方案 A 或 B + wasm 实际 URL | （待填） |
| Draco 四项数字与结论 | （待填） |
| 对比表落地位置 | README §六 / 本文件 |
