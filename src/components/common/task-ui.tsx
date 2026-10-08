'use client'
import { AlertTriangle, ArrowDown, ArrowUp, Check, CircleDashed, Circle, CircleDot, CircleCheck, CircleX, Minus } from 'lucide-react'
import type { Priority, TaskStatus } from '@/lib/types'
import { cn } from '@/lib/utils'

export const STATUSES: TaskStatus[] = ['backlog', 'todo', 'in_progress', 'in_review', 'done', 'cancelled']
export const PRIORITIES: Priority[] = ['urgent', 'high', 'medium', 'low']

export const STATUS_COLOR: Record<TaskStatus, string> = {
  backlog: 'var(--text-3)', todo: 'var(--text-2)', in_progress: 'var(--warning)', in_review: 'var(--info)', done: 'var(--success)', cancelled: 'var(--text-3)',
}
export const PRIORITY_COLOR: Record<Priority, string> = { urgent: 'var(--danger)', high: 'var(--warning)', medium: 'var(--info)', low: 'var(--text-3)' }

export function StatusIcon({ status, className }: { status: TaskStatus; className?: string }) {
  const c = cn('size-4', className)
  const style = { color: STATUS_COLOR[status] }
  if (status === 'done') return <CircleCheck className={c} style={style} />
  if (status === 'cancelled') return <CircleX className={c} style={style} />
  if (status === 'in_progress') return <CircleDot className={c} style={style} />
  if (status === 'in_review') return <Check className={cn(c, 'rounded-full border border-current p-0.5')} style={style} />
  if (status === 'backlog') return <CircleDashed className={c} style={style} />
  return <Circle className={c} style={style} />
}

export function PriorityIcon({ priority, className }: { priority: Priority; className?: string }) {
  const c = cn('size-3.5', className)
  const style = { color: PRIORITY_COLOR[priority] }
  if (priority === 'urgent') return <AlertTriangle className={c} style={style} />
  if (priority === 'high') return <ArrowUp className={c} style={style} />
  if (priority === 'low') return <ArrowDown className={c} style={style} />
  return <Minus className={c} style={style} />
}
