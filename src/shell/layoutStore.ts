import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export const LAYOUT_STORAGE_KEY = 'mendwell:layout';

interface LayoutState {
  /** Whether the right-hand care panel is shown on wide screens. */
  carePanelOpen: boolean;
  setCarePanelOpen: (open: boolean) => void;
  toggleCarePanel: () => void;
  /** On narrower screens the care panel opens as a drawer instead. Not remembered. */
  careDrawerOpen: boolean;
  setCareDrawerOpen: (open: boolean) => void;
}

export const useLayoutStore = create<LayoutState>()(
  persist(
    (set) => ({
      carePanelOpen: true,
      setCarePanelOpen: (carePanelOpen) => set({ carePanelOpen }),
      toggleCarePanel: () => set((state) => ({ carePanelOpen: !state.carePanelOpen })),
      careDrawerOpen: false,
      setCareDrawerOpen: (careDrawerOpen) => set({ careDrawerOpen }),
    }),
    {
      name: LAYOUT_STORAGE_KEY,
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: ({ carePanelOpen }) => ({ carePanelOpen }),
    },
  ),
);
