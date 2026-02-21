import AdmZip from "adm-zip";
import { join } from "path";
import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";

/** 最简 plugin.xml */
export function minimalPluginXml(overrides?: {
  id?: string;
  name?: string;
  version?: string;
  sinceBuild?: string;
  untilBuild?: string;
}): string {
  const {
    id = "com.example.test",
    name = "Test Plugin",
    version = "1.0.0",
    sinceBuild = "222",
    untilBuild,
  } = overrides ?? {};

  return `<idea-plugin>
  <id>${id}</id>
  <name>${name}</name>
  <version>${version}</version>
  <idea-version since-build="${sinceBuild}"${untilBuild ? ` until-build="${untilBuild}"` : ""}/>
</idea-plugin>`;
}

/** 完整 plugin.xml（含所有可选字段） */
export function fullPluginXml(overrides?: {
  id?: string;
  name?: string;
  version?: string;
  sinceBuild?: string;
  untilBuild?: string;
  description?: string;
  changeNotes?: string;
  vendorName?: string;
  vendorEmail?: string;
  vendorUrl?: string;
  depends?: string[];
}): string {
  const {
    id = "com.example.test",
    name = "Test Plugin",
    version = "1.0.0",
    sinceBuild = "222",
    untilBuild = "241.*",
    description = "<p>A test plugin</p>",
    changeNotes = "<ul><li>Initial release</li></ul>",
    vendorName = "Test Inc",
    vendorEmail = "dev@test.com",
    vendorUrl = "https://test.com",
    depends = ["com.intellij.modules.platform"],
  } = overrides ?? {};

  return `<idea-plugin>
  <id>${id}</id>
  <name>${name}</name>
  <version>${version}</version>
  <vendor email="${vendorEmail}" url="${vendorUrl}">${vendorName}</vendor>
  <description><![CDATA[${description}]]></description>
  <change-notes><![CDATA[${changeNotes}]]></change-notes>
  <idea-version since-build="${sinceBuild}" until-build="${untilBuild}"/>
  ${depends.map((d) => `<depends>${d}</depends>`).join("\n  ")}
</idea-plugin>`;
}

/** 创建 JAR 格式（格式 A）的插件包 */
export function createJarPlugin(pluginXml: string): Buffer {
  const zip = new AdmZip();
  zip.addFile("META-INF/plugin.xml", Buffer.from(pluginXml, "utf-8"));
  zip.addFile("com/example/plugin/MyAction.class", Buffer.from("fake class"));
  return zip.toBuffer();
}

/** 创建 ZIP 格式（格式 B）的插件包，含嵌套 JAR */
export function createZipPlugin(pluginXml: string, pluginName = "test-plugin"): Buffer {
  // 先创建内层 JAR
  const innerJar = new AdmZip();
  innerJar.addFile("META-INF/plugin.xml", Buffer.from(pluginXml, "utf-8"));
  innerJar.addFile("com/example/plugin/MyAction.class", Buffer.from("fake class"));

  // 创建外层 ZIP
  const outerZip = new AdmZip();
  outerZip.addFile(
    `${pluginName}/lib/${pluginName}-1.0.0.jar`,
    innerJar.toBuffer()
  );
  // 添加一个额外的依赖 JAR（无 plugin.xml）
  const depJar = new AdmZip();
  depJar.addFile("kotlin/Unit.class", Buffer.from("fake"));
  outerZip.addFile(`${pluginName}/lib/kotlin-stdlib-1.9.0.jar`, depJar.toBuffer());

  return outerZip.toBuffer();
}

/** 创建无 plugin.xml 的无效 ZIP */
export function createInvalidZip(): Buffer {
  const zip = new AdmZip();
  zip.addFile("README.md", Buffer.from("no plugin here"));
  return zip.toBuffer();
}

/** 创建临时数据目录，测试结束后清理 */
export async function createTempDataDir(): Promise<{
  path: string;
  cleanup: () => Promise<void>;
}> {
  const path = await mkdtemp(join(tmpdir(), "registry-test-"));
  return {
    path,
    cleanup: () => rm(path, { recursive: true, force: true }),
  };
}

/** 将 Buffer 写入临时文件，返回路径 */
export async function writeToTempFile(
  dataDir: string,
  buffer: Buffer,
  filename = "test-plugin.zip",
): Promise<string> {
  const filePath = join(dataDir, filename);
  await Bun.write(filePath, buffer);
  return filePath;
}

/** 将 Buffer 包装为 File 对象（模拟 multipart 上传） */
export function bufferToFile(buffer: Buffer, filename = "test-plugin.zip"): File {
  return new File([buffer], filename, { type: "application/zip" });
}
