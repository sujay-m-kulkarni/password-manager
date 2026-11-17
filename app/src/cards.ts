/** Debit and credit cards kept inside a Banking entry. No CVV is stored, by design. */
export type CardKind = 'debit' | 'credit';

export type Card = {
  id?: number;
  kind: CardKind;
  /** Digits only. */
  number: string;
  /** "MM/YY" */
  expiry: string;
  name: string;
  /** Card / ATM PIN, digits. Optional. */
  pin: string;
};

export const emptyCard = (kind: CardKind = 'debit'): Card => ({ kind, number: '', expiry: '', name: '', pin: '' });

export const digits = (s: string) => s.replace(/\D/g, '');

/** Card number as typed: digits only, at most 19. */
export const cleanCardNumber = (s: string) => digits(s).slice(0, 19);

/** "1234567812345678" → "1234 5678 1234 5678" (Amex 4-6-5). */
export function groupCardNumber(n: string): string {
  const d = digits(n);
  if (/^3[47]/.test(d)) {
    return [d.slice(0, 4), d.slice(4, 10), d.slice(10, 15)].filter(Boolean).join(' ');
  }
  return d.replace(/(.{4})/g, '$1 ').trim();
}

/** "•••• 1234" */
export const maskCardNumber = (n: string) => (digits(n).length >= 4 ? `•••• ${digits(n).slice(-4)}` : '••••');

/** Typing help for expiry: "1" → "1", "12" → "12/", "1228" → "12/28". */
export function formatExpiry(text: string, previous = ''): string {
  const d = digits(text).slice(0, 4);
  if (d.length >= 3) {
    return `${d.slice(0, 2)}/${d.slice(2)}`;
  }
  if (d.length === 2 && text.length > previous.length) {
    return `${d}/`;
  }
  return d;
}

export function isValidExpiry(e: string): boolean {
  const m = /^(\d{2})\/(\d{2})$/.exec(e);
  return !!m && Number(m[1]) >= 1 && Number(m[1]) <= 12;
}

/** Luhn checksum: catches most typing mistakes in a card number. */
export function luhnOk(n: string): boolean {
  const d = digits(n);
  if (d.length < 12) {
    return false;
  }
  let sum = 0;
  for (let i = 0; i < d.length; i++) {
    let x = Number(d[d.length - 1 - i]);
    if (i % 2 === 1) {
      x *= 2;
      if (x > 9) {
        x -= 9;
      }
    }
    sum += x;
  }
  return sum % 10 === 0;
}

/** Card network from the number's first digits (display only). */
export function cardNetwork(n: string): string | null {
  const d = digits(n);
  if (/^4/.test(d)) {
    return 'Visa';
  }
  if (/^3[47]/.test(d)) {
    return 'Amex';
  }
  if (/^(60|65|81|82|508|353|356)/.test(d)) {
    return 'RuPay';
  }
  const six = Number(d.slice(0, 6));
  if (/^5[1-5]/.test(d) || (d.length >= 6 && six >= 222100 && six <= 272099)) {
    return 'Mastercard';
  }
  if (/^3(0[0-5]|[689])/.test(d)) {
    return 'Diners';
  }
  return null;
}

/** Returns the first problem with a card, or null if it can be saved. */
export function cardProblem(c: Card): string | null {
  const n = digits(c.number);
  if (n.length < 12 || n.length > 19) {
    return 'A card number has 12 to 19 digits.';
  }
  if (c.expiry && !isValidExpiry(c.expiry)) {
    return 'Expiry is MM/YY, e.g. 08/29.';
  }
  if (c.pin && !/^\d{4,6}$/.test(c.pin)) {
    return 'A card PIN is 4 to 6 digits.';
  }
  return null;
}
