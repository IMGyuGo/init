"use client";

import { EditorContent, useEditor } from "@tiptap/react";
import { type ChangeEvent, type CSSProperties, useEffect, useRef, useState } from "react";

import { uploadJobDescriptionImage } from "./api";
import { buildJobDescriptionEditorContent } from "./job-description-content";
import { JOB_DESCRIPTION_IMAGE_ACCEPT, validateJobDescriptionImageFile } from "./job-description-image-upload";
import { getJobDescriptionExtensions } from "./job-description-tiptap";

type JobDescriptionEditorProps = {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  uploadImage?: (file: File) => Promise<{ url: string }>;
};

async function uploadImageByApi(file: File) {
  const response = await uploadJobDescriptionImage(file);
  return response.data;
}

export function JobDescriptionEditor({ value, onChange, disabled = false, uploadImage = uploadImageByApi }: JobDescriptionEditorProps) {
  const [zoom, setZoom] = useState(1);
  const [imageUploadMessage, setImageUploadMessage] = useState<string | null>(null);
  const [isImageUploading, setIsImageUploading] = useState(false);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const editor = useEditor({
    extensions: getJobDescriptionExtensions(),
    content: buildJobDescriptionEditorContent(value),
    editable: !disabled,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: "jd-editor-content",
      },
    },
    onUpdate: ({ editor: currentEditor }) => {
      onChange(currentEditor.getHTML());
    },
  });

  useEffect(() => {
    if (!editor) {
      return;
    }

    const nextContent = buildJobDescriptionEditorContent(value);
    if (editor.getHTML() !== nextContent) {
      editor.commands.setContent(nextContent, { emitUpdate: false });
    }
  }, [editor, value]);

  useEffect(() => {
    editor?.setEditable(!disabled);
  }, [disabled, editor]);

  function setLink() {
    if (!editor || disabled) {
      return;
    }

    const previousUrl = editor.getAttributes("link").href as string | undefined;
    const nextUrl = window.prompt("연결할 URL을 입력하세요.", previousUrl ?? "");

    if (nextUrl === null) {
      return;
    }

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

  function openImageFilePicker() {
    if (!editor || disabled || isImageUploading) {
      return;
    }

    imageInputRef.current?.click();
  }

  async function handleImageFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file || !editor || disabled || isImageUploading) {
      return;
    }

    const validation = validateJobDescriptionImageFile(file);
    if (!validation.ok) {
      setImageUploadMessage(validation.message);
      return;
    }

    setImageUploadMessage(null);
    setIsImageUploading(true);

    try {
      const uploadedImage = await uploadImage(file);
      editor.chain().focus().setImage({ src: uploadedImage.url }).run();
    } catch (error) {
      setImageUploadMessage(error instanceof Error ? error.message : "이미지 업로드에 실패했습니다.");
    } finally {
      setIsImageUploading(false);
    }
  }

  if (!editor) {
    return <div className="jd-editor-skeleton">JD 에디터를 준비하고 있습니다.</div>;
  }

  const editorStyle = { "--jd-zoom": zoom } as CSSProperties;

  function changeZoom(delta: number) {
    setZoom((current) => Math.min(1.3, Math.max(0.8, Number((current + delta).toFixed(1)))));
  }

  return (
    <div className="jd-editor" style={editorStyle}>
      <div className="jd-toolbar" aria-label="JD 서식 도구">
        <div className="jd-toolbar-group">
          <button
            className="jd-toolbar-button jd-icon-button"
            type="button"
            disabled={disabled || !editor.can().undo()}
            title="되돌리기"
            onClick={() => editor.chain().focus().undo().run()}
          >
            ↶
          </button>
          <button
            className="jd-toolbar-button jd-icon-button"
            type="button"
            disabled={disabled || !editor.can().redo()}
            title="다시 실행"
            onClick={() => editor.chain().focus().redo().run()}
          >
            ↷
          </button>
        </div>
        <div className="jd-toolbar-group">
          <button
            className="jd-toolbar-button jd-icon-button"
            type="button"
            disabled={disabled || zoom <= 0.8}
            title="축소"
            onClick={() => changeZoom(-0.1)}
          >
            -
          </button>
          <span className="jd-zoom-value">{Math.round(zoom * 100)}%</span>
          <button
            className="jd-toolbar-button jd-icon-button"
            type="button"
            disabled={disabled || zoom >= 1.3}
            title="확대"
            onClick={() => changeZoom(0.1)}
          >
            +
          </button>
        </div>
        <div className="jd-toolbar-group">
          <button
            className={editor.isActive("heading", { level: 2 }) ? "jd-toolbar-button is-active" : "jd-toolbar-button"}
            type="button"
            disabled={disabled}
            onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          >
            H2
          </button>
          <button
            className={editor.isActive("paragraph") ? "jd-toolbar-button is-active" : "jd-toolbar-button"}
            type="button"
            disabled={disabled}
            onClick={() => editor.chain().focus().setParagraph().run()}
          >
            본문
          </button>
        </div>
        <div className="jd-toolbar-group">
          <button
            className={editor.isActive("bulletList") ? "jd-toolbar-button is-active" : "jd-toolbar-button"}
            type="button"
            disabled={disabled}
            onClick={() => editor.chain().focus().toggleBulletList().run()}
          >
            목록
          </button>
          <button
            className={editor.isActive("orderedList") ? "jd-toolbar-button is-active" : "jd-toolbar-button"}
            type="button"
            disabled={disabled}
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
          >
            번호
          </button>
        </div>
        <div className="jd-toolbar-group">
          <button
            className={editor.isActive("bold") ? "jd-toolbar-button is-active" : "jd-toolbar-button"}
            type="button"
            disabled={disabled}
            onClick={() => editor.chain().focus().toggleBold().run()}
          >
            B
          </button>
          <button
            className={editor.isActive("italic") ? "jd-toolbar-button is-active" : "jd-toolbar-button"}
            type="button"
            disabled={disabled}
            onClick={() => editor.chain().focus().toggleItalic().run()}
          >
            I
          </button>
          <button
            className={editor.isActive("strike") ? "jd-toolbar-button is-active" : "jd-toolbar-button"}
            type="button"
            disabled={disabled}
            onClick={() => editor.chain().focus().toggleStrike().run()}
          >
            S
          </button>
          <button
            className={editor.isActive("underline") ? "jd-toolbar-button is-active" : "jd-toolbar-button"}
            type="button"
            disabled={disabled}
            onClick={() => editor.chain().focus().toggleUnderline().run()}
          >
            U
          </button>
          <label className="jd-color-control">
            <input
              className="jd-color-input"
              type="color"
              disabled={disabled}
              aria-label="글자 색상"
              defaultValue="#14131c"
              onChange={(event) => editor.chain().focus().setColor(event.target.value).run()}
            />
          </label>
        </div>
        <div className="jd-toolbar-group">
          <button
            className={editor.isActive({ textAlign: "left" }) ? "jd-toolbar-button is-active" : "jd-toolbar-button"}
            type="button"
            disabled={disabled}
            onClick={() => editor.chain().focus().setTextAlign("left").run()}
          >
            좌
          </button>
          <button
            className={editor.isActive({ textAlign: "center" }) ? "jd-toolbar-button is-active" : "jd-toolbar-button"}
            type="button"
            disabled={disabled}
            onClick={() => editor.chain().focus().setTextAlign("center").run()}
          >
            중
          </button>
          <button
            className={editor.isActive({ textAlign: "right" }) ? "jd-toolbar-button is-active" : "jd-toolbar-button"}
            type="button"
            disabled={disabled}
            onClick={() => editor.chain().focus().setTextAlign("right").run()}
          >
            우
          </button>
          <button
            className={editor.isActive({ textAlign: "justify" }) ? "jd-toolbar-button is-active" : "jd-toolbar-button"}
            type="button"
            disabled={disabled}
            onClick={() => editor.chain().focus().setTextAlign("justify").run()}
          >
            양
          </button>
        </div>
        <div className="jd-toolbar-group">
          <button className="jd-toolbar-button" type="button" disabled={disabled} onClick={setLink}>
            링크
          </button>
          <button className="jd-toolbar-button" type="button" disabled={disabled || isImageUploading} onClick={openImageFilePicker}>
            {isImageUploading ? "업로드 중" : "이미지 업로드"}
          </button>
          <input
            ref={imageInputRef}
            className="jd-file-input"
            type="file"
            accept={JOB_DESCRIPTION_IMAGE_ACCEPT}
            disabled={disabled || isImageUploading}
            onChange={handleImageFileChange}
          />
        </div>
      </div>

      {imageUploadMessage ? (
        <p className="jd-upload-message" role="status" aria-live="polite">
          {imageUploadMessage}
        </p>
      ) : null}

      <EditorContent className="jd-editor-shell" editor={editor} />
    </div>
  );
}

function normalizeLinkUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }
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
