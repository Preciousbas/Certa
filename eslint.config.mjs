import tseslint from "typescript-eslint";
import noFloatMoney from "./eslint-rules/no-float-money.js";

export default tseslint.config(
  { ignores: ["**/*.test.ts", "contracts/**", "packages/**", ".next/**", "apps/web/e2e/**"] },
  {
    files: ["src/**/*.ts"],
    languageOptions: {
      parserOptions: { project: "./src/tsconfig.json", tsconfigRootDir: import.meta.dirname },
    },
    plugins: { local: { rules: { "no-float-money": noFloatMoney } } },
    extends: [tseslint.configs.recommendedTypeChecked],
    rules: {
      "local/no-float-money": "error",
      eqeqeq: "error",
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    },
  },
  {
    files: ["apps/web/components/**/*.{ts,tsx}"],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: { ecmaFeatures: { jsx: true }, sourceType: "module" },
    },
    rules: {
      "no-restricted-imports": ["error", { patterns: ["@/server/**", "**/src/server/**"] }],
    },
  },
);
