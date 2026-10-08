'use client'
import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import Link from '@tiptap/extension-link'
import { useEffect } from 'react'
import { Bold, Code, Heading1, Heading2, Heading3, Italic, LinkIcon, List, ListChecks, ListOrdered, Minus, Quote, Redo2, Strikethrough, Undo2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useT } from '@/i18n/provider'

type Props = { content: Record<string, unknown>; editable: boolean; onChange: (json: Record<string, unknown>, text: string) => void; resetKey?: string }

function ToolbarBtn({ on, active, label, icon: Icon, disabled }: { on: () => void; active?: boolean; label: string; icon: typeof Bold; disabled?: boolean }) {
  return (
    <button type="button" onClick={on} disabled={disabled} title={label} aria-label={label} aria-pressed={active}
      className={cn('flex size-8 shrink-0 items-center justify-center rounded-md text-text-2 transition-colors hover:bg-surface-3 hover:text-text disabled:opacity-40', active && 'bg-accent-soft text-accent-ink')}>
      <Icon className="size-4" />
    </button>
  )
}

export function RichEditor({ content, editable, onChange, resetKey }: Props) {
  const t = useT()
  const editor = useEditor({
    immediatelyRender: false,
    editable,
    extensions: [
      StarterKit.configure({ link: false }),
      Link.configure({ openOnClick: false, autolink: true }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Placeholder.configure({ placeholder: t('notes.placeholder') }),
    ],
    content: Object.keys(content).length ? content : '',
    editorProps: { attributes: { class: 'prose-flow ProseMirror', spellcheck: 'true' } },
    onUpdate: ({ editor: e }) => onChange(e.getJSON() as Record<string, unknown>, e.getText()),
  })

  useEffect(() => { editor?.setEditable(editable) }, [editor, editable])
  useEffect(() => {
    if (!editor || resetKey === undefined) return
    editor.commands.setContent(Object.keys(content).length ? content : '', { emitUpdate: false })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey, editor])

  if (!editor) return null
  const setLink = () => {
    const prev = editor.getAttributes('link').href as string | undefined
    const url = window.prompt('URL', prev ?? 'https://')
    if (url === null) return
    if (url === '') editor.chain().focus().unsetLink().run()
    else editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run()
  }
  return (
    <div>
      {editable && (
        <div className="sticky top-0 z-10 -mx-1 mb-3 flex gap-0.5 overflow-x-auto rounded-xl border border-border bg-surface/90 p-1 backdrop-blur [scrollbar-width:none]">
          <ToolbarBtn on={() => editor.chain().focus().undo().run()} label={t('ed.undo')} icon={Undo2} disabled={!editor.can().undo()} />
          <ToolbarBtn on={() => editor.chain().focus().redo().run()} label={t('ed.redo')} icon={Redo2} disabled={!editor.can().redo()} />
          <span className="mx-1 my-1.5 w-px shrink-0 bg-border" />
          <ToolbarBtn on={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} active={editor.isActive('heading', { level: 1 })} label={t('ed.h1')} icon={Heading1} />
          <ToolbarBtn on={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} active={editor.isActive('heading', { level: 2 })} label={t('ed.h2')} icon={Heading2} />
          <ToolbarBtn on={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} active={editor.isActive('heading', { level: 3 })} label={t('ed.h3')} icon={Heading3} />
          <span className="mx-1 my-1.5 w-px shrink-0 bg-border" />
          <ToolbarBtn on={() => editor.chain().focus().toggleBold().run()} active={editor.isActive('bold')} label={t('ed.bold')} icon={Bold} />
          <ToolbarBtn on={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive('italic')} label={t('ed.italic')} icon={Italic} />
          <ToolbarBtn on={() => editor.chain().focus().toggleStrike().run()} active={editor.isActive('strike')} label={t('ed.strike')} icon={Strikethrough} />
          <ToolbarBtn on={() => editor.chain().focus().toggleCode().run()} active={editor.isActive('code')} label={t('ed.code')} icon={Code} />
          <ToolbarBtn on={setLink} active={editor.isActive('link')} label={t('ed.link')} icon={LinkIcon} />
          <span className="mx-1 my-1.5 w-px shrink-0 bg-border" />
          <ToolbarBtn on={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive('bulletList')} label={t('ed.bullets')} icon={List} />
          <ToolbarBtn on={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive('orderedList')} label={t('ed.numbers')} icon={ListOrdered} />
          <ToolbarBtn on={() => editor.chain().focus().toggleTaskList().run()} active={editor.isActive('taskList')} label={t('ed.todos')} icon={ListChecks} />
          <ToolbarBtn on={() => editor.chain().focus().toggleBlockquote().run()} active={editor.isActive('blockquote')} label={t('ed.quote')} icon={Quote} />
          <ToolbarBtn on={() => editor.chain().focus().setHorizontalRule().run()} label={t('ed.divider')} icon={Minus} />
        </div>
      )}
      <EditorContent editor={editor} />
    </div>
  )
}
