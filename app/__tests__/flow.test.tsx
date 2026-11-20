/**
 * End-to-end flows in Node: render the whole App against real SQLite (test-support/nodeSqlite).
 */
jest.mock('@op-engineering/op-sqlite', () => require('../test-support/nodeSqlite').create());
jest.mock('react-native-quick-crypto', () => require('../test-support/nodeCrypto'));
jest.mock('react-native-keychain', () => require('../test-support/keychain'));
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);

import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { NativeModules, TextInput } from 'react-native';
import App from '../App';
import { useSession } from '../src/store/session';

// Whole-app flows wait for key derivation and screen changes; allow for a slow build machine.
jest.setTimeout(60_000);

const wait = (ms: number) => new Promise<void>(res => setTimeout(() => res(), ms));

const textOf = (r: ReactTestRenderer.ReactTestRenderer) =>
  r.root
    .findAll(n => typeof n.props.children === 'string' || typeof n.props.children === 'number')
    .map(n => String(n.props.children))
    .join(' | ');

/**
 * Waits (up to 15 s) for text to appear. Key derivation and screen changes take longer on a busy
 * build machine than here; a fixed wait made these tests fail at random (1.8.4's first build).
 */
const seen = async (r: ReactTestRenderer.ReactTestRenderer, text: string) => {
  for (let i = 0; i < 150 && !textOf(r).includes(text); i++) {
    await act(async () => {
      await wait(100);
    });
  }
  expect(textOf(r)).toContain(text);
};

/** On the home list: its Add button is there (the title is the app's name, shared with other screens). */
const atHome = (r: ReactTestRenderer.ReactTestRenderer) =>
  r.root.findAll(n => n.props.accessibilityLabel === 'Add entry' && typeof n.props.onPress === 'function').length > 0;
const home = async (r: ReactTestRenderer.ReactTestRenderer) => {
  for (let i = 0; i < 150 && !atHome(r); i++) {
    await act(async () => {
      await wait(100);
    });
  }
  expect(atHome(r)).toBe(true);
};

const pressTab = async (r: ReactTestRenderer.ReactTestRenderer, label: string) => {
  const tab = r.root.findAll(
    n => n.props.accessibilityRole === 'tab' && typeof n.props.onPress === 'function' && n.findAll(t => String(t.props.children).startsWith(label)).length > 0,
  )[0];
  await act(async () => {
    tab.props.onPress();
    await wait(50);
  });
};

const pressButton = async (r: ReactTestRenderer.ReactTestRenderer, label: string) => {
  const button = r.root.findAll(
    n =>
      n.props.accessibilityRole === 'button' &&
      typeof n.props.onPress === 'function' &&
      n.findAll(t => t.props.children === label).length > 0,
  ).at(-1); // the top screen renders last (screens behind it stay mounted)
  if (!button) {
    throw new Error(`No button "${label}" on: ${textOf(r).slice(0, 400)}`);
  }
  await act(async () => {
    button.props.onPress();
    await wait(300);
  });
};

afterEach(async () => {
  delete NativeModules.CrashReport;
});

