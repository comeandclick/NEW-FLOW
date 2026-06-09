'use client'

import { use, useEffect, useState, useRef } from 'react'
import { messagesService } from '@/services/messages.service'
import { subscribeToMessages } from '@/lib/realtime/subscriptions'
import { getSupabaseClient } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/useAuth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Send, ArrowLeft, Hash, MessageSquare, Smile, MoreHorizontal, Pencil, Trash2, Check, X, Users } from 'lucide-react'
import { format, isToday, isYesterday } from 'date-fns'
import { cn } from '@/lib/utils'
import type { Message } from '@/types/database'
import Link from 'next/link'
import { toast } from 'sonner'

interface Props {
  params: Promise<{ workspace: string; conversationId: string }>
}

type UserProfile = { id: string; full_name?: string | null; avatar_url?: string | null; email: string }
type MessageWithUser = Message & { user: UserProfile; reactions?: ReactionCount[] }
type ReactionCount = { emoji: string; count: number; userReacted: boolean }

const QUICK_EMOJIS = ['👍', '❤️', '😂', '🎉', '🔥', '👀', '✅', '😮']

function formatMessageDate(date: Date) {
  if (isToday(date)) return format(date, 'HH:mm')
  if (isYesterday(date)) return `Hier ${format(date, 'HH:mm')}`
  return format(date, 'd MMM HH:mm')
}

