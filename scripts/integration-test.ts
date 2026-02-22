#!/usr/bin/env bun
/**
 * 端到端集成测试脚本
 *
 * 启动真实服务器 → 上传插件 → 验证所有端点 → 清理
 *
 * 用法：
 *   bun run scripts/integration-test.ts                  # 使用内置 fixture 插件
 *   bun run scripts/integration-test.ts --use-sample     # 使用 sample-plugin 的真实 ZIP
 *
 * 退出码：
 *   0 = 全部通过
 *   1 = 有失败
 */

import { spawn } from "bun";
import { mkdtemp, rm, mkdir } from "fs/promises";
import { tmpdir } from "os";
import { join, resolve } from "path";
import AdmZip from "adm-zip";

// ── 配置 ──

const ROOT_DIR = resolve(import.meta.dir, "..");
const SERVER_DIR = join(ROOT_DIR, "server");
const SAMPLE_PLUGIN_ZIP = join(
  ROOT_DIR,
  "sample-plugin/build/distributions/sample-plugin-1.0.0.zip"
);
const AUTH_TOKEN = "integration-test-token";
const ADMIN_PASS = "test-pass";
const USE_SAMPLE = process.argv.includes("--use-sample");

// ── 测试结果收集 ──

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

const results: TestResult[] = [];

function assert(name: string, condition: boolean, detail?: string) {
  if (condition) {
    results.push({ name, passed: true });
    console.log(`  ✅ ${name}`);
  } else {
    results.push({ name, passed: false, error: detail });
    console.log(`  ❌ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

// ── 工具函数 ──

function createFixtureZip(
  pluginId: string,
  version: string,
  sinceBuild: string,
  untilBuild: string
): Buffer {
  const pluginXml = `<idea-plugin>
  <id>${pluginId}</id>
  <name>Integration Test Plugin</name>
  <version>${version}</version>
  <vendor email="dev@test.com" url="https://test.com">Test Corp</vendor>
  <description><![CDATA[<p>An integration test plugin</p>]]></description>
  <change-notes><![CDATA[<ul><li>${version} release</li></ul>]]></change-notes>
  <idea-version since-build="${sinceBuild}" until-build="${untilBuild}"/>
  <depends>com.intellij.modules.platform</depends>
</idea-plugin>`;

  const innerJar = new AdmZip();
  innerJar.addFile("META-INF/plugin.xml", Buffer.from(pluginXml, "utf-8"));
  innerJar.addFile(
    "com/example/plugin/Main.class",
    Buffer.from("fake class bytes")
  );

  const outerZip = new AdmZip();
  outerZip.addFile(
    `integration-test/lib/integration-test-${version}.jar`,
    innerJar.toBuffer()
  );

  return outerZip.toBuffer();
}

async function waitForServer(
  baseUrl: string,
  timeoutMs = 10000
): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${baseUrl}/api/health`);
      if (res.ok) return true;
    } catch {
      // 服务未就绪，继续等待
    }
    await Bun.sleep(200);
  }
  return false;
}

