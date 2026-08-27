import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("application document", () => {
  it("declares an inline favicon so browsers do not request a missing file", async () => {
    const html = await readFile(new URL("../index.html", import.meta.url), "utf8");

    expect(html).toContain('rel="icon"');
    expect(html).toContain("data:image/svg+xml");
  });
});
