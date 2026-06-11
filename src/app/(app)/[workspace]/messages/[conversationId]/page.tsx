'use client'

import { use, useEffect, useState, useRef, useCallback } from 'react'
import { messagesService } from '@/services/messages.service'
import { subscribeToMessages, broadcastTyping } from '@/lib/realtime/subscriptions'
import { getSupabaseClient } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/useAuth'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  Send, ArrowLeft, Hash, MessageSquare, Pencil, Trash2,
  Check, X, Users, Reply, CornerUpLeft,
} from 'lucide-react'
import { format, isToday, isYesterday } from 'date-fns'
import { fr } from 'date-fns/locale'
import { cn } from '@/lib/utils'
import type { Message } from '@/types/database'
import Link from 'next/link'
import { toast } from 'sonner'

interface Props {
  params: Promise<{ workspace: string; conversationId: string }>
}

type UserProfile = { id: string; full_name?: string | null; avatar_url?: string | null; email: string }
type MessageWithUser = Message & { user: UserProfile; reactions?: ReactionCount[]; replyTo?: MessageWithUser | null }
type ReactionCount = { emoji: string; count: number; userReacted: boolean }

function formatMessageDate(date: Date) {
  if (isToday(date)) return format(date, 'HH:mm')
  if (isYesterday(date)) return `Hier ${format(date, 'HH:mm')}`
  return format(date, 'd MMM HH:mm', { locale: fr })
}

// Check if two messages are from same sender within 5 min (compact display)
function shouldCompact(prev: MessageWithUser | null, curr: MessageWithUser) {
  if (!prev) return false
  if (prev.user_id !== curr.user_id) return false
  const diff = new Date(curr.created_at).getTime() - new Date(prev.created_at).getTime()
  return diff < 5 * 60 * 1000 && !curr.replyTo
}

