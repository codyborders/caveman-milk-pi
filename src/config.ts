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

const CONFIG_FILENAME = "caveman-milk-pi.json";
const LEGACY_CONFIG_FILENAME = "pi-caveman.json";

/** Resolved config locations, including every prior path we migrate from. */
export interface ConfigPaths {
  configPath: string;
  /** Migration candidates, newest format first. All are optional inputs. */
  legacyConfigPaths: readonly string[];
}

/** Inputs for {@link resolveConfigDirectory}. Defaults read the live process. */
export interface ConfigDirectoryInput {
  env?: Record<string, string | undefined>;
  platform?: NodeJS.Platform;
  homedir?: string;
}

// Config root: explicit override first, then the platform convention.
// linux honors XDG_CONFIG_HOME, darwin uses Application Support, win32 uses
// APPDATA. The old ~/.config location always remains a migration source.
export function resolveConfigDirectory(input: ConfigDirectoryInput = {}): string {
  const env = input.env ?? process.env;
  const platform = input.platform ?? process.platform;
  const homedir = input.homedir ?? os.homedir();

  // Simulated platforms must follow their own path semantics: win32 uses
  // backslash joins and drive-letter resolution, other platforms use POSIX.
  // At runtime platform equals process.platform, so this matches the host.
  const platformPath = platform === "win32" ? path.win32 : path.posix;

  const override = (env.CAVEMAN_MILK_CONFIG_DIR ?? "").trim();
  if (override !== "") {
    return platformPath.resolve(override);
  }

  if (platform === "win32") {
    const appData = (env.APPDATA ?? "").trim();
    if (appData !== "") {
      return platformPath.resolve(appData);
    }
    return platformPath.join(homedir, "AppData", "Roaming");
  }

  if (platform === "darwin") {
    return platformPath.join(homedir, "Library", "Application Support");
  }

  // XDG: a relative XDG_CONFIG_HOME is invalid per spec; use the default.
  const xdg = (env.XDG_CONFIG_HOME ?? "").trim();
  if (xdg !== "" && platformPath.isAbsolute(xdg)) {
    return xdg;
  }
  return platformPath.join(homedir, ".config");
}

export function getConfigPaths(): ConfigPaths {
  const directory = resolveConfigDirectory();
  const configPath = path.join(directory, CONFIG_FILENAME);
  const priorConfigDirectory = path.join(os.homedir(), ".config");
  const legacyConfigPaths = [
    path.join(directory, LEGACY_CONFIG_FILENAME),
    path.join(priorConfigDirectory, CONFIG_FILENAME),
    path.join(priorConfigDirectory, LEGACY_CONFIG_FILENAME),
  ].filter((candidate, index, all) => candidate !== configPath && all.indexOf(candidate) === index);
  return { configPath, legacyConfigPaths };
}

export function getConfigPath(): string {
  return getConfigPaths().configPath;
}

function validateConfigPath(configPath: string): void {
  if (configPath.length === 0) {
    throw new Error("caveman-milk-pi config path must not be empty.");
  }
  if (!path.isAbsolute(configPath)) {
    throw new Error(`caveman-milk-pi config path must be absolute: ${configPath}`);
  }
}

function configPathClause(configPath?: string): string {
  return configPath === undefined ? "" : ` at ${configPath}`;
}

function rejectUnknownFields(
  config: Record<string, unknown>,
  allowedFields: readonly string[],
  configPath?: string,
): void {
  const allowed = new Set(allowedFields);
  const unknownFields = Object.keys(config).filter((field) => !allowed.has(field));
  if (unknownFields.length > 0) {
    throw new Error(
      `caveman-milk-pi config${configPathClause(configPath)}: unknown field${unknownFields.length === 1 ? "" : "s"} ` +
        `'${unknownFields.join("', '")}'.`,
    );
  }
}

export function validateMode(raw: unknown, configPath?: string): CavemanMode {
  if (typeof raw !== "string") {
    throw new Error(
      `caveman-milk-pi config${configPathClause(configPath)}: mode must be a string, got ${typeof raw}. ` +
        `Valid modes: ${VALID_MODES.join(", ")}.` +
        (configPath === undefined ? "" : ` Delete ${configPath} to reset.`),
    );
  }
  if (!(VALID_MODES as readonly string[]).includes(raw)) {
    throw new Error(
      `caveman-milk-pi config${configPathClause(configPath)}: invalid mode '${raw}'. ` +
        `Valid modes: ${VALID_MODES.join(", ")}.` +
        (configPath === undefined ? "" : ` Delete ${configPath} to reset.`),
    );
  }
  return raw as CavemanMode;
}

