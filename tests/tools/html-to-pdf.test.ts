import { describe, it, expect, beforeEach, afterAll, afterEach } from "vitest";
import { mkdtempSync, existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  htmlToPdfTool,
  htmlCheckTool,
  htmlStyleGuideTool,
  browserService,
  parseLengthToPx,
  parseMargins,
  parsePaper,
  PRESET_NAMES,
  themeCss,
  injectStyle,
  BUILTIN_TOOLS,
  defaultRegistry,
} from "@agentic/tools";

let tmp: string;

beforeEach(() => { tmp = mkdtempSync(join(tmpdir(), "agentic-html-pdf-test-")); });
afterEach(() => { rmSync(tmp, { recursive: true, force: true }); });
afterAll(async () => { await browserService.shutdown(); });

function assertPdf(path: string) {
  const buf = readFileSync(path);
  expect(buf.slice(0, 5).toString("ascii")).toBe("%PDF-");
  expect(buf.slice(-8).toString("ascii")).toMatch(/%%EOF\s*$/);
  expect(buf.length).toBeGreaterThan(500);
}

function assertPng(path: string) {
  const buf = readFileSync(path);
  expect(
    buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  ).toBe(true);
  expect(buf.length).toBeGreaterThan(100);
}

// ──────────────────────────────────────────────────────────────────────────────
// Parsing helpers
// ──────────────────────────────────────────────────────────────────────────────

describe("parseLengthToPx", () => {
  it("parses CSS units at 96 DPI", () => {
    expect(parseLengthToPx("1in")).toBeCloseTo(96);
    expect(parseLengthToPx("2.54cm")).toBeCloseTo(96, 2);
    expect(parseLengthToPx("25.4mm")).toBeCloseTo(96, 2);
    expect(parseLengthToPx("72pt")).toBeCloseTo(96);
    expect(parseLengthToPx("800px")).toBe(800);
    expect(parseLengthToPx("800")).toBe(800);
  });
  it("returns NaN for garbage", () => {
    expect(parseLengthToPx("bogus")).toBeNaN();
    expect(parseLengthToPx(undefined)).toBeNaN();
  });
});

describe("parseMargins (CSS shorthand)", () => {
  const fallback = { top: 0, right: 0, bottom: 0, left: 0 };

  it("handles 1-4 value shorthand", () => {
    expect(parseMargins("0.5in", fallback)).toEqual({
      top: 48, right: 48, bottom: 48, left: 48,
    });
    expect(parseMargins("0.5in 1in", fallback)).toEqual({
      top: 48, right: 96, bottom: 48, left: 96,
    });
    expect(parseMargins("0.5in 1in 0.25in", fallback)).toEqual({
      top: 48, right: 96, bottom: 24, left: 96,
    });
    expect(parseMargins("0.5in 1in 0.25in 0.75in", fallback)).toEqual({
      top: 48, right: 96, bottom: 24, left: 72,
    });
  });

  it("uses fallback on bad input", () => {
    expect(parseMargins("garbage", fallback)).toEqual(fallback);
    expect(parseMargins("1in 2in 3in 4in 5in", fallback)).toEqual(fallback);
    expect(parseMargins(undefined, fallback)).toEqual(fallback);
  });
});

