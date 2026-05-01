const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");
const sharedPackageRoot = path.resolve(workspaceRoot, "packages/shared");

const config = getDefaultConfig(projectRoot);

// Watch only workspace source packages — not the repo root (avoids indexing root node_modules).
config.watchFolders = [sharedPackageRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];

module.exports = config;
