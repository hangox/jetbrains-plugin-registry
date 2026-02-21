import { describe, it, expect } from "bun:test";
import { isCompatible, compareVersions } from "../../src/lib/build-number";

describe("isCompatible", () => {
  // -- 基础匹配 --

  it("matches when build is within range", () => {
    expect(isCompatible("241.15989", "222", "241.*")).toBe(true);
  });

  it("matches exact sinceBuild", () => {
    expect(isCompatible("222", "222", "241.*")).toBe(true);
  });

  it("rejects build below sinceBuild", () => {
    expect(isCompatible("221", "222", "241.*")).toBe(false);
  });

  it("matches when untilBuild is null (no upper limit)", () => {
    expect(isCompatible("999.99999", "222", null)).toBe(true);
  });

  // -- 通配符处理 --

  it("wildcard matches any sub-version", () => {
    expect(isCompatible("241.0", "222", "241.*")).toBe(true);
    expect(isCompatible("241.99999", "222", "241.*")).toBe(true);
    expect(isCompatible("241.99999.999", "222", "241.*")).toBe(true);
  });

  it("wildcard does not match higher major", () => {
    expect(isCompatible("242.0", "222", "241.*")).toBe(false);
  });

  // -- 多段版本号 --

  it("compares multi-segment builds", () => {
    expect(isCompatible("241.15989.150", "241.15989", "241.15989.200")).toBe(true);
    expect(isCompatible("241.15989.250", "241.15989", "241.15989.200")).toBe(false);
  });

  it("treats missing segments as 0", () => {
    expect(isCompatible("241", "241", "241.*")).toBe(true);
  });

  // -- 边界场景 --

  it("handles single-segment build numbers", () => {
    expect(isCompatible("222", "222", "241")).toBe(true);
    expect(isCompatible("242", "222", "241")).toBe(false);
  });
});

describe("compareVersions", () => {
  it("compares semantic versions correctly", () => {
    expect(compareVersions("1.2.0", "1.1.9")).toBeGreaterThan(0);
    expect(compareVersions("1.1.0", "1.2.0")).toBeLessThan(0);
    expect(compareVersions("1.0.0", "1.0.0")).toBe(0);
  });

  it("handles different segment counts", () => {
    expect(compareVersions("1.0.1", "1.0")).toBeGreaterThan(0);
    expect(compareVersions("1.0", "1.0.0")).toBe(0);
  });

  it("sorts version list correctly", () => {
    const versions = ["1.0.0", "2.1.0", "1.2.0", "1.1.0", "2.0.0"];
    const sorted = versions.sort((a, b) => compareVersions(b, a));
    expect(sorted).toEqual(["2.1.0", "2.0.0", "1.2.0", "1.1.0", "1.0.0"]);
  });
});
