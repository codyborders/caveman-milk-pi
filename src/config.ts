// Config load/save for caveman-milk-pi.
//
// Transform: ~/.config/caveman-milk-pi.json  ->  CavemanConfig
// Invalid data stops loading instead of falling back to partial defaults.
//
// The "default config when file missing" case is NOT a fallback on
// error. A missing file is a valid first-run state that we write a
// fresh default into. A malformed file IS an error and must crash.
//
// One-shot legacy migration: if the old pi-caveman.json exists and
// the new caveman-milk-pi.json does not, rename it. v0.1.x users
// transitioning to v0.2.x get their persisted mode preserved with
// no manual action.

import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import type { CavemanConfig, CavemanMode } from "./types.js";
import { DEFAULT_CONFIG, VALID_MODES } from "./types.js";

const CONFIG_DIR = path.join(os.homedir(), ".config");
const CONFIG_PATH = path.join(CONFIG_DIR, "caveman-milk-pi.json");
const LEGACY_CONFIG_PATH = path.join(CONFIG_DIR, "pi-caveman.json");

export function getConfigPath(): string {
  return CONFIG_PATH;
}

function validateConfigPath(configPath: string): void {
  if (configPath.length === 0) {
    throw new Error("caveman-milk-pi config path must not be empty.");
  }
  if (!path.isAbsolute(configPath)) {
    throw new Error(`caveman-milk-pi config path must be absolute: ${configPath}`);
  }
}

function rejectUnknownFields(
  config: Record<string, unknown>,
  allowedFields: readonly string[],
): void {
  const allowed = new Set(allowedFields);
  const unknownFields = Object.keys(config).filter((field) => !allowed.has(field));
  if (unknownFields.length > 0) {
    throw new Error(
      `caveman-milk-pi config: unknown field${unknownFields.length === 1 ? "" : "s"} ` +
        `'${unknownFields.join("', '")}'.`,
    );
  }
}

export function validateMode(raw: unknown): CavemanMode {
  if (typeof raw !== "string") {
    throw new Error(
      `caveman-milk-pi config: mode must be a string, got ${typeof raw}. ` +
        `Valid modes: ${VALID_MODES.join(", ")}. ` +
        `Delete ${CONFIG_PATH} to reset.`,
    );
  }
  if (!(VALID_MODES as readonly string[]).includes(raw)) {
    throw new Error(
      `caveman-milk-pi config: invalid mode '${raw}'. ` +
        `Valid modes: ${VALID_MODES.join(", ")}. ` +
        `Delete ${CONFIG_PATH} to reset.`,
    );
  }
  return raw as CavemanMode;
}

export function validateConfigShape(raw: unknown): CavemanConfig {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new Error(
      `caveman-milk-pi config at ${CONFIG_PATH} is not a JSON object. ` +
        "Delete the file to reset to defaults.",
    );
  }
  const obj = raw as Record<string, unknown>;
  if (obj.schemaVersion !== 1) {
    throw new Error(
      `caveman-milk-pi config: unsupported schemaVersion '${String(obj.schemaVersion)}'. ` +
        "Delete the file to reset to defaults.",
    );
  }
  rejectUnknownFields(obj, ["schemaVersion", "mode", "showStatus"]);
  const mode = validateMode(obj.mode);
  if (typeof obj.showStatus !== "boolean") {
    throw new Error("caveman-milk-pi config: showStatus must be a boolean.");
  }
  return { schemaVersion: 1, mode, showStatus: obj.showStatus };
}

export function migrateLegacyConfigShape(raw: unknown): CavemanConfig {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new Error("caveman-milk-pi config: legacy value must be an object.");
  }
  const obj = raw as Record<string, unknown>;
  rejectUnknownFields(obj, ["mode", "enabled", "showStatus"]);
  if (obj.enabled !== undefined && typeof obj.enabled !== "boolean") {
    throw new Error("caveman-milk-pi config: legacy enabled must be a boolean.");
  }
  const showStatus = obj.showStatus === undefined ? true : obj.showStatus;
  if (typeof showStatus !== "boolean") {
    throw new Error("caveman-milk-pi config: showStatus must be a boolean.");
  }
  return { schemaVersion: 1, mode: validateMode(obj.mode), showStatus };
}

export function loadConfigAtPath(
  configPath: string,
  legacyConfigPath?: string,
): CavemanConfig {
  validateConfigPath(configPath);
  if (legacyConfigPath !== undefined) validateConfigPath(legacyConfigPath);
  if (
    legacyConfigPath !== undefined &&
    fs.existsSync(legacyConfigPath) &&
    !fs.existsSync(configPath)
  ) {
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.renameSync(legacyConfigPath, configPath);
  }

  if (!fs.existsSync(configPath)) {
    saveConfigAtPath(DEFAULT_CONFIG, configPath);
    return { ...DEFAULT_CONFIG };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(configPath, "utf8")) as unknown;
  } catch (error) {
    throw new Error(`caveman-milk-pi config at ${configPath} contains invalid JSON.`, {
      cause: error,
    });
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error(
      `caveman-milk-pi config at ${configPath} is not a JSON object. ` +
        "Delete the file to reset to defaults.",
    );
  }

  if (!("schemaVersion" in parsed)) {
    const migrated = migrateLegacyConfigShape(parsed);
    saveConfigAtPath(migrated, configPath);
    return migrated;
  }

  return validateConfigShape(parsed);
}

export function loadConfig(): CavemanConfig {
  return loadConfigAtPath(CONFIG_PATH, LEGACY_CONFIG_PATH);
}

export function saveConfigAtPath(
  config: CavemanConfig,
  configPath: string,
): void {
  validateConfigPath(configPath);
  validateConfigShape(config);
  const configDirectory = path.dirname(configPath);
  fs.mkdirSync(configDirectory, { recursive: true });

  const randomSuffix = crypto.randomBytes(8).toString("hex");
  const tempPath = path.join(
    configDirectory,
    `.${path.basename(configPath)}.${process.pid}.${randomSuffix}.tmp`,
  );

  try {
    fs.writeFileSync(tempPath, JSON.stringify(config, null, 2) + "\n", {
      encoding: "utf8",
      flag: "wx",
      mode: 0o600,
    });
    fs.renameSync(tempPath, configPath);
  } catch (error) {
    try {
      fs.unlinkSync(tempPath);
    } catch (cleanupError) {
      if ((cleanupError as NodeJS.ErrnoException).code !== "ENOENT") {
        throw new AggregateError(
          [error, cleanupError],
          "caveman-milk-pi config write and temporary-file cleanup both failed.",
        );
      }
    }
    throw error;
  }
}

export function saveConfig(config: CavemanConfig): void {
  saveConfigAtPath(config, CONFIG_PATH);
}
