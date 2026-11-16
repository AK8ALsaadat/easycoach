export type Language = "ar" | "en";
export function createTranslator(language: Language, dictionary: Record<string, string> = {}) {
const patterns = (language === "en" ? Object.entries(dictionary) : [])
  .filter(([key]) => /\{\d+\}/.test(key))
  .map(([key, translated]) => ({
    translated,
    indexes: [...key.matchAll(/\{(\d+)\}/g)].map((m) => Number(m[1])),
    expression: new RegExp(
      "^" +
        key
          .split(/(\{\d+\})/)
          .map((part) =>
            /^\{\d+\}$/.test(part)
              ? "(.+?)"
              : part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
          )
          .join("") +
        "$",
    ),
  }));
  return (input: string | number | undefined, ...values: string[]) => {
    const text = String(input ?? "");
    const exact = Object.hasOwn(dictionary, text) ? dictionary[text] : undefined;
    let translated = language === "en" ? (exact ?? text) : text;
    let substitutions = values;
    if (language === "en" && exact === undefined) {
      for (const pattern of patterns) {
        const match = pattern.expression.exec(text);
        if (match) {
          translated = pattern.translated;
          substitutions = [];
          pattern.indexes.forEach((index, i) => {
            substitutions[index] = match[i + 1];
          });
          break;
        }
      }
    }
    return translated.replace(
      /\{(\d+)\}/g,
      (match, index) => substitutions[Number(index)] ?? match,
    );
  };
}
