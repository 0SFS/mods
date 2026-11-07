/**
 * What a mod contributes. An aircraft, an engine, a component shared by other mods
 * (a propeller, a gimbal, a camera, a flight model), one payload item, a plugin,
 * one celestial body, or one mission. A modpack contributes nothing itself: it
 * lists the mods to install together.
 */
export const MOD_KINDS = ["aircraft", "engine", "component", "payload", "plugin", "body", "mission", "modpack"] as const;
export type ModKind = (typeof MOD_KINDS)[number];

/** The Kármán line. The atmospheric envelope stops here, and space flight begins here. */
export const SPACE_DEPARTURE_ALTITUDE_M = 100_000;

/** The keys that carry a mod's own content. A modpack has none of them. */
const CONTENT_KEYS = ["aircraft", "engine", "payload", "jsbsimFiles", "quadcopter", "dji", "quad", "camera", "cameraPreview", "audioRenderer", "space", "body", "mission", "wasm", "js"] as const;

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

/** Numeric source generator loaded inside the sound worklet, never as a flight JS module. */
export interface ModAudioRendererContribution {
  apiVersion: 1;
  abi: "osfs-engine-voice-v1";
  rendererId: string;
  engineClasses: readonly string[];
  telemetrySchemaIds: readonly string[];
  wasm: { path: string; sha256: string };
}

/** Optional live-view provider. Its JS module exports createCameraPreview. */
export interface CameraPreviewModData {
  apiVersion: 1;
}

/** Earth, as the space plugin declares it. Other bodies are `body` mods. */
export interface SpaceEarthData {
  id: "earth";
  gravitationalParameterM3S2: number;
  equatorialRadiusM: number;
  soiRadiusM: number;
  rotationRadS: number;
}

/** Opt-in space flight. Present only on the `0sfs/space` plugin. */
export interface SpaceModData {
  apiVersion: 1;
  originBodyId: "earth";
  departureAltitudeM: number;
  earth: SpaceEarthData;
}

/** Keplerian elements of a body that orbits Earth, in Earth-centered inertial axes. */
export interface BodyOrbitData {
  semiMajorAxisM: number;
  eccentricity: number;
  inclinationRad: number;
  longitudeOfAscendingNodeRad: number;
  argumentOfPeriapsisRad: number;
  meanAnomalyAtEpochRad: number;
  /** Seconds on the space session clock. The session starts this clock at zero when space is installed. */
  epochSeconds: number;
}

/**
 * One celestial body other than Earth. Its orbit is around Earth.
 * `rotationRadS` is spin about the orbit normal relative to the meridian that
 * faces Earth: zero keeps longitude 0 aimed at Earth.
 */
export interface BodyModData {
  apiVersion: 1;
  id: string;
  name: string;
  gravitationalParameterM3S2: number;
  equatorialRadiusM: number;
  soiRadiusM: number;
  rotationRadS: number;
  parentBodyId: "earth";
  orbit: BodyOrbitData;
}

export type MissionCompleteWhen =
  | { kind: "altitude-below"; altMeters: number }
  | { kind: "altitude-above"; altMeters: number }
  | { kind: "speed-below"; speedMps: number }
  | { kind: "body"; bodyId: string };

export interface MissionPhaseData {
  id: string;
  label: string;
  completeWhen: MissionCompleteWhen;
}

/** A start on a body's surface frame. Altitude is metres above that body's radius. */
export interface MissionStartData {
  frame: "body-fixed";
  bodyId: string;
  latDeg: number;
  lonDeg: number;
  altMeters: number;
  headingDeg: number;
  northMps: number;
  eastMps: number;
  upMps: number;
}

/** One scenario. It runs only after the space plugin and the bodies it names are installed. */
export interface MissionModData {
  apiVersion: 1;
  id: string;
  name: string;
  summary: string;
  bodyId: string;
  requiredBodyIds: readonly string[];
  start: MissionStartData;
  phases: readonly MissionPhaseData[];
}

