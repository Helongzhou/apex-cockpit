# Apex Cockpit · In-car HMI and ADAS visualisation

> A Three.js + Rapier driving demo redeveloped into a **portfolio project for in-car HMI / 3D
> visualisation engineering**: strict TypeScript, a React 19 shell, a testable vehicle data layer,
> ADAS overlays with a truth-vs-perception narrative, and a performance monitor that measures the
> numbers it claims.
>
> **Status: iterations 1–3 delivered.** Originally a no-build Vue demo
> ([manuelhintermayr/three-js-car-example](https://github.com/manuelhintermayr/three-js-car-example), MIT);
> the migration, the stability work, the data layer, the cluster, the highway stage, the ADAS
> layers and the tooling all live in this repository.
>
> The **Chinese README ([README.md](README.md)) is the primary, most detailed document** — this file
> is the English summary for international readers.

---

## 1. What it is

**Implemented today**

- Joint-based vehicle physics (suspension, steering and wheel spin are real Rapier constraints).
- Cockpit view: the steering wheel, pedals and gear lever animate from the real control state.
- Two stages: a **studio** test track and a **highway** with three lanes, guardrails, gantries,
  lamps and a kinematic lead vehicle cruising a deterministic centreline.
- **Digital cluster** (DOM/CSS, no second render context): analogue speed gauge, gear indicator,
  centre-zero power bar, data-driven status icons.
- **ADAS visualisation layers**: lane lines and object-pooled target boxes with velocity leaders,
  isolated on a dedicated `THREE.Layers` bit so they never appear in the car's reflection or in the
  bloom dim pass.
- **Truth vs perception**: a deterministic noise model (missed detections, position jitter, heading
  error, sensor latency, confidence) downgrades ground truth into "what a perception stack would
  report"; one button switches between the two views.
- **Performance monitor** (F9): frame-time p50/p95/p99, main-thread script time, draw calls,
  triangles, resource counts, physics substeps, ADAS targets and the measured bundle baseline.
- Runtime hardening: render-loop error boundary, WebGL context-loss recovery, retryable asset
  loading, serialized resets, one disposer for every DOM listener.

**Not in scope**: perception/planning algorithms, point clouds, backends, engine ports,
multi-screen or voice interaction, automotive certification.

---

## 2. Quick start

```bash
npm install          # Node >= 22.12
npm run dev          # Vite dev server (http://localhost:5173)
npm run build        # static dist/ - no CDN references, works offline
npm run preview      # preview the build (http://localhost:8080)
```

Controls: **W/A/S/D** drive, **Space** jump, **B** brake, **C** cockpit view, **Enter** reset,
**F12** vehicle-data panels, **F9** performance panel. Stage and ADAS switches are in the top-right.

---

## 3. Verification (everything in this repo is measured, not asserted)

```bash
npm run typecheck     # strict TypeScript, 0 errors
npm run test          # vitest: 173 unit tests
npm run test:coverage # coverage (100% on the pure data-layer modules)
npm run smoke         # 21 UI behaviour checks (Playwright, against dist/)
npm run stability     # 22 fault-injection checks (exception, context loss, load retry, resets)
npm run cluster       # 10 digital-cluster checks
npm run stage         # 12 stage-switch checks (cost + leak-free switching)
npm run adas          # 15 ADAS/perception checks
npm run perf          # 14 performance-panel checks
npm run deterministic -- --compare baselines/physics-golden.json /tmp/candidate.json
npm run frame-rate    # 30/60/144 Hz comparison (frame-rate independence)
npm run budget        # bundle + draw-call measurement, regenerates the panel baseline
```

Chromium binaries default to `.playwright-browsers/` (git-ignored); override with
`PLAYWRIGHT_BROWSERS_PATH`.

---

## 4. Architecture

```
index.html → src/main.tsx → src/ui/App.tsx          (React shell, 76 kB gzip first screen)
                                │ dynamic import()
                                ▼
                       src/game-bridge.ts ──► game/three-game.ts   (lazy chunk: three + game logic)
                                                   │
                                                   ├─ game/game-session.ts   per-frame: input → physics → visuals → camera → telemetry
                                                   ├─ game/physics-world.ts  Rapier (wasm shipped as its own asset)
                                                   ├─ game/adas/*            lanes, target pool, perception model
                                                   ├─ game/scenes/*          stage registry (studio | highway)
                                                   └─ game/math/*            pure maths (units, frame-rate, lanes, stats, path)
src/state.ts  ◄── the only cross-layer seam: the game writes a GameHost, React reads it
```

Rules enforced by grep in CI-style checks: `game/` never imports React; the UI never imports the
game statically (that is what keeps the first screen small); every DOM listener goes through
`game/listeners.ts` so `window.__listenerCount()` can prove registered == released.

---

## 5. Measured results

| Metric | Before | After | Target |
|---|---|---|---|
| First-screen gzip | 1,333.9 kB | **76.1 kB** | ≤ 450 kB |
| Game chunk gzip | (same bundle) | 119.3 kB | — |
| Rapier + Draco wasm (gzip, streamed) | inlined as base64 | 896.2 kB | self-hosted |
| Draw calls / frame | ~120–150 (estimated) | **76–82** (view dependent) | ≤ 80 |
| Frame-rate independence | per-frame constants (2.4× faster at 144 Hz) | **30/60/144 Hz bit-identical** | equal curves |
| Behaviour invariance vs upstream | — | 601 frames, max \|Δ\| = **0.000e+0** | ≤ 1e-6 |
| Unit correctness | raw world units labelled km/h | exact `v / 8 × 3.6` | 0 error |
| Runtime exceptions | loop dies permanently | boundary + visible fatal + retry | recoverable |
| WebGL context loss | no app-level handling | pause + rebuild, ready in 174 ms | recover |
| 20 resets / 20 stage switches | unknown | geometries/textures/programs/listeners at baseline | no growth |

Honest caveats, recorded in the task archives rather than hidden: the **frame-time p95 budget of
0.5 ms is not resolvable in this environment** (software rasterisation at ~12 fps has a 3–10 ms
noise floor, so the criterion is marked inconclusive with a structural argument instead); the
**draw-call budget is met on the highway but view-dependent on the studio stage**; and the
perceived stage-switch time (~1 s under SwiftShader) is dominated by the first frame's GPU work,
while the application's own rebuild costs **2.2 ms**.

---

## 6. Demo assets

`docs/demo/` holds screenshots of the studio cockpit, the highway with ADAS truth and perception
overlays, the performance panel and the cluster, plus a ~30 s recording (`apex-cockpit-demo.webm`,
781 kB). Regenerate with `npm run build && node scripts/capture-demo.mjs dist`.

---

## 7. Attributions

Upstream baseline: [manuelhintermayr/three-js-car-example](https://github.com/manuelhintermayr/three-js-car-example)
(MIT), itself a port of [babylon-js-car-example](https://github.com/manuelhintermayr/babylon-js-car-example).
The stylesheets in `css/` are reused byte-for-byte from upstream; the Vue components were rewritten
as React in iteration 1. Vehicle physics and camera control derive from public Babylon.js Playground
examples; the selective bloom follows the Three.js example `webgl_postprocessing_unreal_bloom_selective`.
Libraries: Three.js (MIT), Rapier (Apache-2.0), React (MIT) — all bundled locally since iteration 1.
The low-poly Ford Anglia model (`game/models/car.glb`) is Manuel Hintermayr's work and is **not**
covered by the code licence; see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

Licensed under the MIT License — see [LICENSE](LICENSE).
