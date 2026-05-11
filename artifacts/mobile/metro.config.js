const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

// firebase-admin (installed for api-server) pulls in google-gax as a
// transitive dependency. google-gax creates google-gax_tmp_* directories
// that may not have a build/ subdirectory yet. Metro's FallbackWatcher
// tries to watch them and crashes with ENOENT. Block the entire subtree.
config.resolver.blockList = [
  /.*\/google-gax_tmp_.*/,
];

module.exports = config;
