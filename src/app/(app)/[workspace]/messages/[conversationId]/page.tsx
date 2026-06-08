'use client'

import { use, useEffect, useState, useRef } from 'react'
import { messagesService } from '@/services/messages.service'
import { subscribeToMessages } from '@/lib/realtime/subscriptions'
import { useAuth } from '@/hooks/useAuth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Send, ArrowLeft, Hash } from 'lucide-react'
import { format, isToday, isYesterday } from 'date-fns'
import { cn } from '@/lib/utils'
import type { Message } from '@/types/database'
import Link from 'next/link'
import { toast } from 'sonner'

interface Props {
  params: Promise<{ workspace: string; conversationId: string }>
}

type MessageWithUser = Message & {
  user: { id: string; full_name?: string; avatar_url?: string; email: string }
}

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

  useEffect(() => {
    // Load messages
    messagesService.getMessages(conversationId).then((data) => {
      setMessages(data as unknown as MessageWithUser[])
      bottomRef.current?.scrollIntoView()
    })

    // Load conversation info
    import('@/lib/supabase/client').then(({ getSupabaseClient }) => {
      getSupabaseClient()
        .from('conversations')
        .select('name, type')
        .eq('id', conversationId)
        .single()
        .then(({ data }) => setConversation(data))
    })

    // Subscribe to realtime
    const unsub = subscribeToMessages(conversationId, (newMsg) => {
      setMessages((prev) => {
        const exists = prev.some((m) => m.id === (newMsg as unknown as MessageWithUser).id)
        if (exists) return prev
        // Fetch full message with user
        messagesService.getMessages(conversationId, 1).then((data) => {
          if (data.length > 0) {
            setMessages((p) => {
              const latest = data[data.length - 1] as unknown as MessageWithUser
              if (p.some((m) => m.id === latest.id)) return p
              return [...p, latest]
            })
            bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
          }
        })
        return prev
      })
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
      setMessages((prev) => [...prev, msg as unknown as MessageWithUser])
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
        <Hash className="h-4 w-4 text-muted-foreground" />
        <span className="font-medium text-sm">{conversation?.name ?? 'Conversation'}</span>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-auto px-4 py-4 space-y-1">
        {groupedMessages.map(({ msg, showDate }) => {
          const isOwn = msg.user_id === user?.id
          const isDeleted = msg.is_deleted

          return (
            <div key={msg.id}>
              {showDate && (
                <div className="flex items-center gap-2 my-4">
                  <span className="flex-1 border-t border-border" />
                  <span className="text-[10px] text-muted-foreground px-2">
                    {isToday(new Date(msg.created_at)) ? 'Today' : isYesterday(new Date(msg.created_at)) ? 'Yesterday' : format(new Date(msg.created_at), 'MMMM d, yyyy')}
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
                    <p className="text-sm break-words">{msg.content}</p>
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
