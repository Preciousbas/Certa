import { ESLint } from "eslint";
import tseslint from "typescript-eslint";
import { describe, expect, it } from "vitest";
import noFloatMoney from "./no-float-money.js";

async function lint(code: string) {
  const eslint = new ESLint({
    overrideConfigFile: true,
    overrideConfig: [
      {
        files: ["**/*.ts"],
        languageOptions: { parser: tseslint.parser, ecmaVersion: 2022, sourceType: "module" },
        plugins: { local: { rules: { "no-float-money": noFloatMoney } } },
        rules: { "local/no-float-money": "error" },
      },
    ],
  });
  const [result] = await eslint.lintText(code, { filePath: "src/lib/money/sample.ts" });
  return result?.messages.map((message) => message.message) ?? [];
}

describe("no-float-money", () => {
  it("rejects parseFloat, Number, and toFixed", async () => {
    const messages = await lint(
      "export const bad = Number('1') + parseFloat('1.2');\nexport const shown = (1).toFixed(2);\n",
    );
    expect(messages.length).toBeGreaterThanOrEqual(3);
  });

  it("allows bigint kobo arithmetic", async () => {
    const messages = await lint(
      "export function add(kobo: bigint): bigint { return kobo + 1n; }\n",
    );
    expect(messages).toEqual([]);
  });
});
