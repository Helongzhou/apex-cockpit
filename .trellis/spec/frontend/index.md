# 前端开发规范

> 本目录记录**本项目真实的工程约定**，由迭代 1 的代码整理而成（任务 C4）。所有条目都对应仓库里的实际文件，可直接 grep 验证。

---

## 规范索引

| 规范 | 内容 | 状态 |
|-------|-------------|--------|
| [目录结构](./directory-structure.md) | 分层边界、目录职责、允许的例外 | ✅ 已按真实代码填写 |
| [组件规范](./component-guidelines.md) | 6 个组件的职责、className 约定、反模式 | ✅ 已按真实代码填写 |
| [Hook 规范](./hook-guidelines.md) | 仅有的 2 个自定义 hook 与监听器释放约定 | ✅ 已按真实代码填写 |
| [状态管理](./state-management.md) | 四类状态的归属、store 接缝、订阅约定 | ✅ 已按真实代码填写 |
| [质量门禁](./quality-guidelines.md) | 提交前必跑命令、禁止模式、错误处理契约 | ✅ 已按真实代码填写 |
| [类型安全](./type-safety.md) | strict 基线、版本对齐、第三方边界窄化写法 | ✅ 已按真实代码填写 |

---

## 与本项目决策的对应关系

| 决策 | 落地位置 |
|---|---|
| Q8：Vite + TypeScript + React 19 | `vite.config.ts`、`tsconfig.json`、`src/main.tsx` |
| Q9：Rapier 保留但懒加载 | `game/physics-world.ts`、`src/game-bridge.ts` |
| A5：中文为主 + 英文注释 | 文档中文；代码标识符、注释、提交信息英文 |
| 性能权重最高 | `quality-guidelines.md` 的实测值纪律 + `scripts/measure-budget.mjs` |
| 稳定性第二 | `game/render-loop.ts`、`game/context-monitor.ts`、`game/loading.ts` + `scripts/stability-check.mjs` |

---

## 如何维护

1. 规范必须写**实际约定**，不是理想设计；每条尽量给出可 grep 的路径或命令。
2. 新增禁止模式时，同时给出替代做法与"为什么"。
3. 结论被推翻时改正原文并留痕（例：WebGL 上下文丢失的原始判断已在 README 与迭代计划中就地更正）。
4. 文档语言：**中文**（项目决策 A5）；代码标识符、注释与提交信息用**英文**。