describe("parsePaper", () => {
  it("accepts named formats case-insensitively", () => {
    expect(parsePaper("Letter")?.format).toBe("Letter");
    expect(parsePaper("letter")?.format).toBe("Letter");
    expect(parsePaper("A4")?.format).toBe("A4");
  });

  it("accepts custom WxH with x or ×", () => {
    const p1 = parsePaper("13.333in x 7.5in")!;
    expect(p1.format).toBe(null);
    expect(p1.widthIn).toBeCloseTo(13.333);
    expect(p1.heightIn).toBeCloseTo(7.5);

    const p2 = parsePaper("210mm × 297mm")!;
    expect(p2.widthIn).toBeCloseTo(210 / 25.4);
    expect(p2.heightIn).toBeCloseTo(297 / 25.4);
  });

  it("returns null on garbage", () => {
    expect(parsePaper("not a paper")).toBeNull();
    expect(parsePaper("5in")).toBeNull();
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Injection helpers
// ──────────────────────────────────────────────────────────────────────────────

describe("injectStyle", () => {
  it("inserts <style> into <head>", () => {
    const out = injectStyle("<html><head><title>x</title></head><body>hi</body></html>", "p{color:red}");
    expect(out).toMatch(/<head><style data-agentic-theme>p\{color:red\}<\/style><title>/);
  });
  it("wraps bare fragment", () => {
    const out = injectStyle("<p>hello</p>", "p{color:blue}");
    expect(out).toMatch(/^<!doctype html><html><head><style data-agentic-theme>/);
    expect(out).toContain("<body><p>hello</p></body>");
  });
});

describe("themeCss(deck, ...) uses supplied paper", () => {
  it("injects correct @page size", () => {
    const css = themeCss("deck", { paperWidthIn: 13.333, paperHeightIn: 7.5 });
    expect(css).toContain("@page { size: 13.333in 7.5in");
    expect(css).toContain("width: 13.333in; height: 7.5in");
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// The fast path — <5 args produce great output
// ──────────────────────────────────────────────────────────────────────────────

describe("html_to_pdf fast path", () => {
  it("default preset produces a clean Letter document", async () => {
    const out = join(tmp, "doc.pdf");
    const result = await htmlToPdfTool.run(
      {
        html: "<h1>Report</h1><p>Body paragraph with some content.</p>",
        output_path: out,
      },
      { cwd: tmp },
    );
    expect(result).toContain(`Saved PDF to: ${out}`);
    // Default preset = document (Letter, 0.75in margins, document theme)
    expect(result).toMatch(/paper=Letter \(816×1056px, printable 672×912px\)/);
    expect(result).toMatch(/~1page\b/);
    // Theme handles typography → no advice for default preset on sensible HTML.
    expect(result).not.toMatch(/Design advice/);
    assertPdf(out);
  }, 30_000);

  it("auto-appends .pdf to output_path", async () => {
    const result = await htmlToPdfTool.run(
      { html: "<p>hi</p>", output_path: "report" },
      { cwd: tmp },
    );
    const expected = join(tmp, "report.pdf");
    expect(result).toContain(expected);
    assertPdf(expected);
  }, 30_000);

  it("preview_image=true saves a sibling .png", async () => {
    const out = join(tmp, "r.pdf");
    const result = await htmlToPdfTool.run(
      { html: "<h1>X</h1>", output_path: out, preview_image: true },
      { cwd: tmp },
    );
    const expectedPng = join(tmp, "r.png");
    expect(result).toContain(expectedPng);
    assertPng(expectedPng);
  }, 30_000);

  it("preview_image=<path> writes PNG at that path", async () => {
    const out = join(tmp, "a.pdf");
    const preview = join(tmp, "thumb.png");
    await htmlToPdfTool.run(
      { html: "<p>hi</p>", output_path: out, preview_image: preview },
      { cwd: tmp },
    );
    assertPng(preview);
  }, 30_000);
});

// ──────────────────────────────────────────────────────────────────────────────
// Presets are complete bundles (paper + margins + theme + flags)
// ──────────────────────────────────────────────────────────────────────────────

describe("presets", () => {
  it.each([
    ["a4",               /paper=A4 \(/],
    ["letter-landscape", /paper=Letter \(landscape\)/],
    ["legal",            /paper=Legal/],
    ["slides-4x3",       /paper=10in × 7\.5in/],
  ])("preset '%s' selects matching paper", async (preset, re) => {
    const out = join(tmp, `${preset}.pdf`);
    const result = await htmlToPdfTool.run(
      { html: "<h1>P</h1><p>x</p>", output_path: out, preset },
      { cwd: tmp },
    );
    expect(result).toMatch(re);
    assertPdf(out);
  }, 30_000);

  it("preset 'deck' renders one page per <section> without any CSS from the agent", async () => {
    const out = join(tmp, "deck.pdf");
    const result = await htmlToPdfTool.run(
      {
        html:
          "<section class='title'><h1>Title</h1><p>Subtitle</p></section>" +
          "<section><h1>Slide 2</h1><ul><li>One</li><li>Two</li></ul></section>" +
          "<section><h1>Slide 3</h1><p>Final</p></section>",
        output_path: out,
        preset: "deck",
      },
      { cwd: tmp },
    );
    expect(result).toMatch(/paper=13\.333in × 7\.5in \(1280×720px, no margins\)/);
    expect(result).toMatch(/~3pages/);
    expect(result).not.toMatch(/wider than the printable area/);
    assertPdf(out);
  }, 30_000);

  it("unknown preset name throws with the list of valid presets", async () => {
    await expect(
      htmlToPdfTool.run(
        { html: "<p>x</p>", output_path: join(tmp, "x.pdf"), preset: "bogus" },
        { cwd: tmp },
      ),
    ).rejects.toThrow(/unknown preset "bogus"/);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Overrides layered on top of presets
// ──────────────────────────────────────────────────────────────────────────────

describe("overrides", () => {
  it("paper override accepts a named format", async () => {
    const out = join(tmp, "a4.pdf");
    const result = await htmlToPdfTool.run(
      { html: "<p>a</p>", output_path: out, paper: "A4" },
      { cwd: tmp },
    );
    expect(result).toMatch(/paper=A4 /);
    assertPdf(out);
  }, 30_000);

  it("paper override accepts custom WxH", async () => {
    const out = join(tmp, "custom.pdf");
    const result = await htmlToPdfTool.run(
      {
        html: "<p>custom</p>",
        output_path: out,
        paper: "5in x 3in",
        margins: "0.1in",
      },
      { cwd: tmp },
    );
    expect(result).toMatch(/paper=5in × 3in \(480×288px, printable 461×269px\)/);
    assertPdf(out);
  }, 30_000);

  it("margins shorthand overrides preset margins", async () => {
    const out = join(tmp, "mm.pdf");
    const result = await htmlToPdfTool.run(
      { html: "<p>m</p>", output_path: out, margins: "0" },
      { cwd: tmp },
    );
    expect(result).toMatch(/no margins/);
    assertPdf(out);
  }, 30_000);

  it("landscape flips a named format", async () => {
    const out = join(tmp, "l.pdf");
    const result = await htmlToPdfTool.run(
      { html: "<p>l</p>", output_path: out, paper: "Letter", landscape: true },
      { cwd: tmp },
    );
    expect(result).toMatch(/paper=Letter \(landscape\) \(1056×816px/);
    assertPdf(out);
  }, 30_000);

  it("page-count estimate accounts for margins", async () => {
    const out = join(tmp, "pages.pdf");
    // Letter + 0.75in margins → printable height = 11 - 1.5 = 9.5in = 912px
    // 2000px content → ceil(2000/912) = 3 pages
    const result = await htmlToPdfTool.run(
      {
        html: "<!doctype html><html><body style='margin:0'>" +
              "<div style='height:2000px;background:#ddd'>c</div></body></html>",
        output_path: out,
      },
      { cwd: tmp },
    );
    const m = result.match(/~(\d+)pages/);
    expect(m).toBeTruthy();
    expect(Number(m![1])).toBe(3);
    assertPdf(out);
  }, 30_000);

  it("theme='none' disables theme injection", async () => {
    const out = join(tmp, "nostyle.pdf");
    const result = await htmlToPdfTool.run(
      {
        html: "<body style='font-size:6pt'><p>tiny</p></body>",
        output_path: out,
        theme: "none",
      },
      { cwd: tmp },
    );
    // With no theme, the 6pt font should still trigger advice.
    expect(result).toMatch(/Body font-size is/);
    assertPdf(out);
  }, 30_000);
});

// ──────────────────────────────────────────────────────────────────────────────
// Header / footer presets
// ──────────────────────────────────────────────────────────────────────────────

describe("header_footer", () => {
  it("'page-numbers' adds a page-count footer", async () => {
    const out = join(tmp, "pn.pdf");
    await htmlToPdfTool.run(
      {
        html: "<p>x</p>".repeat(1), // single page
        output_path: out,
        header_footer: "page-numbers",
      },
      { cwd: tmp },
    );
    assertPdf(out);
  }, 30_000);

  it("'title-and-pages' works for long content", async () => {
    const out = join(tmp, "tp.pdf");
    const sections = Array.from({ length: 5 }, (_, i) => `<div style='height:400px'>Section ${i}</div>`).join("");
    await htmlToPdfTool.run(
      {
        html: `<!doctype html><html><head><title>Doc</title></head><body style='margin:0'>${sections}</body></html>`,
        output_path: out,
        header_footer: "title-and-pages",
      },
      { cwd: tmp },
    );
    assertPdf(out);
  }, 30_000);

  it("custom_header_html takes precedence", async () => {
    const out = join(tmp, "custom.pdf");
    await htmlToPdfTool.run(
      {
        html: "<p>x</p>",
        output_path: out,
        custom_header_html: "<div style='font-size:10pt'>CUSTOM HEADER</div>",
      },
      { cwd: tmp },
    );
    assertPdf(out);
  }, 30_000);

  it("unknown header_footer throws", async () => {
    await expect(
      htmlToPdfTool.run(
        { html: "<p>x</p>", output_path: join(tmp, "z.pdf"), header_footer: "bogus" },
        { cwd: tmp },
      ),
    ).rejects.toThrow(/unknown header_footer/);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Advanced options
// ──────────────────────────────────────────────────────────────────────────────

describe("advanced options", () => {
  it("wait_for accepts a millisecond number", async () => {
    const out = join(tmp, "w.pdf");
    const before = Date.now();
    await htmlToPdfTool.run(
      { html: "<p>w</p>", output_path: out, wait_for: 200 },
      { cwd: tmp },
    );
    expect(Date.now() - before).toBeGreaterThan(150);
    assertPdf(out);
  }, 30_000);

  it("wait_for accepts a Playwright event name", async () => {
    const out = join(tmp, "e.pdf");
    await htmlToPdfTool.run(
      { html: "<p>w</p>", output_path: out, wait_for: "domcontentloaded" },
      { cwd: tmp },
    );
    assertPdf(out);
  }, 30_000);

  it("wait_for rejects garbage", async () => {
    await expect(
      htmlToPdfTool.run(
        { html: "<p>x</p>", output_path: join(tmp, "x.pdf"), wait_for: "asdf" },
        { cwd: tmp },
      ),
    ).rejects.toThrow(/wait_for must be/);
  });

  it("design_check=false suppresses the advice section", async () => {
    const out = join(tmp, "dc.pdf");
    const result = await htmlToPdfTool.run(
      {
        html: "<body style='font-size:6pt'><p>x</p></body>",
        output_path: out,
        theme: "none",
        design_check: false,
      },
      { cwd: tmp },
    );
    expect(result).not.toMatch(/Design advice/);
    assertPdf(out);
  }, 30_000);
});

// ──────────────────────────────────────────────────────────────────────────────
// Diagnostics quality (warnings + advice)
// ──────────────────────────────────────────────────────────────────────────────

describe("diagnostics", () => {
  it("detects horizontal overflow with offending selector", async () => {
    const out = join(tmp, "of.pdf");
    const result = await htmlToPdfTool.run(
      {
        html:
          "<body style='margin:0'>" +
          "<div class='wide' style='width:2000px;height:50px;background:red'>wide</div></body>",
        output_path: out,
        theme: "none",
      },
      { cwd: tmp },
    );
    expect(result).toMatch(/wider than the printable area/);
    expect(result).toMatch(/<div>/);
    expect(result).toMatch(/\.wide/);
    assertPdf(out);
  }, 30_000);

  it("detects broken images", async () => {
    const out = join(tmp, "bi.pdf");
    const result = await htmlToPdfTool.run(
      {
        html: "<body><img src='http://127.0.0.1:1/missing.png'></body>",
        output_path: out,
        wait_for: "domcontentloaded",
      },
      { cwd: tmp },
    );
    expect(result).toMatch(/broken image/);
    expect(result).toContain("http://127.0.0.1:1/missing.png");
    assertPdf(out);
  }, 30_000);

  it("warns on empty content", async () => {
    const out = join(tmp, "e.pdf");
    const result = await htmlToPdfTool.run(
      { html: "<body></body>", output_path: out, theme: "none" },
      { cwd: tmp },
    );
    expect(result).toMatch(/No visible text or images/);
    assertPdf(out);
  }, 30_000);

  it("default preset suppresses basic typography advice", async () => {
    const ugly = "<h1>Title</h1><p>A bit of body content here.</p>";
    const themed = await htmlCheckTool.run({ html: ugly }, { cwd: tmp });
    expect(themed).not.toMatch(/Tight line-height/);
    expect(themed).not.toMatch(/default serif/);

    const bare = await htmlCheckTool.run(
      {
        html: "<body style='font-size:7pt;line-height:1.05'>" +
              "<p>Tiny and tight paragraph with no structure whatsoever to help.</p></body>",
        theme: "none",
      },
      { cwd: tmp },
    );
    expect(bare).toMatch(/Body font-size is/);
    expect(bare).toMatch(/Tight line-height/);
  }, 30_000);
});

// ──────────────────────────────────────────────────────────────────────────────
// html_check — dry-run sibling of html_to_pdf
// ──────────────────────────────────────────────────────────────────────────────

describe("html_check", () => {
  it("returns diagnostics without creating a PDF", async () => {
    const result = await htmlCheckTool.run(
      { html: "<h1>X</h1><p>body</p>", preset: "a4" },
      { cwd: tmp },
    );
    expect(result).toMatch(/html_check:/);
    expect(result).toMatch(/paper=A4 /);
  }, 30_000);

  it("preview_image=true writes a PNG in cwd", async () => {
    const result = await htmlCheckTool.run(
      { html: "<p>x</p>", preview_image: true },
      { cwd: tmp },
    );
    const m = result.match(/Preview image: (.+\.png)/);
    expect(m).toBeTruthy();
    assertPng(m![1]);
  }, 30_000);

  it("reads from a local file and auto-resolves", async () => {
    const src = join(tmp, "in.html");
    writeFileSync(src, "<p>from file</p>");
    const result = await htmlCheckTool.run({ path: src }, { cwd: tmp });
    expect(result).toContain(`file ${src}`);
  }, 30_000);
});

// ──────────────────────────────────────────────────────────────────────────────
// html_style_guide
// ──────────────────────────────────────────────────────────────────────────────

describe("html_style_guide", () => {
  it("default section is cookbook", async () => {
    const out = await htmlStyleGuideTool.run({}, { cwd: tmp });
    expect(out).toMatch(/# Cookbook/);
    expect(out).toMatch(/FAST PATH/);
    expect(out).toMatch(/PITFALLS/);
  });

  it("'presets' lists every preset with its bundle", async () => {
    const out = await htmlStyleGuideTool.run({ section: "presets" }, { cwd: tmp });
    expect(out).toMatch(/# Presets/);
    for (const name of PRESET_NAMES) {
      expect(out).toContain(name);
    }
  });

  it("'document' returns the theme CSS", async () => {
    const out = await htmlStyleGuideTool.run({ section: "document" }, { cwd: tmp });
    expect(out).toMatch(/theme="document" CSS/);
    expect(out).toMatch(/```css/);
  });

  it("'all' concatenates everything", async () => {
    const out = await htmlStyleGuideTool.run({ section: "all" }, { cwd: tmp });
    expect(out).toMatch(/# Cookbook/);
    expect(out).toMatch(/# Presets/);
    expect(out).toMatch(/# theme="document" CSS/);
    expect(out).toMatch(/# theme="deck" CSS/);
    expect(out).toMatch(/# theme="minimal" CSS/);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Source-selection errors
// ──────────────────────────────────────────────────────────────────────────────

describe("source errors", () => {
  it("requires a source", async () => {
    await expect(
      htmlToPdfTool.run({ output_path: join(tmp, "x.pdf") }, { cwd: tmp }),
    ).rejects.toThrow(/html_to_pdf requires one of: html, path, or url/);
    await expect(htmlCheckTool.run({}, { cwd: tmp })).rejects.toThrow(
      /html_check requires one of: html, path, or url/,
    );
  });

  it("rejects multiple sources", async () => {
    await expect(
      htmlToPdfTool.run(
        { html: "<p>a</p>", url: "http://example.com", output_path: join(tmp, "x.pdf") },
        { cwd: tmp },
      ),
    ).rejects.toThrow(/accepts only one of: html, path, or url/);
  });

  it("propagates read errors from path source", async () => {
    await expect(
      htmlToPdfTool.run(
        { path: join(tmp, "nope.html"), output_path: join(tmp, "o.pdf") },
        { cwd: tmp },
      ),
    ).rejects.toThrow();
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Schema + registration
// ──────────────────────────────────────────────────────────────────────────────

describe("tool definitions + schema", () => {
  it("html_to_pdf has a compact schema (few top-level knobs)", () => {
    const props = Object.keys(htmlToPdfTool.inputSchema.properties ?? {});
    // Sources (3) + output_path + preview_image + preset + header_footer
    // + 5 overrides + ~4 advanced. Cap around 16.
    expect(props.length).toBeLessThanOrEqual(18);
    // Essential args exist
    for (const k of ["html", "path", "url", "output_path", "preset", "header_footer"]) {
      expect(props).toContain(k);
    }
  });

  it("html_check inputSchema mirrors html_to_pdf's (minus output_path)", () => {
    const pdfProps = new Set(Object.keys(htmlToPdfTool.inputSchema.properties ?? {}));
    pdfProps.delete("output_path");
    const checkProps = new Set(Object.keys(htmlCheckTool.inputSchema.properties ?? {}));
    for (const k of pdfProps) expect(checkProps.has(k)).toBe(true);
  });

  it("all three html tools are in BUILTIN_TOOLS and defaultRegistry", () => {
    for (const name of ["html_to_pdf", "html_check", "html_style_guide"]) {
      expect(BUILTIN_TOOLS.some((t) => t.name === name)).toBe(true);
      expect(defaultRegistry.has(name)).toBe(true);
    }
  });

  it("descriptions mention the fast path and diagnostics", () => {
    expect(htmlToPdfTool.description).toMatch(/FAST PATH/);
    expect(htmlToPdfTool.description).toMatch(/preset/);
    expect(htmlToPdfTool.description).toMatch(/DIAGNOSTICS/);
  });

  it("PRESET_NAMES contains expected presets", () => {
    for (const p of ["document", "report", "letter", "a4", "deck", "slides-16x9", "slides-4x3", "minimal", "none"]) {
      expect(PRESET_NAMES).toContain(p);
    }
  });

  it("preview_image=true auto-names PNG when no explicit path", async () => {
    // Smoke: covers the boolean branch specifically
    const out = join(tmp, "auto.pdf");
    const result = await htmlToPdfTool.run(
      { html: "<p>x</p>", output_path: out, preview_image: true },
      { cwd: tmp },
    );
    expect(result).toContain(join(tmp, "auto.png"));
    expect(existsSync(join(tmp, "auto.png"))).toBe(true);
  }, 30_000);
});
