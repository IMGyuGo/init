"use client";

import { EditorContent, useEditor } from "@tiptap/react";
import { useEffect } from "react";

import { buildJobDescriptionEditorContent } from "./job-description-content";
import { getJobDescriptionExtensions } from "./job-description-tiptap";

type JobDescriptionViewerProps = {
  value: string | null | undefined;
  emptyMessage: string;
};

export function JobDescriptionViewer({ value, emptyMessage }: JobDescriptionViewerProps) {
  const content = buildJobDescriptionEditorContent(value);
  const editor = useEditor({
    extensions: getJobDescriptionExtensions(),
    content,
    editable: false,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: "jd-content",
      },
    },
  });

  useEffect(() => {
    if (!editor) {
      return;
    }

    if (editor.getHTML() !== content) {
      editor.commands.setContent(content, { emitUpdate: false });
    }
  }, [content, editor]);

  if (!content) {
    return emptyMessage;
  }

  if (!editor) {
    return <div className="jd-content">JD를 불러오는 중입니다.</div>;
  }

  return <EditorContent editor={editor} />;
}
