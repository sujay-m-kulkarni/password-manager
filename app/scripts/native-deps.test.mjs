// Fails when a library needs a native companion package that the app doesn't list itself.
//
// React Native only links the Android code of packages listed in the app's own package.json.
// A required peer dependency that npm installs silently ends up in the JavaScript bundle but not
// in the APK, and the app closes the first time it is used. Vault 1.0.1 shipped that way:
// react-native-quick-crypto needs react-native-quick-base64, which was not listed, so creating a
// vault closed the app. Tests on a laptop can't see it; this check can.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const app = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const listed = new Set([...Object.keys(app.dependencies ?? {}), ...Object.keys(app.devDependencies ?? {})]);

const read = name => {
  const file = join(root, 'node_modules', name, 'package.json');
  return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null;
};

const hasNativeCode = (name, pkg) => {
  const dir = join(root, 'node_modules', name);
  return (
    existsSync(join(dir, 'android')) ||
    existsSync(join(dir, 'react-native.config.js')) ||
    Boolean(pkg.codegenConfig)
  );
};

test('every required native peer dependency is listed in package.json', () => {
  const missing = [];
  for (const dep of Object.keys(app.dependencies ?? {})) {
    const pkg = read(dep);
    if (!pkg) {
      continue;
    }
    for (const peer of Object.keys(pkg.peerDependencies ?? {})) {
      const optional = pkg.peerDependenciesMeta?.[peer]?.optional === true;
      if (optional || listed.has(peer)) {
        continue;
      }
      const peerPkg = read(peer);
      if (peerPkg && hasNativeCode(peer, peerPkg)) {
        missing.push(`${dep} needs ${peer} (native): add it with npm install --save-exact ${peer}@${peerPkg.version}`);
      }
    }
  }
  assert.deepEqual(missing, [], `Native packages missing from package.json:\n${missing.join('\n')}`);
});
