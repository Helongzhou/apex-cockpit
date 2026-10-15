# Iteration 1 — Execution Plan（parent）

> 本文件只做**编排**：顺序、门禁、集成评审与回滚点。具体技术设计与逐步清单在四个子任务的 `design.md` / `implement.md`。
> 规程要求：实现只在子任务 `task.py start` 之后进行；parent 不进入 Phase 2。

## 1. 执行顺序与门禁

```
C1 ──┬─→ C2 ─┐
     └─→ C3 ─┴─→ C4          （C2 与 C3 可并行，但共享 C1 的产物）
```

| 阶段 | 进入条件（Entry Gate） | 退出条件（Exit Gate） |
|---|---|---|
| **C1 迁移** | iter-1 规划产物齐备（本文件 + 子任务 prd/design/implement + manifests）且 `task.py validate` 通过 | `npm run typecheck` 全绿 · `npm run build` 出 `dist/` · 静态服务器可跑 · **五条操作链与归档基线一致**（曲线比对记录留档） |
| **C2 可恢复** | C1 已归档（文件已是 `.ts` / React 结构） | 见 C2 验收：异常注入不冻屏、上下文丢失自动恢复、加载失败可重试、监听器计数平衡 |
| **C3 包体** | C1 已归档（Vite 构建已就位） | 预算脚本一键通过；首屏 ≤450 KB gzip、总包 ≤0.9 MB gzip；对比表产出 |
| **C4 规范与测试** | C1 已归档；C2、C3 至少进入可提交状态（规范要描述最终结构） | 四份规范无模板残留且引用真实代码；`npm run test` ≥12 用例全绿 |
| **集成评审** | C2/C3/C4 全部归档 | 下述 checklist 全过 + AC6（README 状态更新） |

**并行约束**：C2 与 C3 都会改 `game/three-game.ts`（错误边界 / 懒加载入口）。若并行推进，先由一方落地该文件的改动、另一方 rebase 后再改，避免同一区域互相覆盖；无法协调时改为串行 C2 → C3。

## 2. 集成评审清单（parent 执行）

- [ ] `git status` 干净；四个子任务的提交均已落地，且提交信息与仓库既有风格一致（英文祈使句、无前缀）
- [ ] `npm ci && npm run typecheck && npm run test && npm run build` 在干净克隆上可复现
- [ ] `dist/` 用 `python3 -m http.server` 起服务后：能驾驶、能切座舱视角、能重置、移动端模拟下摇杆可用
- [ ] 五条操作链的行为比对记录存在且结论为"一致"（AC2）
- [ ] 三类故障注入全部通过：`renderFrame` 抛异常、`WEBGL_lose_context`、CDN 资源 404（AC3）
- [ ] 包体预算脚本在 `dist/` 上通过，且对比表数字与实际测量一致（AC4）
- [ ] 四份 spec 无模板残留，抽样 3 条规范能在代码里找到对应实现（AC5）
- [ ] README "当前状态" 已更新到迭代 1 完成态，且未把迭代 2/3 的内容写成已完成（AC6）
- [ ] 归档基线副本未被修改（`diff` 其源码与迭代 1 之前的快照）

## 3. 验证命令清单（parent 复用）

```bash
npm run typecheck          # tsc --noEmit, strict
npm run test               # vitest run
npm run build              # 产出 dist/
node scripts/check-bundle.mjs   # 包体预算门禁（C3 交付）
python3 -m http.server 8080     # 在 dist/ 内起静态服务做人工验收
python3 ./.trellis/scripts/get_context.py --mode packages   # spec 层清单
```

## 4. 回滚点

| 回滚点 | 触发条件 | 动作 |
|---|---|---|
| R1（C1 内） | 类型迁移后发现行为不一致且无法在 0.5 天内定位 | 保留 `game/*.ts` 的类型工作，短时切回归档基线演示；把差异记录为新任务 |
| R2（C1 完成态） | React 重写导致 UI 行为退化（面板 / 触摸） | `git revert` 该子任务提交，回到"Vue + Vite"中间态（若已无 Vue 代码，则回到归档基线并重排计划） |
| R3（C2 内） | 上下文恢复实现引入新的帧循环不稳定 | 保留错误边界与加载重试，单独回滚上下文恢复那一个提交 |
| R4（C3 内） | Rapier 懒加载导致首帧可交互时间反而变长 | 保留 three 按需与预算脚本，回滚懒加载，接受较高的总包并在对比表中标注 |

**通用原则**：每个子任务按"一个逻辑改动一个提交"落地，保证任一步都可单独 revert；任何回滚都不删除归档基线副本。

## 5. 风险与砍单顺序

| 风险 | 影响 | 缓解 |
|---|---|---|
| 一次迁完构建 + UI 框架，回归面大 | AC2 不达标 | C1 内强制"`game/` 只加类型不改逻辑"；逐链比对而非目测；C1 退出前不打 tag 不进 C2 |
| React 重写引入状态管理差异 | 面板 / 触摸行为退化 | 接缝在 C1 的 `design.md` 里先定契约，再写实现；保留"游戏层不 import UI 框架"的硬约束 |
| 3 周排期被 C1 吃掉 | 迭代 2/3 被挤压 | 砍单顺序：① 迭代 3 的规划轨迹 → ② C4 降级为"仅规范、不抽函数" → ③ C3 的 Draco 烘焙评估 |
| Rapier wasm 自托管体积/部署路径出错 | 演示失败 | C3 内保留"回退到 CDN `+esm`"的一行开关，默认走自托管 |
| 真机缺失（车机/平板） | 适配验收不实 | 统一用 DevTools CPU/网络节流做代理基线，并在 C2 记录节流参数，保证可复现 |

## 6. 完成定义（DoD）

迭代 1 视为完成，当且仅当：四个子任务均已 `task.py archive`、集成评审清单全过、`main` 分支上的 `dist/` 可从零构建、README 状态已更新、且 `chore: record journal` 已记录本次迭代的提交哈希。
