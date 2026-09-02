import { PromptPreprocessor } from "@lmstudio/sdk";

// LM Studio hands a dragged / pasted image to the model as a vision attachment,
// but the model never learns where that file lives on disk — so it cannot fill
// in `image_path` for qwen_edit_image / qwen_reference_image (it used to guess a
// path and fail). This preprocessor resolves the real path of every image
// attached to the user's message (LM Studio keeps its own copy under
// ~/.lmstudio/user-files/, which safeImagePath() allows) and appends a short
// note listing those paths so the model can pass them through verbatim.

const NOTE_MARKER = "[Attached image file path";

export const promptPreprocessor: PromptPreprocessor = async (ctl, userMessage) => {
  try {
    if (!userMessage.hasFiles()) return userMessage;
    if (userMessage.getText().includes(NOTE_MARKER)) return userMessage; // already annotated

    const images = userMessage.getFiles(ctl.client).filter((f) => f.isImage());
    if (images.length === 0) return userMessage;

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
    const note =
      `\n\n${NOTE_MARKER}${many ? "s" : ""} — the user attached ${many ? `${paths.length} images` : "an image"} ` +
      `to this message. Pass ${many ? "these exact strings" : "this exact string"} as ` +
      `image_path${many ? " / image_path_2 / image_path_3" : ""} when calling qwen_edit_image or ` +
      `qwen_reference_image:\n${paths.map((p) => `- ${p}`).join("\n")}\n]`;

    userMessage.appendText(note);
    return userMessage;
  } catch {
    // Never let annotation failure break the prediction.
    return userMessage;
  }
};
