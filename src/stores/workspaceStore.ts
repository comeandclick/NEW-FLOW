import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import type { Workspace, WorkspaceMember, Project } from '@/types/database'

interface WorkspaceState {
  workspaces: Workspace[]
  currentWorkspace: Workspace | null
  currentWorkspaceMembers: WorkspaceMember[]
  projects: Project[]
  currentProject: Project | null
  isLoading: boolean

  setWorkspaces: (workspaces: Workspace[]) => void
  setCurrentWorkspace: (workspace: Workspace | null) => void
  setCurrentWorkspaceMembers: (members: WorkspaceMember[]) => void
  setProjects: (projects: Project[]) => void
  setCurrentProject: (project: Project | null) => void
  addWorkspace: (workspace: Workspace) => void
  updateWorkspace: (id: string, updates: Partial<Workspace>) => void
  removeWorkspace: (id: string) => void
  addProject: (project: Project) => void
  updateProject: (id: string, updates: Partial<Project>) => void
  removeProject: (id: string) => void
  setLoading: (loading: boolean) => void
  reset: () => void
}

const initialState = {
  workspaces: [],
  currentWorkspace: null,
  currentWorkspaceMembers: [],
  projects: [],
  currentProject: null,
  isLoading: false,
}

export const useWorkspaceStore = create<WorkspaceState>()(
  immer((set) => ({
    ...initialState,

    setWorkspaces: (workspaces) =>
      set((state) => { state.workspaces = workspaces }),

    setCurrentWorkspace: (workspace) =>
      set((state) => { state.currentWorkspace = workspace }),

    setCurrentWorkspaceMembers: (members) =>
      set((state) => { state.currentWorkspaceMembers = members }),

    setProjects: (projects) =>
      set((state) => { state.projects = projects }),

    setCurrentProject: (project) =>
      set((state) => { state.currentProject = project }),

    addWorkspace: (workspace) =>
      set((state) => { state.workspaces.push(workspace) }),

    updateWorkspace: (id, updates) =>
      set((state) => {
        const idx = state.workspaces.findIndex((w) => w.id === id)
        if (idx !== -1) Object.assign(state.workspaces[idx], updates)
        if (state.currentWorkspace?.id === id)
          Object.assign(state.currentWorkspace, updates)
      }),

    removeWorkspace: (id) =>
      set((state) => {
        state.workspaces = state.workspaces.filter((w) => w.id !== id)
        if (state.currentWorkspace?.id === id) state.currentWorkspace = null
      }),

    addProject: (project) =>
      set((state) => { state.projects.push(project) }),

    updateProject: (id, updates) =>
      set((state) => {
        const idx = state.projects.findIndex((p) => p.id === id)
        if (idx !== -1) Object.assign(state.projects[idx], updates)
        if (state.currentProject?.id === id)
          Object.assign(state.currentProject, updates)
      }),

    removeProject: (id) =>
      set((state) => {
        state.projects = state.projects.filter((p) => p.id !== id)
        if (state.currentProject?.id === id) state.currentProject = null
      }),

    setLoading: (loading) =>
      set((state) => { state.isLoading = loading }),

    reset: () => set(initialState),
  }))
)