export interface ElectricPropellerData {
  radiusM: number;
  blades: number;
  chordM: number;
  pitchM: number;
  zeroLiftDeg: number;
  liftSlope: number;
  profileDrag: number;
  inertiaKgM2: number;
  timeConstantS: number;
  maxRpm: number;
  idleRpm: number;
}

interface ModEngineBase {
  id: string;
  label: string;
  summary: string;
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

export interface ModNativeEngineContribution extends ModEngineBase {
  type: "piston" | "turbine";
  jsbsimEngineFiles: readonly string[];
  rotorBlades: { outer: number; inner: number | null; outerEstimated: boolean; innerEstimated: boolean };
  startSpeed: { property: string; runningAt: number };
  maxEngineRpm?: number;
  gauges: { primary: string; secondary: string | null; label: string };
}

export interface ModElectricEngineContribution extends ModEngineBase {
  type: "electric";
  electric: { propeller: ElectricPropellerData };
}

export type ModEngineContribution = ModNativeEngineContribution | ModElectricEngineContribution;

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

/** Shared by every quadcopter: how sticks become velocity commands, and the capture grid. */
export interface QuadcopterModData {
  kinematic: "drone-pgps";
  /** Position hold gain (1/s) and stick deadzone. Flight-controller gains are per airframe. */
  gains: { kPos: number; deadzone: number };
  gridOverlap: number;
  physicsHz: 120;
  gimbalSlewDeg: number;
  positionHoldMps: number;
  /** JSBSim properties the rotors' wrench is written to: body axes at the CG, lbf and ft lbf. */
  properties: { fx: string; fy: string; fz: string; l: string; m: string; n: string; armed: string };
}

/** Shared by DJI camera drones: mount stabilization. */
export interface DjiQuadModData {
  gimbalRollDeg: number;
}

/** A camera model, declared by its own mod; no flight-controller fields. */
export interface DroneCameraModData {
  sensorW: number;
  sensorH: number;
  diagonalFovDeg: number;
  exifModel: string;
  focalMm: number;
  focal35mm: number;
  exposureDen: number;
  make: string;
  xmpNamespace: string;
  software: string;
  jpegQuality: number;
}

/** One flight mode's limits, as the manufacturer publishes them. */
export interface QuadFlightModeData {
  speedMps: number;
  tiltMaxDeg: number;
  yawRateDeg: number;
  climbMps: number;
  descentMps: number;
}

/**
 * One airframe: rotors, flight controller, flight modes and mount limits;
 * cameraId selects a camera mod. Mass and inertia are in its JSBSim XML.
 * Positions are JSBSim structural metres: x aft, y right, z up.
 */
export interface QuadVehicleModData {
  cameraId: string;
  gimbalMinDeg: number;
  gimbalMaxDeg: number;
  /** Simulator manual overrides, bounded by the mount mechanical range. */
  gimbalRollMinDeg?: number;
  gimbalRollMaxDeg?: number;
  gimbalYawMinDeg?: number;
  gimbalYawMaxDeg?: number;
  modes: { normal: QuadFlightModeData; sport: QuadFlightModeData };
  /** Engine mod ID owning this vehicle's motor and propeller data. */
  propulsionId?: string;
  /** Legacy inline data. New airframes select an electric propulsion mod instead. */
  propeller?: ElectricPropellerData;
  /** Spin +1 is clockwise seen from above. */
  rotors: readonly { position: "front-left" | "front-right" | "rear-left" | "rear-right"; hubM: readonly [number, number, number]; spin: 1 | -1 }[];
  /** Matches the JSBSim XML's CG. */
  cgM: readonly [number, number, number];
  control: {
    kv: number; kvi: number; viLimitH: number; viLimitV: number;
    shapeGain: number; accelMaxH: number; accelMaxV: number; jerkMax: number;
    kAtt: number; rateMaxDeg: number;
    kPsi: number; yawLeadDeg: number;
    kRate: number; kRi: number; riLimit: number;
  };
  aero?: { hubMomentGain?: number; vrsAmplitude?: number; vrsCorrelationS?: number; groundBodyGain?: number };
}

/** Aircraft families, definitions, flight profiles and how this airframe hangs payload. */
export interface ModAircraftContribution {
  family: Record<string, unknown>;
  definitions: readonly Record<string, unknown>[];
  fdmProfiles: Readonly<Record<string, Record<string, unknown>>>;
  audio?: { engineDefinitionId: string; sourceKind?: "rotor" };
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
  /** Present on `0sfs/quadcopter`. */
  quadcopter?: QuadcopterModData;
  /** Present on `0sfs/dji-quadcopter`. */
  dji?: DjiQuadModData;
  /** Present on one DJI airframe mod. */
  quad?: QuadVehicleModData;
  camera?: DroneCameraModData;
  cameraPreview?: CameraPreviewModData;
  /** Present on the opt-in space plugin. Absent from the default modpack. */
  space?: SpaceModData;
  /** Present on a `body` mod. */
  body?: BodyModData;
  /** Present on a `mission` mod. */
  mission?: MissionModData;
  audioRenderer?: ModAudioRendererContribution;
  engine?: ModEngineContribution;
  payload?: ModPayloadContribution;
  wasm?: ModWasmEntry;
  js?: ModJsEntry;
}

const IDENT = /^[a-z][a-z0-9-]{0,63}$/;

function ident(value: unknown): value is string {
  return typeof value === "string" && IDENT.test(value);
}

function finiteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function assertSpace(space: SpaceModData | undefined, id: string, kind: ModKind | undefined, execution: ModExecutionMode): void {
  if (kind !== "plugin" || execution !== "declarative") {
    throw new Error(`Space mod ${id} must be a declarative plugin.`);
  }
  if (!space || space.apiVersion !== 1 || space.originBodyId !== "earth" || space.departureAltitudeM !== SPACE_DEPARTURE_ALTITUDE_M) {
    throw new Error(`Space mod ${id} needs apiVersion 1, origin earth, and departure ${SPACE_DEPARTURE_ALTITUDE_M} m.`);
  }
  const earth = space.earth;
  if (!earth || earth.id !== "earth" || !finiteNumber(earth.gravitationalParameterM3S2) || earth.gravitationalParameterM3S2 <= 0
    || !finiteNumber(earth.equatorialRadiusM) || earth.equatorialRadiusM <= 0
    || !finiteNumber(earth.soiRadiusM) || earth.soiRadiusM <= earth.equatorialRadiusM
    || !finiteNumber(earth.rotationRadS) || earth.rotationRadS <= 0) {
    throw new Error(`Space mod ${id} needs Earth's gravitational parameter, radius, sphere of influence, and rotation.`);
  }
}

function assertBody(body: BodyModData | undefined, id: string, kind: ModKind | undefined, execution: ModExecutionMode): void {
  if (kind !== "body" || execution !== "declarative") throw new Error(`Body mod ${id} must be a declarative body.`);
  const orbit = body?.orbit;
  if (!body || body.apiVersion !== 1 || !ident(body.id) || body.id === "earth" || typeof body.name !== "string" || !body.name
    || body.parentBodyId !== "earth"
    || !finiteNumber(body.gravitationalParameterM3S2) || body.gravitationalParameterM3S2 <= 0
    || !finiteNumber(body.equatorialRadiusM) || body.equatorialRadiusM <= 0
    || !finiteNumber(body.soiRadiusM) || body.soiRadiusM <= body.equatorialRadiusM
    || !finiteNumber(body.rotationRadS)) {
    throw new Error(`Body mod ${id} needs a name, an id other than earth, a radius, a sphere of influence, and an Earth orbit.`);
  }
  if (!orbit || !finiteNumber(orbit.semiMajorAxisM) || orbit.semiMajorAxisM <= 0
    || !finiteNumber(orbit.eccentricity) || orbit.eccentricity < 0 || orbit.eccentricity >= 1
    || !finiteNumber(orbit.inclinationRad) || orbit.inclinationRad < 0 || orbit.inclinationRad > Math.PI
    || !finiteNumber(orbit.longitudeOfAscendingNodeRad) || !finiteNumber(orbit.argumentOfPeriapsisRad)
    || !finiteNumber(orbit.meanAnomalyAtEpochRad) || !finiteNumber(orbit.epochSeconds)) {
    throw new Error(`Body mod ${id} needs a bound elliptical orbit around Earth.`);
  }
}

function assertCompleteWhen(value: MissionCompleteWhen | undefined, label: string): void {
  if (!value) throw new Error(`${label} needs a completion.`);
  if ((value.kind === "altitude-below" || value.kind === "altitude-above") && finiteNumber(value.altMeters)) return;
  if (value.kind === "speed-below" && finiteNumber(value.speedMps) && value.speedMps >= 0) return;
  if (value.kind === "body" && ident(value.bodyId)) return;
  throw new Error(`${label} has an unknown completion.`);
}

function assertMission(mission: MissionModData | undefined, id: string, kind: ModKind | undefined, execution: ModExecutionMode): void {
  if (kind !== "mission" || execution !== "declarative") throw new Error(`Mission mod ${id} must be a declarative mission.`);
  const start = mission?.start;
  if (!mission || mission.apiVersion !== 1 || !ident(mission.id) || typeof mission.name !== "string" || !mission.name
    || typeof mission.summary !== "string" || !mission.summary || !ident(mission.bodyId)
    || !Array.isArray(mission.requiredBodyIds) || !mission.requiredBodyIds.every(ident)
    || (mission.bodyId !== "earth" && !mission.requiredBodyIds.includes(mission.bodyId))
    || !mission.phases?.length) {
    throw new Error(`Mission mod ${id} needs a name, a body, the bodies it requires, and at least one phase.`);
  }
  if (!start || start.frame !== "body-fixed" || start.bodyId !== mission.bodyId
    || !finiteNumber(start.latDeg) || Math.abs(start.latDeg) > 90
    || !finiteNumber(start.lonDeg) || Math.abs(start.lonDeg) > 180
    || !finiteNumber(start.altMeters) || !finiteNumber(start.headingDeg)
    || !finiteNumber(start.northMps) || !finiteNumber(start.eastMps) || !finiteNumber(start.upMps)) {
    throw new Error(`Mission mod ${id} needs a body-fixed start on its own body.`);
  }
  const seen = new Set<string>();
  for (const phase of mission.phases) {
    if (!phase || !ident(phase.id) || seen.has(phase.id) || typeof phase.label !== "string" || !phase.label) {
      throw new Error(`Mission mod ${id} has a phase without a unique id and label.`);
    }
    seen.add(phase.id);
    assertCompleteWhen(phase.completeWhen, `Mission mod ${id} phase ${phase.id}`);
  }
}

export function dependencySource(dependency: string | ModDependencySpec): string {
  return typeof dependency === "string" ? dependency : dependency.source;
}

/** Source generators are sandboxed WASM; JavaScript entries always select JS execution. */
export function inferExecution(manifest: Pick<OsfsModManifest, "wasm" | "js" | "audioRenderer">): ModExecutionMode {
  if (manifest.js) return "js";
  if (manifest.wasm || manifest.audioRenderer) return "wasm";
  return "declarative";
}

export function assertManifest(value: unknown): OsfsModManifest {
  if (!value || typeof value !== "object") throw new Error("A mod manifest must be a JSON object.");
  const manifest = value as Partial<OsfsModManifest>;
  if (manifest.schemaVersion !== 1) throw new Error("Unsupported mod schemaVersion.");
  if (typeof manifest.id !== "string" || !manifest.id) throw new Error("A mod manifest needs an id.");
  if (!(MOD_KINDS as readonly unknown[]).includes(manifest.kind)) {
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
  if (manifest.audioRenderer !== undefined) {
    const renderer = manifest.audioRenderer;
    if (!renderer || renderer.apiVersion !== 1 || renderer.abi !== "osfs-engine-voice-v1") {
      throw new Error(`Audio renderer mod ${manifest.id} needs apiVersion 1 and ABI osfs-engine-voice-v1.`);
    }
    if (manifest.kind !== "component" || manifest.js || manifest.wasm) {
      throw new Error(`Audio renderer mod ${manifest.id} must be a component with only an audioRenderer WASM entry.`);
    }
    if (typeof renderer.rendererId !== "string" || !renderer.rendererId.trim()
      || !Array.isArray(renderer.engineClasses) || !renderer.engineClasses.length
      || !renderer.engineClasses.every(value => typeof value === "string" && value.trim())
      || !Array.isArray(renderer.telemetrySchemaIds) || !renderer.telemetrySchemaIds.length
      || !renderer.telemetrySchemaIds.every(value => typeof value === "string" && value.trim())) {
      throw new Error(`Audio renderer mod ${manifest.id} needs a rendererId, engineClasses and telemetrySchemaIds.`);
    }
    const entry = renderer.wasm?.path;
    if (typeof entry !== "string" || !entry.trim() || entry !== entry.trim()
      || /^(?:[a-z][a-z0-9+.-]*:|\/)|\\|[?#]/i.test(entry)
      || !new URL(entry, "https://mod.invalid/component/").href.startsWith("https://mod.invalid/component/")
      || !entry.endsWith(".wasm")) {
      throw new Error(`Audio renderer mod ${manifest.id} needs a relative wasm.path ending in .wasm.`);
    }
    if (typeof renderer.wasm.sha256 !== "string" || !/^[a-f0-9]{64}$/i.test(renderer.wasm.sha256)) {
      throw new Error(`Audio renderer mod ${manifest.id} needs a SHA-256 digest for its WASM source generator.`);
    }
  }
  if (manifest.engine?.type === "electric") {
    const propeller = manifest.engine.electric?.propeller;
    if (!propeller || !["radiusM", "blades", "chordM", "pitchM", "liftSlope", "profileDrag", "inertiaKgM2", "timeConstantS", "maxRpm", "idleRpm"]
      .every(key => Number.isFinite(propeller[key as keyof ElectricPropellerData]) && propeller[key as keyof ElectricPropellerData] > 0)
      || !Number.isFinite(propeller.zeroLiftDeg) || !Number.isInteger(propeller.blades) || propeller.idleRpm >= propeller.maxRpm) {
      throw new Error(`Electric engine mod ${manifest.id} needs a valid physical propeller specification.`);
    }
  }
  if (manifest.cameraPreview !== undefined) {
    if (!manifest.cameraPreview || manifest.cameraPreview.apiVersion !== 1) {
      throw new Error(`Camera preview mod ${manifest.id} needs cameraPreview.apiVersion 1.`);
    }
    if (manifest.kind !== "plugin" || execution !== "js") {
      throw new Error(`Camera preview mod ${manifest.id} needs kind "plugin" and a JavaScript entry.`);
    }
    const entry = manifest.js?.path;
    if (typeof entry !== "string" || !entry.trim() || entry !== entry.trim()
      || /^(?:[a-z][a-z0-9+.-]*:|\/)|\\/i.test(entry)
      || !new URL(entry, "https://mod.invalid/component/").href.startsWith("https://mod.invalid/component/")
      || !entry.split(/[?#]/)[0] || entry.split(/[?#]/)[0]!.endsWith("/")) {
      throw new Error(`Camera preview mod ${manifest.id} needs js.path relative to its mod directory.`);
    }
  }
  if (manifest.space !== undefined) assertSpace(manifest.space, manifest.id, manifest.kind, execution);
  if (manifest.body !== undefined || manifest.kind === "body") assertBody(manifest.body, manifest.id, manifest.kind, execution);
  if (manifest.mission !== undefined || manifest.kind === "mission") assertMission(manifest.mission, manifest.id, manifest.kind, execution);
  if ((manifest.kind === "body" || manifest.kind === "mission") && !manifest.dependencies?.length) {
    throw new Error(`Mod ${manifest.id} must depend on the space mod.`);
  }
  if (manifest.kind === "modpack") {
    if (!manifest.dependencies?.length) throw new Error(`Modpack ${manifest.id} lists no mods in dependencies.`);
    const content = CONTENT_KEYS.find(key => manifest[key] !== undefined);
    if (content) throw new Error(`Modpack ${manifest.id} only lists mods; it cannot carry ${content}.`);
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
