import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["**/node_modules/**", "**/dist/**", "**/*.config.*", "apps/web/**"] },
  {
    files: ["packages/*/src/**/*.ts", "apps/*/src/**/*.ts"],
    extends: [...tseslint.configs.recommended],
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      "@typescript-eslint/no-explicit-any": "off",
    },
  }
);
