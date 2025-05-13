import { create } from 'zustand';
import { NodeId } from '../audio/schema';

interface UIState {
  selectedNodeId: NodeId | null;
  isAudioContextRunning: boolean;
  lastErrorMessage: string | null;
  theme: 'light' | 'dark';
  // Add other UI-related state properties here
  // e.g., isSidebarOpen, currentTab, modalStates, etc.

  selectNode: (nodeId: NodeId | null) => void;
  setAudioContextRunning: (isRunning: boolean) => void;
  setLastErrorMessage: (message: string | null) => void;
  toggleTheme: () => void;
}

export const useUIStore = create<UIState>((set) => ({
  selectedNodeId: null,
  isAudioContextRunning: false,
  lastErrorMessage: null,
  theme: 'dark', // Default theme

  selectNode: (nodeId) => set({ selectedNodeId: nodeId }),
  setAudioContextRunning: (isRunning) => set({ isAudioContextRunning: isRunning }),
  setLastErrorMessage: (message) => set({ lastErrorMessage: message }),
  toggleTheme: () =>
    set((state) => ({ theme: state.theme === 'light' ? 'dark' : 'light' })),
}));
