import type { CompatiblePlugin } from "../repository/types";

/**
 * 生成 JetBrains Custom Plugin Repository 格式的 XML。
 * 每个 pluginId 只返回一个最兼容的版本。
 */
export function generateUpdatePluginsXml(plugins: CompatiblePlugin[]): string {
  const entries = plugins.map((p) => {
    let xml = `  <plugin id="${escapeXml(p.id)}"
          url="${escapeXml(p.downloadUrl)}"
          version="${escapeXml(p.version)}">
    <idea-version since-build="${escapeXml(p.sinceBuild)}"${
      p.untilBuild ? ` until-build="${escapeXml(p.untilBuild)}"` : ""
    }/>
    <name>${escapeXml(p.name)}</name>`;

    if (p.description) {
      xml += `\n    <description><![CDATA[${p.description}]]></description>`;
    }
    if (p.changeNotes) {
      xml += `\n    <change-notes><![CDATA[${p.changeNotes}]]></change-notes>`;
    }
    if (p.vendor) {
      const attrs: string[] = [];
      if (p.vendor.email) attrs.push(`email="${escapeXml(p.vendor.email)}"`);
      if (p.vendor.url) attrs.push(`url="${escapeXml(p.vendor.url)}"`);
      xml += `\n    <vendor${attrs.length ? " " + attrs.join(" ") : ""}>${escapeXml(p.vendor.name)}</vendor>`;
    }

    xml += `\n  </plugin>`;
    return xml;
  });

  return `<?xml version="1.0" encoding="UTF-8"?>\n<plugins>\n${entries.join("\n")}\n</plugins>`;
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
