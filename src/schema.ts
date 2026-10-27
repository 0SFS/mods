/** A mod is an aircraft, an engine, one payload item, or a plugin. */
export type ModKind = "aircraft" | "engine" | "payload" | "plugin";

/** Declarative mods run no code. Rust/WASM is the sandboxed path. JS is the last resort. */
export type ModExecutionMode = "declarative" | "wasm" | "js";

export interface ModDependencySpec {
  /** GitHub shorthand (`0SFS/F135`, `alice/my-plane@v1.2.0`) or an HTTPS URL. */
  source: string;
  /** Optional expected mod id, checked after the manifest is fetched. */
  id?: string;
}

export interface ModProvenance {
  repository: string;
  owner: string;
  commit?: string;
  version?: string;
  license: string;
  authors: readonly string[];
  noticeFiles?: readonly string[];
}

export interface ModWasmEntry {
  /** Path relative to the mod base URL, for example `mod.wasm`. */
  path: string;
  sha256?: string;
  readProperties: readonly string[];
  writeProperties: readonly string[];
}

export interface ModJsEntry {
  /** Last-resort ES module path relative to the mod base URL. */
  path: string;
}

export interface ModEngineContribution {
  id: string;
  label: string;
  summary: string;
  type: "piston" | "turbine";
  jsbsimEngineFiles: readonly string[];
  rotorBlades: {
    outer: number;
    inner: number | null;
    outerEstimated: boolean;
    innerEstimated: boolean;
  };
  startSpeed: { property: string; runningAt: number };
  maxEngineRpm?: number;
  gauges: { primary: string; secondary: string | null; label: string };
  engineAssets?: {
    full: { path: string; triangles: number };
    installed: { path: string; triangles: number };
    rig?: {
      bearingNames: readonly string[];
      bearingInclinationDeg?: number;
      bearingInclinationRad?: number;
      aperture?: unknown;
    };
  };
  exhaustOpticalProfiles?: readonly { id: string; hudAccentHex?: string }[];
  gasSupport?: unknown;
  acousticProfile?: {
    id: string;
    engineClass: string;
    manufacturerFamily: string;
    rendererId: string;
    telemetryId: string;
    label: string;
    approximation: string;
    parameters: unknown;
  };
}

export interface ModStoreDefinition {
  id: number;
  key: string;
  label: string;
  massLbs: number;
  dragAreaFt2: number;
  lengthM: number | null;
  diameterM: number | null;
  spanM: number | null;
  boxM: { length: number; width: number; height: number } | null;
  meshStandIn: boolean;
  meshPath?: string;
  rounds: number | null;
  massNote: string | null;
}

export interface ModExternalTankDefinition {
  key: string;
  label: string;
  capacityLbs: number;
  dryWeightLbs: number;
  meshPath: string;
  credit?: { artist: string; note: string; licence?: string; sourceUrl?: string };
}

export interface ModPayloadContribution {
  payloadType: "store" | "external-tank";
  store?: ModStoreDefinition;
  tank?: ModExternalTankDefinition;
}

/** Aircraft families, definitions, flight profiles and how this airframe hangs payload. */
export interface ModAircraftContribution {
  family: Record<string, unknown>;
  definitions: readonly Record<string, unknown>[];
  fdmProfiles: Readonly<Record<string, Record<string, unknown>>>;
  audio?: { engineDefinitionId: string };
  payloadInstallation?: Record<string, unknown>;
}

export interface OsfsModManifest {
  schemaVersion: 1;
  id: string;
  kind: ModKind;
  name: string;
  summary: string;
  execution: ModExecutionMode;
  provenance: ModProvenance;
  dependencies?: readonly (string | ModDependencySpec)[];
  /** Paths relative to `${baseUrl}/jsbsim-data/`. */
  jsbsimFiles?: readonly string[];
  aircraft?: ModAircraftContribution;
  engine?: ModEngineContribution;
  payload?: ModPayloadContribution;
  wasm?: ModWasmEntry;
  js?: ModJsEntry;
}

export function dependencySource(dependency: string | ModDependencySpec): string {
  return typeof dependency === "string" ? dependency : dependency.source;
}

/** Declarative when neither entry is set, WASM when only wasm is set, JS when js is set. */
export function inferExecution(manifest: Pick<OsfsModManifest, "wasm" | "js">): ModExecutionMode {
  if (manifest.js) return "js";
  if (manifest.wasm) return "wasm";
  return "declarative";
}

export function assertManifest(value: unknown): OsfsModManifest {
  if (!value || typeof value !== "object") throw new Error("A mod manifest must be a JSON object.");
  const manifest = value as Partial<OsfsModManifest>;
  if (manifest.schemaVersion !== 1) throw new Error("Unsupported mod schemaVersion.");
  if (typeof manifest.id !== "string" || !manifest.id) throw new Error("A mod manifest needs an id.");
  if (manifest.kind !== "aircraft" && manifest.kind !== "engine" && manifest.kind !== "payload" && manifest.kind !== "plugin") {
    throw new Error(`Unsupported mod kind: ${String(manifest.kind)}.`);
  }
  if (typeof manifest.name !== "string" || typeof manifest.summary !== "string") throw new Error("A mod manifest needs a name and summary.");
  if (!manifest.provenance || typeof manifest.provenance !== "object") throw new Error("A mod manifest needs provenance.");
  if (typeof manifest.provenance.owner !== "string" || typeof manifest.provenance.repository !== "string" || typeof manifest.provenance.license !== "string") {
    throw new Error("Mod provenance needs an owner, repository and license.");
  }
  const execution = inferExecution(manifest as OsfsModManifest);
  if (manifest.execution !== execution) {
    throw new Error(`Mod ${manifest.id} says execution is ${String(manifest.execution)} but the entries make it ${execution}.`);
  }
  if (manifest.kind === "payload") {
    const payload = manifest.payload;
    if (!payload || (payload.payloadType !== "store" && payload.payloadType !== "external-tank")) {
      throw new Error(`Payload mod ${manifest.id} needs payloadType "store" or "external-tank".`);
    }
    if (payload.payloadType === "store" && !payload.store) throw new Error(`Payload mod ${manifest.id} is missing its store.`);
    if (payload.payloadType === "external-tank" && !payload.tank) throw new Error(`Payload mod ${manifest.id} is missing its tank.`);
  }
  return manifest as OsfsModManifest;
}
