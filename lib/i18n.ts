import english from "./locales/en.json";
import { createTranslator, type Language } from "./translate";
export type { Language } from "./translate";

/** Server-side translation; client dictionaries are supplied for the selected locale only. */
export function translator(language: Language) {
  return createTranslator(language, english);
}
