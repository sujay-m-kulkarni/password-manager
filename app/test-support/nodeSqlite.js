// Test stand-in for @op-engineering/op-sqlite backed by Node's built-in SQLite (one temp dir per test file).
// Encryption itself is SQLCipher's job on the phone; here the key is only checked for consistency,
// so a wrong data key fails like it would on a device.
const { DatabaseSync } = require('node:sqlite');
const fs = require('fs');
const os = require('os');
const path = require('path');

function create() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vault-'));
  const keys = new Map(); // file -> key it was created with
  return {
    __dir: dir,
    __reset: () => {
      for (const f of fs.readdirSync(dir)) fs.rmSync(path.join(dir, f), { force: true });
      keys.clear();
    },
    open: ({ name, encryptionKey }) => {
      const file = path.join(dir, name);
      if (encryptionKey !== undefined && fs.existsSync(file) && keys.has(file) && keys.get(file) !== encryptionKey) {
        const fail = () => {
          throw new Error('file is not a database');
        };
        return { executeSync: fail, close: () => {}, delete: () => fs.rmSync(file, { force: true }) };
      }
      if (encryptionKey !== undefined && !keys.has(file)) keys.set(file, encryptionKey);
      const raw = new DatabaseSync(file);
      return {
        executeSync: (sql, params = []) => {
          const t = sql.trim().toUpperCase();
          if (t.startsWith('SELECT') || (t.startsWith('PRAGMA') && !t.includes('='))) {
            return { rows: raw.prepare(sql).all(...params), insertId: undefined };
          }
          if (params.length === 0) {
            raw.exec(sql);
            return { rows: [], insertId: undefined };
          }
          const r = raw.prepare(sql).run(...params);
          return { rows: [], insertId: Number(r.lastInsertRowid) };
        },
        close: () => raw.close(),
        delete: () => {
          try {
            raw.close();
          } catch {}
          fs.rmSync(file, { force: true });
          keys.delete(file);
        },
      };
    },
  };
}

module.exports = { create };
