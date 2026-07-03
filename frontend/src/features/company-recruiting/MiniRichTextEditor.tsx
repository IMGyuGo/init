"use client";

import { EditorContent, useEditor } from "@tiptap/react";
import { useEffect } from "react";

import { buildJobDescriptionEditorContent } from "./job-description-content";
import { getJobDescriptionExtensions } from "./job-description-tiptap";

type MiniRichTextEditorProps = {
  value: string;
  placeholder: string;
  disabled?: boolean;
  onChange: (value: string) => void;
};

export function MiniRichTextEditor({ value, placeholder, disabled = false, onChange }: MiniRichTextEditorProps) {
  const editor = useEditor({
    extensions: getJobDescriptionExtensions(),
    content: buildJobDescriptionEditorContent(value),
    editable: !disabled,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: "mini-rich-content",
        "data-placeholder": placeholder,
      },
    },
    onUpdate: ({ editor: currentEditor }) => {
      onChange(currentEditor.getHTML());
    },
  });

  useEffect(() => {
    if (!editor) return;

    const nextContent = buildJobDescriptionEditorContent(value);
    if (editor.getHTML() !== nextContent) {
      editor.commands.setContent(nextContent, { emitUpdate: false });
    }
  }, [editor, value]);

  useEffect(() => {
    editor?.setEditable(!disabled);
  }, [disabled, editor]);

  function setLink() {
    if (!editor || disabled) return;

    const previousUrl = editor.getAttributes("link").href as string | undefined;
    const nextUrl = window.prompt("연결할 URL을 입력하세요.", previousUrl ?? "");
    if (nextUrl === null) return;

    const normalizedUrl = normalizeLinkUrl(nextUrl);
    if (!normalizedUrl) {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }

    if (editor.state.selection.empty) {
      editor.chain().focus().insertContent(`<a href="${escapeAttribute(normalizedUrl)}">${escapeHtml(normalizedUrl)}</a>`).run();
      return;
    }

    editor.chain().focus().extendMarkRange("link").setLink({ href: normalizedUrl }).run();
  }

  if (!editor) {
    return <div className="mini-rich-skeleton">입력기를 준비하고 있습니다.</div>;
  }

  return (
    <div className="mini-rich-editor">
      <div className="mini-rich-toolbar" aria-label="섹션 서식 도구">
        <button type="button" disabled={disabled || !editor.can().undo()} title="되돌리기" onClick={() => editor.chain().focus().undo().run()}>
          ↶
        </button>
        <button type="button" disabled={disabled || !editor.can().redo()} title="다시 실행" onClick={() => editor.chain().focus().redo().run()}>
          ↷
        </button>
        <span aria-hidden="true" />
        <button
          className={editor.isActive("bold") ? "is-active" : ""}
          type="button"
          disabled={disabled}
          title="굵게"
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          B
        </button>
        <button
          className={editor.isActive("bulletList") ? "is-active" : ""}
          type="button"
          disabled={disabled}
          title="글머리 목록"
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        >
          •
        </button>
        <button
          className={editor.isActive("orderedList") ? "is-active" : ""}
          type="button"
          disabled={disabled}
          title="번호 목록"
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        >
          1.
        </button>
        <button type="button" disabled={disabled} title="링크" onClick={setLink}>
          링크
        </button>
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}

function normalizeLinkUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed) || /^mailto:/i.test(trimmed)) {
    return trimmed;
  }
  return `https://${trimmed}`;
}

function escapeAttribute(value: string) {
  return escapeHtml(value).replace(/`/g, "&#96;");
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
