module.exports = {
  preset: '@react-native/jest-preset',
  // The navigation libraries ship untranspiled ES modules; let Babel handle them in tests.
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|@react-navigation|react-native-screens|react-native-safe-area-context|zustand)/)',
  ],
};
