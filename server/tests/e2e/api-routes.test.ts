import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { createTestApp } from "../helpers/test-app";
import { fullPluginXml, createJarPlugin, bufferToFile } from "../helpers/fixtures";
import type { Hono } from "hono";
import type { PluginService } from "../../src/service/plugin-service";

describe("API Routes", () => {
  let app: Hono;
  let service: PluginService;
  let cleanup: () => Promise<void>;

  beforeEach(async () => {
    ({ app, service, cleanup } = await createTestApp({
      authTokens: ["valid-token"],
    }));
  });

  afterEach(async () => {
    await cleanup();
  });

  // -- 上传 --

  describe("POST /api/plugins", () => {
    it("uploads plugin with valid token", async () => {
      const buffer = createJarPlugin(fullPluginXml());
      const formData = new FormData();
      formData.append("file", new File([buffer], "test.zip", { type: "application/zip" }));

      const res = await app.request("/api/plugins", {
        method: "POST",
        headers: { Authorization: "Bearer valid-token" },
        body: formData,
      });

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.pluginId).toBe("com.example.test");
      expect(body.version).toBe("1.0.0");
    });

    it("rejects without token (401)", async () => {
      const formData = new FormData();
      formData.append("file", new File([Buffer.alloc(1)], "test.zip"));

      const res = await app.request("/api/plugins", {
        method: "POST",
        body: formData,
      });

      expect(res.status).toBe(401);
    });

    it("rejects with invalid token (401)", async () => {
      const formData = new FormData();
      formData.append("file", new File([Buffer.alloc(1)], "test.zip"));

      const res = await app.request("/api/plugins", {
        method: "POST",
        headers: { Authorization: "Bearer wrong-token" },
        body: formData,
      });

      expect(res.status).toBe(401);
    });

    it("rejects duplicate version (409)", async () => {
      const buffer = createJarPlugin(fullPluginXml());

      const form1 = new FormData();
      form1.append("file", new File([buffer], "test.zip"));
      await app.request("/api/plugins", {
        method: "POST",
        headers: { Authorization: "Bearer valid-token" },
        body: form1,
      });

      const form2 = new FormData();
      form2.append("file", new File([buffer], "test.zip"));
      const res = await app.request("/api/plugins", {
        method: "POST",
        headers: { Authorization: "Bearer valid-token" },
        body: form2,
      });

      expect(res.status).toBe(409);
      const body = await res.json();
      expect(body.error).toContain("already exists");
    });

    it("allows overwrite with force=true", async () => {
      const buffer = createJarPlugin(fullPluginXml());

      const form1 = new FormData();
      form1.append("file", new File([buffer], "test.zip"));
      await app.request("/api/plugins", {
        method: "POST",
        headers: { Authorization: "Bearer valid-token" },
        body: form1,
      });

      const form2 = new FormData();
      form2.append("file", new File([buffer], "test.zip"));
      const res = await app.request("/api/plugins?force=true", {
        method: "POST",
        headers: { Authorization: "Bearer valid-token" },
        body: form2,
      });

      expect(res.status).toBe(201);
    });

    it("rejects invalid ZIP (400)", async () => {
      const formData = new FormData();
      formData.append("file", new File([Buffer.from("not a zip")], "bad.zip"));

      const res = await app.request("/api/plugins", {
        method: "POST",
        headers: { Authorization: "Bearer valid-token" },
        body: formData,
      });

      expect(res.status).toBe(400);
    });

    it("rejects missing file (400)", async () => {
      const formData = new FormData();

      const res = await app.request("/api/plugins", {
        method: "POST",
        headers: { Authorization: "Bearer valid-token" },
        body: formData,
      });

      expect(res.status).toBe(400);
    });
  });

  // -- 查询 --

  describe("GET /api/plugins", () => {
    it("returns empty list initially", async () => {
      const res = await app.request("/api/plugins");

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.total).toBe(0);
      expect(body.items).toEqual([]);
    });

    it("returns plugins after upload", async () => {
      await service.upload(bufferToFile(createJarPlugin(fullPluginXml())), false);

      const res = await app.request("/api/plugins");
      const body = await res.json();

      expect(body.total).toBe(1);
      expect(body.items[0].id).toBe("com.example.test");
    });

    it("supports search query", async () => {
      await service.upload(
        bufferToFile(createJarPlugin(fullPluginXml({ id: "com.acme.foo", name: "Foo" }))),
        false,
      );
      await service.upload(
        bufferToFile(createJarPlugin(fullPluginXml({ id: "com.acme.bar", name: "Bar" }))),
        false,
      );

      const res = await app.request("/api/plugins?query=foo");
      const body = await res.json();

      expect(body.total).toBe(1);
      expect(body.items[0].id).toBe("com.acme.foo");
    });

    it("supports pagination", async () => {
      for (let i = 1; i <= 5; i++) {
        await service.upload(
          bufferToFile(createJarPlugin(fullPluginXml({
            id: `plugin-${i}`,
            name: `Plugin ${i}`,
          }))),
          false,
        );
      }

      const res = await app.request("/api/plugins?page=2&pageSize=2");
      const body = await res.json();

      expect(body.total).toBe(5);
      expect(body.items).toHaveLength(2);
      expect(body.page).toBe(2);
    });
  });

  describe("GET /api/plugins/:pluginId", () => {
    it("returns plugin detail with versions", async () => {
      await service.upload(bufferToFile(createJarPlugin(fullPluginXml())), false);

      const res = await app.request("/api/plugins/com.example.test");
      const body = await res.json();

      expect(body.info.id).toBe("com.example.test");
      expect(body.versions).toHaveLength(1);
    });

    it("returns 404 for non-existent plugin", async () => {
      const res = await app.request("/api/plugins/non.existent");
      expect(res.status).toBe(404);
    });
  });

  // -- 删除 --

  describe("DELETE /api/plugins/:pluginId/:version", () => {
    it("deletes version with valid token", async () => {
      await service.upload(bufferToFile(createJarPlugin(fullPluginXml())), false);

      const res = await app.request("/api/plugins/com.example.test/1.0.0", {
        method: "DELETE",
        headers: { Authorization: "Bearer valid-token" },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.message).toContain("Deleted");
      expect(body.remainingVersions).toBe(0);
    });

    it("returns 404 for non-existent version", async () => {
      const res = await app.request("/api/plugins/non.existent/1.0.0", {
        method: "DELETE",
        headers: { Authorization: "Bearer valid-token" },
      });

      expect(res.status).toBe(404);
    });
  });

  describe("DELETE /api/plugins/:pluginId", () => {
    it("deletes plugin with all versions", async () => {
      await service.upload(bufferToFile(createJarPlugin(fullPluginXml())), false);
      await service.upload(
        bufferToFile(createJarPlugin(fullPluginXml({ version: "1.1.0" }))),
        false,
      );

      const res = await app.request("/api/plugins/com.example.test", {
        method: "DELETE",
        headers: { Authorization: "Bearer valid-token" },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.message).toContain("all 2 versions");
    });
  });

  // -- 运维接口 --

  describe("GET /api/health", () => {
    it("returns health status", async () => {
      const res = await app.request("/api/health");

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.status).toBe("ok");
      expect(body.database).toBe("connected");
      expect(body.uptime).toMatch(/\d+d \d+h \d+m/);
    });
  });

  describe("GET /api/stats", () => {
    it("returns stats with counts", async () => {
      await service.upload(bufferToFile(createJarPlugin(fullPluginXml())), false);

      const res = await app.request("/api/stats");
      const body = await res.json();

      expect(body.pluginCount).toBe(1);
      expect(body.versionCount).toBe(1);
      expect(body.totalStorageHuman).toBeTruthy();
    });
  });
});
