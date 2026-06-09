import { NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

function getAdmin() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

/**
 * POST /api/automations/execute
 * Body: {
 *   trigger_type: 'task_status_changed' | 'task_created' | 'task_due' | 'member_joined' | 'file_uploaded'
 *   workspace_id: string
 *   payload: {
 *     // For task_status_changed:
 *     task_id?: string, task_title?: string, from_status?: string, to_status?: string, assignee_id?: string, project_id?: string
 *     // For task_created:
 *     task_id?: string, task_title?: string, assignee_id?: string, project_id?: string
 *     // For member_joined:
 *     user_id?: string, user_name?: string
 *   }
 * }
 *
 * Finds all active automations in workspace that match trigger_type + trigger_config conditions.
 * Executes each matching automation's action.
 */
export async function POST(request: Request) {
  const supa = await createServerClient()
  const { data: { user } } = await supa.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const { trigger_type, workspace_id, payload } = await request.json()
  if (!trigger_type || !workspace_id) {
    return NextResponse.json({ error: 'trigger_type et workspace_id requis' }, { status: 400 })
  }

  const admin = getAdmin()

  // Load active automations matching trigger
  const { data: automations, error } = await admin
    .from('automations')
    .select('*')
    .eq('workspace_id', workspace_id)
    .eq('trigger_type', trigger_type)
    .eq('is_active', true)

  if (error || !automations?.length) {
    return NextResponse.json({ executed: 0 })
  }

  const results: string[] = []

  for (const automation of automations) {
    try {
      // ── Check trigger_config conditions ──────────────────────────────────
      const tc = (automation.trigger_config ?? {}) as Record<string, string>

      if (trigger_type === 'task_status_changed') {
        if (tc.from_status && tc.from_status !== payload.from_status) continue
        if (tc.to_status && tc.to_status !== payload.to_status) continue
        if (tc.project_id && tc.project_id !== payload.project_id) continue
      } else if (trigger_type === 'task_created') {
        if (tc.project_id && tc.project_id !== payload.project_id) continue
      }

      // ── Execute action ────────────────────────────────────────────────────
      const ac = (automation.action_config ?? {}) as Record<string, string>

      switch (automation.action_type) {
        case 'send_notification': {
          // Notify all workspace members (or specific user_ids from config)
          let targetIds: string[] = []
          if (ac.user_ids) {
            targetIds = ac.user_ids.split(',').map((s: string) => s.trim()).filter(Boolean)
          } else {
            const { data: members } = await admin
              .from('workspace_members')
              .select('user_id')
              .eq('workspace_id', workspace_id)
            targetIds = (members ?? []).map(m => m.user_id)
          }

          const title = ac.title ?? `Automation: ${automation.name}`
          const body = ac.body
            ? ac.body
                .replace('{task_title}', payload.task_title ?? '')
                .replace('{from_status}', payload.from_status ?? '')
                .replace('{to_status}', payload.to_status ?? '')
            : `Déclencheur: ${trigger_type}`

          if (targetIds.length) {
            await admin.from('notifications').insert(
              targetIds.map(uid => ({
                user_id: uid,
                workspace_id,
                type: 'automation',
                title,
                body,
                is_read: false,
                action_url: payload.task_id ? `/${workspace_id}/tasks/${payload.task_id}` : null,
                metadata: { automation_id: automation.id, trigger_type, payload },
              }))
            )
          }
          results.push(`send_notification: notified ${targetIds.length} members`)
          break
        }

        case 'set_status': {
          if (!payload.task_id || !ac.status) break
          await admin.from('tasks').update({ status: ac.status as 'todo' | 'in_progress' | 'in_review' | 'done' | 'cancelled', updated_at: new Date().toISOString() }).eq('id', payload.task_id)
          results.push(`set_status: task ${payload.task_id} → ${ac.status}`)
          break
        }

        case 'assign_task': {
          if (!payload.task_id) break
          // If assignee_id in config, use it; else keep existing
          if (ac.assignee_id) {
            await admin.from('tasks').update({ assignee_id: ac.assignee_id, updated_at: new Date().toISOString() }).eq('id', payload.task_id)
            results.push(`assign_task: task ${payload.task_id} → ${ac.assignee_id}`)
          }
          break
        }

        case 'send_message': {
          // Send message to a channel by conversation_id or find by name
          let convId: string | undefined = ac.conversation_id
          if (!convId && ac.channel_name) {
            const { data: conv } = await admin
              .from('conversations')
              .select('id')
              .eq('workspace_id', workspace_id)
              .eq('type', 'channel')
              .eq('name', ac.channel_name)
              .maybeSingle()
            convId = conv?.id ?? undefined
          }
          if (convId) {
            const content = (ac.content ?? `Automation "${automation.name}" déclenchée: ${trigger_type}`)
              .replace('{task_title}', payload.task_title ?? '')
              .replace('{from_status}', payload.from_status ?? '')
              .replace('{to_status}', payload.to_status ?? '')
            // Insert as system message (user_id = creator of automation or current user)
            await admin.from('messages').insert({
              conversation_id: convId,
              user_id: automation.created_by ?? user.id,
              content: `🤖 ${content}`,
            })
            await admin.from('conversations').update({ updated_at: new Date().toISOString() }).eq('id', convId)
            results.push(`send_message: posted to conv ${convId}`)
          }
          break
        }

        case 'create_task': {
          if (!ac.title) break
          const title = ac.title
            .replace('{task_title}', payload.task_title ?? '')
            .replace('{to_status}', payload.to_status ?? '')
          await admin.from('tasks').insert({
            workspace_id,
            title,
            status: (ac.status as 'todo' | 'in_progress' | 'in_review' | 'done' | 'cancelled') ?? 'todo',
            priority: 'medium',
            project_id: payload.project_id ?? null,
            assignee_id: ac.assignee_id ?? null,
            created_by: automation.created_by ?? user.id,
          })
          results.push(`create_task: created "${title}"`)
          break
        }
      }

      // ── Increment run_count and log last_run_at ────────────────────────────
      await admin.from('automations').update({
        run_count: (automation.run_count ?? 0) + 1,
        last_run_at: new Date().toISOString(),
      }).eq('id', automation.id)

      // Log activity
      await admin.from('activity_logs').insert({
        workspace_id,
        user_id: user.id,
        action: 'automation.executed',
        entity_type: 'automation',
        entity_id: automation.id,
        metadata: { trigger_type, action_type: automation.action_type, payload, result: results.at(-1) } as unknown as import('@/types/database').Json,
      })

    } catch (err) {
      console.error(`[automation ${automation.id}] error:`, err)
    }
  }

  return NextResponse.json({ executed: results.length, results })
}
