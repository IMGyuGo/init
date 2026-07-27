import Color from "@tiptap/extension-color";
import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import TextAlign from "@tiptap/extension-text-align";
import { TextStyle } from "@tiptap/extension-text-style";
import Underline from "@tiptap/extension-underline";
import StarterKit from "@tiptap/starter-kit";

export function getJobDescriptionExtensions() {
  return [
    StarterKit.configure({
      link: false,
      underline: false,
    }),
    Underline,
    TextStyle,
    Color,
    TextAlign.configure({
      types: ["heading", "paragraph"],
    }),
    Link.configure({
      autolink: true,
      openOnClick: false,
      HTMLAttributes: {
        rel: "noopener noreferrer",
        target: "_blank",
      },
    }),
    Image.configure({
      allowBase64: false,
      inline: false,
    }),
  ];
}
