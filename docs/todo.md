# Implementation Plan

## Phase 1 · Project Bootstrap

- [x] **Step 1: Initialise Vite React TS project**
  - **Task**:
    - `npm create vite@latest mfn-web-audio -- --template react-ts`
    - `cd mfn-web-audio && npm i`
    - Install deps: `npm i @mantine/core @mantine/hooks zustand idb`
    - Enable strict ESLint + Prettier configs.
  - **Files** (≤ 10):
    - `package.json`, `tsconfig.json`, `.eslintrc`, `.prettierrc`, `vite.config.ts`, initial `index.html`, `src/main.tsx`, `src/App.tsx`
  - **Dependencies**: None
  - **User Instructions**: Verify `npm run dev` serves starter page.

## Phase 2 · Directory Skeleton & Shared Types

- [x] **Step 2: Create base folder hierarchy**

  - **Task**: Add empty folders & placeholder index files matching spec.
  - **Files**:
    - `src/audio/`, `src/audio/nodes/`, `src/lib/`, `src/components/`, `src/stores/`, `src/pages/`, each with `README.md` or placeholder `.ts`/`.tsx`.
  - **Dependencies**: Step 1

- [x] **Step 3: Define global typings & schema**
  - **Task**: `audio/schema.ts` – message enums, node/param interfaces, routing matrix types (3-D).
  - **Files**: `src/audio/schema.ts`, update `tsconfig.json` paths if needed.
  - **Dependencies**: Step 2

## Phase 3 · AudioWorklet Core

- [x] **Step 4: Stub MFNProcessor & register worklet**

  - **Task**:
    - `src/audio/mfn-processor.ts`: subclass `AudioWorkletProcessor`; handle `INIT`, `GRAPH_UPDATE`, `PARAM_UPDATE`, `RENDER_OFFLINE`.
    - `src/audio/index.ts`: helper to `audioContext.audioWorklet.addModule(...)`.
    - Add `declare` for `MFNProcessor` in `global.d.ts`.
  - **Files** (≤ 6)
  - **Dependencies**: Steps 1-3
  - **User Instructions**: Run `npm run dev`; check console log from processor.

- [x] **Step 5: Implement core DSP loop & multichannel routing**
  - **Task**:
    - In `mfn-processor.ts`, iterate `channels`, apply per-channel node chain, mix via routing matrix, RMS guard.
    - Utility in `audio/matrix.ts` for fast matrix multiply across channels.
  - **Files**: `src/audio/mfn-processor.ts`, `src/audio/matrix.ts`
  - **Dependencies**: Step 4

## Phase 4 · Node Kernel Library

- [x] **Step 6: Add initial DSP kernels**

  - **Task**: Implement `delay`, `gain`, `biquad` in `audio/nodes/`. Each exports pure function `(buf, params, state)`.
  - **Files**: up to 6 kernel files + index barrel.
  - **Dependencies**: Step 5

- [x] **Step 7: Kernel registry & builder API**
  - **Task**:
    - `lib/builder.ts`: chainable class with `.channels()`, `.addNode()`, `.setMatrix()`, `.render()`.
    - `MFN.register` function to inject kernels.
  - **Files**: `src/lib/builder.ts`, `src/lib/kernel-registry.ts`
  - **Dependencies**: Step 6

## Phase 5 · State Management & Bridge

- [ ] **Step 8: Zustand slices & Audio bridge**
  - **Task**:
    - `stores/graph.ts`, `stores/ui.ts` with initial state/actions.
    - `lib/bridge.ts`: wraps AudioContext, MessagePort, translates store changes to worklet messages (debounced 5 ms).
  - **Files**: 5-6 new/updated.
  - **Dependencies**: Steps 4, 7

## Phase 6 · UI Framework

- [/] **Step 9: App shell & Mantine provider**

  - **Task**: Replace default `App.tsx` with layout incl. theme toggle, sidebar for patch list, main workspace.
  - **Files**: `src/App.tsx`, `src/components/LayoutShell.tsx`, theme file.
  - **Dependencies**: Steps 1, 8

- [ ] **Step 10: MatrixCanvas proto**

  - **Task**:
    - Create `components/MatrixCanvas.tsx` rendering stacked channel grids on `<canvas>`; callbacks fire `graph.setWeight`.
  - **Files**: `src/components/MatrixCanvas.tsx`, small helper in `lib/canvas-utils.ts`.
  - **Dependencies**: Step 9

- [ ] **Step 11: TransportBar & NodeInspector**
  - **Task**:
    - `components/TransportBar.tsx`: play/stop, record, chaos knob.
    - `components/NodeInspector.tsx`: parameter sliders tied to selected node.
  - **Files**: 2-3 component files.
  - **Dependencies**: Steps 8, 9

## Phase 7 · Recording & Persistence

- [ ] **Step 12: Implement MediaRecorder capture & Offline bounce**

  - **Task**: `lib/recording.ts` handles real-time and offline renders; save Blob to IndexedDB via `persist.ts`.
  - **Files**: `src/lib/recording.ts`, update bridge & TransportBar.
  - **Dependencies**: Steps 5, 11

- [ ] **Step 13: IndexedDB CRUD helpers & patch save/load UI**
  - **Task**:
    - `lib/persist.ts` CRUD for `patches` + `recordings`.
    - Add save/load buttons in sidebar; integrate with `graph` slice.
  - **Files**: 3-4 updates.
  - **Dependencies**: Step 8

## Phase 8 · Styling & UX Polish

- [ ] **Step 14: Theme, palette, accessibility pass**
  - **Task**: Mantine theme override with cyan/orange palette, dark-mode default, keyboard nav for MatrixCanvas.
  - **Files**: theme file, minor component tweaks (≤ 8).
  - **Dependencies**: Steps 10-11

## Phase 9 · Build & Deployment

- [ ] **Step 15: Production optimise & deploy**
  - **Task**:
    - Configure Vite `base` for CDN.
    - Add GitHub Actions workflow: install, build, upload static to Vercel/Cloudflare.
    - Update README with build commands.
  - **Files**: `.github/workflows/deploy.yml`, `vite.config.ts`, `README.md` (≤ 6).
  - **Dependencies**: All prior steps

---

### Summary

This 15-step plan bootstraps a Vite + React + TypeScript project, embeds a multichannel AudioWorklet DSP engine, and layers on a Mantine UI with Zustand state. Steps progress from tooling and processor scaffolding to kernels, state bridge, visual editor, recording, and persistence. Each step affects fewer than 20 files and builds directly on earlier work, enabling a code-generation AI—or a human team—to implement sequentially with minimal merge risk and clear checkpoints.
