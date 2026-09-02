import { PluginContext } from "@lmstudio/sdk";
import { toolsProvider } from "./toolsProvider";
import { promptPreprocessor } from "./promptPreprocessor";

export async function main(context: PluginContext) {
  context.withToolsProvider(toolsProvider);
  // Surfaces the on-disk path of any image dragged into the chat so the model can
  // hand it to qwen_edit_image / qwen_reference_image.
  context.withPromptPreprocessor(promptPreprocessor);
}
