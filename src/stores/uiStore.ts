import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'

interface UIState {
  commandPaletteOpen: boolean
  sidebarCollapsed: boolean
  activeModal: string | null
  theme: 'light' | 'dark' | 'system'

  setCommandPaletteOpen: (open: boolean) => void
  toggleCommandPalette: () => void
  setSidebarCollapsed: (collapsed: boolean) => void
  toggleSidebar: () => void
  openModal: (modalId: string) => void
  closeModal: () => void
  setTheme: (theme: UIState['theme']) => void
}

export const useUIStore = create<UIState>()(
  immer((set) => ({
    commandPaletteOpen: false,
    sidebarCollapsed: false,
    activeModal: null,
    theme: 'system',

    setCommandPaletteOpen: (open) =>
      set((state) => { state.commandPaletteOpen = open }),

    toggleCommandPalette: () =>
      set((state) => { state.commandPaletteOpen = !state.commandPaletteOpen }),

    setSidebarCollapsed: (collapsed) =>
      set((state) => { state.sidebarCollapsed = collapsed }),

    toggleSidebar: () =>
      set((state) => { state.sidebarCollapsed = !state.sidebarCollapsed }),

    openModal: (modalId) =>
      set((state) => { state.activeModal = modalId }),

    closeModal: () =>
      set((state) => { state.activeModal = null }),

    setTheme: (theme) =>
      set((state) => { state.theme = theme }),
  }))
)
