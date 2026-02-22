/**
 * 完整生命周期集成测试
 *
 * 测试从上传 → 查询 → XML → 下载 → 多版本 → 删除的完整流程。
 * 使用 app.request() 进程内测试，无需启动真实服务器。
 */
import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { createTestApp } from "../helpers/test-app";
import {
  fullPluginXml,
  createZipPlugin,
  createJarPlugin,
} from "../helpers/fixtures";
import type { Hono } from "hono";

describe("Integration Flow - Full Lifecycle", () => {
  let app: Hono;
  let cleanup: () => Promise<void>;
  const TOKEN = "Bearer valid-token";

  beforeEach(async () => {
    ({ app, cleanup } = await createTestApp({
      authTokens: ["valid-token"],
      baseUrl: "http://localhost:3000",
    }));
  });

  afterEach(async () => {
    await cleanup();
  });

  /**
   * 核心场景：完整的插件生命周期
   * 上传 → API 查询 → XML 协议 → 下载 → SHA256 校验 → 多版本 → 删除
   */
  it("complete lifecycle: upload → query → xml → download → verify → multi-version → delete", async () => {
    // ── 1. 上传 v1.0.0（ZIP 格式，模拟真实 IntelliJ 插件结构） ──
    const pluginXml = fullPluginXml({
      id: "com.example.integration-test",
      name: "Integration Test Plugin",
      version: "1.0.0",
      sinceBuild: "241",
      untilBuild: "241.*",
      vendorName: "Test Corp",
      vendorEmail: "dev@test.com",
      vendorUrl: "https://test.com",
      depends: ["com.intellij.modules.platform"],
    });
    const zipBuffer = createZipPlugin(pluginXml, "integration-test");

    const uploadForm = new FormData();
    uploadForm.append(
      "file",
      new File([zipBuffer], "integration-test-1.0.0.zip", {
        type: "application/zip",
      })
    );
    const uploadRes = await app.request("/api/plugins", {
      method: "POST",
      headers: { Authorization: TOKEN },
      body: uploadForm,
    });

    expect(uploadRes.status).toBe(201);
    const uploadBody = await uploadRes.json();
    expect(uploadBody.pluginId).toBe("com.example.integration-test");
    expect(uploadBody.version).toBe("1.0.0");
    expect(uploadBody.fileSha256).toBeTruthy();
    const v1sha256 = uploadBody.fileSha256;

    // ── 2. API 查询：插件列表 ──
    const listRes = await app.request("/api/plugins");
    const listBody = await listRes.json();
    expect(listBody.total).toBe(1);
    expect(listBody.items[0].id).toBe("com.example.integration-test");
    expect(listBody.items[0].latestVersion).toBe("1.0.0");

    // ── 3. API 查询：插件详情 ──
    const detailRes = await app.request(
      "/api/plugins/com.example.integration-test"
    );
    const detailBody = await detailRes.json();
    expect(detailBody.info.name).toBe("Integration Test Plugin");
    expect(detailBody.info.vendor.name).toBe("Test Corp");
    expect(detailBody.versions).toHaveLength(1);
    expect(detailBody.versions[0].depends).toContain(
      "com.intellij.modules.platform"
    );

    // ── 4. XML 协议：兼容的 build ──
    const xmlRes = await app.request(
      "/updatePlugins.xml?build=IC-241.15989.150"
    );
    expect(xmlRes.status).toBe(200);
    const xml = await xmlRes.text();
    expect(xml).toContain('id="com.example.integration-test"');
    expect(xml).toContain('version="1.0.0"');
    expect(xml).toContain("Integration Test Plugin");
    expect(xml).toContain("Test Corp");

    // ── 5. XML 协议：不兼容的 build ──
    const xmlIncompatible = await app.request(
      "/updatePlugins.xml?build=IC-251.1000"
    );
    const xmlText2 = await xmlIncompatible.text();
    expect(xmlText2).not.toContain("com.example.integration-test");

    // ── 6. 下载插件并校验 SHA256 ──
    const downloadRes = await app.request(
      "/plugins/com.example.integration-test/1.0.0"
    );
    expect(downloadRes.status).toBe(200);
    expect(downloadRes.headers.get("Content-Type")).toBe("application/zip");

    const downloadedBytes = await downloadRes.arrayBuffer();
    expect(downloadedBytes.byteLength).toBeGreaterThan(0);

    const hasher = new Bun.CryptoHasher("sha256");
    hasher.update(new Uint8Array(downloadedBytes));
    const downloadSha256 = hasher.digest("hex");
    expect(downloadSha256).toBe(v1sha256);

    // ── 7. 上传 v2.0.0（新版本） ──
    const v2Xml = fullPluginXml({
      id: "com.example.integration-test",
      name: "Integration Test Plugin",
      version: "2.0.0",
      sinceBuild: "241",
      untilBuild: "242.*",
      changeNotes: "<ul><li>v2.0.0 - Major update</li></ul>",
    });
    const v2Buffer = createZipPlugin(v2Xml, "integration-test");
    const v2Form = new FormData();
    v2Form.append(
      "file",
      new File([v2Buffer], "integration-test-2.0.0.zip", {
        type: "application/zip",
      })
    );
    const v2Res = await app.request("/api/plugins", {
      method: "POST",
      headers: { Authorization: TOKEN },
      body: v2Form,
    });
    expect(v2Res.status).toBe(201);

    // ── 8. 验证多版本 ──
    const multiRes = await app.request(
      "/api/plugins/com.example.integration-test"
    );
    const multiBody = await multiRes.json();
    expect(multiBody.versions).toHaveLength(2);

    // XML 应返回最新兼容版本
    const xmlMulti = await app.request(
      "/updatePlugins.xml?build=IC-241.15989"
    );
    const xmlMultiText = await xmlMulti.text();
    // 241 build 同时兼容 v1 (until 241.*) 和 v2 (until 242.*)，应返回 v2
    expect(xmlMultiText).toContain('version="2.0.0"');

    // ── 9. 统计 ──
    const statsRes = await app.request("/api/stats");
    const statsBody = await statsRes.json();
    expect(statsBody.pluginCount).toBe(1);
    expect(statsBody.versionCount).toBe(2);
    expect(statsBody.totalStorageBytes).toBeGreaterThan(0);

    // ── 10. 删除 v1.0.0 ──
    const delRes = await app.request(
      "/api/plugins/com.example.integration-test/1.0.0",
      {
        method: "DELETE",
        headers: { Authorization: TOKEN },
      }
    );
    expect(delRes.status).toBe(200);
    const delBody = await delRes.json();
    expect(delBody.remainingVersions).toBe(1);

    // 验证 v1 已删除，v2 仍在
    const afterDelRes = await app.request(
      "/api/plugins/com.example.integration-test"
    );
    const afterDelBody = await afterDelRes.json();
    expect(afterDelBody.versions).toHaveLength(1);
    expect(afterDelBody.versions[0].version).toBe("2.0.0");

    // ── 11. 删除整个插件 ──
    const delAllRes = await app.request(
      "/api/plugins/com.example.integration-test",
      {
        method: "DELETE",
        headers: { Authorization: TOKEN },
      }
    );
    expect(delAllRes.status).toBe(200);

    // 验证已清空
    const emptyRes = await app.request("/api/plugins");
    const emptyBody = await emptyRes.json();
    expect(emptyBody.total).toBe(0);
  });

  /**
   * 版本覆盖场景：force=true 覆盖已有版本
   */
  it("force overwrite: upload same version twice with force=true", async () => {
    const xml = fullPluginXml({
      id: "com.example.overwrite-test",
      version: "1.0.0",
      sinceBuild: "241",
    });
    const buffer = createJarPlugin(xml);

    // 第一次上传
    const form1 = new FormData();
    form1.append("file", new File([buffer], "test.zip"));
    const res1 = await app.request("/api/plugins", {
      method: "POST",
      headers: { Authorization: TOKEN },
      body: form1,
    });
    expect(res1.status).toBe(201);

    // 第二次上传（无 force）应 409
    const form2 = new FormData();
    form2.append("file", new File([buffer], "test.zip"));
    const res2 = await app.request("/api/plugins", {
      method: "POST",
      headers: { Authorization: TOKEN },
      body: form2,
    });
    expect(res2.status).toBe(409);

    // 第三次上传（force=true）应成功
    const form3 = new FormData();
    form3.append("file", new File([buffer], "test.zip"));
    const res3 = await app.request("/api/plugins?force=true", {
      method: "POST",
      headers: { Authorization: TOKEN },
      body: form3,
    });
    expect(res3.status).toBe(201);
  });

  /**
   * 多插件场景：多个不同插件并存
   */
  it("multiple plugins coexist and filter independently", async () => {
    // 插件 A：兼容 241
    const bufA = createJarPlugin(
      fullPluginXml({
        id: "com.example.plugin-a",
        name: "Plugin A",
        sinceBuild: "241",
        untilBuild: "241.*",
      })
    );
    const formA = new FormData();
    formA.append("file", new File([bufA], "a.zip"));
    await app.request("/api/plugins", {
      method: "POST",
      headers: { Authorization: TOKEN },
      body: formA,
    });

    // 插件 B：兼容 242+
    const bufB = createJarPlugin(
      fullPluginXml({
        id: "com.example.plugin-b",
        name: "Plugin B",
        sinceBuild: "242",
        untilBuild: "243.*",
      })
    );
    const formB = new FormData();
    formB.append("file", new File([bufB], "b.zip"));
    await app.request("/api/plugins", {
      method: "POST",
      headers: { Authorization: TOKEN },
      body: formB,
    });

    // API 列表应有 2 个
    const listRes = await app.request("/api/plugins");
    const listBody = await listRes.json();
    expect(listBody.total).toBe(2);

    // 241 build 只看到 A
    const xml241 = await (
      await app.request("/updatePlugins.xml?build=IC-241.15989")
    ).text();
    expect(xml241).toContain("plugin-a");
    expect(xml241).not.toContain("plugin-b");

    // 242 build 只看到 B
    const xml242 = await (
      await app.request("/updatePlugins.xml?build=IC-242.10000")
    ).text();
    expect(xml242).not.toContain("plugin-a");
    expect(xml242).toContain("plugin-b");
  });
});
