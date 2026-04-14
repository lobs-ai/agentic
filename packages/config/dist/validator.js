/**
 * Config validation — validate config files and report errors clearly.
 *
 * Config directory layout:
 *   {configDir}/                     ← committable config
 *     models.json                    ← model tier definitions
 *     identity.json                  ← bot/owner identity (optional)
 *     agent.json                     ← runtime settings (optional)
 *   {configDir}/secrets/             ← gitignored secrets
 *     keys.json                      ← API keys
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { getConfigDir, getSecretsDir } from "./loader.js";
// ── JSON helpers ──────────────────────────────────────────────────────────────
function parseJson(path) {
    if (!existsSync(path)) {
        return { valid: false, error: "File does not exist" };
    }
    try {
        const content = readFileSync(path, "utf-8");
        const data = JSON.parse(content);
        return { valid: true, data };
    }
    catch (err) {
        return { valid: false, error: `Invalid JSON: ${String(err)}` };
    }
}
// ── Per-file validators ───────────────────────────────────────────────────────
function validateModelsConfig(path) {
    const result = {
        file: "models.json",
        valid: true,
        errors: [],
        warnings: [],
    };
    const parsed = parseJson(path);
    if (!parsed.valid) {
        result.valid = false;
        result.errors.push(parsed.error);
        return result;
    }
    const data = parsed.data;
    // Validate tiers
    if (!data.tiers || typeof data.tiers !== "object") {
        result.errors.push("Missing or invalid 'tiers' object");
        result.valid = false;
    }
    else {
        const requiredTiers = ["micro", "small", "medium", "standard", "strong"];
        const tiers = data.tiers;
        for (const tier of requiredTiers) {
            if (!tiers[tier] || typeof tiers[tier] !== "string") {
                result.errors.push(`Tier '${tier}' is missing or not a string`);
                result.valid = false;
            }
        }
        for (const key of Object.keys(tiers)) {
            if (!requiredTiers.includes(key)) {
                result.warnings.push(`Unknown tier key: '${key}' (will be ignored)`);
            }
        }
    }
    // Validate agents (optional)
    if (data.agents !== undefined) {
        if (typeof data.agents !== "object" || data.agents === null) {
            result.errors.push("'agents' must be an object");
            result.valid = false;
        }
        else {
            for (const [agentType, config] of Object.entries(data.agents)) {
                if (typeof config !== "object" || config === null) {
                    result.errors.push(`Agent '${agentType}' config is not an object`);
                    result.valid = false;
                    continue;
                }
                const agentConfig = config;
                if (!agentConfig.primary || typeof agentConfig.primary !== "string") {
                    result.errors.push(`Agent '${agentType}' missing or invalid 'primary' model`);
                    result.valid = false;
                }
                if (agentConfig.fallbacks !== undefined) {
                    if (!Array.isArray(agentConfig.fallbacks)) {
                        result.errors.push(`Agent '${agentType}' 'fallbacks' must be an array`);
                        result.valid = false;
                    }
                    else if (agentConfig.fallbacks.length === 0) {
                        result.warnings.push(`Agent '${agentType}' has empty fallbacks array`);
                    }
                }
            }
        }
    }
    // Validate local config (optional)
    if (data.local !== undefined) {
        if (typeof data.local !== "object" || data.local === null) {
            result.errors.push("'local' config must be an object");
            result.valid = false;
        }
        else {
            const local = data.local;
            if (!local.baseUrl || typeof local.baseUrl !== "string") {
                result.warnings.push("'local.baseUrl' is missing or invalid");
            }
            if (!local.chatModel || typeof local.chatModel !== "string") {
                result.warnings.push("'local.chatModel' is missing or invalid");
            }
        }
    }
    return result;
}
function validateIdentityConfig(path) {
    const result = {
        file: "identity.json",
        valid: true,
        errors: [],
        warnings: [],
    };
    const parsed = parseJson(path);
    if (!parsed.valid) {
        // identity.json is optional
        result.warnings.push("File does not exist (using defaults)");
        return result;
    }
    const data = parsed.data;
    for (const section of ["bot", "owner"]) {
        if (data[section] !== undefined) {
            const s = data[section];
            if (typeof s !== "object" || s === null) {
                result.errors.push(`'${section}' must be an object`);
                result.valid = false;
                continue;
            }
            if (s.name && typeof s.name !== "string") {
                result.errors.push(`'${section}.name' must be a string`);
                result.valid = false;
            }
            if (s.id && typeof s.id !== "string") {
                result.errors.push(`'${section}.id' must be a string`);
                result.valid = false;
            }
        }
    }
    return result;
}
function validateKeysConfig(path, isLegacy) {
    const result = {
        file: isLegacy ? "keys.json (legacy)" : "secrets/keys.json",
        valid: true,
        errors: [],
        warnings: [],
    };
    const parsed = parseJson(path);
    if (!parsed.valid) {
        result.warnings.push("File does not exist (optional — use env vars instead)");
        return result;
    }
    if (isLegacy) {
        result.warnings.push("Using legacy location — move secrets to secrets/keys.json and gitignore that directory");
    }
    const data = parsed.data;
    if (typeof data !== "object" || data === null) {
        result.errors.push("Root must be an object mapping provider names to key arrays");
        result.valid = false;
        return result;
    }
    for (const [pool, keys] of Object.entries(data)) {
        // Support both array format and { keys: [...] } format
        const keyList = Array.isArray(keys)
            ? keys
            : (keys && typeof keys === "object" && Array.isArray(keys.keys))
                ? keys.keys
                : null;
        if (keyList === null) {
            result.errors.push(`Provider '${pool}' must be an array of keys or { keys: [...], strategy: "sticky-failover" }`);
            result.valid = false;
        }
        else if (keyList.length === 0) {
            result.warnings.push(`Provider '${pool}' has no keys`);
        }
    }
    return result;
}
// ── Public API ────────────────────────────────────────────────────────────────
/**
 * Validate all config files in a config directory.
 *
 * Checks:
 *   - models.json (required)
 *   - identity.json (optional)
 *   - secrets/keys.json or keys.json (optional)
 *
 * @param configDir - Override the config directory (default: getConfigDir())
 */
