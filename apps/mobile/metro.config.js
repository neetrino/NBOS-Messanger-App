const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

// pnpm hoists `react-native` (and nested `@react-native/*`) under the repo root. Metro must watch
// those paths or bundling fails with "Failed to get the SHA-1" for files outside `watchFolders`.
// `packages/shared` lives under `workspaceRoot`, so one root folder is enough.
config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];

module.exports = config;
