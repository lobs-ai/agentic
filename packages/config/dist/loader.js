/**
 * Config directory resolution and base loader utilities.
 *
 * The config directory is resolved in this priority order:
 *   1. Explicit `configDir` parameter passed to loader functions
 *   2. `AGENT_CONFIG_DIR` environment variable
 *   3. `~/.agent/config` (generic default)
 *
 * This replaces lobs-core's `getLobsRoot()` with a generic, configurable system.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve, join } from "node:path";
// ── Directory resolution ──────────────────────────────────────────────────────
const HOME = process.env.HOME ?? process.env.USERPROFILE ?? "";
/**
 * Get the resolved config directory.
 *
 * Priority:
 *   1. Explicit `configDir` argument
 *   2. `AGENT_CONFIG_DIR` env var
 *   3. `~/.agent/config`
 */
export function getConfigDir(configDir) {
    if (configDir)
        return configDir;
    if (process.env.AGENT_CONFIG_DIR)
        return process.env.AGENT_CONFIG_DIR;
    return resolve(HOME, ".agent", "config");
}
/**
 * Get the secrets subdirectory within a config dir.
 * Secrets (API keys, tokens) live here and should be gitignored.
 */
export function getSecretsDir(configDir) {
    return join(getConfigDir(configDir), "secrets");
}
// ── Runtime config (agent.json) ───────────────────────────────────────────────
/**
 * Load the runtime config from {configDir}/agent.json.
 * Returns an empty object if the file doesn't exist or fails to parse.
 *
 * The runtime config controls server ports, gateway settings, circuit breaker, etc.
 */
export function loadRuntimeConfig(opts) {
    const configPath = process.env.AGENT_CONFIG
        ?? resolve(getConfigDir(opts?.configDir), "agent.json");
    if (!existsSync(configPath))
        return {};
    try {
        return JSON.parse(readFileSync(configPath, "utf-8"));
    }
    catch (err) {
        if (!opts?.silent) {
            console.warn(`[config/loader] Failed to load runtime config from ${configPath}:`, err);
        }
        return {};
    }
}
/**
 * Get the server port for this agent.
 *
 * Priority:
 *   1. `AGENT_PORT` env var
 *   2. `server.port` in agent.json
 *   3. Default port (provided as argument, default 9420)
 */
export function getServerPort(defaultPort = 9420, opts) {
    if (process.env.AGENT_PORT) {
        const parsed = parseInt(process.env.AGENT_PORT, 10);
        if (!isNaN(parsed))
            return parsed;
    }
    const config = loadRuntimeConfig(opts);
    if (config.server?.port)
        return config.server.port;
    return defaultPort;
}
/**
 * Get the gateway config (port + auth token).
 *
 * Priority:
 *   1. `AGENT_GATEWAY_PORT` / `AGENT_GATEWAY_TOKEN` env vars
 *   2. `gateway.*` in agent.json
 *   3. Defaults: port 18789, empty token
 */
export function getGatewayConfig(opts) {
    const config = loadRuntimeConfig(opts);
    const port = process.env.AGENT_GATEWAY_PORT
        ? parseInt(process.env.AGENT_GATEWAY_PORT, 10) || 18789
        : (config.gateway?.port ?? 18789);
    const token = process.env.AGENT_GATEWAY_TOKEN
        ?? config.gateway?.auth?.token
        ?? "";
    return { port, token };
}
// ── Generic JSON loader ───────────────────────────────────────────────────────
/**
 * Load and parse a JSON file from the config directory.
 * Returns undefined if the file doesn't exist or can't be parsed.
 *
 * @param filename - Filename relative to the config dir (e.g. "discord.json")
 * @param opts - Config options
 */
export function loadConfigFile(filename, opts) {
    const path = resolve(getConfigDir(opts?.configDir), filename);
    if (!existsSync(path))
        return undefined;
    try {
        return JSON.parse(readFileSync(path, "utf-8"));
    }
    catch (err) {
        if (!opts?.silent) {
            console.warn(`[config/loader] Failed to load ${path}:`, err);
        }
        return undefined;
    }
}
//# sourceMappingURL=loader.js.map