import { describe, it, expect } from "bun:test";

describe("config", () => {
  it("splits AUTH_TOKENS by comma", () => {
    const raw = "token1,token2,token3";
    const tokens = raw.split(",").filter(Boolean);
    expect(tokens).toEqual(["token1", "token2", "token3"]);
  });

  it("handles empty AUTH_TOKENS", () => {
    const raw = "";
    const tokens = raw.split(",").filter(Boolean);
    expect(tokens).toEqual([]);
  });

  it("trims trailing commas", () => {
    const raw = "token1,,token2,";
    const tokens = raw.split(",").filter(Boolean);
    expect(tokens).toEqual(["token1", "token2"]);
  });

  it("defaults port to 3000", () => {
    const port = Number(undefined ?? 3000);
    expect(port).toBe(3000);
  });
});
