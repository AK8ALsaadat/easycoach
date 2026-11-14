export function displayInputDate(iso: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso.split("-").reverse().join("/") : iso;
}
export function parseDisplayDate(input: string): string | null {
  const text = input.trim().replace(/[٠-٩۰-۹]/g, digit => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit) >= 0 ? "٠١٢٣٤٥٦٧٨٩".indexOf(digit) : "۰۱۲۳۴۵۶۷۸۹".indexOf(digit)));
  const match = /^(\d{1,2})[/.](\d{1,2})[/.](\d{4})$/.exec(text);
  const iso = match ? `${match[3]}-${match[2].padStart(2,"0")}-${match[1].padStart(2,"0")}` : text;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const date = new Date(iso + "T12:00:00Z");
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0,10) === iso ? iso : null;
}