async function uploadFile(
  baseUrl: string,
  fileData: Buffer | Uint8Array,
  fileName: string,
  force = false
): Promise<Response> {
  const formData = new FormData();
  formData.append(
    "file",
    new File([fileData], fileName, { type: "application/zip" })
  );
  return fetch(
    `${baseUrl}/api/plugins${force ? "?force=true" : ""}`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${AUTH_TOKEN}` },
      body: formData,
    }
  );
}

// ── 主流程 ──

async function main() {
  console.log("\n🧪 JetBrains Plugin Registry — 端到端集成测试\n");

  // 1. 创建临时数据目录
  const dataDir = await mkdtemp(join(tmpdir(), "registry-e2e-"));
  await mkdir(join(dataDir, "plugins"), { recursive: true });
  await mkdir(join(dataDir, "tmp"), { recursive: true });

  // 2. 选择可用端口
  const port = 3456 + Math.floor(Math.random() * 1000);
  const baseUrl = `http://localhost:${port}`;

  console.log(`📁 数据目录: ${dataDir}`);
  console.log(`🌐 服务地址: ${baseUrl}`);
  console.log(`🔑 Token: ${AUTH_TOKEN}`);
  console.log(`📦 插件来源: ${USE_SAMPLE ? "sample-plugin ZIP" : "内置 fixture"}\n`);

  // 3. 启动服务器
  console.log("── 启动服务器 ──");
  const serverProc = spawn({
    cmd: ["bun", "run", "src/index.ts"],
    cwd: SERVER_DIR,
    env: {
      ...process.env,
      PORT: String(port),
      BASE_URL: baseUrl,
      AUTH_TOKENS: AUTH_TOKEN,
      ADMIN_USER: "admin",
      ADMIN_PASS: ADMIN_PASS,
      DATA_DIR: dataDir,
      DB_TYPE: "sqlite",
    },
    stdout: "pipe",
    stderr: "pipe",
  });

  try {
    const serverReady = await waitForServer(baseUrl);
    assert("服务器启动", serverReady, "超时未就绪");
    if (!serverReady) return;

    // 4. 健康检查
    console.log("\n── 健康检查 ──");
    const healthRes = await fetch(`${baseUrl}/api/health`);
    const health = (await healthRes.json()) as Record<string, unknown>;
    assert("健康检查返回 200", healthRes.status === 200);
    assert(
      "数据库已连接",
      health.database === "connected",
      `got: ${health.database}`
    );

    // 5. 准备插件文件
    console.log("\n── 上传插件 ──");
    let pluginData: Buffer | Uint8Array;
    let fileName: string;
    let expectedPluginId: string;

    if (USE_SAMPLE) {
      const file = Bun.file(SAMPLE_PLUGIN_ZIP);
      const exists = await file.exists();
      assert("sample-plugin ZIP 存在", exists, SAMPLE_PLUGIN_ZIP);
      if (!exists) return;
      pluginData = new Uint8Array(await file.arrayBuffer());
      fileName = "sample-plugin-1.0.0.zip";
      expectedPluginId = "com.example.sample-plugin";
    } else {
      pluginData = createFixtureZip(
        "com.example.e2e-test",
        "1.0.0",
        "241",
        "241.*"
      );
      fileName = "e2e-test-1.0.0.zip";
      expectedPluginId = "com.example.e2e-test";
    }

    // 6. 上传 v1.0.0
    const uploadRes = await uploadFile(baseUrl, pluginData, fileName);
    assert("上传返回 201", uploadRes.status === 201, `got: ${uploadRes.status}`);
    const uploadBody = (await uploadRes.json()) as Record<string, unknown>;
    assert(
      "pluginId 正确",
      uploadBody.pluginId === expectedPluginId,
      `got: ${uploadBody.pluginId}`
    );
    const v1sha256 = uploadBody.fileSha256 as string;

    // 7. 上传 v2（仅 fixture 模式）
    if (!USE_SAMPLE) {
      const v2Data = createFixtureZip(
        "com.example.e2e-test",
        "2.0.0",
        "241",
        "242.*"
      );
      const v2Res = await uploadFile(baseUrl, v2Data, "e2e-test-2.0.0.zip");
      assert("上传 v2.0.0 返回 201", v2Res.status === 201);
    }

    // 8. API 查询
    console.log("\n── API 查询 ──");
    const listRes = await fetch(`${baseUrl}/api/plugins`);
    const listBody = (await listRes.json()) as {
      total: number;
      items: { id: string }[];
    };
    assert("插件列表返回 200", listRes.status === 200);
    assert("插件数量正确", listBody.total === 1, `got: ${listBody.total}`);
    assert(
      "插件 ID 匹配",
      listBody.items[0]?.id === expectedPluginId,
      `got: ${listBody.items[0]?.id}`
    );

    const detailRes = await fetch(`${baseUrl}/api/plugins/${expectedPluginId}`);
    const detailBody = (await detailRes.json()) as {
      info: { name: string };
      versions: { version: string }[];
    };
    assert("插件详情返回 200", detailRes.status === 200);
    assert(
      "版本数量正确",
      detailBody.versions.length === (USE_SAMPLE ? 1 : 2),
      `got: ${detailBody.versions.length}`
    );

    // 9. updatePlugins.xml
    console.log("\n── XML 协议 ──");
    const xmlRes = await fetch(
      `${baseUrl}/updatePlugins.xml?build=IC-241.15989.150`
    );
    assert("XML 返回 200", xmlRes.status === 200);
    const xml = await xmlRes.text();
    assert(
      "XML 含 Content-Type",
      xmlRes.headers.get("Content-Type")?.includes("xml") === true
    );
    assert("XML 包含插件 ID", xml.includes(expectedPluginId));
    assert("XML 包含 idea-version", xml.includes("since-build="));

    // 不兼容的 build 号不应返回插件
    const xmlIncompat = await fetch(
      `${baseUrl}/updatePlugins.xml?build=IC-200.1000`
    );
    const xmlIncompatText = await xmlIncompat.text();
    assert(
      "不兼容 build 不返回插件",
      !xmlIncompatText.includes(expectedPluginId)
    );

    // 10. 下载并校验
    console.log("\n── 下载与校验 ──");
    const dlRes = await fetch(
      `${baseUrl}/plugins/${expectedPluginId}/1.0.0`
    );
    assert("下载返回 200", dlRes.status === 200);
    assert(
      "Content-Type 为 zip",
      dlRes.headers.get("Content-Type") === "application/zip"
    );

    const dlBytes = new Uint8Array(await dlRes.arrayBuffer());
    assert("下载文件大小 > 0", dlBytes.length > 0, `got: ${dlBytes.length}`);

    const hasher = new Bun.CryptoHasher("sha256");
    hasher.update(dlBytes);
    const dlSha256 = hasher.digest("hex");
    assert("SHA256 校验一致", dlSha256 === v1sha256, `expected: ${v1sha256}, got: ${dlSha256}`);

    // 验证下载的是合法 ZIP
    const testZip = new AdmZip(Buffer.from(dlBytes));
    const entries = testZip.getEntries().map((e) => e.entryName);
    assert("ZIP 结构包含 lib/", entries.some((e) => e.includes("lib/")));

    // 11. 统计
    console.log("\n── 存储统计 ──");
    const statsRes = await fetch(`${baseUrl}/api/stats`);
    const stats = (await statsRes.json()) as Record<string, unknown>;
    assert("统计返回 200", statsRes.status === 200);
    assert("pluginCount = 1", stats.pluginCount === 1);
    assert(
      "totalStorageBytes > 0",
      (stats.totalStorageBytes as number) > 0
    );

    // 12. 版本冲突 (409)
    console.log("\n── 边界情况 ──");
    const dupRes = await uploadFile(baseUrl, pluginData, fileName);
    assert(
      "重复上传返回 409",
      dupRes.status === 409,
      `got: ${dupRes.status}`
    );

    // force 覆盖
    const forceRes = await uploadFile(baseUrl, pluginData, fileName, true);
    assert("force 覆盖返回 201", forceRes.status === 201);

    // 认证失败
    const noAuthRes = await fetch(`${baseUrl}/api/plugins`, {
      method: "POST",
      body: new FormData(),
    });
    assert("无 Token 返回 401", noAuthRes.status === 401);

    // 不存在的插件
    const notFoundRes = await fetch(`${baseUrl}/plugins/non.existent/1.0.0`);
    assert("不存在的插件返回 404", notFoundRes.status === 404);

    // 13. 删除
    if (!USE_SAMPLE) {
      console.log("\n── 删除操作 ──");
      const delV1 = await fetch(
        `${baseUrl}/api/plugins/${expectedPluginId}/1.0.0`,
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${AUTH_TOKEN}` },
        }
      );
      assert("删除 v1.0.0 返回 200", delV1.status === 200);

      const delAll = await fetch(
        `${baseUrl}/api/plugins/${expectedPluginId}`,
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${AUTH_TOKEN}` },
        }
      );
      assert("删除整个插件返回 200", delAll.status === 200);

      const emptyList = await fetch(`${baseUrl}/api/plugins`);
      const emptyBody = (await emptyList.json()) as { total: number };
      assert("删除后列表为空", emptyBody.total === 0);
    }
  } finally {
    // 清理
    serverProc.kill();
    await rm(dataDir, { recursive: true, force: true });
  }

  // 汇总
  console.log("\n══════════════════════════════════════");
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  console.log(`  总计: ${results.length}  通过: ${passed}  失败: ${failed}`);
  console.log("══════════════════════════════════════\n");

  if (failed > 0) {
    console.log("失败项:");
    for (const r of results.filter((f) => !f.passed)) {
      console.log(`  ❌ ${r.name}: ${r.error ?? "unknown"}`);
    }
    console.log("");
    process.exit(1);
  }

  console.log("🎉 全部通过!\n");
  process.exit(0);
}

main().catch((err) => {
  console.error("致命错误:", err);
  process.exit(1);
});
