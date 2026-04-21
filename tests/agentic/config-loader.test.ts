import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { loadConfigFile, interpolate } from "agentic";

let tmp: string;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "agentic-config-test-"));
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

describe("interpolate", () => {
  it("replaces env vars in strings", () => {
    process.env.TEST_MODEL_VAR = "claude-haiku-4-5";
    const result = interpolate({ defaults: { model: "${TEST_MODEL_VAR}", timeout: 120 } });
    delete process.env.TEST_MODEL_VAR;
    expect((result as { defaults: { model: string; timeout: number } }).defaults.model).toBe("claude-haiku-4-5");
    expect((result as { defaults: { model: string; timeout: number } }).defaults.timeout).toBe(120);
  });

  it("replaces missing env var with empty string", () => {
    delete process.env.MISSING_VAR_XYZ;
    const result = interpolate({ model: "${MISSING_VAR_XYZ}" }) as { model: string };
    expect(result.model).toBe("");
  });

  it("handles arrays recursively", () => {
    process.env.TEST_KEY_VAR = "sk-test";
    const result = interpolate({ keys: ["${TEST_KEY_VAR}", "static"] }) as { keys: string[] };
    delete process.env.TEST_KEY_VAR;
    expect(result.keys[0]).toBe("sk-test");
    expect(result.keys[1]).toBe("static");
  });

  it("passes through non-string values unchanged", () => {
    const result = interpolate({ count: 42, flag: true }) as { count: number; flag: boolean };
    expect(result.count).toBe(42);
    expect(result.flag).toBe(true);
  });
});

describe("loadConfigFile", () => {
  it("returns empty config when no file found in directory", async () => {
    const result = await loadConfigFile(tmp);
    expect(result).toEqual({});
  });

  it("loads agentic.yaml from a directory", async () => {
    writeFileSync(join(tmp, "agentic.yaml"), `
defaults:
  model: claude-sonnet-4-6
  timeout: 300
`);
    const result = await loadConfigFile(tmp);
    expect(result.defaults?.model).toBe("claude-sonnet-4-6");
    expect(result.defaults?.timeout).toBe(300);
  });

  it("loads agentic.yml as a fallback", async () => {
    writeFileSync(join(tmp, "agentic.yml"), `
defaults:
  model: claude-haiku-4-5
`);
    const result = await loadConfigFile(tmp);
    expect(result.defaults?.model).toBe("claude-haiku-4-5");
  });

  it("loads from an explicit file path", async () => {
    const cfgPath = join(tmp, "custom.yaml");
    writeFileSync(cfgPath, `
defaults:
  model: gpt-4o
`);
    const result = await loadConfigFile(cfgPath);
    expect(result.defaults?.model).toBe("gpt-4o");
  });

  it("loads agentic.config.json", async () => {
    const cfg = { defaults: { model: "mistral-large", timeout: 60 } };
    writeFileSync(join(tmp, "agentic.config.json"), JSON.stringify(cfg));
    const result = await loadConfigFile(tmp);
    expect(result.defaults?.model).toBe("mistral-large");
  });

  it("parses full provider config from YAML", async () => {
    writeFileSync(join(tmp, "agentic.yaml"), `
providers:
  anthropic:
    keys:
      - sk-ant-test
    fallbackTo:
      - openai/gpt-4o
resilience:
  retries: 5
`);
    const result = await loadConfigFile(tmp);
    expect(result.providers?.anthropic?.keys).toEqual(["sk-ant-test"]);
    expect(result.providers?.anthropic?.fallbackTo).toEqual(["openai/gpt-4o"]);
    expect(result.resilience?.retries).toBe(5);
  });

  it("interpolates env vars from YAML file", async () => {
    process.env.TEST_YAML_MODEL = "claude-sonnet-4-6";
    writeFileSync(join(tmp, "agentic.yaml"), `
defaults:
  model: \${TEST_YAML_MODEL}
`);
    const result = await loadConfigFile(tmp);
    delete process.env.TEST_YAML_MODEL;
    expect(result.defaults?.model).toBe("claude-sonnet-4-6");
  });
});
