// Builds an installable APK file into app/apk/, without needing a phone connected.
//
//   npm run android:apk            test APK: the release build, signed with this laptop's debug key
//   npm run android:apk:release    release APK, signed with the Vault key (use scripts/release-apk.ps1)
//
// Both are release builds, so the app's code is inside the APK (no Metro needed) and the
// internet permission is removed, exactly as in pipeline releases. Only the signing key differs.
//
// The test APK installs on any phone (allow "install unknown apps"), but cannot be updated by a
// pipeline release, and a pipeline release cannot be installed over it: Android only updates an
// app signed with the same key, and uninstalling deletes the vault. Use it for trying things out.
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const release = process.argv.includes('--release');
const windows = process.platform === 'win32';

function run(command, args, cwd = root) {
  console.log(`\n> ${command} ${args.join(' ')}`);
  // On Windows gradlew is a .bat file, which needs a shell to run.
  const result = spawnSync(command, args, { cwd, stdio: 'inherit', shell: windows });
  if (result.status !== 0) {
    console.error(`\n${command} failed (exit ${result.status ?? result.signal}).`);
    process.exit(result.status ?? 1);
  }
}

const keyVars = ['PM_KEYSTORE_FILE', 'PM_KEYSTORE_PASSWORD', 'PM_KEY_ALIAS', 'PM_KEY_PASSWORD'];
if (release) {
  const missing = keyVars.filter(n => !process.env[n]);
  if (missing.length > 0) {
    console.error(`A release APK needs the signing key. Missing: ${missing.join(', ')}.`);
    console.error('Run scripts\\release-apk.ps1, which asks for them (docs/guides/android-setup.md).');
    process.exit(1);
  }
  if (!existsSync(process.env.PM_KEYSTORE_FILE)) {
    console.error(`The keystore file was not found: ${process.env.PM_KEYSTORE_FILE}`);
    process.exit(1);
  }
} else {
  // A test build must not pick up a key left in the environment by an earlier release build.
  for (const n of keyVars) {
    delete process.env[n];
  }
}

const version = process.env.PM_VERSION || JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;
if (!/^\d+\.\d+\.\d+$/.test(version)) {
  console.error(`Not a version number: ${version}`);
  process.exit(1);
}

// Phone processors only (64- and 32-bit ARM), as in pipeline releases: about 60 MB instead of 125 MB.
run(
  windows ? 'gradlew.bat' : './gradlew',
  ['assembleRelease', '-PreactNativeArchitectures=armeabi-v7a,arm64-v8a'],
  join(root, 'android'),
);

const built = join(root, 'android', 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk');
if (!existsSync(built)) {
  console.error(`Gradle finished but ${built} is missing.`);
  process.exit(1);
}
const type = release ? 'release' : 'test';
mkdirSync(join(root, 'apk'), { recursive: true });
const target = join(root, 'apk', `vault-${version}-${type}.apk`);
copyFileSync(built, target);
console.log(`\nAPK ready (${(statSync(target).size / 1024 / 1024).toFixed(1)} MB): ${target}`);
if (!release) {
  console.log('Signed with this laptop\'s debug key: for testing only, keep real passwords out of it.');
}
