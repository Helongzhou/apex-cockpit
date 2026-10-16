# Journal - HelongZhou (Part 1)

> AI development session journal
> Started: 2026-10-15

---



## Session 1: Consolidate the workspace and plan the three-week redevelopment
<!-- trellis-session: v=2 fp=a8b18867955163e1 -->

**Date**: 2026-10-15
**Task**: Consolidate the workspace and plan the three-week redevelopment
**Branch**: `main`

### Summary

Merged the Trellis toolchain from the duplicate clone into apex-cockpit, archived the duplicate, and committed the codebase analysis plus the JD-aligned iteration plan. No source code was changed this session.

### Main Changes

- Merged .trellis, .agents, .dsh and .cursor from three-js-car-example; archived the duplicate to ~/Documents/archive (source verified byte-identical)
- Applied user-invocable: false to 13 project-level Trellis skills so the slash menu lists only trellis-finish-work
- Extended .gitignore with dist/ and the agent directories left behind on purpose
- Wrote the L1-L4 codebase analysis: 22 graded findings with file/line evidence and 20 source-grounded interview questions
- Wrote the iteration plan aligned to the target JD: Vite + TypeScript + React 19, Rapier lazy loading, state bus, digital cluster, ADAS layers

### Git Commits

| Hash | Message |
|------|---------|
| `f464dcd` | Add the Trellis workspace toolchain |
| `f1d8a65` | Document the codebase analysis |
| `8c2295f` | Plan the three-week redevelopment |

### Testing

- [OK] diff -rq against the archived duplicate: all 19 JS modules, HTML, CSS and assets byte-identical
- [OK] Frontmatter validated with the DSH yaml parser: only trellis-finish-work stays user-invocable in both project skill roots
- [OK] Measured the live first-load payload: 4.48 MB raw / 1.44 MB gzip (Rapier +esm alone is 2.86 MB)

### Status

[OK] **Completed**

### Next Steps

- Run Trellis triage and create the iteration 1 parent task with its child tasks
- Migrate to Vite + TypeScript + React 19, then add the render-loop error boundary and WebGL context-loss recovery


## Session 2: Complete iteration 1: migrate to Vite + TypeScript + React 19 and harden the runtime
<!-- trellis-session: v=2 fp=26032c2184e7c679 -->

**Date**: 2026-10-16
**Task**: Complete iteration 1: migrate to Vite + TypeScript + React 19 and harden the runtime
**Branch**: `main`

### Summary

Iteration 1 finished: four child tasks (C1 migration, C2 stability, C3 bundle budget, C4 specs and tests) delivered and archived; full verification gate green

### Main Changes

- C1: typed all 13 game modules (579 -> 0 strict errors), rewrote the Vue UI as 6 React components over a 111-line reactive store, migrated to Vite 8 + TypeScript 7 + React 19
- C1: proved behaviour invariance with a deterministic harness - 601 scripted frames compared frame by frame against the archived Vue baseline, max |delta| = 0.000e+0
- C2: render-loop error boundary, application-level WebGL context-loss recovery (simulation pause, render-target rebuild, 174 ms restore), retryable loading with visible progress, serialized resets, one disposer for every DOM listener
- C2: the new resource assertions exposed and fixed a real leak - one reflection-probe cube render target per session (now a cross-session singleton) plus undisposed light shadow maps
- C3: first-screen payload 1,333.9 -> 72.9 kB gzip (lazy game chunk + Rapier non-compat build with a self-hosted 748 kB wasm asset); draw calls 82 -> 76
- C4: extracted the pure helpers into game/math/, added 45 unit tests (93.3% statements / 87.2% branches) and filled six frontend specs from the real code

### Git Commits

| Hash | Message |
|------|---------|
| `0500b90` | Type the game modules |
| `65b41bd` | Rewrite the UI layer in React |
| `7d7ca15` | Add the deterministic regression harness |
| `6827e16` | Harden the runtime against fatal errors and context loss |
| `7e4cab1` | Register every listener through one disposer |
| `7d59235` | Cut the first-screen payload from 1.3 MB to 73 kB gzip |
| `4b6a1fe` | Extract the pure helpers into testable modules |
| `81449f0` | Add unit tests for the extracted helper modules |
| `db4ac04` | Fill the frontend specs from the real code |
| `5366cd5` | Record the test and spec results in the README |

### Testing

- [OK] typecheck 0 errors; 45/45 vitest; build ok; ui-smoke 15/15; stability-check 22/22; deterministic comparison 0.000e+0; npm ci --dry-run resolves the lockfile
- [OK] Bundle/runtime measured with scripts/measure-budget.mjs: first screen 72.9 kB gzip, game chunk 166.5 kB, Rapier wasm 747.9 kB streamed, 76 draw calls, 27.9k triangles

### Status

[OK] **Completed**

### Next Steps

- Iteration 2: VehicleState data layer and state bus, digital cluster, highway stage
- Iteration 3: ADAS visualisation layers, perception noise model, performance panel, delivery


