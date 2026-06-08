'use client'

import { useEffect, useCallback, useRef } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import { BubbleMenu } from '@tiptap/react/menus'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import Link from '@tiptap/extension-link'
import Image from '@tiptap/extension-image'
import Color from '@tiptap/extension-color'
import { TextStyle } from '@tiptap/extension-text-style'
import { Button } from '@/components/ui/button'
import {
  Bold, Italic, Strikethrough, Code, Link2, List, ListOrdered,
  CheckSquare, Quote, Minus
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Json } from '@/types/database'

interface NoteEditorProps {
  content: Json
  onChange: (content: Json) => void
  onSave?: () => void
  placeholder?: string
  className?: string
}

export function NoteEditor({ content, onChange, onSave, placeholder = 'Start writing…', className }: NoteEditorProps) {
  const saveTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({ placeholder }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Link.configure({ openOnClick: false, HTMLAttributes: { class: 'text-blue-400 underline' } }),
      Image,
      Color,
      TextStyle,
    ],
    content: content as object ?? {},
    editorProps: {
      attributes: {
        class: 'prose prose-invert max-w-none focus:outline-none min-h-[200px] text-sm',
      },
    },
    onUpdate: ({ editor }) => {
      const json = editor.getJSON() as Json
      onChange(json)
      // Debounced save
      if (onSave) {
        clearTimeout(saveTimeout.current)
        saveTimeout.current = setTimeout(onSave, 1000)
      }
    },
  })

  useEffect(() => {
    return () => { clearTimeout(saveTimeout.current) }
  }, [])

  if (!editor) return null

  return (
    <div className={cn('relative', className)}>
      {editor && (
        <BubbleMenu editor={editor} updateDelay={100}>
          <div className="flex items-center gap-0.5 bg-popover border border-border rounded-md p-1 shadow-lg">
            <ToolbarBtn
              onClick={() => editor.chain().focus().toggleBold().run()}
              active={editor.isActive('bold')}
              icon={<Bold className="h-3.5 w-3.5" />}
            />
            <ToolbarBtn
              onClick={() => editor.chain().focus().toggleItalic().run()}
              active={editor.isActive('italic')}
              icon={<Italic className="h-3.5 w-3.5" />}
            />
            <ToolbarBtn
              onClick={() => editor.chain().focus().toggleStrike().run()}
              active={editor.isActive('strike')}
              icon={<Strikethrough className="h-3.5 w-3.5" />}
            />
            <ToolbarBtn
              onClick={() => editor.chain().focus().toggleCode().run()}
              active={editor.isActive('code')}
              icon={<Code className="h-3.5 w-3.5" />}
            />
            <ToolbarBtn
              onClick={() => {
                const url = window.prompt('URL')
                if (url) editor.chain().focus().setLink({ href: url }).run()
              }}
              active={editor.isActive('link')}
              icon={<Link2 className="h-3.5 w-3.5" />}
            />
          </div>
        </BubbleMenu>
      )}

      {/* Fixed toolbar */}
      <div className="flex items-center gap-0.5 border-b border-border pb-2 mb-4 flex-wrap">
        <ToolbarBtn
          onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
          active={editor.isActive('heading', { level: 1 })}
          label="H1"
        />
        <ToolbarBtn
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          active={editor.isActive('heading', { level: 2 })}
          label="H2"
        />
        <ToolbarBtn
          onClick={() => editor.chain().focus().toggleBold().run()}
          active={editor.isActive('bold')}
          icon={<Bold className="h-3.5 w-3.5" />}
        />
        <ToolbarBtn
          onClick={() => editor.chain().focus().toggleItalic().run()}
          active={editor.isActive('italic')}
          icon={<Italic className="h-3.5 w-3.5" />}
        />
        <ToolbarBtn
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          active={editor.isActive('bulletList')}
          icon={<List className="h-3.5 w-3.5" />}
        />
        <ToolbarBtn
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          active={editor.isActive('orderedList')}
          icon={<ListOrdered className="h-3.5 w-3.5" />}
        />
        <ToolbarBtn
          onClick={() => editor.chain().focus().toggleTaskList().run()}
          active={editor.isActive('taskList')}
          icon={<CheckSquare className="h-3.5 w-3.5" />}
        />
        <ToolbarBtn
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
          active={editor.isActive('blockquote')}
          icon={<Quote className="h-3.5 w-3.5" />}
        />
        <ToolbarBtn
          onClick={() => editor.chain().focus().toggleCodeBlock().run()}
          active={editor.isActive('codeBlock')}
          icon={<Code className="h-3.5 w-3.5" />}
        />
        <ToolbarBtn
          onClick={() => editor.chain().focus().setHorizontalRule().run()}
          icon={<Minus className="h-3.5 w-3.5" />}
        />
      </div>

      <EditorContent editor={editor} />
    </div>
  )
}

function ToolbarBtn({
  onClick,
  active,
  icon,
  label,
}: {
  onClick: () => void
  active?: boolean
  icon?: React.ReactNode
  label?: string
}) {
  return (
    <Button
      variant="ghost"
      size="icon"
      className={cn('h-6 w-6 text-muted-foreground hover:text-foreground', active && 'bg-accent text-foreground')}
      onClick={onClick}
    >
      {icon ?? <span className="text-[11px] font-bold">{label}</span>}
    </Button>
  )
}