export default function ConversationPage({ params }: Props) {
  const { workspace: slug, conversationId } = use(params)
  const { user } = useAuth()
  const [messages, setMessages] = useState<MessageWithUser[]>([])
  const [conversation, setConversation] = useState<{ name?: string | null; type: string; is_private?: boolean } | null>(null)
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editText, setEditText] = useState('')
  const [hoverMsgId, setHoverMsgId] = useState<string | null>(null)
  const [emojiPickerFor, setEmojiPickerFor] = useState<string | null>(null)
  const [members, setMembers] = useState<{ user_id: string; profile: UserProfile | null }[]>([])
  const [showMembers, setShowMembers] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const editInputRef = useRef<HTMLInputElement>(null)
  const profileCache = useRef<Map<string, UserProfile>>(new Map())

  useEffect(() => {
    messagesService.getMessages(conversationId).then((data) => {
      const msgs = data as unknown as MessageWithUser[]
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

    // Load reactions for all messages
    loadReactions()

    const unsub = subscribeToMessages(conversationId, async (rawMsg) => {
      const newMsg = rawMsg as Message

      let userProfile = profileCache.current.get(newMsg.user_id)
      if (!userProfile) {
        const { data } = await getSupabaseClient()
          .from('profiles')
          .select('id, full_name, avatar_url, email')
          .eq('id', newMsg.user_id)
          .single()
        if (data) {
          userProfile = data as UserProfile
          profileCache.current.set(newMsg.user_id, userProfile)
        }
      }

      const fullMsg: MessageWithUser = {
        ...newMsg,
        user: userProfile ?? { id: newMsg.user_id, email: '', full_name: null, avatar_url: null },
      }

      setMessages((prev) => {
        if (prev.some((m) => m.id === fullMsg.id)) return prev
        return [...prev, fullMsg]
      })
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    })

    if (user?.id) {
      messagesService.markRead(conversationId, user.id)
    }

    return unsub
  }, [conversationId, user?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  async function loadReactions() {
    if (!user?.id) return
    const { data } = await getSupabaseClient()
      .from('reactions')
      .select('emoji, user_id, message_id')
      .not('message_id', 'is', null)

    if (!data) return
    const byMsg: Record<string, ReactionCount[]> = {}
    for (const r of data) {
      if (!r.message_id) continue
      if (!byMsg[r.message_id]) byMsg[r.message_id] = []
      const existing = byMsg[r.message_id].find(x => x.emoji === r.emoji)
      if (existing) {
        existing.count++
        if (r.user_id === user?.id) existing.userReacted = true
      } else {
        byMsg[r.message_id].push({ emoji: r.emoji, count: 1, userReacted: r.user_id === user?.id })
      }
    }
    setMessages(prev => prev.map(m => ({ ...m, reactions: byMsg[m.id] ?? [] })))
  }

  async function loadMembers() {
    const { data } = await getSupabaseClient()
      .from('conversation_members')
      .select('user_id, profile:profiles(id, full_name, avatar_url, email)')
      .eq('conversation_id', conversationId)
    if (data) setMembers(data as unknown as { user_id: string; profile: UserProfile | null }[])
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault()
    if (!text.trim() || !user) return
    setSending(true)
    try {
      const msg = await messagesService.send({
        conversation_id: conversationId,
        user_id: user.id,
        content: text.trim(),
      })
      const fullMsg = msg as unknown as MessageWithUser
      setMessages((prev) => {
        if (prev.some((m) => m.id === fullMsg.id)) return prev
        return [...prev, { ...fullMsg, reactions: [] }]
      })
      if (fullMsg.user) profileCache.current.set(user.id, fullMsg.user)
      setText('')
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    } catch {
      toast.error('Impossible d\'envoyer le message')
    } finally {
      setSending(false)
    }
  }

  async function handleEdit(msgId: string) {
    if (!editText.trim()) return
    try {
      await getSupabaseClient()
        .from('messages')
        .update({ content: editText.trim(), is_edited: true })
        .eq('id', msgId)
      setMessages(prev => prev.map(m => m.id === msgId ? { ...m, content: editText.trim(), is_edited: true } : m))
      setEditingId(null)
      setEditText('')
    } catch {
      toast.error('Impossible de modifier')
    }
  }

  async function handleDelete(msgId: string) {
    try {
      await getSupabaseClient()
        .from('messages')
        .update({ is_deleted: true, content: null })
        .eq('id', msgId)
      setMessages(prev => prev.map(m => m.id === msgId ? { ...m, is_deleted: true, content: null } : m))
    } catch {
      toast.error('Impossible de supprimer')
    }
  }

  async function toggleReaction(msgId: string, emoji: string) {
    if (!user?.id) return
    const msg = messages.find(m => m.id === msgId)
    const existing = msg?.reactions?.find(r => r.emoji === emoji)

    if (existing?.userReacted) {
      await getSupabaseClient()
        .from('reactions')
        .delete()
        .eq('message_id', msgId)
        .eq('user_id', user.id)
        .eq('emoji', emoji)
      setMessages(prev => prev.map(m => m.id !== msgId ? m : {
        ...m,
        reactions: (m.reactions ?? [])
          .map(r => r.emoji === emoji ? { ...r, count: r.count - 1, userReacted: false } : r)
          .filter(r => r.count > 0)
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
    setEmojiPickerFor(null)
  }

  // Group messages by date
  let lastDate = ''
  const groupedMessages = messages.map((msg) => {
    const dateKey = format(new Date(msg.created_at), 'yyyy-MM-dd')
    const showDate = dateKey !== lastDate
    lastDate = dateKey
    return { msg, showDate }
  })

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
          <span className="font-semibold text-sm truncate">
            {conversation?.name ?? 'Conversation'}
          </span>
        </div>
        <Button
          variant="ghost" size="icon" className="h-7 w-7 shrink-0"
          onClick={() => { setShowMembers(!showMembers); if (!showMembers) loadMembers() }}
          title="Membres"
        >
          <Users className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Messages area */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-auto px-4 py-4 space-y-0.5">
            {groupedMessages.map(({ msg, showDate }) => {
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
                          : format(new Date(msg.created_at), 'd MMMM yyyy')}
                      </span>
                      <span className="flex-1 border-t border-border" />
                    </div>
                  )}
                  <div
                    className="relative group flex gap-2.5 hover:bg-muted/30 rounded-lg px-2 py-1 -mx-2"
                    onMouseEnter={() => setHoverMsgId(msg.id)}
                    onMouseLeave={() => { setHoverMsgId(null); setEmojiPickerFor(null) }}
                  >
                    <Avatar className="h-7 w-7 shrink-0 mt-0.5">
                      <AvatarImage src={msg.user?.avatar_url ?? undefined} />
                      <AvatarFallback className="text-[10px]">
                        {(msg.user?.full_name ?? msg.user?.email ?? '?')[0].toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-1.5">
                        <span className="text-xs font-semibold">{msg.user?.full_name ?? msg.user?.email}</span>
                        <span className="text-[10px] text-muted-foreground">{formatMessageDate(new Date(msg.created_at))}</span>
                        {msg.is_edited && <span className="text-[9px] text-muted-foreground">(modifié)</span>}
                      </div>

                      {msg.is_deleted ? (
                        <p className="text-xs text-muted-foreground italic">Message supprimé</p>
                      ) : isEditing ? (
                        <div className="flex gap-1.5 mt-1">
                          <Input
                            ref={editInputRef}
                            value={editText}
                            onChange={e => setEditText(e.target.value)}
                            className="h-7 text-xs flex-1"
                            onKeyDown={e => {
                              if (e.key === 'Enter') handleEdit(msg.id)
                              if (e.key === 'Escape') { setEditingId(null); setEditText('') }
                            }}
                            autoFocus
                          />
                          <Button size="icon" className="h-7 w-7" onClick={() => handleEdit(msg.id)}>
                            <Check className="h-3 w-3" />
                          </Button>
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { setEditingId(null); setEditText('') }}>
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      ) : (
                        <p className="text-sm break-words whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                      )}

                      {/* Reactions */}
                      {(msg.reactions ?? []).length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {(msg.reactions ?? []).map(r => (
                            <button
                              key={r.emoji}
                              onClick={() => toggleReaction(msg.id, r.emoji)}
                              className={cn(
                                'flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[11px] border transition-colors',
                                r.userReacted
                                  ? 'bg-primary/10 border-primary/30 text-primary'
                                  : 'bg-muted border-border hover:bg-muted/80'
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
                        <button
                          onClick={() => setEmojiPickerFor(emojiPickerFor === msg.id ? null : msg.id)}
                          className="p-1 rounded hover:bg-muted transition-colors"
                          title="Réagir"
                        >
                          <Smile className="h-3.5 w-3.5 text-muted-foreground" />
                        </button>
                        {isOwn && (
                          <>
                            <button
                              onClick={() => { setEditingId(msg.id); setEditText(msg.content ?? '') }}
                              className="p-1 rounded hover:bg-muted transition-colors"
                              title="Modifier"
                            >
                              <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                            </button>
                            <button
                              onClick={() => handleDelete(msg.id)}
                              className="p-1 rounded hover:bg-destructive/10 transition-colors"
                              title="Supprimer"
                            >
                              <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
                            </button>
                          </>
                        )}
                      </div>
                    )}

                    {/* Emoji picker */}
                    {emojiPickerFor === msg.id && (
                      <div className="absolute right-2 top-10 z-20 bg-background border border-border rounded-xl shadow-lg p-2 flex gap-1">
                        {QUICK_EMOJIS.map(emoji => (
                          <button
                            key={emoji}
                            onClick={() => toggleReaction(msg.id, emoji)}
                            className="text-lg hover:scale-125 transition-transform p-1 rounded"
                          >
                            {emoji}
                          </button>
                        ))}
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

          {/* Input */}
          <form onSubmit={handleSend} className="px-4 py-3 border-t border-border flex gap-2 shrink-0">
            <div className="relative flex-1">
              <Input
                placeholder={`Message ${conversation?.type === 'channel' ? '#' : ''}${conversation?.name ?? '…'}`}
                value={text}
                onChange={(e) => setText(e.target.value)}
                className="text-sm pr-10"
                autoComplete="off"
              />
            </div>
            <Button type="submit" size="icon" className="h-9 w-9 shrink-0" disabled={sending || !text.trim()}>
              <Send className="h-4 w-4" />
            </Button>
          </form>
        </div>

        {/* Members sidebar */}
        {showMembers && (
          <div className="w-52 border-l border-border flex flex-col shrink-0">
            <div className="px-3 py-2.5 border-b border-border">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Membres</p>
            </div>
            <div className="flex-1 overflow-auto p-2 space-y-1">
              {members.map(m => (
                <div key={m.user_id} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted/30">
                  <Avatar className="h-6 w-6 shrink-0">
                    <AvatarImage src={m.profile?.avatar_url ?? undefined} />
                    <AvatarFallback className="text-[9px]">
                      {(m.profile?.full_name ?? m.profile?.email ?? '?')[0].toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <span className="text-xs truncate">{m.profile?.full_name ?? m.profile?.email}</span>
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
