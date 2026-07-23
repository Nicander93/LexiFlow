const { run } = require("vue-tsc");

// Vue language-tools still requires the JavaScript compiler API removed in
// TypeScript 7. Keep this bridge isolated so the rest of the project can use
// the native TypeScript 7 compiler and remove it once vue-tsc catches up.
run(require.resolve("@typescript/typescript6/lib/tsc"));