## Session 3: Complete iteration 2: vehicle state layer, digital cluster and highway stage
<!-- trellis-session: v=2 fp=f2453c28d60f7f6b -->

**Date**: 2026-10-16
**Task**: Complete iteration 2: vehicle state layer, digital cluster and highway stage
**Branch**: `main`

### Summary

Iteration 2 finished: the demo now has a testable data layer, a frame-rate independent simulation, a digital cluster HMI and a second stage; all three child tasks archived

### Main Changes

- D1: VehicleState signals + a subscription state bus with swappable sources (live simulation or JSON replay), units.ts as the single unit-conversion entry point, and frame-rate.ts turning every per-frame constant into a time-based one
- D1: the control loop now advances inside the physics substep, so 30/60/144 Hz runs are bit-identical (max |delta| = 0.0000); telemetry became a bus consumer with collision/box/race events
- D1 fixed three upstream defects found on the way: steering exceeded its own limit by 0.84 degrees, the jump was level-triggered (14 impulses per 0.1 s at 144 Hz vs 3 at 30 Hz), and resets gave no visual feedback
- D2: digital cluster (speed gauge, gear, centre-zero power bar, status icons, stage switcher) built from DOM/CSS only - one canvas on the page, transform-only updates, memoised static gauge face
- D3: highway stage with a deterministic centreline, three lanes, guardrails, gantries and a kinematic lead vehicle as the ADAS target; the stage list is published by the game so the UI stays out of the game bundle

### Git Commits

| Hash | Message |
|------|---------|
| `15981ea` | Add the vehicle state layer and the state bus |
| `61493c2` | Make the control loop frame-rate independent |
| `59895f2` | Drive the HMI from the state bus and fix the displayed units |
| `ae77b37` | Add the digital cluster driven by the vehicle state |
| `521a1f9` | Add the highway stage with a kinematic lead vehicle |

### Testing

- [OK] typecheck 0 errors; 125/125 vitest (vehicle-state/state-bus/units/frame-rate at 100% coverage); smoke 21/21; stability 22/22; cluster 10/10; stage 12/12
- [OK] Golden baseline: studio physics unchanged (prefix 301 frames, 0.000e+0); 20 stage switches leave geometries/textures/programs/listeners at baseline

### Status

[OK] **Completed**

### Next Steps

- Iteration 3: ADAS visualisation layers (lane lines, target boxes, planned trajectory), perception noise narrative, performance panel, specs and delivery


## Session 4: Complete iteration 3: ADAS visualisation, perception narrative and performance tooling
<!-- trellis-session: v=2 fp=e8c4cbcb1d45f36d -->

**Date**: 2026-10-16
**Task**: Complete iteration 3: ADAS visualisation, perception narrative and performance tooling
**Branch**: `main`

### Summary

Iteration 3 finished and the project is delivery-ready: ADAS layers with layer isolation, a deterministic perception model, a performance panel, demo assets, an English README and a published static build

### Main Changes

- E1: lane ribbons from the deterministic highway centreline plus an object-pooled target layer, isolated on a dedicated THREE.Layers bit so ADAS geometry never reaches the reflection probe or the bloom dim pass (zero-allocation updates, 17 new unit tests)
- E2: a seeded perception model (dropout, jitter, heading error, second-based latency with a timestamped history ring, confidence) that turns ground truth into perception output; one toggle switches the same scene between the two
- E3: PerfMonitor + panel on F9 (frame-time p50/p95/p99, main-thread script time, renderer counters, physics substeps, ADAS targets) fed by a 4 Hz snapshot, plus a bundle baseline generated by the measurement script
- Delivery: five screenshots and a 30 s recording in docs/demo, README.en.md rewritten, gh-pages branch published with only the built site
- Fixes found by looking at the captured screenshots: the highway had no end barriers (a 14 s straight drive fell into the void), the cluster overlapped the key hints, and the gauge scale was based on a wrong top-speed assumption (measured 78 km/h studio / 88.9 km/h highway instead of the documented 36)
- Specs backfilled from the real code (10 components, transform-only instrument rules, low-frequency snapshot rule) and every React listener routed through game/listeners.ts so the registered==released invariant now covers the whole UI

### Git Commits

| Hash | Message |
|------|---------|
| `cd47542` | Add the ADAS lane and target layers with layer isolation |
| `157be37` | Add the deterministic perception noise model |
| `592acbc` | Add the performance monitor and its panel |
| `b51feef` | Add the demo assets and fix the highway ends, gauge scale and cluster overlap |
| `470f1eb` | Route every React listener through the registry and add the English README |

### Testing

- [OK] typecheck 0; 173/173 vitest; build ok; smoke 21/21; stability 22/22; cluster 10/10; stage 12/12; adas 15/15; perf 14/14; golden baseline 0.000e+0

### Status

[OK] **Completed**

### Next Steps

- Enable GitHub Pages in the repository settings to serve the published branch
- Optional follow-ups recorded in the task archives: instanced environment geometry to bring the studio draw-call count comfortably under 80, and a real-hardware frame-time measurement to settle the 0.5 ms budget that this environment cannot resolve
