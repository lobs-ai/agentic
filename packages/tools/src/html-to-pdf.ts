/**
 * html_to_pdf — render HTML to a PDF file using headless Chromium (Playwright).
 *
 * Accepts HTML from one of three sources (in priority order):
 *   1. `html`  — inline HTML string
 *   2. `path`  — local .html file (resolved relative to cwd)
 *   3. `url`   — remote http(s) URL
 *
 * Output is written to `output_path`. The `.pdf` extension is added if missing.
 *
 * Uses the shared `browserService` browser, so it reuses the same Chromium
 * instance as web_fetch and web_search.
 */

import { readFile } from "node:fs/promises";
import { browserService } from "./browser-service.js";
import { BaseTool, type ToolContext } from "./base-tool.js";
import { resolveToCwd } from "./path-utils.js";
import type { ToolExecutorResult } from "./types.js";

type PdfFormat =
  | "Letter"
  | "Legal"
  | "Tabloid"
  | "Ledger"
  | "A0"
  | "A1"
  | "A2"
  | "A3"
  | "A4"
  | "A5"
  | "A6";

interface PdfMargin {
  top?: string;
  right?: string;
  bottom?: string;
  left?: string;
}

interface PdfOptions {
  path: string;
  format?: PdfFormat;
  width?: string;
  height?: string;
  landscape?: boolean;
  printBackground?: boolean;
  scale?: number;
  margin?: PdfMargin;
  displayHeaderFooter?: boolean;
  headerTemplate?: string;
  footerTemplate?: string;
  pageRanges?: string;
  preferCSSPageSize?: boolean;
}

export class HtmlToPdfTool extends BaseTool {
  readonly name = "html_to_pdf";
  readonly tags = ["pdf", "html", "write"] as const;
  readonly description =
    "Render HTML to a PDF file using headless Chromium. " +
    "Source: inline HTML string, local .html file path, or http(s) URL — provide exactly one. " +
    "Supports standard paper formats (A4, Letter, etc.), custom dimensions, margins, landscape, " +
    "background colors/images, scaling, page ranges, and header/footer templates. " +
    "The header/footer templates use Playwright-supported classes: " +
    "`date`, `title`, `url`, `pageNumber`, `totalPages`.";
  readonly inputSchema = {
    type: "object" as const,
    properties: {
      html: {
        type: "string",
        description: "Inline HTML content. Mutually exclusive with path and url.",
      },
      path: {
        type: "string",
        description: "Path to a local .html file (relative to cwd or absolute). Mutually exclusive with html and url.",
      },
      url: {
        type: "string",
        description: "http(s) URL to render. Mutually exclusive with html and path.",
      },
      output_path: {
        type: "string",
        description: "Output .pdf path (relative to cwd or absolute). Extension added if omitted.",
      },
      format: {
        type: "string",
        enum: ["Letter", "Legal", "Tabloid", "Ledger", "A0", "A1", "A2", "A3", "A4", "A5", "A6"],
        description: "Paper format. Default: Letter. Ignored if width/height are set.",
      },
      width: {
        type: "string",
        description: "Custom paper width (e.g. '8.5in', '210mm', '800px'). Overrides format.",
      },
      height: {
        type: "string",
        description: "Custom paper height (e.g. '11in', '297mm'). Overrides format.",
      },
      landscape: { type: "boolean", description: "Landscape orientation. Default false." },
      print_background: {
        type: "boolean",
        description: "Include background colors/images. Default true.",
      },
      scale: {
        type: "number",
        description: "Render scale 0.1–2.0. Default 1.",
      },
      margin_top: { type: "string", description: "Top margin (e.g. '0.5in', '10mm'). Default '0.4in'." },
      margin_right: { type: "string", description: "Right margin. Default '0.4in'." },
      margin_bottom: { type: "string", description: "Bottom margin. Default '0.4in'." },
      margin_left: { type: "string", description: "Left margin. Default '0.4in'." },
      page_ranges: {
        type: "string",
        description: "Pages to print, e.g. '1-5,8,11-13'. Default: all pages.",
      },
      header_html: {
        type: "string",
        description:
          "HTML template for the page header. Requires display_header_footer=true. " +
          "Use elements with class 'date', 'title', 'url', 'pageNumber', 'totalPages' for dynamic values.",
      },
      footer_html: {
        type: "string",
        description: "HTML template for the page footer. Same rules as header_html.",
      },
      display_header_footer: {
        type: "boolean",
        description: "Show header/footer. Enabled automatically if header_html or footer_html is set.",
      },
      prefer_css_page_size: {
        type: "boolean",
        description: "Use @page CSS size declarations instead of format/width/height. Default false.",
      },
      wait_until: {
        type: "string",
        enum: ["load", "domcontentloaded", "networkidle", "commit"],
        description: "Navigation readiness signal. Default 'networkidle' (waits for all resources).",
      },
      wait_ms: {
        type: "number",
        description: "Extra delay in ms after load (for JS-driven rendering). Default 0.",
      },
      emulate_media: {
        type: "string",
        enum: ["screen", "print"],
        description: "CSS media type to emulate. Default 'print'.",
      },
    },
    required: ["output_path"],
  };

