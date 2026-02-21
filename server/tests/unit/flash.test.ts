import { describe, it, expect } from "bun:test";
import { redirectWithFlash } from "../../src/lib/flash";

describe("redirectWithFlash", () => {
  it("builds success redirect URL", () => {
    const url = redirectWithFlash("/web/plugins/test", "success", "Upload OK");
    expect(url).toBe("/web/plugins/test?success=Upload%20OK");
  });

  it("builds error redirect URL", () => {
    const url = redirectWithFlash("/", "error", "Something failed");
    expect(url).toBe("/?error=Something%20failed");
  });

  it("encodes special characters", () => {
    const url = redirectWithFlash("/", "success", "v1.0 已上传 & 成功");
    expect(url).toContain("success=");
    expect(decodeURIComponent(url.split("success=")[1])).toBe("v1.0 已上传 & 成功");
  });
});
