import js from "@eslint/js";
import globals from "globals";

export default [
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        ...globals.browser,
      },
    },
  },
  {
    // CLAUDE.md conventions, enforced so review doesn't have to.
    files: ["js/**/*.js"],
    rules: {
      // Trace logs go through debugLog (core/utils.js), gated on PRISM_DEBUG.
      "no-console": ["error", { allow: ["error", "warn"] }],
      "no-restricted-syntax": [
        "error",
        {
          // The .open setter only works once Web Awesome has upgraded the element.
          selector:
            "AssignmentExpression > MemberExpression.left[property.name='open']:matches([object.name=/[Dd]ialog/], [object.property.name=/[Dd]ialog/])",
          message:
            "Open/close a wa-dialog with setAttribute('open', '') / removeAttribute('open'), not .open =.",
        },
      ],
    },
  },
  {
    // Tests, their helpers and scripts/ run under Node, not in a browser: they use
    // process, and the scenario runner installs its own window/document fakes.
    files: ["tests/**/*.js", "tests/**/*.mjs", "scripts/**/*.mjs"],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },
];
