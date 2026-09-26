// Expo SDK 52+ configures Metro for pnpm/Turborepo monorepos automatically (watchFolders = repo root,
// nodeModulesPaths = app + root). @hris/shared resolves from source through its "exports" field.
const { getDefaultConfig } = require("expo/metro-config");

module.exports = getDefaultConfig(__dirname);
