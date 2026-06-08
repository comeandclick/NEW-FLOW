'use client'

import { useEffect } from 'react'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import { workspacesService } from '@/services/workspaces.service'
import { subscribeToTasks } from '@/lib/realtime/subscriptions'

export function useWorkspaces(userId: string) {
  const { workspaces, setWorkspaces, setLoading } = useWorkspaceStore()

  useEffect(() => {
    if (!userId) return
    setLoading(true)
    workspacesService
      .getForUser(userId)
      .then((data) => setWorkspaces(data as never))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [userId]) // eslint-disable-line react-hooks/exhaustive-deps

  return workspaces
}

export function useWorkspace(slug: string) {
  const { currentWorkspace, setCurrentWorkspace, setProjects, setCurrentWorkspaceMembers } =
    useWorkspaceStore()

  useEffect(() => {
    if (!slug) return
    workspacesService
      .getBySlug(slug)
      .then(async (ws) => {
        setCurrentWorkspace(ws)
        const [projects, members] = await Promise.all([
          workspacesService.getProjects(ws.id),
          workspacesService.getMembers(ws.id),
        ])
        setProjects(projects)
        setCurrentWorkspaceMembers(members as never)
        return ws
      })
      .catch(console.error)
  }, [slug]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!currentWorkspace?.id) return
    const unsub = subscribeToTasks(currentWorkspace.id)
    return unsub
  }, [currentWorkspace?.id])

  return currentWorkspace
}