test('setup creates the vault and opens the Vault screen', async () => {
  let r!: ReactTestRenderer.ReactTestRenderer;
  await act(async () => {
    r = ReactTestRenderer.create(<App />);
  });
  await seen(r, 'Create your master password');

  const inputs = r.root.findAllByType(TextInput);
  await act(async () => {
    inputs[0].props.onChangeText('purple mango river forty');
    inputs[1].props.onChangeText('purple mango river forty');
  });
  await pressButton(r, 'Create vault');

  // Step 2: the recovery key is shown once and must be confirmed as written down.
  await seen(r, 'Your recovery key');
  const code = r.root
    .findAll(n => typeof n.props.accessibilityLabel === 'string' && n.props.accessibilityLabel.startsWith('Recovery key '))[0]
    .props.accessibilityLabel.replace('Recovery key ', '')
    .replace(/ /g, '');
  expect(code).toMatch(/^[0-9A-Z-]{29}$/);
  const continueBtn = () =>
    r.root.findAll(n => n.props.accessibilityRole === 'button' && n.findAll(t => t.props.children === 'Continue').length > 0)[0];
  expect(continueBtn().props.accessibilityState.disabled).toBe(true);
  await act(async () => {
    r.root.findAll(n => n.props.accessibilityRole === 'checkbox')[0].props.onPress();
  });
  await pressButton(r, 'Continue');

  // Step 3: no fingerprint hardware in the test, so it explains and continues.
  await seen(r, 'Unlock with your fingerprint');
  await pressButton(r, 'Continue');

  await home(r);
  const after = textOf(r);
  expect(atHome(r)).toBe(true);
  expect(after).toContain('Banking');

  // Forgot password: lock, unlock with the recovery key, choose a new master password.
  await act(async () => {
    useSession.getState().lock();
    await wait(50);
  });
  await seen(r, 'Welcome back');
  await act(async () => {
    r.root.findAll(n => n.props.accessibilityRole === 'button' && n.findAll(t => t.props.children === 'Forgot password? Use recovery key').length > 0)[0].props.onPress();
  });
  await act(async () => {
    r.root.findAllByType(TextInput)[0].props.onChangeText(code.toLowerCase());
  });
  await pressButton(r, 'Unlock');
  await seen(r, 'Set a new master password');
  const pwInputs = r.root.findAllByType(TextInput);
  await act(async () => {
    pwInputs[0].props.onChangeText('seven quiet blue lanterns');
    pwInputs[1].props.onChangeText('seven quiet blue lanterns');
  });
  await pressButton(r, 'Save and open Anchor');
  await home(r);

  // The new password now opens the vault.
  await act(async () => {
    useSession.getState().lock();
    await wait(50);
  });
  await act(async () => {
    r.root.findAllByType(TextInput)[0].props.onChangeText('seven quiet blue lanterns');
  });
  await pressButton(r, 'Unlock');
  await home(r);
  await act(async () => {
    r.unmount();
    await wait(50);
  });
});

test('shows the crash report before anything else, until closed', async () => {
  const dismissCrash = jest.fn();
  NativeModules.CrashReport = {
    dismissCrash,
    takeLastCrash: jest.fn().mockResolvedValue({
      reason: 'Crash (native code)',
      when: 0,
      details: 'Abort message: example',
      device: 'Test phone',
      appVersion: '1.0.1',
    }),
  };
  let r!: ReactTestRenderer.ReactTestRenderer;
  await act(async () => {
    r = ReactTestRenderer.create(<App />);
    await wait(50);
  });
  await seen(r, 'Anchor closed unexpectedly last time');
  await seen(r, 'Anchor 1.0.1 — report');
  // Safe start: nothing of the vault runs while the report is shown.
  expect(textOf(r)).not.toContain('Welcome back');
  await pressButton(r, 'Close');
  expect(dismissCrash).toHaveBeenCalled();
  expect(textOf(r)).not.toContain('Anchor closed unexpectedly last time');
  await seen(r, 'Welcome back');
  await act(async () => {
    r.unmount();
    await wait(50);
  });
});

test('the guide opens from the unlock screen, without unlocking', async () => {
  let r!: ReactTestRenderer.ReactTestRenderer;
  await act(async () => {
    r = ReactTestRenderer.create(<App />);
    await wait(50);
  });
  await seen(r, 'Welcome back');
  await pressButton(r, 'How to use Anchor');
  await seen(r, 'Getting started');
  await seen(r, 'Write it on paper');
  await pressButton(r, 'Backups');
  await seen(r, 'Daily backup: Anchor saves an encrypted backup every day');
  await pressButton(r, '‹ Back');
  await seen(r, 'Welcome back');
  await act(async () => {
    r.unmount();
    await wait(50);
  });
});

