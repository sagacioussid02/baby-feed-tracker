// Babel config for the baby milk tracker app.
//
// NOTE: this template predates Expo's default babel.config.js, so
// `babel-preset-expo` is not hoisted to the top-level node_modules — it lives
// under expo/node_modules. Resolve it robustly instead of by bare name.
function resolveExpoPreset() {
  try {
    return require.resolve('babel-preset-expo');
  } catch {
    // Fallback to the copy nested inside the expo package (bypasses the
    // expo package.json `exports` map, which blocks subpath resolution).
    const path = require('path');
    const expoPkg = require.resolve('expo/package.json');
    return path.join(path.dirname(expoPkg), 'node_modules', 'babel-preset-expo');
  }
}

module.exports = function (api) {
  api.cache(true);
  return {
    presets: [resolveExpoPreset()],
    // Required for react-native-reanimated worklets (used by Skia animations).
    // Must be listed last.
    plugins: ['react-native-reanimated/plugin'],
  };
};
