# 质量约定与门禁

> 这些规则由 `scripts/` 下的可执行脚本强制，**不是**靠自觉。

---

## 1. 提交前必跑

```bash
npm run typecheck     # tsc --noEmit，0 错误
npm run test          # vitest，45 个用例
npm run build         # vite build，产出 dist/
npm run smoke         # 15 项 UI 行为（playwright，跑 dist/）
npm run stability     # 22 项故障注入（异常 / 上下文丢失 / 加载重试 / 20 次重置）
npm run deterministic -- --dump --dir dist --out /tmp/c.json
npm run deterministic -- --compare <baseline.json> /tmp/c.json   # 期望 max |delta| = 0
```

性能/包体改动还要跑 `node scripts/measure-budget.mjs dist`，并把实测值写回 README §六 的表格。

---

## 2. 提交粒度与信息风格

- 一个提交只做一件事，**英文祈使句、无前缀**（`Type the game modules`、`Harden the runtime against fatal errors and context loss`）。
- 任务归档提交由 Trellis 生成（`chore(task): archive ...`），不要手写。
- 纯搬移/重构提交必须在提交信息或任务记录里说明"这是搬移"，并以 `compare-deterministic` 的 0 差异作为证据。

---

## 3. 禁止模式

| 禁止 | 原因 | 替代做法 |
|---|---|---|
| `any` / `@ts-ignore` | 见 `type-safety.md` | 窄化接口或最小断言 + 注释 |
| 静默 `catch {}` | 失败会变成不可见的黑盒 | 至少 `console.error`；用户可见的失败必须进 `host.runtime` |
| 渲染循环内未捕获的异常 | three 的 `WebGLAnimation` 先调回调再排下一帧 → 一次异常**永久停帧** | 循环走 `game/render-loop.ts` 的边界；fatal 态必须可见并能恢复 |
| 直接用 `addEventListener` / `removeEventListener` | 会绕过监听器计数与统一释放 | 一律用 `game/listeners.ts` 的 `listen()` + `releaseAll()` |
| `dist/` 内出现 CDN 引用 | 车机/离线场景不可用 | 资源本地化（GLB 走 `?url`、Draco 走 three 自带资产、wasm 由打包器产出） |
| 无限重试 / 无退避 | 会打爆网络或卡死启动 | `loadWithRetry`，上限 3 次、300/900 ms 退避 |
| 用估算值填 README 性能表 | 会掩盖真实回退 | 只写 `measure-budget.mjs` / 自动化脚本的实测值，未测的标"未测" |

---

## 4. 错误处理契约

1. **可见**：任何让游戏不可用的失败，都必须写 `host.runtime`（`phase` + `message` + `detail`），由 `RuntimeOverlay` 展示。`detail` 放技术首行，`message` 放人话。
2. **可恢复**：`fatal` 与 `context-lost` 都必须提供恢复路径（`host.retry()` → `recoverGame()`），且重入安全（`recovering` 标志 + 重置串行化）。
3. **不吞**：`catch` 里必须记录；只在"上层已负责展示"时才允许不上报。
4. **不冻屏**：渲染循环的异常必须被边界捕获并停帧 + 展示原因，而不是让画面静默僵死。

---

## 5. 迁移类任务的额外要求

- **CSS 逐字节不变**（`git diff --stat -- css/` 为空），类名与 DOM 结构保持一致，否则视觉回归无法自动判定。
- **行为不变性有证据**：`scripts/compare-deterministic.mjs` 以固定步长 + 脚本化输入采样物理状态，和归档基线逐帧比对；容差为 1e-6，实测为 0，**不得为了过门禁而放宽容差**。
- 迁移期间不得顺手改玩法参数（质量、摩擦、相机手感）；要改就单独开任务并在记录里说明。

---

## 6. 文档纪律

- 分析与结论性文档（`docs/`）必须标注证据等级：【已有】= 源码可验证、【推断】= 基于源码的推断、【计划】= 尚未存在。
- 结论被推翻时要**改正原文并留痕**，不要只在新文档里"另说"（例：WebGL 上下文丢失的原始判断在 README 与迭代计划中就地更正）。
