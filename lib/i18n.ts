import english from "./locales/en.json";
export type Language = "ar" | "en";
const dictionary: Record<string, string> = english;
const patterns = Object.entries(dictionary)
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
export function translator(language: Language) {
  return (input: string | number | undefined, ...values: string[]) => {
    const text = String(input ?? "");
    let translated = language === "en" ? (dictionary[text] ?? text) : text;
    let substitutions = values;
    if (language === "en" && !dictionary[text]) {
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
