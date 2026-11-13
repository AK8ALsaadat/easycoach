/** Paylink appends TransactionNo / OrderNumber; the docs spell them in more than one case. */
export function paylinkReturnParams(search: Record<string, string | string[] | undefined>) {
  const pick = (name: string) => {
    const entry = Object.entries(search).find(([key]) => key.toLowerCase() === name);
    const value = Array.isArray(entry?.[1]) ? entry[1][0] : entry?.[1];
    return typeof value === "string" ? value.trim().slice(0, 80) : null;
  };
  return { transactionNo: pick("transactionno"), orderNumber: pick("ordernumber") };
}

export function returnQuery(params: { transactionNo: string | null; orderNumber: string | null }) {
  const query = new URLSearchParams();
  if (params.transactionNo) query.set("transactionNo", params.transactionNo);
  if (params.orderNumber) query.set("orderNumber", params.orderNumber);
  return query.toString();
}
