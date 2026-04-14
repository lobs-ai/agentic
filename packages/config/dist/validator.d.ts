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
import type { ValidationResult, AllConfigsResult } from "./types.js";
export type { ValidationResult, AllConfigsResult };
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
export declare function validateAllConfigs(configDir?: string): AllConfigsResult;
/**
 * Validate a models.json config object (in-memory, no file I/O).
 * Useful when building config programmatically.
 */
export declare function validateModelsObject(data: unknown): ValidationResult;
/**
 * Print validation results to the console in a human-readable format.
 */
export declare function printValidationResults(result: AllConfigsResult): void;
//# sourceMappingURL=validator.d.ts.map