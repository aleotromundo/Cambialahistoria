export function goldShortText(price: number, gold: number): string {
  return `${Math.max(0, price - gold)} gold short`;
}

export function isShort(price: number, gold: number): boolean {
  return price > gold;
}