export function validateConfigShape(raw: unknown, configPath?: string): CavemanConfig {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new Error(
      `caveman-milk-pi config at ${configPath ?? "<unknown path>"} is not a JSON object. ` +
        "Delete the file to reset to defaults.",
    );
  }
  const obj = raw as Record<string, unknown>;
  if (obj.schemaVersion !== 1) {
    throw new Error(
      `caveman-milk-pi config${configPathClause(configPath)}: unsupported schemaVersion '${String(obj.schemaVersion)}'. ` +
        "Delete the file to reset to defaults.",
    );
  }
  rejectUnknownFields(obj, ["schemaVersion", "mode", "showStatus"], configPath);
  const mode = validateMode(obj.mode, configPath);
  if (typeof obj.showStatus !== "boolean") {
    throw new Error(
      `caveman-milk-pi config${configPathClause(configPath)}: showStatus must be a boolean.`,
    );
  }
  return { schemaVersion: 1, mode, showStatus: obj.showStatus };
}

// Legacy flat configs carried an `enabled` flag. No released version ever
// consulted it: injection was keyed on `mode` alone from v0.1.0 onward.
// Migration therefore drops `enabled` and preserves `mode` verbatim, matching
// what the running extension actually did with those files.
export function migrateLegacyConfigShape(raw: unknown, configPath?: string): CavemanConfig {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new Error(
      `caveman-milk-pi config${configPathClause(configPath)}: legacy value must be an object.`,
    );
  }
  const obj = raw as Record<string, unknown>;
  rejectUnknownFields(obj, ["mode", "enabled", "showStatus"], configPath);
  if (obj.enabled !== undefined && typeof obj.enabled !== "boolean") {
    throw new Error(
      `caveman-milk-pi config${configPathClause(configPath)}: legacy enabled must be a boolean.`,
    );
  }
  const showStatus = obj.showStatus === undefined ? true : obj.showStatus;
  if (typeof showStatus !== "boolean") {
    throw new Error(
      `caveman-milk-pi config${configPathClause(configPath)}: showStatus must be a boolean.`,
    );
  }
  return { schemaVersion: 1, mode: validateMode(obj.mode, configPath), showStatus };
}

function migrateFileTo(fromPath: string, toPath: string): void {
  fs.mkdirSync(path.dirname(toPath), { recursive: true });
  try {
    fs.renameSync(fromPath, toPath);
  } catch (error) {
    // Cross-device prior paths cannot be renamed; copy then remove.
    if ((error as NodeJS.ErrnoException).code !== "EXDEV") throw error;
    fs.copyFileSync(fromPath, toPath);
    fs.unlinkSync(fromPath);
  }
  // Prior releases wrote 0644; migrated files adopt the 0600 default.
  // Permission normalization must not fail an otherwise successful migration.
  try {
    fs.chmodSync(toPath, 0o600);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EPERM") throw error;
  }
}

function normalizeLegacyPaths(
  configPath: string,
  legacyConfigPath?: string | readonly string[],
): readonly string[] {
  if (legacyConfigPath === undefined) return [];
  const candidates = typeof legacyConfigPath === "string" ? [legacyConfigPath] : [...legacyConfigPath];
  return candidates.filter(
    (candidate, index) => path.resolve(candidate) !== path.resolve(configPath) && candidates.indexOf(candidate) === index,
  );
}

