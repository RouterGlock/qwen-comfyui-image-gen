import { PromptPreprocessor } from "@lmstudio/sdk";

// LM Studio already delivers a dragged / pasted image to the model as a normal
// vision attachment — the model CAN see it. What the model can't infer is where
// that file lives on disk, which it needs to fill in `image_path` for
// qwen_edit_image / qwen_reference_image.
//
// So this preprocessor appends a short note listing the on-disk path(s). The
// wording matters: an earlier version said "the user attached an image … pass
// this exact string as image_path", which a vision-capable model reads as "all I
// got was a path" — it then insists it can't see the picture, breaking plain
// "what's in this image?", OCR, and describe/translate requests. The note below
// leads with "you can see this directly" and marks the path as tool-only, so the
// same chat can both read images and generate/edit them.
//
// Non-image files (PDFs, text, docx) are left completely untouched — those are
// handled by the rag-v1 plugin, which can run alongside this one.

const NOTE_MARKER = "[Attached image file path";

export const promptPreprocessor: PromptPreprocessor = async (ctl, userMessage) => {
  try {
    if (!userMessage.hasFiles()) return userMessage;
    if (userMessage.getText().includes(NOTE_MARKER)) return userMessage; // already annotated

    const images = userMessage.getFiles(ctl.client).filter((f) => f.isImage());
    if (images.length === 0) return userMessage; // e.g. a PDF — leave it for rag-v1

    const paths: string[] = [];
    for (const file of images) {
      try {
        const p = await file.getFilePath();
        if (p) paths.push(p);
      } catch {
        /* unresolvable file — skip it */
      }
    }
    if (paths.length === 0) return userMessage;

    const many = paths.length > 1;
    const subj = many ? `these ${paths.length} images` : "this image";
    const note =
      `\n\n${NOTE_MARKER}${many ? "s" : ""}] — You can see ${subj} directly through vision: ` +
      `look at ${many ? "them" : "it"}, describe ${many ? "them" : "it"}, read any text in ${many ? "them" : "it"}, ` +
      `or answer questions about ${many ? "them" : "it"} normally. ` +
      `The on-disk path${many ? "s" : ""} below ${many ? "are" : "is"} needed ONLY if the user asks you to ` +
      `generate, edit, restyle, or use ${many ? "them" : "it"} as a reference — in that case pass ` +
      `${many ? "these exact strings" : "this exact string"} as ` +
      `image_path${many ? " / image_path_2 / image_path_3" : ""} to qwen_edit_image or qwen_reference_image:\n` +
      `${paths.map((p) => `- ${p}`).join("\n")}`;

    userMessage.appendText(note);
    return userMessage;
  } catch {
    // Never let annotation failure break the prediction.
    return userMessage;
  }
};
