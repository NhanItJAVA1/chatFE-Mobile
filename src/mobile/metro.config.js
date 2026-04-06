const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "..", "..");
const sharedRoot = path.resolve(workspaceRoot, "src", "shared");

const config = getDefaultConfig(projectRoot);

// Watch both shared and mobile folders
config.watchFolders = [projectRoot, sharedRoot];

// When Metro is resolving modules, it should look in:
// 1. mobile/node_modules (primary)
// 2. workspace root node_modules (for shared dependencies)
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];

module.exports = config;
