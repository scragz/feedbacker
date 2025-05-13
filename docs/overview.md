# Project Overview: MFN Web Audio Feedbacker

**Last Updated:** May 13, 2025

## 1. Introduction

MFN Web Audio Feedbacker is a web-based audio application designed for creating and manipulating complex audio feedback loops and soundscapes. Built with modern web technologies, it leverages the power of the Web Audio API, specifically AudioWorklets, for high-performance, multichannel audio processing directly in the browser.

The application provides a modular environment where users can dynamically add, connect, and configure various audio processing nodes (e.g., delays, filters, gains) to build intricate audio graphs. The core of the application is a custom multichannel AudioWorklet DSP engine, allowing for sophisticated routing and real-time parameter control.

The user interface is built with React and Mantine UI components, offering a responsive and interactive experience. State management is handled by Zustand, ensuring a predictable and efficient way to manage the application's complex state, including the audio graph structure, node parameters, and UI settings.

## 2. Core Technologies

- **Frontend Framework:** React (v19.1.0) with TypeScript
- **UI Library:** Mantine UI (v8.0.0) for a rich set of pre-built components and styling capabilities.
- **State Management:** Zustand (v5.0.4) for lightweight and flexible global state management.
- **Audio Processing:**
  - Web Audio API with a custom AudioWorklet (`mfn-processor.ts`) for multichannel DSP.
  - Modular audio nodes (kernels) like Delay, Gain, Biquad filters.
- **Build Tool:** Vite (v6.3.5) for fast development and optimized production builds.
- **Persistence:** IndexedDB (via `idb` library v8.0.3) for saving patches and recordings locally in the browser.
- **Linting & Formatting:** ESLint and Prettier for code quality and consistency.

## 3. Application Architecture & Main Layout

The application is structured to separate concerns, with distinct modules for audio processing, UI components, state management, and utility functions.

### 3.1. Key Directories:

- `src/audio/`: Contains all Web Audio API related code, including:
  - `mfn-processor.ts`: The core AudioWorklet processor.
  - `schema.ts`: Defines types and interfaces for audio graph, nodes, parameters, and messages between the main thread and the worklet.
  - `nodes/`: Individual DSP kernels (e.g., `delay.ts`, `gain.ts`).
  - `index.ts`: Entry point for audio system initialization and worklet loading.
- `src/components/`: Reusable React components for the UI, such as:
  - `Pedalboard/`: The main container for audio nodes.
  - `NodeList/`: Displays the list of active audio nodes.
  - `NodeEditor/`: Allows editing parameters of a selected node.
  - `Controls/`: UI elements for adding nodes, controlling master audio, etc.
  - `Header/`: Application header.
  - `StatusDisplay/`: Shows audio context status and errors.
  - (Planned) `MatrixCanvas.tsx`: For visualizing and controlling the routing matrix.
  - (Planned) `TransportBar.tsx`: For playback and recording controls.
- `src/hooks/`: Custom React hooks for managing complex logic, such as:
  - `useAudioInitialization.ts`: Handles setting up the AudioContext and AudioWorklet.
  - `useProcessorInitialization.ts`: Manages initializing the audio processor with the graph.
  - `useProcessorStatusCheck.ts`: Checks the status of the audio processor.
- `src/stores/`: Zustand store definitions (e.g., `graph.ts`, `ui.ts` - planned) for managing application state.
- `src/lib/`: Utility libraries and helper functions, including:
  - (Planned) `builder.ts`: For programmatically constructing audio graphs.
  - (Planned) `kernel-registry.ts`: For managing available DSP kernels.
  - (Planned) `recording.ts`: For handling audio recording.
  - (Planned) `persist.ts`: For IndexedDB interactions.
- `src/App.tsx`: The main application component that orchestrates the UI and integrates various parts of the application.
- `src/main.tsx`: The entry point of the React application, responsible for rendering the root component and setting up the Mantine UI provider.

### 3.2. Main Layout (Conceptual - based on README and existing components):

The application's UI, as suggested by the `README.md` (Step 9) and existing components, is likely to feature:

1.  **Main Application Shell (`LayoutShell.tsx` - planned, currently `App.tsx` serves this role):**

    - Wraps the entire application.
    - Includes the Mantine provider for theming.

2.  **Header (`Header.tsx`):**

    - Likely contains the application title or logo.
    - May include global actions or navigation (e.g., theme toggle - planned).

3.  **Main Workspace/Pedalboard Area (`Pedalboard.tsx`):**

    - This is the central area where users interact with the audio graph.
    - **Node List (`NodeList.tsx`):** Displays the audio nodes currently in the graph. Allows users to select nodes.
    - **Node Editor/Inspector (`NodeEditor.tsx`, `NodeInspector.tsx` - planned):** When a node is selected, this area shows its parameters (e.g., sliders, knobs) for real-time adjustment.
    - **(Planned) Matrix Canvas (`MatrixCanvas.tsx`):** A visual representation of the multichannel routing matrix, allowing users to connect nodes and adjust signal flow between channels.

4.  **Controls Area (`Controls.tsx`):**

    - Buttons or other UI elements to add new audio nodes to the graph.
    - Master audio controls (e.g., resume audio context).

5.  **Status Display (`StatusDisplay.tsx`):**

    - Provides feedback to the user about the audio system's state (e.g., "Initializing Audio", "Audio Context Suspended", error messages).

6.  **Sidebar (Planned - Step 9):**

    - Intended for managing patches (saving/loading audio graph configurations).
    - May also list available recordings.

7.  **(Planned) Transport Bar (`TransportBar.tsx`):**
    - Controls for global playback (play/stop).
    - Recording functionality (real-time capture, offline bounce).
    - Potentially a "chaos knob" or other global performance parameters.

## 4. Development Status & Future Work (based on README)

The project is currently in active development, with several core features already implemented (Phases 1-6 partially complete).

**Completed/In Progress:**

- Project setup with Vite, React, TypeScript, Mantine, Zustand, and IDB.
- Basic directory structure and shared type definitions (`audio/schema.ts`).
- Core AudioWorklet processor (`mfn-processor.ts`) with multichannel routing capabilities.
- Initial DSP kernels (delay, gain, biquad).
- Basic UI shell (`App.tsx`) with components for displaying nodes (`NodeList`), editing parameters (`NodeEditor`), adding nodes (`Controls`), and showing status (`StatusDisplay`).
- Refactoring of `App.tsx` logic into custom hooks (`useAudioInitialization`, `useProcessorInitialization`, `useProcessorStatusCheck`).

**Upcoming Features (Phases 7-15):**

- **Kernel Registry & Builder API (`lib/builder.ts`, `lib/kernel-registry.ts`):** For more advanced graph construction and kernel management.
- **Zustand Slices & Audio Bridge (`stores/`, `lib/bridge.ts`):** Full integration of state management with the audio engine.
- **Advanced UI Components:**
  - `MatrixCanvas.tsx`: Visual routing matrix.
  - `TransportBar.tsx`: Playback and recording controls.
- **Recording & Persistence:**
  - MediaRecorder capture and offline rendering (`lib/recording.ts`).
  - IndexedDB integration for saving/loading patches and recordings (`lib/persist.ts`).
- **Styling & UX Polish:** Custom Mantine theme, accessibility improvements.
- **Production Optimization & Deployment:** Vite configuration for CDN, GitHub Actions for CI/CD.

This overview provides a snapshot of the MFN Web Audio Feedbacker project, its architecture, and its development trajectory.
