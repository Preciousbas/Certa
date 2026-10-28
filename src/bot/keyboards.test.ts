import { describe, expect, it } from "vitest";
import { reviewFiguresKeyboard, roleMenu } from "./keyboards.js";

function reviewFiguresUrl(rows: ReturnType<typeof roleMenu>): string {
  for (const row of rows) {
    for (const button of row) {
      if (button.kind === "web_app" && button.text === "Review figures") return button.url;
    }
  }
  return "";
}

describe("Review figures", () => {
  it("opens /app/p/<id>/contract/review from the menu and the figures keyboard", () => {
    const projectId = "p-23-oct";
    expect(reviewFiguresUrl(roleMenu("client", 0, "https://certa.example/", projectId))).toBe(
      "https://certa.example/app/p/p-23-oct/contract/review",
    );
    expect(reviewFiguresUrl(reviewFiguresKeyboard("https://certa.example", projectId))).toBe(
      "https://certa.example/app/p/p-23-oct/contract/review",
    );
  });
});
