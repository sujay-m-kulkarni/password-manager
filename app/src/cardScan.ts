/**
 * Card scanning (1.8.0). The native scanner (android/…/cardscan) reads text from the camera on the
 * phone and returns the card number, when that side shows it, plus every line of text it saw;
 * this file picks out the expiry, the name on the card and, when printed, Debit or Credit.
 *
 * Cards differ: the number, expiry and name can be on the front, the back, or split between them.
 * So a card can be scanned one side at a time; the second scan only fills what is still missing.
 * The CVV is never read into Vault: only MM/YY dates, upper-case names and a 13–19 digit number
 * that passes the Luhn check are picked out, so a 3-digit CVV can't land in any field.
 * Nothing is saved until the person reviews the card and taps Save.
 */
import { NativeModules } from 'react-native';
import { cleanCardNumber, type Card, type CardKind } from './cards';

export type ScanResult = { number?: string | null; lines: string[] };
export type ScannedCard = Pick<Card, 'number' | 'expiry' | 'name'> & { kind: CardKind | null };

type Native = { scan(prompt: string | null): Promise<ScanResult | null> };
const native = () => NativeModules.CardScan as Native | undefined;

/** False on builds without the scanner (tests, laptop builds before 1.8). */
export const canScanCards = () => typeof native()?.scan === 'function';

export const FIRST_SIDE_PROMPT = 'Hold the side with the card number inside the frame. No number on this side? Tap Done.';
export const OTHER_SIDE_PROMPT = 'Now the other side. Tap Done when the expiry and name are in the frame.';

/** Opens the camera. Resolves to what that side shows (number may be empty), or null when cancelled. */
export async function scanCard(prompt: string = FIRST_SIDE_PROMPT): Promise<ScannedCard | null> {
  const m = native();
  if (!m) {
    throw new Error('Card scanning is not available in this build.');
  }
  const r = await m.scan(prompt);
  return r ? readCard(r) : null;
}

/** What a scanned card still lacks, for the "Scan the other side" offer. */
export function missingFromScan(c: Pick<ScannedCard, 'number' | 'expiry' | 'name'>): string[] {
  return [!c.number && 'card number', !c.expiry && 'expiry', !c.name && 'name'].filter((x): x is string => !!x);
}

/** Second side: fills only what is still empty, so nothing the person already checked changes. */
export function mergeScan<T extends Pick<ScannedCard, 'number' | 'expiry' | 'name'>>(have: T, other: ScannedCard): T {
  return {
    ...have,
    number: have.number || other.number,
    expiry: have.expiry || other.expiry,
    name: have.name || other.name,
  };
}

/** Words printed on cards that are never the holder's name. */
const NOT_A_NAME =
  /\b(VISA|MASTER\s?CARD|RUPAY|AMEX|AMERICAN|EXPRESS|DINERS|DISCOVER|MAESTRO|DEBIT|CREDIT|BANK|CARD|PLATINUM|GOLD|CLASSIC|TITANIUM|SIGNATURE|WORLD|INFINITE|BUSINESS|CORPORATE|PREPAID|VALID|THRU|FROM|UPTO|UP TO|MONTH|YEAR|EXPIRES?|EXPIRY|MEMBER|SINCE|CUSTOMER|SERVICE|ELECTRONIC|USE|ONLY|INTERNATIONAL|INDIA|CONTACTLESS|REWARDS?|MILLENNIA|REGALIA|SELECT|PRIVILEGE|LIMITED|LTD|NETWORK|AUTHORI[SZ]ED|SIGNATURE)\b/;

/**
 * Expiry: the latest MM/YY (or MM/YYYY) on the card, since cards often also print "valid from".
 */
export function findExpiry(lines: string[]): string {
  let best: { y: number; m: number } | null = null;
  for (const line of lines) {
    for (const match of line.matchAll(/\b(0[1-9]|1[0-2])\s?[/\-]\s?(\d{4}|\d{2})\b/g)) {
      const m = Number(match[1]);
      const y = match[2].length === 4 ? Number(match[2]) % 100 : Number(match[2]);
      if (!best || y > best.y || (y === best.y && m > best.m)) {
        best = { y, m };
      }
    }
  }
  return best ? `${String(best.m).padStart(2, '0')}/${String(best.y).padStart(2, '0')}` : '';
}

/** Name on the card: an upper-case line of 2–4 words of letters, not a bank or network word. */
export function findName(lines: string[]): string {
  const candidates = lines
    .map(l => l.trim().replace(/\s+/g, ' '))
    .filter(l => /^[A-Z][A-Z .']{3,25}$/.test(l))
    .filter(l => {
      const words = l.split(' ').filter(Boolean);
      return words.length >= 2 && words.length <= 4 && !NOT_A_NAME.test(l);
    });
  // The name is printed near the bottom of the card, after the number and dates.
  return candidates[candidates.length - 1] ?? '';
}

export function findKind(lines: string[]): CardKind | null {
  const text = lines.join(' ').toUpperCase();
  const credit = /\bCREDIT\b/.test(text);
  const debit = /\bDEBIT\b/.test(text);
  return credit === debit ? null : credit ? 'credit' : 'debit';
}

export function readCard(r: ScanResult): ScannedCard {
  const lines = r.lines ?? [];
  return { number: cleanCardNumber(r.number ?? ''), expiry: findExpiry(lines), name: findName(lines), kind: findKind(lines) };
}
