import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { PluginParser, InvalidPluginError } from "../../src/service/plugin-parser";
import {
  minimalPluginXml,
  fullPluginXml,
  createJarPlugin,
  createZipPlugin,
  createInvalidZip,
  createTempDataDir,
  writeToTempFile,
} from "../helpers/fixtures";

describe("PluginParser", () => {
  const parser = new PluginParser();
  let dataDir: string;
  let cleanup: () => Promise<void>;

  beforeEach(async () => {
    ({ path: dataDir, cleanup } = await createTempDataDir());
  });

  afterEach(async () => {
    await cleanup();
  });

  // -- JAR 格式（格式 A） --

  describe("JAR format (Format A)", () => {
    it("parses minimal plugin.xml from JAR", async () => {
      const buffer = createJarPlugin(minimalPluginXml());
      const filePath = await writeToTempFile(dataDir, buffer);

      const result = parser.parse(filePath);

      expect(result.id).toBe("com.example.test");
      expect(result.name).toBe("Test Plugin");
      expect(result.version).toBe("1.0.0");
      expect(result.sinceBuild).toBe("222");
      expect(result.untilBuild).toBeNull();
      expect(result.description).toBeNull();
      expect(result.vendor).toBeNull();
      expect(result.depends).toEqual([]);
    });

    it("parses full plugin.xml with all fields", async () => {
      const buffer = createJarPlugin(fullPluginXml());
      const filePath = await writeToTempFile(dataDir, buffer);

      const result = parser.parse(filePath);

      expect(result.id).toBe("com.example.test");
      expect(result.name).toBe("Test Plugin");
      expect(result.version).toBe("1.0.0");
      expect(result.sinceBuild).toBe("222");
      expect(result.untilBuild).toBe("241.*");
      expect(result.description).toBe("<p>A test plugin</p>");
      expect(result.changeNotes).toBe("<ul><li>Initial release</li></ul>");
      expect(result.vendor).toEqual({
        name: "Test Inc",
        email: "dev@test.com",
        url: "https://test.com",
      });
      expect(result.depends).toEqual(["com.intellij.modules.platform"]);
    });

    it("handles vendor without attributes", async () => {
      const xml = `<idea-plugin>
        <id>test</id><name>Test</name><version>1.0</version>
        <idea-version since-build="222"/>
        <vendor>My Company</vendor>
      </idea-plugin>`;
      const filePath = await writeToTempFile(dataDir, createJarPlugin(xml));

      const result = parser.parse(filePath);

      expect(result.vendor).toEqual({
        name: "My Company",
        url: null,
        email: null,
      });
    });

    it("extracts multiple depends", async () => {
      const xml = `<idea-plugin>
        <id>test</id><name>Test</name><version>1.0</version>
        <idea-version since-build="222"/>
        <depends>com.intellij.modules.platform</depends>
        <depends optional="true" config-file="yaml.xml">org.jetbrains.plugins.yaml</depends>
        <depends>com.intellij.modules.lang</depends>
      </idea-plugin>`;
      const filePath = await writeToTempFile(dataDir, createJarPlugin(xml));

      const result = parser.parse(filePath);

      expect(result.depends).toEqual([
        "com.intellij.modules.platform",
        "org.jetbrains.plugins.yaml",
        "com.intellij.modules.lang",
      ]);
    });
  });

  // -- ZIP 格式（格式 B） --

  describe("ZIP format (Format B)", () => {
    it("finds plugin.xml inside nested JAR in lib/", async () => {
      const buffer = createZipPlugin(minimalPluginXml({
        id: "com.example.zip-plugin",
      }));
      const filePath = await writeToTempFile(dataDir, buffer);

      const result = parser.parse(filePath);

      expect(result.id).toBe("com.example.zip-plugin");
    });

    it("skips JARs without plugin.xml", async () => {
      const buffer = createZipPlugin(minimalPluginXml());
      const filePath = await writeToTempFile(dataDir, buffer);

      const result = parser.parse(filePath);

      expect(result.id).toBe("com.example.test");
    });
  });

  // -- 错误场景 --

  describe("error handling", () => {
    it("throws on non-ZIP file", async () => {
      const filePath = await writeToTempFile(
        dataDir,
        Buffer.from("not a zip"),
        "fake.zip"
      );

      expect(() => parser.parse(filePath)).toThrow(InvalidPluginError);
      expect(() => parser.parse(filePath)).toThrow("Not a valid ZIP/JAR file");
    });

    it("throws when no plugin.xml found", async () => {
      const buffer = createInvalidZip();
      const filePath = await writeToTempFile(dataDir, buffer);

      expect(() => parser.parse(filePath)).toThrow(InvalidPluginError);
      expect(() => parser.parse(filePath)).toThrow("No plugin.xml found");
    });

    it("throws on missing <id>", async () => {
      const xml = `<idea-plugin>
        <name>Test</name><version>1.0</version>
        <idea-version since-build="222"/>
      </idea-plugin>`;
      const filePath = await writeToTempFile(dataDir, createJarPlugin(xml));

      expect(() => parser.parse(filePath)).toThrow("Missing required element: <id>");
    });

    it("throws on missing <name>", async () => {
      const xml = `<idea-plugin>
        <id>test</id><version>1.0</version>
        <idea-version since-build="222"/>
      </idea-plugin>`;
      const filePath = await writeToTempFile(dataDir, createJarPlugin(xml));

      expect(() => parser.parse(filePath)).toThrow("Missing required element: <name>");
    });

    it("throws on missing <version>", async () => {
      const xml = `<idea-plugin>
        <id>test</id><name>Test</name>
        <idea-version since-build="222"/>
      </idea-plugin>`;
      const filePath = await writeToTempFile(dataDir, createJarPlugin(xml));

      expect(() => parser.parse(filePath)).toThrow("Missing required element: <version>");
    });

    it("throws on missing since-build", async () => {
      const xml = `<idea-plugin>
        <id>test</id><name>Test</name><version>1.0</version>
      </idea-plugin>`;
      const filePath = await writeToTempFile(dataDir, createJarPlugin(xml));

      expect(() => parser.parse(filePath)).toThrow("Missing required attribute: idea-version since-build");
    });

    it("rejects path traversal in id", async () => {
      const xml = `<idea-plugin>
        <id>../../etc/passwd</id><name>Test</name><version>1.0</version>
        <idea-version since-build="222"/>
      </idea-plugin>`;
      const filePath = await writeToTempFile(dataDir, createJarPlugin(xml));

      expect(() => parser.parse(filePath)).toThrow("must not contain path separators");
    });

    it("rejects path traversal in version", async () => {
      const xml = `<idea-plugin>
        <id>test</id><name>Test</name><version>1.0/../../</version>
        <idea-version since-build="222"/>
      </idea-plugin>`;
      const filePath = await writeToTempFile(dataDir, createJarPlugin(xml));

      expect(() => parser.parse(filePath)).toThrow("must not contain path separators");
    });
  });

  // -- XML 命名空间兼容 --

  describe("IntelliJ Platform Plugin 2.x compatibility", () => {
    it("ignores XML namespace declarations", async () => {
      const xml = `<idea-plugin xmlns:xi="http://www.w3.org/2001/XInclude">
        <id>com.example.v2plugin</id>
        <name>V2 Plugin</name>
        <version>2.0.0</version>
        <idea-version since-build="231" until-build="242.*"/>
      </idea-plugin>`;
      const filePath = await writeToTempFile(dataDir, createJarPlugin(xml));

      const result = parser.parse(filePath);

      expect(result.id).toBe("com.example.v2plugin");
      expect(result.sinceBuild).toBe("231");
      expect(result.untilBuild).toBe("242.*");
    });
  });
});