export function validateAllConfigs(configDir) {
    const dir = getConfigDir(configDir);
    const secretsDir = getSecretsDir(configDir);
    const results = [];
    // Check key layout
    const oldKeysPath = resolve(dir, "keys.json");
    const newKeysPath = resolve(secretsDir, "keys.json");
    const legacyLayout = existsSync(oldKeysPath) && !existsSync(newKeysPath);
    // Validate committed config files
    results.push(validateModelsConfig(resolve(dir, "models.json")));
    results.push(validateIdentityConfig(resolve(dir, "identity.json")));
    // Validate secrets
    if (legacyLayout) {
        results.push(validateKeysConfig(oldKeysPath, true));
    }
    else {
        results.push(validateKeysConfig(newKeysPath, false));
    }
    const valid = results.every((r) => r.valid);
    return {
        valid,
        results,
        secrets: {
            api_keys: existsSync(newKeysPath) || existsSync(oldKeysPath),
        },
        legacy_layout: legacyLayout,
    };
}
/**
 * Validate a models.json config object (in-memory, no file I/O).
 * Useful when building config programmatically.
 */
export function validateModelsObject(data) {
    const result = {
        file: "models (object)",
        valid: true,
        errors: [],
        warnings: [],
    };
    if (!data || typeof data !== "object") {
        result.valid = false;
        result.errors.push("Config must be an object");
        return result;
    }
    const obj = data;
    if (!obj.tiers || typeof obj.tiers !== "object") {
        result.valid = false;
        result.errors.push("Missing required 'tiers' object");
    }
    else {
        const requiredTiers = ["micro", "small", "medium", "standard", "strong"];
        const tiers = obj.tiers;
        for (const tier of requiredTiers) {
            if (!tiers[tier] || typeof tiers[tier] !== "string") {
                result.valid = false;
                result.errors.push(`Tier '${tier}' must be a non-empty string model ID`);
            }
        }
    }
    return result;
}
/**
 * Print validation results to the console in a human-readable format.
 */
export function printValidationResults(result) {
    console.log("=== Config Validation ===\n");
    if (result.legacy_layout) {
        console.log("⚠️  Using LEGACY layout — secrets are in the config root");
        console.log("    Move secrets to {configDir}/secrets/keys.json\n");
    }
    for (const r of result.results) {
        const status = r.valid ? "✓" : "✗";
        console.log(`${status} ${r.file}`);
        if (r.errors.length > 0) {
            console.log("  Errors:");
            for (const err of r.errors) {
                console.log(`    - ${err}`);
            }
        }
        if (r.warnings.length > 0) {
            console.log("  Warnings:");
            for (const warn of r.warnings) {
                console.log(`    - ${warn}`);
            }
        }
        console.log("");
    }
    console.log("Secrets:");
    console.log(`  API keys: ${result.secrets.api_keys ? "✓ present" : "✗ missing"}`);
    console.log("");
    console.log(result.valid ? "✓ All configs valid" : "✗ Some configs have errors");
}
//# sourceMappingURL=validator.js.map