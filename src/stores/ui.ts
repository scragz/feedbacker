import { create } from 'zustand';
import type { NodeId } from '../audio/schema';

interface UIState {
  selectedNodeId: NodeId | null;
  isAudioContextRunning: boolean;
  lastErrorMessage: string | null;
  // Add other UI-related state properties here
  // e.g., isSidebarOpen, currentTab, modalStates, etc.

  selectNode: (nodeId: NodeId | null) => void;
  setAudioContextRunning: (isRunning: boolean) => void;
  setLastErrorMessage: (message: string | null) => void;
}

export const useUIStore = create<UIState>((set) => ({
  selectedNodeId: null,
  isAudioContextRunning: false,
  lastErrorMessage: null,
  theme: 'dark', // Default theme

  selectNode: (nodeId) => {
    set({ selectedNodeId: nodeId });
  },
  setAudioContextRunning: (isRunning) => {
    set({ isAudioContextRunning: isRunning });
  },
  setLastErrorMessage: (message) => {
    set({ lastErrorMessage: message });
  },
}));
