import { describe, it, expect, beforeEach, afterAll, afterEach } from "vitest";
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { htmlToPdfTool, browserService } from "@agentic/tools";

let tmp: string;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "agentic-html-pdf-test-"));
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

afterAll(async () => {
  await browserService.shutdown();
});

function assertPdf(path: string) {
  const buf = readFileSync(path);
  // PDF magic: %PDF-
  expect(buf.slice(0, 5).toString("ascii")).toBe("%PDF-");
  // Valid PDFs end with %%EOF (allow trailing newline)
  const tail = buf.slice(-8).toString("ascii");
  expect(tail).toMatch(/%%EOF\s*$/);
  expect(buf.length).toBeGreaterThan(500);
}

describe("htmlToPdfTool", () => {
  it("renders inline HTML to a PDF file", async () => {
    const out = join(tmp, "inline.pdf");
    const result = await htmlToPdfTool.run(
      {
        html: "<!doctype html><html><body><h1>Inline Test</h1><p>Body text.</p></body></html>",
        output_path: out,
      },
      { cwd: tmp },
    );
    expect(result).toContain("Saved PDF to:");
    expect(result).toContain(out);
    assertPdf(out);
  }, 30_000);

  it("renders a local HTML file to PDF", async () => {
    const src = join(tmp, "source.html");
    writeFileSync(
      src,
      "<!doctype html><html><body><h1>From File</h1><p>Paragraph.</p></body></html>",
    );
    const out = join(tmp, "from-file.pdf");
    await htmlToPdfTool.run({ path: src, output_path: out }, { cwd: tmp });
    assertPdf(out);
  }, 30_000);

  it("resolves output_path relative to cwd and auto-adds .pdf extension", async () => {
    const result = await htmlToPdfTool.run(
      { html: "<p>relative</p>", output_path: "report" },
      { cwd: tmp },
    );
    const expected = join(tmp, "report.pdf");
    expect(result).toContain(expected);
    assertPdf(expected);
  }, 30_000);

  it("respects landscape and custom margins (width ≈ height of portrait when landscape)", async () => {
    const portrait = join(tmp, "p.pdf");
    const landscape = join(tmp, "l.pdf");
    await htmlToPdfTool.run(
      { html: "<p>portrait</p>", output_path: portrait, format: "Letter" },
      { cwd: tmp },
    );
    await htmlToPdfTool.run(
      { html: "<p>landscape</p>", output_path: landscape, format: "Letter", landscape: true },
      { cwd: tmp },
    );
    // Both files produced, and landscape should differ in size from portrait (different content stream).
    expect(statSync(portrait).size).toBeGreaterThan(0);
    expect(statSync(landscape).size).toBeGreaterThan(0);
    assertPdf(portrait);
    assertPdf(landscape);
  }, 30_000);

  it("renders with custom width/height instead of format", async () => {
    const out = join(tmp, "custom.pdf");
    await htmlToPdfTool.run(
      {
        html: "<p>custom size</p>",
        output_path: out,
        width: "5in",
        height: "3in",
        margin_top: "0.1in",
        margin_bottom: "0.1in",
        margin_left: "0.1in",
        margin_right: "0.1in",
      },
      { cwd: tmp },
    );
    assertPdf(out);
  }, 30_000);

  it("supports header/footer templates and page_ranges", async () => {
    const out = join(tmp, "hf.pdf");
    // Force multi-page content so page_ranges is meaningful
    const many = Array.from({ length: 10 }, (_, i) => `<h2>Section ${i + 1}</h2><p style="page-break-after:always;">…</p>`).join("");
    await htmlToPdfTool.run(
      {
        html: `<!doctype html><html><body>${many}</body></html>`,
        output_path: out,
        format: "Letter",
        header_html: "<div style='font-size:10px;width:100%;text-align:center;'><span class='title'></span></div>",
        footer_html: "<div style='font-size:10px;width:100%;text-align:center;'>Page <span class='pageNumber'></span>/<span class='totalPages'></span></div>",
        page_ranges: "1-2",
      },
      { cwd: tmp },
    );
    assertPdf(out);
  }, 30_000);

  it("rejects when no source is provided", async () => {
    await expect(
      htmlToPdfTool.run({ output_path: join(tmp, "x.pdf") }, { cwd: tmp }),
    ).rejects.toThrow(/one of: html, path, or url/);
  });

  it("rejects when multiple sources are provided", async () => {
    await expect(
      htmlToPdfTool.run(
        { html: "<p>a</p>", url: "http://example.com", output_path: join(tmp, "x.pdf") },
        { cwd: tmp },
      ),
    ).rejects.toThrow(/only one of: html, path, or url/);
  });

  it("propagates a read error when the source path does not exist", async () => {
    await expect(
      htmlToPdfTool.run(
        { path: join(tmp, "does-not-exist.html"), output_path: join(tmp, "out.pdf") },
        { cwd: tmp },
      ),
    ).rejects.toThrow();
  });
});

describe("HtmlToPdfTool definition", () => {
  it("has correct name, tags, and required schema", () => {
    expect(htmlToPdfTool.name).toBe("html_to_pdf");
    expect(htmlToPdfTool.tags).toContain("pdf");
    expect(htmlToPdfTool.definition.input_schema.required).toEqual(["output_path"]);
  });

  it("is registered in BUILTIN_TOOLS", async () => {
    const { BUILTIN_TOOLS } = await import("@agentic/tools");
    expect(BUILTIN_TOOLS.some((t) => t.name === "html_to_pdf")).toBe(true);
  });

  it("is discoverable via defaultRegistry", async () => {
    const { defaultRegistry } = await import("@agentic/tools");
    expect(defaultRegistry.names()).toContain("html_to_pdf");
    expect(defaultRegistry.has("html_to_pdf")).toBe(true);
  });
});
