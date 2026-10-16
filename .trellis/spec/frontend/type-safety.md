# 类型安全约定

> 基线：`tsconfig.json` 的 `strict` 全开，外加 `noUnusedLocals` / `noUnusedParameters`。

---

## 1. 硬性规则

| 规则 | 说明 | 验证 |
|---|---|---|
| 禁止 `any` | 包括 `as any`、`<any>` | `grep -rn ":\s*any\b\|<any>\|as any" game/ src/` 必须无输出 |
| 禁止 `@ts-ignore` / `@ts-expect-error` | 类型错误必须真正解决；确需绕过时用**窄化断言 + 注释说明原因** | `grep -rn "@ts-ignore\|@ts-expect-error" game/ src/` |
| 非空断言 `!` 只用于结构上必然存在处 | 并写清为什么必然存在 | 人工评审 |
| 类型导入用 `import type` | 避免把纯类型带进运行时依赖图（曾是 C1 的一处实际报错来源） | `game/game-session.ts:3`、`src/dev/deterministic.ts:13-14` |

---

## 2. 版本对齐（曾踩过的坑）

- `three` 运行时版本必须与 `@types/three` 的**次版本对齐**：当前 `three@0.185.1` + `@types/three@0.185.4`。three 本体不发布 `*.d.ts`，类型完全来自 DefinitelyTyped。
- `@dimforge/rapier3d` 自带逐模块 `*.d.ts`，可直接 `import type { World } from '@dimforge/rapier3d'`；而 `rapier3d-compat` 的入口是 `export default RAPIER`，把命名空间当类型用时要留意。
- DOM 事件映射不全：`webglcontextlost` / `webglcontextrestored` **不在** `HTMLElementEventMap` 里，需要为 `listen()` 写专门的 overload（见 `game/listeners.ts` 的第一个重载）。

---

## 3. 第三方边界的窄化写法

三条实际用到的模式：

```ts
// 1) 只声明用到的字段，而不是把整个外部类型拖进来（game/math/vehicle-math.ts）
export interface WheelGeometry { halfWheelbase: number; halfTrack: number }

// 2) 运行时确实存在、但声明里是基类的下转型 —— 必须写成最小必要类型 + 注释
//    Rapier 的 createImpulseJoint() 返回基类 ImpulseJoint，马达方法在 RevoluteImpulseJoint 上
const spinJoint = world.createImpulseJoint(...) as RAPIER.RevoluteImpulseJoint;

// 3) 结构上可能不存在、但只在特定实例上有的成员 —— 用交叉类型 + 可选链
const shadowOwner = light as THREE.Light & { shadow?: { dispose(): void } };
shadowOwner.shadow?.dispose();
```

**判断标准**：能用结构接口描述的就不要断言；必须断言时，断言的类型必须是"最小充分"的，并在同一行或上一行写清原因。

---

## 4. 全局扩充

需要挂 `window` 时集中声明，禁止散落的 `(window as any)`：

- `game/listeners.ts`：`window.__listenerCount`
- `game/three-game.ts`：`window.__APEX_INJECT_FRAME_ERROR`、`window.__APEX_STATS`
- `src/dev/deterministic.ts`：`window.__APEX_DETERMINISTIC`、`window.__APEX_DUMP`

统一用 `declare global { interface Window { ... } }`，并在注释里写明"谁在用"。

---

## 5. 运行期校验

外部数据（网络、wasm、用户输入）不得只靠类型断言：

- 加载失败统一包成 `LoadFailure`（`game/loading.ts`），错误里带 `stage` 字段供 UI 分类展示。
- `catch` 到的值一律 `unknown`，用 `error instanceof Error ? error.message : String(error)` 归一化（见 `game/three-game.ts` 的 `reportFatal`）。
