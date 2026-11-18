/** 1.8.0: picking expiry, name and card type out of the text the camera read. */
import { NativeModules } from 'react-native';
import {
  FIRST_SIDE_PROMPT,
  OTHER_SIDE_PROMPT,
  canScanCards,
  findExpiry,
  findKind,
  findName,
  mergeScan,
  missingFromScan,
  readCard,
  scanCard,
} from '../src/cardScan';

// Text as ML Kit returns it, line by line, from two typical Indian cards.
const HDFC_DEBIT = [
  'HDFC BANK',
  'Millennia',
  'DEBIT',
  '4111 1111 1111 1111',
  'VALID',
  'FROM 01/23',
  'VALID',
  'THRU 01/28',
  'SUJAY M KULKARNI',
  'VISA',
  'Platinum',
];
const SBI_CREDIT = ['SBI Card', 'PRIME', '5555 5555 5555 4444', 'MEMBER SINCE 2019', 'VALID UPTO 09/2029', 'S KULKARNI', 'CREDIT', 'mastercard'];

afterEach(() => {
  delete NativeModules.CardScan;
});

test('expiry is the latest date on the card, not "valid from"', () => {
  expect(findExpiry(HDFC_DEBIT)).toBe('01/28');
  expect(findExpiry(SBI_CREDIT)).toBe('09/29');
  expect(findExpiry(['VALID THRU 12-30'])).toBe('12/30');
  expect(findExpiry(['13/28', '00/27'])).toBe(''); // not months
  expect(findExpiry(['no dates here'])).toBe('');
});

test('name is an upper-case line of 2–4 words that is not a bank or network word', () => {
  expect(findName(HDFC_DEBIT)).toBe('SUJAY M KULKARNI');
  expect(findName(SBI_CREDIT)).toBe('S KULKARNI');
  expect(findName(['HDFC BANK', 'VALID THRU', 'DEBIT CARD'])).toBe('');
  expect(findName(['Sujay Kulkarni'])).toBe(''); // names are embossed in capitals; mixed case is other text
});

test('debit or credit when the card says so', () => {
  expect(findKind(HDFC_DEBIT)).toBe('debit');
  expect(findKind(SBI_CREDIT)).toBe('credit');
  expect(findKind(['RUPAY'])).toBeNull();
  expect(findKind(['DEBIT', 'CREDIT'])).toBeNull(); // both printed: let the person choose
});

test('a full reading', () => {
  expect(readCard({ number: '4111 1111 1111 1111', lines: HDFC_DEBIT })).toEqual({
    number: '4111111111111111',
    expiry: '01/28',
    name: 'SUJAY M KULKARNI',
    kind: 'debit',
  });
});

test('scanCard: cancelled → null; not available → a clear error', async () => {
  expect(canScanCards()).toBe(false);
  await expect(scanCard()).rejects.toThrow('not available');

  const scan = jest.fn().mockResolvedValueOnce(null).mockResolvedValueOnce({ number: '5555555555554444', lines: SBI_CREDIT });
  NativeModules.CardScan = { scan };
  expect(canScanCards()).toBe(true);
  expect(await scanCard()).toBeNull();
  expect(await scanCard()).toMatchObject({ number: '5555555555554444', expiry: '09/29', kind: 'credit' });
  expect(scan).toHaveBeenCalledWith(FIRST_SIDE_PROMPT);
});

// A newer "number on the back" card: the front has only the bank, name and network; the back has
// the number, expiry and the CVV next to the signature strip.
const FRONT = ['ICICI Bank', 'Coral', 'SUJAY KULKARNI', 'RUPAY', 'DEBIT'];
const BACK = ['4111 1111 1111 1111', 'VALID THRU', '04/30', 'CVV', '123', 'AUTHORISED SIGNATURE', 'Customer care 1800 1080'];

test('two sides: the second fills only what is still missing', () => {
  const front = readCard({ number: null, lines: FRONT }); // Done on a side without the number
  expect(front).toEqual({ number: '', expiry: '', name: 'SUJAY KULKARNI', kind: 'debit' });
  expect(missingFromScan(front)).toEqual(['card number', 'expiry']);

  const back = readCard({ number: '4111111111111111', lines: BACK });
  const both = mergeScan({ ...front, name: 'SUJAY M KULKARNI' }, back); // name already corrected by hand
  expect(both).toMatchObject({ number: '4111111111111111', expiry: '04/30', name: 'SUJAY M KULKARNI' });
  expect(missingFromScan(both)).toEqual([]);
});

test('the CVV is never picked up', () => {
  const back = readCard({ number: '4111111111111111', lines: BACK });
  expect(Object.values(back)).not.toContain('123');
  expect(JSON.stringify(back)).not.toContain('123"');
  expect(findExpiry(['CVV 123', '123'])).toBe('');
  expect(findName(['CVV', '123'])).toBe('');
});

test('the second side is scanned with its own prompt', async () => {
  const scan = jest.fn().mockResolvedValue({ number: null, lines: FRONT });
  NativeModules.CardScan = { scan };
  await scanCard(OTHER_SIDE_PROMPT);
  expect(scan).toHaveBeenCalledWith(OTHER_SIDE_PROMPT);
});
