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

  if (!editor) {
    return <div className="mini-rich-skeleton">입력기를 준비하고 있습니다.</div>;
  }

  return (
    <div className="mini-rich-editor">
      <EditorContent editor={editor} />
    </div>
  );
}
