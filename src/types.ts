// Shared modes, configuration, and cached prompt shapes for caveman-milk-pi.

export type CavemanMode =
  | "off"
  | "lite"
  | "full"
  | "ultra"
  | "wenyan-lite"
  | "wenyan"
  | "wenyan-ultra";

export const VALID_MODES: readonly CavemanMode[] = [
  "off",
  "lite",
  "full",
  "ultra",
  "wenyan-lite",
  "wenyan",
  "wenyan-ultra",
] as const;

export interface CavemanConfig {
  schemaVersion: 1;
  mode: CavemanMode;
  /** Publish mode to pi footer via ctx.ui.setStatus. Orthogonal to `mode`. */
  showStatus: boolean;
}

export interface InjectionCache {
  mode: CavemanMode;
  text: string;
  sourceHash: string;
}

export const DEFAULT_CONFIG: CavemanConfig = {
  schemaVersion: 1,
  mode: "off",
  showStatus: true,
};
