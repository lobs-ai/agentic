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
import type { RuntimeConfig, LoadConfigOptions } from "./types.js";
export type { LoadConfigOptions };
/**
 * Get the resolved config directory.
 *
 * Priority:
 *   1. Explicit `configDir` argument
 *   2. `AGENT_CONFIG_DIR` env var
 *   3. `~/.agent/config`
 */
export declare function getConfigDir(configDir?: string): string;
/**
 * Get the secrets subdirectory within a config dir.
 * Secrets (API keys, tokens) live here and should be gitignored.
 */
export declare function getSecretsDir(configDir?: string): string;
/**
 * Load the runtime config from {configDir}/agent.json.
 * Returns an empty object if the file doesn't exist or fails to parse.
 *
 * The runtime config controls server ports, gateway settings, circuit breaker, etc.
 */
export declare function loadRuntimeConfig(opts?: LoadConfigOptions): RuntimeConfig;
/**
 * Get the server port for this agent.
 *
 * Priority:
 *   1. `AGENT_PORT` env var
 *   2. `server.port` in agent.json
 *   3. Default port (provided as argument, default 9420)
 */
export declare function getServerPort(defaultPort?: number, opts?: LoadConfigOptions): number;
/**
 * Get the gateway config (port + auth token).
 *
 * Priority:
 *   1. `AGENT_GATEWAY_PORT` / `AGENT_GATEWAY_TOKEN` env vars
 *   2. `gateway.*` in agent.json
 *   3. Defaults: port 18789, empty token
 */
export declare function getGatewayConfig(opts?: LoadConfigOptions): {
    port: number;
    token: string;
};
/**
 * Load and parse a JSON file from the config directory.
 * Returns undefined if the file doesn't exist or can't be parsed.
 *
 * @param filename - Filename relative to the config dir (e.g. "discord.json")
 * @param opts - Config options
 */
export declare function loadConfigFile<T = unknown>(filename: string, opts?: LoadConfigOptions): T | undefined;
//# sourceMappingURL=loader.d.ts.map