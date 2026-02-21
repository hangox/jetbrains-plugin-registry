import AdmZip from "adm-zip";
import type { PluginMetadata, VendorInfo } from "../repository/types";

export class InvalidPluginError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidPluginError";
  }
}

export class PluginParser {

  /**
   * 从 ZIP/JAR 文件中解析 plugin.xml，提取元数据。
   *
   * @param filePath 临时文件路径
   * @returns 解析出的插件元数据
   * @throws InvalidPluginError 文件格式无效、找不到 plugin.xml、缺少必填字段
   */
  parse(filePath: string): PluginMetadata {
    let zip: AdmZip;
    try {
      zip = new AdmZip(filePath);
    } catch (e) {
      throw new InvalidPluginError(
        `Not a valid ZIP/JAR file: ${e instanceof Error ? e.message : "unknown error"}`
      );
    }

    // 尝试方式 1: 作为 JAR 直接查找 plugin.xml
    const directEntry = zip.getEntry("META-INF/plugin.xml");
    if (directEntry) {
      const xmlContent = directEntry.getData().toString("utf-8");
      return this.parsePluginXml(xmlContent);
    }

    // 尝试方式 2: 在嵌套的 lib/*.jar 中查找
    const jarEntries = zip.getEntries().filter((entry) => {
      const parts = entry.entryName.split("/");
      return (
        !entry.isDirectory &&
        parts.length >= 3 &&
        parts[parts.length - 2] === "lib" &&
        entry.entryName.endsWith(".jar")
      );
    });

    if (jarEntries.length === 0) {
      throw new InvalidPluginError(
        "No plugin.xml found. " +
        "Expected either META-INF/plugin.xml in root (JAR format), " +
        "or */lib/*.jar containing META-INF/plugin.xml (ZIP format)."
      );
    }

    for (const jarEntry of jarEntries) {
      const jarData = jarEntry.getData();
      try {
        const innerZip = new AdmZip(jarData);
        const pluginXmlEntry = innerZip.getEntry("META-INF/plugin.xml");
        if (pluginXmlEntry) {
          const xmlContent = pluginXmlEntry.getData().toString("utf-8");
          return this.parsePluginXml(xmlContent);
        }
      } catch {
        // 该 jar 无法作为 zip 打开（可能是损坏的 JAR），跳过
        continue;
      }
    }

    throw new InvalidPluginError(
      `Searched ${jarEntries.length} JAR file(s) in lib/ directory, ` +
      "but none contained META-INF/plugin.xml.\n" +
      "JARs searched: " + jarEntries.map(e => e.entryName).join(", ")
    );
  }

  /**
   * 解析 plugin.xml 内容，提取所有字段。
   */
  private parsePluginXml(xmlContent: string): PluginMetadata {
    // 必填字段
    const id = this.extractTag(xmlContent, "id");
    if (!id) {
      throw new InvalidPluginError(
        "Missing required element: <id>\n" +
        "plugin.xml must contain: <id>com.example.myplugin</id>"
      );
    }

    const name = this.extractTag(xmlContent, "name");
    if (!name) {
      throw new InvalidPluginError(
        "Missing required element: <name>\n" +
        "plugin.xml must contain: <name>My Plugin Name</name>"
      );
    }

    const version = this.extractTag(xmlContent, "version");
    if (!version) {
      throw new InvalidPluginError(
        "Missing required element: <version>\n" +
        "plugin.xml must contain: <version>1.0.0</version>"
      );
    }

    const sinceBuild = this.extractAttr(xmlContent, "idea-version", "since-build");
    if (!sinceBuild) {
      throw new InvalidPluginError(
        "Missing required attribute: idea-version since-build\n" +
        "plugin.xml must contain: <idea-version since-build=\"222\"/>"
      );
    }

    // 可选字段
    const untilBuild = this.extractAttr(xmlContent, "idea-version", "until-build");
    const description = this.extractCdata(xmlContent, "description")
      ?? this.extractTag(xmlContent, "description");
    const changeNotes = this.extractCdata(xmlContent, "change-notes")
      ?? this.extractTag(xmlContent, "change-notes");

    const vendor = this.extractVendor(xmlContent);
    const depends = this.extractAllTags(xmlContent, "depends");

    // 安全校验
    this.validateSafePath(id, "id");
    this.validateSafePath(version, "version");

    return {
      id, name, version, sinceBuild, untilBuild,
      description, vendor, changeNotes, depends,
    };
  }

  // ============ XML 提取方法 ============

  /**
   * 提取简单标签文本：<tag>content</tag>
   */
  private extractTag(xml: string, tag: string): string | null {
    const match = xml.match(new RegExp(`<${tag}[^>]*>([^<]+)</${tag}>`));
    return match?.[1]?.trim() ?? null;
  }

  /**
   * 提取 CDATA 内容：<tag><![CDATA[content]]></tag>
   */
  private extractCdata(xml: string, tag: string): string | null {
    const match = xml.match(
      new RegExp(`<${tag}[^>]*>\\s*<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>\\s*</${tag}>`)
    );
    return match?.[1]?.trim() ?? null;
  }

  /**
   * 提取自闭合标签或空标签的属性值：<tag attr="value" />
   */
  private extractAttr(xml: string, tag: string, attr: string): string | null {
    const tagMatch = xml.match(new RegExp(`<${tag}\\s+([^>]*)/?>`));
    if (!tagMatch) return null;
    const attrMatch = tagMatch[1].match(new RegExp(`${attr}="([^"]*)"`));
    return attrMatch?.[1]?.trim() || null;
  }

  /**
   * 提取所有同名标签的文本
   */
  private extractAllTags(xml: string, tag: string): string[] {
    const matches = xml.matchAll(new RegExp(`<${tag}[^>]*>([^<]+)</${tag}>`, "g"));
    return Array.from(matches, (m) => m[1].trim());
  }

  /**
   * 提取 vendor 信息
   */
  private extractVendor(xml: string): VendorInfo | null {
    // 尝试匹配有属性的 vendor
    const withAttrs = xml.match(/<vendor\s+([^>]*)>([^<]*)<\/vendor>/);
    if (withAttrs) {
      const attrs = withAttrs[1];
      const name = withAttrs[2].trim();
      const url = attrs.match(/url="([^"]*)"/)?.[1] || null;
      const email = attrs.match(/email="([^"]*)"/)?.[1] || null;
      return { name, url, email };
    }

    // 尝试匹配无属性的 vendor：<vendor>Example Inc</vendor>
    const withoutAttrs = xml.match(/<vendor>([^<]+)<\/vendor>/);
    if (withoutAttrs) {
      return { name: withoutAttrs[1].trim(), url: null, email: null };
    }

    return null;
  }

  // ============ 安全校验 ============

  /**
   * 路径遍历防护
   */
  private validateSafePath(value: string, fieldName: string): void {
    if (value.includes("..") || value.includes("/") || value.includes("\\")) {
      throw new InvalidPluginError(
        `Invalid ${fieldName}: "${value}" must not contain path separators (.. / \\)`
      );
    }

    // 额外校验：不允许空值或纯空白
    if (value.trim().length === 0) {
      throw new InvalidPluginError(
        `Invalid ${fieldName}: must not be empty or whitespace-only`
      );
    }
  }
}
