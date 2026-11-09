import reactHooks from "eslint-plugin-react-hooks";

import config from "../tooling/eslint/index.js";

// The React rules the console runs, carried over with the surface (OX2): this
// is a React app and hooks misuse ships green through typecheck without them.
export default [
  ...config,
  {
    files: ["src/**/*.tsx"],
    plugins: { "react-hooks": reactHooks },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
    },
  },
];
