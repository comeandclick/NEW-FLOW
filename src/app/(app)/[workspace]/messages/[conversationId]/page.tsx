'use client'

import { use, useEffect, useState, useRef } from 'react'
import { messagesService } from '@/services/messages.service'
import { subscribeToMessages } from '@/lib/realtime/subscriptions'
import { getSupabaseClient } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/useAuth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Send, ArrowLeft, Hash, MessageSquare } from 'lucide-react'
import { format, isToday, isYesterday } from 'date-fns'
import { cn } from '@/lib/utils'
import type { Message } from '@/types/database'
import Link from 'next/link'
import { toast } from 'sonner'

interface Props {
  params: Promise<{ workspace: string; conversationId: string }>
}

type UserProfile = { id: string; full_name?: string | null; avatar_url?: string | null; email: string }
type MessageWithUser = Message & { user: UserProfile }

function formatMessageDate(date: Date) {
  if (isToday(date)) return format(date, 'h:mm a')
  if (isYesterday(date)) return `Yesterday ${format(date, 'h:mm a')}`
  return format(date, 'MMM d, h:mm a')
}

export default function ConversationPage({ params }: Props) {
  const { workspace: slug, conversationId } = use(params)
  const { user } = useAuth()
  const [messages, setMessages] = useState<MessageWithUser[]>([])
  const [conversation, setConversation] = useState<{ name?: string | null; type: string } | null>(null)
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  // Profile cache: avoid re-fetching same user on each new message
  const profileCache = useRef<Map<string, UserProfile>>(new Map())

  useEffect(() => {
    // Load messages
    messagesService.getMessages(conversationId).then((data) => {
      const msgs = data as unknown as MessageWithUser[]
      setMessages(msgs)
      // Populate profile cache from loaded messages
      msgs.forEach((m) => { if (m.user) profileCache.current.set(m.user_id, m.user) })
      bottomRef.current?.scrollIntoView()
    })

    // Load conversation info
    getSupabaseClient()
      .from('conversations')
      .select('name, type')
      .eq('id', conversationId)
      .single()
      .then(({ data }) => setConversation(data))

    // Subscribe to realtime — use payload directly, no extra fetch
    const unsub = subscribeToMessages(conversationId, async (rawMsg) => {
      const newMsg = rawMsg as Message

      // De-dupe: might get fired for own message too
      setMessages((prev) => {
        if (prev.some((m) => m.id === newMsg.id)) return prev
        return prev // will update after profile lookup below
      })

      // Resolve user profile (cache-first)
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
      // Scroll only if near bottom
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    })

    if (user?.id) {
      messagesService.markRead(conversationId, user.id)
    }

    return unsub
  }, [conversationId, user?.id]) // eslint-disable-line react-hooks/exhaustive-deps

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
      // Add own message immediately (don't wait for realtime)
      const fullMsg = msg as unknown as MessageWithUser
      setMessages((prev) => {
        if (prev.some((m) => m.id === fullMsg.id)) return prev
        return [...prev, fullMsg]
      })
      // Cache own profile
      if (fullMsg.user) profileCache.current.set(user.id, fullMsg.user)
      setText('')
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    } catch {
      toast.error('Failed to send message')
    } finally {
      setSending(false)
    }
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
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border shrink-0">
        <Link href={`/${slug}/messages`}>
          <Button variant="ghost" size="icon" className="h-7 w-7">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        {conversation?.type === 'channel'
          ? <Hash className="h-4 w-4 text-muted-foreground" />
          : <MessageSquare className="h-4 w-4 text-muted-foreground" />
        }
        <span className="font-medium text-sm">{conversation?.name ?? 'Conversation'}</span>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-auto px-4 py-4 space-y-1">
        {groupedMessages.map(({ msg, showDate }) => {
          const isDeleted = msg.is_deleted

          return (
            <div key={msg.id}>
              {showDate && (
                <div className="flex items-center gap-2 my-4">
                  <span className="flex-1 border-t border-border" />
                  <span className="text-[10px] text-muted-foreground px-2">
                    {isToday(new Date(msg.created_at))
                      ? 'Today'
                      : isYesterday(new Date(msg.created_at))
                      ? 'Yesterday'
                      : format(new Date(msg.created_at), 'MMMM d, yyyy')}
                  </span>
                  <span className="flex-1 border-t border-border" />
                </div>
              )}
              <div className={cn('flex gap-2.5 group hover:bg-muted/20 rounded px-2 py-1 -mx-2')}>
                <Avatar className="h-7 w-7 shrink-0 mt-0.5">
                  <AvatarImage src={msg.user?.avatar_url ?? undefined} />
                  <AvatarFallback className="text-[10px]">{msg.user?.full_name?.[0] ?? '?'}</AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2">
                    <span className="text-xs font-semibold">{msg.user?.full_name ?? msg.user?.email}</span>
                    <span className="text-[10px] text-muted-foreground">{formatMessageDate(new Date(msg.created_at))}</span>
                    {msg.is_edited && <span className="text-[9px] text-muted-foreground">(edited)</span>}
                  </div>
                  {isDeleted ? (
                    <p className="text-xs text-muted-foreground italic">This message was deleted</p>
                  ) : (
                    <p className="text-sm break-words whitespace-pre-wrap">{msg.content}</p>
                  )}
                </div>
              </div>
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <form onSubmit={handleSend} className="px-4 py-3 border-t border-border flex gap-2 shrink-0">
        <Input
          placeholder={`Message ${conversation?.type === 'channel' ? '#' : ''}${conversation?.name ?? '…'}`}
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="text-sm"
          autoComplete="off"
        />
        <Button type="submit" size="icon" className="h-9 w-9 shrink-0" disabled={sending || !text.trim()}>
          <Send className="h-4 w-4" />
        </Button>
      </form>
    </div>
  )
}