test('a new entry returns to the list; an edited one stays on its page, read-only', async () => {
  let r!: ReactTestRenderer.ReactTestRenderer;
  await act(async () => {
    r = ReactTestRenderer.create(<App />);
    await wait(50);
  });
  // Unlock (the first test changed the password).
  await act(async () => {
    r.root.findAllByType(TextInput)[0].props.onChangeText('seven quiet blue lanterns');
  });
  await pressButton(r, 'Unlock');
  await home(r);

  const fab = () => r.root.findAll(n => n.props.accessibilityLabel === 'Add entry' && typeof n.props.onPress === 'function')[0];
  const fill = async (title: string, secret: string) => {
    const inputs = r.root.findAllByType(TextInput);
    const byLabel = (l: string) => inputs.find(i => i.props.accessibilityLabel === l)!;
    await act(async () => {
      byLabel('Title').props.onChangeText(title);
      (byLabel('Password') ?? byLabel('PIN')).props.onChangeText(secret);
    });
  };

  // New login → back on the list.
  await act(async () => {
    fab().props.onPress();
    await wait(50);
  });
  await fill('Netflix', 'Xq7#tLm9vRw!pZ24');
  await pressButton(r, 'Save');
  let t = textOf(r);
  expect(atHome(r)).toBe(true);
  expect(t).toContain('Netflix');
  expect(t).not.toContain('Delete entry'); // not the entry's own page

  // New entry with only a PIN (PINs tab) → back on the list.
  await act(async () => {
    fab().props.onPress();
    await wait(50);
  });
  await pressTab(r, 'PINs');
  await pressButton(r, '+ Add PIN');
  await act(async () => {
    const inputs = r.root.findAllByType(TextInput);
    inputs.find(i => i.props.accessibilityLabel === 'Title')!.props.onChangeText('Phone lock');
    inputs.find(i => i.props.accessibilityLabel === 'PIN name')!.props.onChangeText('Phone lock');
  });
  await act(async () => {
    r.root.findAllByType(TextInput).find(i => i.props.accessibilityLabel === 'Phone lock')!.props.onChangeText('482913');
  });
  await seen(r, 'PINs · 1');
  await pressButton(r, 'Save');
  t = textOf(r);
  expect(atHome(r)).toBe(true);
  expect(t).toContain('Phone lock');

  // Edit from the entry's page → back on the list, not the entry page.
  await pressButton(r, 'Netflix');
  await seen(r, 'Delete entry');
  await pressButton(r, 'Edit');
  await act(async () => {
    r.root.findAllByType(TextInput).find(i => i.props.accessibilityLabel === 'Title')!.props.onChangeText('Netflix family');
  });
  await pressButton(r, 'Save');
  // Editing happens in place: after saving, the same entry is shown read-only again.
  t = textOf(r);
  expect(t).toContain('Netflix family');
  expect(t).toContain('Delete entry');
  expect(r.root.findAllByType(TextInput).filter(i => i.props.accessibilityLabel === 'Title')).toHaveLength(0);

  // Cancel leaves it unchanged.
  await pressButton(r, 'Edit');
  await act(async () => {
    r.root.findAllByType(TextInput).find(i => i.props.accessibilityLabel === 'Title')!.props.onChangeText('Changed');
  });
  await pressButton(r, 'Cancel');
  await seen(r, 'Netflix family');
  expect(textOf(r)).not.toContain('Changed');

  await act(async () => {
    r.unmount();
    await wait(50);
  });
});

