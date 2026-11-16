// Test stand-in for react-native-keychain: in-memory, no fingerprint hardware.
const store = new Map();
module.exports = {
  __store: store,
  ACCESSIBLE: { WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'x' },
  ACCESS_CONTROL: { BIOMETRY_CURRENT_SET: 'bio', BIOMETRY_ANY_OR_DEVICE_PASSCODE: 'bio-or-pin' },
  STORAGE_TYPE: { AES_GCM: 'aes' },
  getSupportedBiometryType: async () => null,
  isPasscodeAuthAvailable: async () => false,
  getGenericPassword: async ({ service }) => (store.has(service) ? { password: store.get(service) } : false),
  setGenericPassword: async (_u, p, { service }) => {
    store.set(service, p);
    return true;
  },
  resetGenericPassword: async ({ service }) => store.delete(service),
};
