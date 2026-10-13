/**
 * Optional capability of a text provider: answer a structured request about
 * images. The shared TextProvider interface has no image input, so the Claude
 * provider implements this extra method and the pipeline feature-detects it.
 * The mock provider does not implement it (it cannot see a picture).
 */
import type { TextProvider, TextRequest, TextResult } from "../ai/types";

export interface VisionImage {
  bytes: Uint8Array;
  /** image/jpeg, image/png or image/webp. */
  contentType: string;
}

export interface VisionTextProvider extends TextProvider {
  generateWithImages<T>(request: TextRequest<T>, images: VisionImage[]): Promise<TextResult<T>>;
}

export function supportsVision(provider: TextProvider): provider is VisionTextProvider {
  return typeof (provider as Partial<VisionTextProvider>).generateWithImages === "function";
}