test('one Banking entry with a login, a UPI PIN and a debit card: read-only first, hidden until Show', async () => {
  let r!: ReactTestRenderer.ReactTestRenderer;
  await act(async () => {
    r = ReactTestRenderer.create(<App />);
    await wait(50);
  });
  await act(async () => {
    r.root.findAllByType(TextInput)[0].props.onChangeText('seven quiet blue lanterns');
  });
  await pressButton(r, 'Unlock');

  const input = (label: string) =>
    r.root.findAllByType(TextInput).find(i => String(i.props.accessibilityLabel ?? '').startsWith(label))!;
  await act(async () => {
    r.root.findAll(n => n.props.accessibilityLabel === 'Add entry' && typeof n.props.onPress === 'function')[0].props.onPress();
    await wait(50);
  });
  // Choose the Banking type: account fields and cards appear.
  await act(async () => {
    r.root.findAll(n => n.props.accessibilityRole === 'radio' && n.findAll(x => x.props.children === 'Banking').length > 0)[0].props.onPress();
  });
  await act(async () => {
    input('Title').props.onChangeText('HDFC Bank');
    input('Password').props.onChangeText('N3t!banking#2026');
    input('IFSC').props.onChangeText('hdfc0001234');
  });
  // The same entry also gets a UPI PIN and a card: one tab each.
  await pressTab(r, 'PINs');
  await pressButton(r, '+ Add PIN');
  await pressButton(r, 'UPI PIN'); // suggested name
  await act(async () => {
    input('UPI PIN').props.onChangeText('482913');
  });
  await pressTab(r, 'Cards');
  await pressButton(r, '+ Debit card');
  await act(async () => {
    input('Card number').props.onChangeText('4111 1111 1111 1111');
    input('Expiry').props.onChangeText('0829');
    input('Card PIN').props.onChangeText('4829');
  });
  expect(input('Card number').props.accessibilityLabel).toContain('Visa');
  await pressButton(r, 'Save');

  // List: Banking filter shows it, with its card count.
  await pressButton(r, 'Banking');
  let t = textOf(r);
  expect(t).toContain('HDFC Bank');
  expect(t).toContain('1 PIN · 1 card');

  await pressButton(r, 'HDFC Bank');
  t = textOf(r);
  expect(t).toContain('HDFC0001234'); // IFSC, upper-cased
  expect(t).toContain('Debit card · Visa');
  expect(t).toContain('UPI PIN');
  expect(t).not.toContain('482 913'); // PIN hidden until Show
  expect(t).toContain('•••• 1111');
  expect(t).not.toContain('4111 1111 1111 1111');
  expect(r.root.findAllByType(TextInput).filter(i => i.props.accessibilityLabel === 'Title')).toHaveLength(0); // read-only

  const show = r.root.findAll(n => n.props.accessibilityLabel === 'Show Debit card details' && typeof n.props.onPress === 'function')[0];
  await act(async () => {
    show.props.onPress();
  });
  await seen(r, '4111 1111 1111 1111');
  await seen(r, '4829');

  await act(async () => {
    r.unmount();
    await wait(50);
  });
});

test('custom fields: fill a starting field, add a hidden one, find the entry by a field value', async () => {
  let r!: ReactTestRenderer.ReactTestRenderer;
  await act(async () => {
    r = ReactTestRenderer.create(<App />);
    await wait(50);
  });
  await act(async () => {
    r.root.findAllByType(TextInput)[0].props.onChangeText('seven quiet blue lanterns');
  });
  await pressButton(r, 'Unlock');
  const input = (label: string) => r.root.findAllByType(TextInput).find(i => i.props.accessibilityLabel === label)!;

  await act(async () => {
    r.root.findAll(n => n.props.accessibilityLabel === 'Add entry' && typeof n.props.onPress === 'function')[0].props.onPress();
    await wait(50);
  });
  await act(async () => {
    r.root.findAll(n => n.props.accessibilityRole === 'radio' && n.findAll(x => x.props.children === 'Banking').length > 0)[0].props.onPress();
  });
  // Banking's starting fields are on the Login tab.
  expect(input('CIF')).toBeTruthy();
  expect(input('UID (Aadhaar)').props.secureTextEntry).toBe(true);
  await act(async () => {
    input('Title').props.onChangeText('Canara Bank');
    input('Password').props.onChangeText('C@nara#2026!');
    input('CIF').props.onChangeText('77001122');
  });
  // + Add field → a suggested name (Profile password is Hidden).
  await pressButton(r, '+ Add field');
  await pressButton(r, 'Profile password');
  await pressButton(r, 'Add');
  await act(async () => {
    input('Profile password').props.onChangeText('pr0file!');
  });
  expect(input('Profile password').props.secureTextEntry).toBe(true);
  await pressButton(r, 'Save');

  // Search by the CIF finds it; the read-only page shows CIF and hides the profile password.
  await act(async () => {
    input('Search passwords').props.onChangeText('77001122');
    await wait(50);
  });
  await pressButton(r, 'Canara Bank');
  let t = textOf(r);
  expect(t).toContain('77001122');
  expect(t).toContain('PROFILE PASSWORD');
  expect(t).not.toContain('pr0file!');
  expect(t).not.toContain('BRANCH CODE'); // empty starting fields are not saved
  const show = r.root.findAll(n => n.props.accessibilityLabel === 'Show Profile password' && typeof n.props.onPress === 'function')[0];
  await act(async () => {
    show.props.onPress();
  });
  await seen(r, 'pr0file!');

  await act(async () => {
    r.unmount();
    await wait(50);
  });
});

