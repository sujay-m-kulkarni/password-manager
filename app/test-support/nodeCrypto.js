// Test stand-in for react-native-quick-crypto: Node's crypto (scrypt instead of Argon2id).
const nodeCrypto = require('crypto');
const { Buffer } = require('buffer');
module.exports = {
  __esModule: true,
  default: {
    randomBytes: n => nodeCrypto.randomBytes(n),
    createCipheriv: nodeCrypto.createCipheriv,
    createDecipheriv: nodeCrypto.createDecipheriv,
    createHmac: nodeCrypto.createHmac,
    argon2: (_alg, p, cb) => nodeCrypto.scrypt(p.message, p.nonce, p.tagLength, cb),
  },
  Buffer,
};