  async run(params: Record<string, unknown>, ctx: ToolContext): Promise<ToolExecutorResult> {
    const html = params.html as string | undefined;
    const srcPath = params.path as string | undefined;
    const url = params.url as string | undefined;

    const sources = [html, srcPath, url].filter((v) => v !== undefined).length;
    if (sources === 0) {
      throw new Error("html_to_pdf requires one of: html, path, or url.");
    }
    if (sources > 1) {
      throw new Error("html_to_pdf accepts only one of: html, path, or url.");
    }

    // Resolve output path
    let outPath = params.output_path as string;
    outPath = resolveToCwd(outPath, ctx.cwd);
    if (!outPath.toLowerCase().endsWith(".pdf")) outPath += ".pdf";

    // Resolve HTML content
    let content: string | null = null;
    let gotoUrl: string | null = null;
    if (html !== undefined) {
      content = html;
    } else if (srcPath !== undefined) {
      const resolved = resolveToCwd(srcPath, ctx.cwd);
      content = await readFile(resolved, "utf8");
    } else {
      gotoUrl = url!;
    }

    const browserCtx = await browserService.ensureBrowser();
    const page = await browserCtx.newPage();

    try {
      const waitUntil =
        (params.wait_until as "load" | "domcontentloaded" | "networkidle" | "commit" | undefined) ??
        "networkidle";

      if (content !== null) {
        await page.setContent(content, { waitUntil, timeout: 30_000 });
      } else {
        await page.goto(gotoUrl!, { waitUntil, timeout: 30_000 });
      }

      const emulate = (params.emulate_media as "screen" | "print" | undefined) ?? "print";
      await page.emulateMedia({ media: emulate });

      if (params.wait_ms !== undefined) {
        await page.waitForTimeout(params.wait_ms as number);
      }

      // Build PDF options
      const headerHtml = params.header_html as string | undefined;
      const footerHtml = params.footer_html as string | undefined;
      const displayHF =
        (params.display_header_footer as boolean | undefined) ??
        (headerHtml !== undefined || footerHtml !== undefined);

      const margin: PdfMargin = {
        top: (params.margin_top as string | undefined) ?? "0.4in",
        right: (params.margin_right as string | undefined) ?? "0.4in",
        bottom: (params.margin_bottom as string | undefined) ?? "0.4in",
        left: (params.margin_left as string | undefined) ?? "0.4in",
      };

      const pdfOpts: PdfOptions = {
        path: outPath,
        printBackground: (params.print_background as boolean | undefined) ?? true,
        landscape: (params.landscape as boolean | undefined) ?? false,
        margin,
      };

      const hasCustomSize = params.width !== undefined || params.height !== undefined;
      if (hasCustomSize) {
        if (params.width) pdfOpts.width = params.width as string;
        if (params.height) pdfOpts.height = params.height as string;
      } else {
        pdfOpts.format = (params.format as PdfFormat | undefined) ?? "Letter";
      }

      if (params.scale !== undefined) pdfOpts.scale = params.scale as number;
      if (params.page_ranges) pdfOpts.pageRanges = params.page_ranges as string;
      if (params.prefer_css_page_size) pdfOpts.preferCSSPageSize = true;

      if (displayHF) {
        pdfOpts.displayHeaderFooter = true;
        pdfOpts.headerTemplate = headerHtml ?? "<div></div>";
        pdfOpts.footerTemplate = footerHtml ?? "<div></div>";
      }

      await page.pdf(pdfOpts);
    } finally {
      await page.close();
    }

    return `Saved PDF to: ${outPath}`;
  }
}

export const htmlToPdfTool = new HtmlToPdfTool();