test('Settings: change a type\'s starting fields; About shows the version history', async () => {
  NativeModules.CrashReport = {
    takeLastCrash: jest.fn().mockResolvedValue(null),
    getAppVersion: jest.fn().mockResolvedValue({ name: '1.7.0', code: 1 }),
  };
  let r!: ReactTestRenderer.ReactTestRenderer;
  await act(async () => {
    r = ReactTestRenderer.create(<App />);
    await wait(50);
  });
  await act(async () => {
    r.root.findAllByType(TextInput)[0].props.onChangeText('seven quiet blue lanterns');
  });
  await pressButton(r, 'Unlock');
  // Bottom bar: React Navigation labels its buttons "Settings, tab, 2 of 2".
  const settingsTab = r.root.findAll(
    n => typeof n.props.onPress === 'function' && String(n.props.accessibilityLabel ?? '').startsWith('Settings'),
  )[0];
  await act(async () => {
    settingsTab.props.onPress();
    await wait(50);
  });
  await pressButton(r, 'Entry types and their fields');
  await seen(r, '9 fields'); // Banking
  // The vault list behind has a "Social media" chip too: press the row on the top screen (last match).
  const rows = r.root.findAll(
    n => n.props.accessibilityRole === 'button' && typeof n.props.onPress === 'function' && n.findAll(t => t.props.children === 'Social media').length > 0,
  );
  await act(async () => {
    rows[rows.length - 1].props.onPress();
    await wait(300);
  });
  await pressButton(r, '+ Add field');
  await act(async () => {
    r.root.findAllByType(TextInput).find(i => i.props.accessibilityLabel === 'Field 1')!.props.onChangeText('Handle');
  });
  await pressButton(r, 'Save');
  await seen(r, '1 field');

  await pressButton(r, '‹ Back');
  await pressButton(r, "About & what's new");
  const t = textOf(r);
  expect(t).toContain('Anchor 1.7.0');
  expect(t).toContain('Installed');
  expect(t).toContain('Custom fields: add your own fields');

  await act(async () => {
    r.unmount();
    await wait(50);
  });
});

test('an error while drawing a screen shows the report instead of closing the app', async () => {
  const saveReport = jest.fn();
  NativeModules.CrashReport = { saveReport, dismissCrash: jest.fn(), takeLastCrash: jest.fn().mockResolvedValue(null) };
  const { ErrorBoundary } = require('../src/components/CrashReportNotice');
  const Broken = () => {
    throw new Error('example failure');
  };
  const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
  let r!: ReactTestRenderer.ReactTestRenderer;
  await act(async () => {
    r = ReactTestRenderer.create(
      <ErrorBoundary>
        <Broken />
      </ErrorBoundary>,
    );
    await wait(20);
  });
  spy.mockRestore();
  await seen(r, 'Something went wrong');
  await seen(r, 'example failure');
  expect(saveReport).toHaveBeenCalledWith('App error', expect.stringContaining('example failure'));
  await act(async () => {
    r.unmount();
  });
});