export default function ConversationPage({ params }: Props) {
  const { workspace: slug, conversationId } = use(params)
  const { user, profile } = useAuth()
  const [messages, setMessages] = useState<MessageWithUser[]>([])
  const [conversation, setConversation] = useState<{ name?: string | null; type: string; is_private?: boolean } | null>(null)
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editText, setEditText] = useState('')
  const [hoverMsgId, setHoverMsgId] = useState<string | null>(null)
  const [members, setMembers] = useState<{ user_id: string; profile: UserProfile | null }[]>([])
  const [showMembers, setShowMembers] = useState(false)
  const [replyTo, setReplyTo] = useState<MessageWithUser | null>(null)
  const [typingUsers, setTypingUsers] = useState<Map<string, string>>(new Map()) // userId → name
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const editInputRef = useRef<HTMLInputElement>(null)
  const profileCache = useRef<Map<string, UserProfile>>(new Map())
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const wasTypingRef = useRef(false)
  const myName = profile?.full_name ?? user?.email ?? 'Quelqu\'un'

  // ── Load initial data ────────────────────────────────────────────────────
  useEffect(() => {
    messagesService.getMessages(conversationId).then((data) => {
      // Transform raw reactions rows to ReactionCount[]
      const msgs = (data as unknown as Array<MessageWithUser & {
        reactions?: Array<{ emoji: string; user_id: string; message_id: string }>
      }>).map(m => {
        const rawReactions = (m.reactions as unknown as Array<{ emoji: string; user_id: string }>) ?? []
        const reactionMap = new Map<string, ReactionCount>()
        for (const r of rawReactions) {
          const existing = reactionMap.get(r.emoji)
          if (existing) {
            existing.count++
            if (r.user_id === user?.id) existing.userReacted = true
          } else {
            reactionMap.set(r.emoji, { emoji: r.emoji, count: 1, userReacted: r.user_id === user?.id })
          }
        }
        return { ...m, reactions: Array.from(reactionMap.values()) }
      }) as MessageWithUser[]
      setMessages(msgs)
      msgs.forEach((m) => { if (m.user) profileCache.current.set(m.user_id, m.user) })
      setTimeout(() => bottomRef.current?.scrollIntoView(), 50)
    })

    getSupabaseClient()
      .from('conversations')
      .select('name, type, is_private')
      .eq('id', conversationId)
      .single()
      .then(({ data }) => setConversation(data))

    // Reactions already included via messagesService.getMessages() reactions(*) join
    // loadReactions() removed — it fetched ALL reactions without conversation filter (bug)

    const unsub = subscribeToMessages(
      conversationId,
      async (rawMsg) => {
        const newMsg = rawMsg as Message
        let userProfile = profileCache.current.get(newMsg.user_id)
        if (!userProfile) {
          const { data } = await getSupabaseClient()
            .from('profiles').select('id, full_name, avatar_url, email').eq('id', newMsg.user_id).single()
          if (data) { userProfile = data as UserProfile; profileCache.current.set(newMsg.user_id, userProfile) }
        }
        const fullMsg: MessageWithUser = {
          ...newMsg,
          user: userProfile ?? { id: newMsg.user_id, email: '', full_name: null, avatar_url: null },
        }
        setMessages((prev) => {
          if (prev.some((m) => m.id === fullMsg.id)) return prev
          return [...prev, fullMsg]
        })
        // Clear typing for sender
        if (newMsg.user_id !== user?.id) {
          setTypingUsers(prev => { const m = new Map(prev); m.delete(newMsg.user_id); return m })
        }
        setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
      },
      // On UPDATE (edit/delete)
      (updatedMsg) => {
        const m = updatedMsg as Message
        setMessages(prev => prev.map(msg => msg.id === m.id
          ? { ...msg, content: m.content, is_edited: m.is_edited, is_deleted: m.is_deleted }
          : msg
        ))
      },
      // On typing broadcast
      ({ userId, name, typing }) => {
        if (userId === user?.id) return
        setTypingUsers(prev => {
          const m = new Map(prev)
          if (typing) m.set(userId, name)
          else m.delete(userId)
          return m
        })
        // Auto-clear after 4s
        setTimeout(() => {
          setTypingUsers(prev => { const m = new Map(prev); m.delete(userId); return m })
        }, 4000)
      }
    )

    if (user?.id) messagesService.markRead(conversationId, user.id)

    return unsub
  }, [conversationId, user?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Load conversation members
  async function loadMembers() {
    const { data } = await getSupabaseClient()
      .from('conversation_members')
      .select('user_id, profile:profiles(id, full_name, avatar_url, email)')
      .eq('conversation_id', conversationId)
    if (data) setMembers(data as unknown as { user_id: string; profile: UserProfile | null }[])
  }

  // ── Reactions (filtered by conversation messages) ─────────────────────────
  async function loadReactions(msgIds?: string[]) {
    if (!user?.id) return
    const ids = msgIds ?? messages.map(m => m.id)
    if (!ids.length) return
    const { data } = await getSupabaseClient()
      .from('reactions')
      .select('emoji, user_id, message_id')
      .in('message_id', ids)
    if (!data) return
    const byMsg: Record<string, ReactionCount[]> = {}
    for (const r of data) {
      if (!r.message_id) continue
      if (!byMsg[r.message_id]) byMsg[r.message_id] = []
      const existing = byMsg[r.message_id].find(x => x.emoji === r.emoji)
      if (existing) { existing.count++; if (r.user_id === user?.id) existing.userReacted = true }
      else byMsg[r.message_id].push({ emoji: r.emoji, count: 1, userReacted: r.user_id === user?.id })
    }
    setMessages(prev => prev.map(m => ids.includes(m.id) ? { ...m, reactions: byMsg[m.id] ?? m.reactions ?? [] } : m))
  }

  // ── Typing broadcast ──────────────────────────────────────────────────────
  function handleTextChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setText(e.target.value)
    if (!user?.id) return

    if (!wasTypingRef.current) {
      wasTypingRef.current = true
      broadcastTyping(conversationId, user.id, myName, true)
    }

    if (typingTimerRef.current) clearTimeout(typingTimerRef.current)
    typingTimerRef.current = setTimeout(() => {
      wasTypingRef.current = false
      broadcastTyping(conversationId, user.id, myName, false)
    }, 2500)
  }

  // ── Send ──────────────────────────────────────────────────────────────────
  async function handleSend(e?: React.FormEvent) {
    e?.preventDefault()
    if (!text.trim() || !user) return
    const content = text.trim()
    setText('')
    setSending(true)

    // Stop typing
    wasTypingRef.current = false
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current)
    broadcastTyping(conversationId, user.id, myName, false)

    try {
      const res = await fetch('/api/messages/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId, content, replyToId: replyTo?.id ?? null }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Erreur')
      const fullMsg = data as MessageWithUser
      setMessages((prev) => {
        if (prev.some((m) => m.id === fullMsg.id)) return prev
        return [...prev, { ...fullMsg, reactions: [], replyTo: replyTo ?? undefined }]
      })
      if (fullMsg.user) profileCache.current.set(user.id, fullMsg.user)
      setReplyTo(null)
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
    } catch (err) {
      setText(content)
      toast.error(err instanceof Error ? err.message : 'Impossible d\'envoyer le message')
    } finally {
      setSending(false)
    }
  }

  // ── Edit ──────────────────────────────────────────────────────────────────
  async function handleEdit(msgId: string) {
    if (!editText.trim()) return
    try {
      await getSupabaseClient()
        .from('messages').update({ content: editText.trim(), is_edited: true }).eq('id', msgId)
      setMessages(prev => prev.map(m => m.id === msgId ? { ...m, content: editText.trim(), is_edited: true } : m))
      setEditingId(null); setEditText('')
    } catch { toast.error('Impossible de modifier') }
  }

  async function handleDelete(msgId: string) {
    try {
      await getSupabaseClient().from('messages').update({ is_deleted: true, content: null }).eq('id', msgId)
      setMessages(prev => prev.map(m => m.id === msgId ? { ...m, is_deleted: true, content: null } : m))
    } catch { toast.error('Impossible de supprimer') }
  }

  // ── Reactions ─────────────────────────────────────────────────────────────
  async function toggleReaction(msgId: string, emoji: string) {
    if (!user?.id) return
    const msg = messages.find(m => m.id === msgId)
    const existing = msg?.reactions?.find(r => r.emoji === emoji)
    if (existing?.userReacted) {
      await getSupabaseClient().from('reactions').delete().eq('message_id', msgId).eq('user_id', user.id).eq('emoji', emoji)
      setMessages(prev => prev.map(m => m.id !== msgId ? m : {
        ...m,
        reactions: (m.reactions ?? []).map(r => r.emoji === emoji ? { ...r, count: r.count - 1, userReacted: false } : r).filter(r => r.count > 0)
      }))
    } else {
      await getSupabaseClient().from('reactions').insert({ message_id: msgId, user_id: user.id, emoji })
      setMessages(prev => prev.map(m => m.id !== msgId ? m : {
        ...m,
        reactions: existing
          ? (m.reactions ?? []).map(r => r.emoji === emoji ? { ...r, count: r.count + 1, userReacted: true } : r)
          : [...(m.reactions ?? []), { emoji, count: 1, userReacted: true }]
      }))
    }
  }

  // ── Keyboard ──────────────────────────────────────────────────────────────
  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
    if (e.key === 'Escape') setReplyTo(null)
  }

  // ── Grouping ──────────────────────────────────────────────────────────────
  let lastDate = ''
  const groupedMessages = messages.map((msg, i) => {
    const dateKey = format(new Date(msg.created_at), 'yyyy-MM-dd')
    const showDate = dateKey !== lastDate
    lastDate = dateKey
    const compact = shouldCompact(messages[i - 1] ?? null, msg) && !showDate
    return { msg, showDate, compact }
  })

  const typingList = [...typingUsers.values()]

  return (
    <div className="flex flex-col h-full relative">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border shrink-0">
        <Link href={`/${slug}/messages`}>
          <Button variant="ghost" size="icon" className="h-7 w-7">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex items-center gap-1.5 flex-1 min-w-0">
          {conversation?.type === 'channel'
            ? <Hash className="h-4 w-4 text-muted-foreground shrink-0" />
            : <MessageSquare className="h-4 w-4 text-muted-foreground shrink-0" />
          }
          <span className="font-semibold text-sm truncate">{conversation?.name ?? 'Conversation'}</span>
          <span className="text-[10px] text-muted-foreground ml-1">{messages.length} message{messages.length !== 1 ? 's' : ''}</span>
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0"
          onClick={() => { setShowMembers(!showMembers); if (!showMembers) loadMembers() }} title="Membres">
          <Users className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex flex-1 overflow-hidden relative">
        {/* Messages area */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-auto px-4 py-4">
            {groupedMessages.map(({ msg, showDate, compact }) => {
              const isOwn = msg.user_id === user?.id
              const isEditing = editingId === msg.id

              return (
                <div key={msg.id}>
                  {showDate && (
                    <div className="flex items-center gap-2 my-4">
                      <span className="flex-1 border-t border-border" />
                      <span className="text-[10px] text-muted-foreground px-2 font-medium">
                        {isToday(new Date(msg.created_at)) ? 'Aujourd\'hui'
                          : isYesterday(new Date(msg.created_at)) ? 'Hier'
                          : format(new Date(msg.created_at), 'd MMMM yyyy', { locale: fr })}
                      </span>
                      <span className="flex-1 border-t border-border" />
                    </div>
                  )}

                  <div
                    className="relative group flex gap-2.5 hover:bg-muted/30 rounded-lg px-2 py-1 -mx-2 transition-colors"
                    style={{ marginTop: compact ? 1 : 12 }}
                    onMouseEnter={() => setHoverMsgId(msg.id)}
                    onMouseLeave={() => setHoverMsgId(null)}
                  >
                    {/* Avatar or spacer */}
                    {compact ? (
                      <div className="w-7 shrink-0" />
                    ) : (
                      <Avatar className="h-7 w-7 shrink-0 mt-0.5">
                        <AvatarImage src={msg.user?.avatar_url ?? undefined} />
                        <AvatarFallback className="text-[10px]">
                          {(msg.user?.full_name ?? msg.user?.email ?? '?')[0].toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                    )}

                    <div className="flex-1 min-w-0">
                      {/* Name + time (only on first message of group) */}
                      {!compact && (
                        <div className="flex items-baseline gap-1.5">
                          <span className="text-xs font-semibold">{msg.user?.full_name ?? msg.user?.email}</span>
                          <span className="text-[10px] text-muted-foreground">{formatMessageDate(new Date(msg.created_at))}</span>
                          {msg.is_edited && <span className="text-[9px] text-muted-foreground">(modifié)</span>}
                        </div>
                      )}

                      {/* Reply-to reference */}
                      {msg.parent_id && (() => {
                        const original = messages.find(m => m.id === msg.parent_id)
                        if (!original) return null
                        return (
                          <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground mb-0.5 pl-1 border-l-2 border-muted-foreground/30 ml-0">
                            <CornerUpLeft className="h-2.5 w-2.5 shrink-0" />
                            <span className="font-medium">{original.user?.full_name ?? original.user?.email}</span>
                            <span className="truncate max-w-[200px]">{original.content?.slice(0, 60)}{(original.content?.length ?? 0) > 60 ? '…' : ''}</span>
                          </div>
                        )
                      })()}

                      {msg.is_deleted ? (
                        <p className="text-xs text-muted-foreground italic">Message supprimé</p>
                      ) : isEditing ? (
                        <div className="flex gap-1.5 mt-1">
                          <input
                            ref={editInputRef}
                            value={editText}
                            onChange={e => setEditText(e.target.value)}
                            className="flex-1 h-7 text-xs px-2 rounded border border-border bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                            onKeyDown={e => {
                              if (e.key === 'Enter') handleEdit(msg.id)
                              if (e.key === 'Escape') { setEditingId(null); setEditText('') }
                            }}
                            autoFocus
                          />
                          <Button size="icon" className="h-7 w-7" onClick={() => handleEdit(msg.id)}><Check className="h-3 w-3" /></Button>
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { setEditingId(null); setEditText('') }}><X className="h-3 w-3" /></Button>
                        </div>
                      ) : (
                        <p className="text-sm break-words whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                      )}

                      {/* Reactions */}
                      {(msg.reactions ?? []).length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {(msg.reactions ?? []).map(r => (
                            <button key={r.emoji}
                              onClick={() => toggleReaction(msg.id, r.emoji)}
                              className={cn(
                                'flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[11px] border transition-colors',
                                r.userReacted ? 'bg-primary/10 border-primary/30 text-primary' : 'bg-muted border-border hover:bg-muted/80'
                              )}
                            >
                              <span>{r.emoji}</span>
                              <span className="font-medium">{r.count}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Hover actions */}
                    {hoverMsgId === msg.id && !msg.is_deleted && !isEditing && (
                      <div className="absolute right-2 top-1 flex items-center gap-0.5 bg-background border border-border rounded-lg shadow-sm px-1 py-0.5 z-10">
                        <button onClick={() => setReplyTo(msg)} className="p-1 rounded hover:bg-muted" title="Répondre">
                          <Reply className="h-3.5 w-3.5 text-muted-foreground" />
                        </button>
                        {isOwn && (
                          <>
                            <button
                              onClick={() => { setEditingId(msg.id); setEditText(msg.content ?? '') }}
                              className="p-1 rounded hover:bg-muted" title="Modifier">
                              <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                            </button>
                            <button onClick={() => handleDelete(msg.id)} className="p-1 rounded hover:bg-destructive/10" title="Supprimer">
                              <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
                            </button>
                          </>
                        )}
                      </div>
                    )}

                  </div>
                </div>
              )
            })}

            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full py-16 text-center space-y-2">
                <MessageSquare className="h-10 w-10 text-muted-foreground/40" />
                <p className="text-sm text-muted-foreground">Aucun message encore.</p>
                <p className="text-xs text-muted-foreground">Soyez le premier à écrire !</p>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Typing indicator */}
          {typingList.length > 0 && (
            <div className="px-6 py-1 text-[11px] text-muted-foreground flex items-center gap-1.5">
              <span className="flex gap-0.5">
                <span className="w-1 h-1 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-1 h-1 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-1 h-1 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: '300ms' }} />
              </span>
              <span>
                {typingList.length === 1
                  ? `${typingList[0]} écrit…`
                  : typingList.length === 2
                  ? `${typingList[0]} et ${typingList[1]} écrivent…`
                  : `${typingList.length} personnes écrivent…`}
              </span>
            </div>
          )}

          {/* Reply-to banner */}
          {replyTo && (
            <div className="px-4 py-2 border-t border-border bg-muted/30 flex items-center gap-2 shrink-0">
              <CornerUpLeft className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <div className="flex-1 min-w-0">
                <span className="text-[10px] font-semibold text-muted-foreground">{replyTo.user?.full_name ?? replyTo.user?.email}</span>
                <span className="text-[10px] text-muted-foreground ml-1.5 truncate">{replyTo.content?.slice(0, 80)}</span>
              </div>
              <button onClick={() => setReplyTo(null)} className="text-muted-foreground hover:text-foreground">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          {/* Input */}
          <div className="px-4 py-3 border-t border-border shrink-0">
            <div className="flex gap-2 items-end">
              <textarea
                ref={inputRef}
                placeholder={`Message ${conversation?.type === 'channel' ? '#' + (conversation?.name ?? '') : (conversation?.name ?? '…')}`}
                value={text}
                onChange={handleTextChange}
                onKeyDown={handleKeyDown}
                rows={1}
                className="flex-1 text-sm px-3 py-2 rounded-xl border border-border bg-background resize-none focus:outline-none focus:ring-1 focus:ring-ring min-h-[38px] max-h-[120px] leading-relaxed"
                style={{ height: 'auto' }}
                onInput={e => {
                  const t = e.currentTarget
                  t.style.height = 'auto'
                  t.style.height = Math.min(t.scrollHeight, 120) + 'px'
                }}
              />
              <Button type="button" size="icon" className="h-9 w-9 shrink-0 rounded-xl" disabled={sending || !text.trim()} onClick={() => handleSend()}>
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        {/* Members sidebar — overlay on mobile, side panel on desktop */}
        {showMembers && (
          <div className="absolute inset-y-0 right-0 w-52 md:relative md:inset-auto border-l border-border flex flex-col shrink-0 bg-background z-20 shadow-xl md:shadow-none">
            <div className="px-3 py-2.5 border-b border-border flex items-center justify-between">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Membres</p>
              <button onClick={() => setShowMembers(false)} className="text-muted-foreground hover:text-foreground">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="flex-1 overflow-auto p-2 space-y-1">
              {members.map(m => (
                <div key={m.user_id} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted/30">
                  <div className="relative shrink-0">
                    <Avatar className="h-6 w-6">
                      <AvatarImage src={m.profile?.avatar_url ?? undefined} />
                      <AvatarFallback className="text-[9px]">
                        {(m.profile?.full_name ?? m.profile?.email ?? '?')[0].toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                  </div>
                  <span className="text-xs truncate">{m.profile?.full_name ?? m.profile?.email}</span>
                  {m.user_id === user?.id && <span className="text-[9px] text-muted-foreground ml-auto">Vous</span>}
                </div>
              ))}
              {members.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-4">Chargement…</p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
