/** The interface says "متدرب"; older database messages still say "عميل". */
const TERMS: [string, string][] = [
  ["عملائك", "متدربيك"],
  ["عملائه", "متدربيه"],
  ["للعملاء", "للمتدربين"],
  ["العملاء", "المتدربين"],
  ["عميلك", "متدربك"],
  ["للعميل", "للمتدرب"],
  ["لعميل", "لمتدرب"],
  ["العميل", "المتدرب"],
  ["عميل", "متدرب"],
];
export const traineeTerms = (text: string) => TERMS.reduce((value, [from, to]) => value.split(from).join(to), text);