test('1.9.0: after unlocking, Vault opens only once a daily backup is set up', async () => {
  const status = { lastRunAt: 0, folderOkAt: 0, driveOkAt: 0, snapshotAt: 0, nextAt: 0, error: null };
  let authority = 'com.android.externalstorage.documents';
  NativeModules.VaultFiles = {
    pickFolder: jest.fn(async () => ({ uri: 'content://tree/Backups', name: 'Backups' })),
    canWriteFolder: jest.fn(async () => true),
    releaseFolder: jest.fn(async () => null),
    writeToFolder: jest.fn(async (_u: string, name: string) => ({ name })),
    saveOffPhone: jest.fn(async (fileName: string) => ({ uri: `content://${authority}/${fileName}`, name: fileName, authority, persisted: true })),
    releaseFile: jest.fn(async () => null),
    saveSnapshot: jest.fn(async () => null),
    configureDaily: jest.fn(async () => status),
    dailyStatus: jest.fn(async () => status),
    runDailyNow: jest.fn(async () => status),
  };
  try {
    let r!: ReactTestRenderer.ReactTestRenderer;
    await act(async () => {
      r = ReactTestRenderer.create(<App />);
    });
    // The vault from the earlier tests (made before 1.9): unlocking now asks for the backup first.
    await act(async () => {
      await wait(50);
      r.root.findAllByType(TextInput)[0].props.onChangeText('seven quiet blue lanterns');
    });
    await pressButton(r, 'Unlock');

    // The backup screen, with the reason, instead of the vault.
    await seen(r, 'Set up your backup');
    await seen(r, 'Why Anchor insists on this');
    expect(atHome(r)).toBe(false);
    const done = () =>
      r.root.findAll(n => n.props.accessibilityRole === 'button' && n.findAll(t => t.props.children === 'Done: open Anchor').length > 0)[0];
    expect(done().props.accessibilityState.disabled).toBe(true);

    await pressButton(r, 'Choose folder');
    await seen(r, 'Saving to “Backups”');

    // Saved on the phone itself: not accepted.
    await pressButton(r, 'Save to Google Drive');
    await seen(r, 'That file was saved on this phone');
    expect(done().props.accessibilityState.disabled).toBe(true);

    authority = 'com.google.android.apps.docs.storage';
    await pressButton(r, 'Save to Google Drive');
    await seen(r, 'on Google Drive. Anchor updates this file every day.');
    expect(done().props.accessibilityState.disabled).toBe(false);

    await pressButton(r, 'Done: open Anchor');
    await home(r);
    await act(async () => {
      r.unmount();
    });
  } finally {
    delete NativeModules.VaultFiles;
  }
});

test('1.11.0: the Family tab: add a will from the checklist and it counts as done', async () => {
  let r!: ReactTestRenderer.ReactTestRenderer;
  await act(async () => {
    r = ReactTestRenderer.create(<App />);
  });
  await act(async () => {
    await wait(50);
  });
  if (textOf(r).includes('Create your master password')) {
    // Run on its own: make a vault first.
    const inputs = r.root.findAllByType(TextInput);
    await act(async () => {
      inputs[0].props.onChangeText('seven quiet blue lanterns');
      inputs[1].props.onChangeText('seven quiet blue lanterns');
    });
    await pressButton(r, 'Create vault');
    await seen(r, 'Your recovery key');
    await act(async () => {
      r.root.findAll(n => n.props.accessibilityRole === 'checkbox')[0].props.onPress();
    });
    await pressButton(r, 'Continue');
    await seen(r, 'Unlock with your fingerprint');
    await pressButton(r, 'Continue');
  } else if (!atHome(r)) {
    await act(async () => {
      r.root.findAllByType(TextInput)[0].props.onChangeText('seven quiet blue lanterns');
    });
    await pressButton(r, 'Unlock');
  }
  await home(r);
  // Bottom bar: React Navigation labels its buttons "Family, tab, 2 of 3".
  const familyTab = r.root.findAll(
    n => typeof n.props.onPress === 'function' && String(n.props.accessibilityLabel ?? '').startsWith('Family, tab'),
  )[0];
  await act(async () => {
    familyTab.props.onPress();
    await wait(50);
  });
  await seen(r, 'Family Kit');
  await seen(r, 'Will & documents');

  const item = (label: string) =>
    r.root.findAll(n => typeof n.props.accessibilityLabel === 'string' && n.props.accessibilityLabel.startsWith(label) && typeof n.props.onPress === 'function')[0];
  expect(item('Will & documents').props.accessibilityLabel).toBe('Will & documents: To do');
  await act(async () => {
    item('Will & documents').props.onPress();
  });
  await pressButton(r, 'Add');
  await seen(r, 'Where the original is kept');

  const input = (label: string) => r.root.findAllByType(TextInput).find(i => i.props.accessibilityLabel === label)!;
  expect(input('Password')).toBeUndefined(); // no login on a will unless asked for
  await act(async () => {
    input('Title').props.onChangeText('Will (2025)');
    input('Where the original is kept').props.onChangeText('Blue file, bedroom cupboard');
  });
  await pressButton(r, 'Save');
  await seen(r, 'Family Kit');
  expect(item('Will & documents').props.accessibilityLabel).toBe('Will & documents: Done');
  await act(async () => {
    r.unmount();
  });
});