export function loadConfigAtPath(
  configPath: string,
  legacyConfigPath?: string | readonly string[],
): CavemanConfig {
  validateConfigPath(configPath);
  for (const candidate of normalizeLegacyPaths(configPath, legacyConfigPath)) {
    validateConfigPath(candidate);
  }
  if (!fs.existsSync(configPath)) {
    for (const candidate of normalizeLegacyPaths(configPath, legacyConfigPath)) {
      if (!fs.existsSync(candidate)) continue;
      try {
        migrateFileTo(candidate, configPath);
        break;
      } catch (error) {
        // Another process migrated it first; load whatever landed at the target.
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    }
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
    const migrated = migrateLegacyConfigShape(parsed, configPath);
    saveConfigAtPath(migrated, configPath);
    return migrated;
  }

  return validateConfigShape(parsed, configPath);
}

export function loadConfig(): CavemanConfig {
  const paths = getConfigPaths();
  return loadConfigAtPath(paths.configPath, paths.legacyConfigPaths);
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
  saveConfigAtPath(config, getConfigPath());
}

// ---------------------------------------------------------------------------
// Locked updates
// ---------------------------------------------------------------------------

/** Options for the same-directory config lock. All times are milliseconds. */
export interface LockOptions {
  /** A lock older than this is considered crashed and may be recovered. */
  staleAfterMs?: number;
  /** Total time a waiter polls before failing with a clear error. */
  maxWaitMs?: number;
  /** Delay between acquisition attempts while waiting. */
  pollIntervalMs?: number;
}

/** Options for {@link updateConfigAtPath}. */
export interface UpdateConfigOptions extends LockOptions {
  /** Migration candidates checked when the target is missing. */
  legacyConfigPath?: string | readonly string[];
}

interface ResolvedLockOptions {
  staleAfterMs: number;
  maxWaitMs: number;
  pollIntervalMs: number;
}

// Locks are held for milliseconds (read JSON, mutate, atomic rename), so a
// lock untouched for ten seconds belongs to a crashed writer. Waiting is
// bounded past the stale threshold so a crashed writer can never block a
// configuration change permanently.
const DEFAULT_LOCK_OPTIONS: ResolvedLockOptions = {
  staleAfterMs: 10_000,
  maxWaitMs: 15_000,
  pollIntervalMs: 25,
};

function resolveLockOptions(options?: LockOptions): ResolvedLockOptions {
  return { ...DEFAULT_LOCK_OPTIONS, ...options };
}

function lockPathFor(configPath: string): string {
  return `${configPath}.lock`;
}

interface LockOwner {
  token: string;
  pid: number;
  createdMs: number;
}

function createLockOwner(): LockOwner {
  return {
    token: `${process.pid}:${crypto.randomBytes(12).toString("hex")}`,
    pid: process.pid,
    createdMs: Date.now(),
  };
}

function isENOENT(error: unknown): boolean {
  return (error as NodeJS.ErrnoException).code === "ENOENT";
}

function tryCreateLock(lockPath: string, owner: LockOwner): boolean {
  let handle: number;
  try {
    handle = fs.openSync(lockPath, "wx", 0o600);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") return false;
    throw error;
  }
  try {
    fs.writeSync(handle, Buffer.from(JSON.stringify(owner) + "\n", "utf8"));
  } finally {
    fs.closeSync(handle);
  }
  return true;
}

// Conservative stale recovery. A lock is stale only when its mtime is older
// than staleAfterMs AND a second stat matches the first. The lock is renamed
// aside before deletion so two recoverers cannot both claim it. Live owner
// locks are never deleted here: a fresh mtime or a mtime change between the
// two stats aborts recovery.
function tryRecoverStaleLock(lockPath: string, staleAfterMs: number): boolean {
  let first: fs.Stats;
  try {
    first = fs.statSync(lockPath);
  } catch (error) {
    if (isENOENT(error)) return false;
    throw error;
  }
  if (Date.now() - first.mtimeMs < staleAfterMs) return false;
  let content: string;
  try {
    content = fs.readFileSync(lockPath, "utf8");
  } catch (error) {
    if (isENOENT(error)) return false;
    throw error;
  }
  let second: fs.Stats;
  try {
    second = fs.statSync(lockPath);
  } catch (error) {
    if (isENOENT(error)) return false;
    throw error;
  }
  if (second.mtimeMs !== first.mtimeMs || second.size !== first.size) return false;

  const quarantinePath = `${lockPath}.stale.${crypto.randomBytes(6).toString("hex")}`;
  try {
    fs.renameSync(lockPath, quarantinePath);
  } catch (error) {
    // Another process recovered the stale lock first; the caller retries
    // acquisition immediately.
    if (isENOENT(error)) return false;
    throw error;
  }

  // Verify the quarantined bytes are the bytes we validated. A mismatch
  // means a live owner replaced the lock between validation and the rename:
  // restore the stolen lock instead of deleting it. Never clobber a newer
  // lock another waiter may already have created at the lock path.
  try {
    const quarantined = fs.readFileSync(quarantinePath, "utf8");
    if (quarantined !== content) {
      if (!fs.existsSync(lockPath)) {
        try {
          fs.renameSync(quarantinePath, lockPath);
        } catch (restoreError) {
          if (!isENOENT(restoreError)) throw restoreError;
        }
      }
      return false;
    }
  } catch (error) {
    if (!isENOENT(error)) throw error;
    return false;
  }
  try {
    fs.unlinkSync(quarantinePath);
  } catch (error) {
    if (!isENOENT(error)) throw error;
  }
  return true;
}

// Release deletes the lock only when it still carries our ownership token.
// A dispossessed owner (its stale lock was recovered mid-update) leaves the
// new owner's lock untouched.
function releaseLock(lockPath: string, owner: LockOwner): void {
  let content: string;
  try {
    content = fs.readFileSync(lockPath, "utf8");
  } catch (error) {
    if (isENOENT(error)) return;
    throw error;
  }
  try {
    const parsed = JSON.parse(content) as Partial<LockOwner>;
    if (parsed.token !== owner.token) return;
    fs.unlinkSync(lockPath);
  } catch (error) {
    if (isENOENT(error)) return;
    // Unreadable or malformed lock content: not provably ours, leave it.
    if (error instanceof SyntaxError) return;
    throw error;
  }
}

async function acquireLock(
  lockPath: string,
  owner: LockOwner,
  options: ResolvedLockOptions,
): Promise<void> {
  const deadline = Date.now() + options.maxWaitMs;
  for (;;) {
    if (tryCreateLock(lockPath, owner)) return;
    const recovered = tryRecoverStaleLock(lockPath, options.staleAfterMs);
    if (Date.now() >= deadline) {
      if (tryCreateLock(lockPath, owner)) return;
      throw new Error(
        `caveman-milk-pi config lock at ${lockPath} was not acquired within ` +
          `${options.maxWaitMs}ms. Another process may hold it. ` +
          `The lock recovers automatically after ${options.staleAfterMs}ms of inactivity.`,
      );
    }
    // After a recovery (ours or another process's) the lock path may be free
    // this instant: retry acquisition immediately instead of sleeping.
    if (!recovered) {
      await new Promise((resolve) => setTimeout(resolve, options.pollIntervalMs));
    }
  }
}

function changedFieldCount(before: CavemanConfig, after: CavemanConfig): number {
  let changed = 0;
  if (after.mode !== before.mode) changed += 1;
  if (after.showStatus !== before.showStatus) changed += 1;
  return changed;
}

function assertSingleFieldUpdate(
  configPath: string,
  before: CavemanConfig,
  after: CavemanConfig,
): void {
  if (after.schemaVersion !== before.schemaVersion) {
    throw new Error(
      `caveman-milk-pi config update at ${configPath}: mutator changed schemaVersion ` +
        `from ${before.schemaVersion} to ${after.schemaVersion}.`,
    );
  }
  const changedFields: string[] = [];
  if (after.mode !== before.mode) changedFields.push("mode");
  if (after.showStatus !== before.showStatus) changedFields.push("showStatus");
  if (changedFields.length > 1) {
    throw new Error(
      `caveman-milk-pi config update at ${configPath}: mutator changed multiple ` +
        `fields (${changedFields.join(", ")}). Change one field per locked update ` +
        `so concurrent writers cannot lose each other's changes.`,
    );
  }
}

// updateConfigAtPath is the concurrent-safe write path: acquire the
// same-directory lock, reload the latest valid config (including first-run
// creation and legacy migration), apply exactly one field-level change, save
// atomically with mode 0600, then release only our own lock.
export async function updateConfigAtPath(
  configPath: string,
  mutator: (config: CavemanConfig) => CavemanConfig,
  options?: UpdateConfigOptions,
): Promise<CavemanConfig> {
  validateConfigPath(configPath);
  const { legacyConfigPath, ...lockOptions } = options ?? {};
  const resolvedLockOptions = resolveLockOptions(lockOptions);
  const lockPath = lockPathFor(configPath);
  fs.mkdirSync(path.dirname(configPath), { recursive: true });

  const owner = createLockOwner();
  await acquireLock(lockPath, owner, resolvedLockOptions);
  let updated: CavemanConfig;
  try {
    const latest = loadConfigAtPath(configPath, legacyConfigPath);
    const next = mutator(latest);
    assertSingleFieldUpdate(configPath, latest, next);
    // A mutator may change zero fields (no-op) or exactly one. No-op updates
    // reload under the lock but skip the write: the file keeps its bytes,
    // permissions, and modification time.
    if (next !== latest && changedFieldCount(latest, next) > 0) {
      saveConfigAtPath(next, configPath);
    }
    updated = next;
  } catch (updateError) {
    // The release must not mask the original failure: surface both.
    try {
      releaseLock(lockPath, owner);
    } catch (releaseError) {
      throw new AggregateError(
        [updateError, releaseError],
        `caveman-milk-pi config update at ${configPath} failed and its lock release also failed.`,
      );
    }
    throw updateError;
  }
  releaseLock(lockPath, owner);
  return updated;
}

export async function updateConfig(
  mutator: (config: CavemanConfig) => CavemanConfig,
  options?: Omit<UpdateConfigOptions, "legacyConfigPath">,
): Promise<CavemanConfig> {
  const paths = getConfigPaths();
  return updateConfigAtPath(paths.configPath, mutator, {
    legacyConfigPath: paths.legacyConfigPaths,
    ...options,
  });
}
