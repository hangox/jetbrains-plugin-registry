import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { createTestApp } from "../helpers/test-app";
import { fullPluginXml, createJarPlugin, bufferToFile } from "../helpers/fixtures";
import type { Hono } from "hono";
import type { PluginService } from "../../src/service/plugin-service";

describe("Web Routes", () => {
  let app: Hono;
  let service: PluginService;
  let cleanup: () => Promise<void>;

  const SESSION_SECRET = "test-secret-123";
  const ADMIN_USER = "admin";
  const ADMIN_PASS = "test-pass";

  beforeEach(async () => {
    ({ app, service, cleanup } = await createTestApp({
      adminUser: ADMIN_USER,
      adminPass: ADMIN_PASS,
      sessionSecret: SESSION_SECRET,
    }));
  });

  afterEach(async () => {
    await cleanup();
  });

  // -- 公开页面 --

  describe("GET / (plugin list)", () => {
    it("returns 200 without auth", async () => {
      const res = await app.request("/");
      expect(res.status).toBe(200);
    });

    it("renders HTML with Plugin Registry title", async () => {
      const res = await app.request("/");
      const body = await res.text();
      expect(body).toContain("Plugin Registry");
    });
  });

  describe("GET /web/stats", () => {
    it("returns 200 without auth", async () => {
      const res = await app.request("/web/stats");
      expect(res.status).toBe(200);
    });
  });

  describe("GET /web/plugins/:pluginId", () => {
    it("returns 404 HTML for non-existent plugin", async () => {
      const res = await app.request("/web/plugins/non.existent");
      expect(res.status).toBe(404);

      const body = await res.text();
      expect(body).toContain("non.existent");
    });

    it("returns plugin detail page", async () => {
      await service.upload(bufferToFile(createJarPlugin(fullPluginXml())), false);

      const res = await app.request("/web/plugins/com.example.test");
      expect(res.status).toBe(200);

      const body = await res.text();
      expect(body).toContain("Test Plugin");
      expect(body).toContain("1.0.0");
    });
  });

  // -- 登录流程 --

  describe("GET /web/login", () => {
    it("shows login form", async () => {
      const res = await app.request("/web/login");
      expect(res.status).toBe(200);

      const body = await res.text();
      expect(body).toContain("Login");
      expect(body).toContain('name="username"');
      expect(body).toContain('name="password"');
    });

    it("shows error message", async () => {
      const res = await app.request("/web/login?error=Invalid+credentials");
      const body = await res.text();
      expect(body).toContain("Invalid credentials");
    });
  });

  describe("POST /web/login", () => {
    it("sets session cookie on valid credentials", async () => {
      const formData = new URLSearchParams({
        username: ADMIN_USER,
        password: ADMIN_PASS,
        returnTo: "/web/upload",
      });

      const res = await app.request("/web/login", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: formData.toString(),
      });

      expect(res.status).toBe(302);
      expect(res.headers.get("Location")).toBe("/web/upload");

      const cookie = res.headers.get("Set-Cookie");
      expect(cookie).toContain("session=");
    });

    it("redirects with error on invalid credentials", async () => {
      const formData = new URLSearchParams({
        username: "admin",
        password: "wrong",
      });

      const res = await app.request("/web/login", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: formData.toString(),
      });

      expect(res.status).toBe(302);
      expect(res.headers.get("Location")).toContain("/web/login?error=");
    });
  });

  describe("POST /web/logout", () => {
    it("clears session cookie", async () => {
      const res = await app.request("/web/logout", {
        method: "POST",
        headers: { Cookie: `session=${SESSION_SECRET}` },
      });

      expect(res.status).toBe(302);
      expect(res.headers.get("Location")).toBe("/web/login");

      const cookie = res.headers.get("Set-Cookie");
      expect(cookie).toContain("Max-Age=0");
    });
  });

  // -- 受保护页面 --

  describe("GET /web/upload (protected)", () => {
    it("redirects to login without session", async () => {
      const res = await app.request("/web/upload");

      expect(res.status).toBe(302);
      expect(res.headers.get("Location")).toContain("/web/login");
      expect(res.headers.get("Location")).toContain("returnTo=");
    });

    it("shows upload form with valid session", async () => {
      const res = await app.request("/web/upload", {
        headers: { Cookie: `session=${SESSION_SECRET}` },
      });

      expect(res.status).toBe(200);
      const body = await res.text();
      expect(body).toContain("Upload");
      expect(body).toContain('type="file"');
    });
  });

  // -- 写操作（需认证） --

  describe("POST /web/upload (protected)", () => {
    it("redirects to login without session", async () => {
      const formData = new FormData();
      formData.append("file", new File([Buffer.alloc(1)], "test.zip"));

      const res = await app.request("/web/upload", {
        method: "POST",
        body: formData,
      });

      expect(res.status).toBe(302);
      expect(res.headers.get("Location")).toContain("/web/login");
    });

    it("uploads and redirects with session", async () => {
      const buffer = createJarPlugin(fullPluginXml());
      const formData = new FormData();
      formData.append("file", new File([buffer], "test.zip", { type: "application/zip" }));

      const res = await app.request("/web/upload", {
        method: "POST",
        headers: { Cookie: `session=${SESSION_SECRET}` },
        body: formData,
      });

      expect(res.status).toBe(302);
      expect(res.headers.get("Location")).toContain("/web/plugins/com.example.test");
      expect(res.headers.get("Location")).toContain("success=");
    });
  });

  describe("POST /web/plugins/:pluginId/delete (protected)", () => {
    it("redirects to login without session", async () => {
      const res = await app.request("/web/plugins/com.example.test/delete", {
        method: "POST",
      });

      expect(res.status).toBe(302);
      expect(res.headers.get("Location")).toContain("/web/login");
    });

    it("deletes plugin and redirects to home", async () => {
      await service.upload(bufferToFile(createJarPlugin(fullPluginXml())), false);

      const res = await app.request("/web/plugins/com.example.test/delete", {
        method: "POST",
        headers: { Cookie: `session=${SESSION_SECRET}` },
      });

      expect(res.status).toBe(302);
      expect(res.headers.get("Location")).toContain("success=");
    });
  });

  describe("POST /web/plugins/:pluginId/:version/delete (protected)", () => {
    it("deletes version and redirects to detail", async () => {
      await service.upload(bufferToFile(createJarPlugin(fullPluginXml())), false);

      const res = await app.request("/web/plugins/com.example.test/1.0.0/delete", {
        method: "POST",
        headers: { Cookie: `session=${SESSION_SECRET}` },
      });

      expect(res.status).toBe(302);
      expect(res.headers.get("Location")).toContain("/web/plugins/com.example.test");
    });
  });
});
