import { describe, it, expect } from "bun:test";
import { generateUpdatePluginsXml } from "../../src/lib/xml";
import type { CompatiblePlugin } from "../../src/repository/types";

describe("generateUpdatePluginsXml", () => {
  it("generates valid XML for single plugin", () => {
    const plugins: CompatiblePlugin[] = [{
      id: "com.example.test",
      name: "Test Plugin",
      version: "1.0.0",
      sinceBuild: "222",
      untilBuild: "241.*",
      description: null,
      vendor: null,
      changeNotes: null,
      downloadUrl: "http://localhost/plugins/com.example.test/1.0.0",
    }];

    const xml = generateUpdatePluginsXml(plugins);

    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(xml).toContain('<plugins>');
    expect(xml).toContain('id="com.example.test"');
    expect(xml).toContain('version="1.0.0"');
    expect(xml).toContain('since-build="222"');
    expect(xml).toContain('until-build="241.*"');
    expect(xml).toContain('</plugins>');
  });

  it("omits until-build when null", () => {
    const plugins: CompatiblePlugin[] = [{
      id: "com.example.test",
      name: "Test Plugin",
      version: "1.0.0",
      sinceBuild: "222",
      untilBuild: null,
      description: null,
      vendor: null,
      changeNotes: null,
      downloadUrl: "http://localhost/plugins/com.example.test/1.0.0",
    }];

    const xml = generateUpdatePluginsXml(plugins);

    expect(xml).toContain('since-build="222"');
    expect(xml).not.toContain("until-build");
  });

  it("includes description in CDATA", () => {
    const plugins: CompatiblePlugin[] = [{
      id: "test",
      name: "Test",
      version: "1.0.0",
      sinceBuild: "222",
      untilBuild: null,
      description: "<p>Hello <b>world</b></p>",
      vendor: null,
      changeNotes: null,
      downloadUrl: "http://localhost/plugins/test/1.0.0",
    }];

    const xml = generateUpdatePluginsXml(plugins);

    expect(xml).toContain("<description><![CDATA[<p>Hello <b>world</b></p>]]></description>");
  });

  it("includes vendor with email and url", () => {
    const plugins: CompatiblePlugin[] = [{
      id: "test",
      name: "Test",
      version: "1.0.0",
      sinceBuild: "222",
      untilBuild: null,
      description: null,
      vendor: { name: "ACME", email: "dev@acme.com", url: "https://acme.com" },
      changeNotes: null,
      downloadUrl: "http://localhost/plugins/test/1.0.0",
    }];

    const xml = generateUpdatePluginsXml(plugins);

    expect(xml).toContain('email="dev@acme.com"');
    expect(xml).toContain('url="https://acme.com"');
    expect(xml).toContain(">ACME</vendor>");
  });

  it("escapes XML special characters in id and name", () => {
    const plugins: CompatiblePlugin[] = [{
      id: 'com.example."test"',
      name: "Test <Plugin> & More",
      version: "1.0.0",
      sinceBuild: "222",
      untilBuild: null,
      description: null,
      vendor: null,
      changeNotes: null,
      downloadUrl: "http://localhost/test",
    }];

    const xml = generateUpdatePluginsXml(plugins);

    expect(xml).toContain('id="com.example.&quot;test&quot;"');
    expect(xml).toContain("<name>Test &lt;Plugin&gt; &amp; More</name>");
  });

  it("generates empty plugins element for empty list", () => {
    const xml = generateUpdatePluginsXml([]);

    expect(xml).toContain("<plugins>");
    expect(xml).toContain("</plugins>");
    expect(xml).not.toContain("<plugin ");
  });

  it("generates multiple plugin entries", () => {
    const plugins: CompatiblePlugin[] = [
      {
        id: "plugin-a", name: "A", version: "1.0", sinceBuild: "222",
        untilBuild: null, description: null, vendor: null, changeNotes: null,
        downloadUrl: "http://localhost/plugins/plugin-a/1.0",
      },
      {
        id: "plugin-b", name: "B", version: "2.0", sinceBuild: "231",
        untilBuild: null, description: null, vendor: null, changeNotes: null,
        downloadUrl: "http://localhost/plugins/plugin-b/2.0",
      },
    ];

    const xml = generateUpdatePluginsXml(plugins);

    expect(xml).toContain('id="plugin-a"');
    expect(xml).toContain('id="plugin-b"');
  });
});
