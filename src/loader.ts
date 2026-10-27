import { assertManifest, dependencySource, type OsfsModManifest } from "./schema";
import { normalizeModSource, type NormalizeModSourceOptions, type NormalizedModSource } from "./normalizeModSource";
import { assessModSecurity, type ModSecurityAssessment, type ViewerIdentity } from "./security";

export interface LoadedModRecord {
  manifest: OsfsModManifest;
  source: NormalizedModSource;
  /** Manifest directory, with a trailing slash, for wasm and JSBSim relative paths. */
  baseUrl: string;
  security: ModSecurityAssessment;
  dependencies: readonly LoadedModRecord[];
}

export interface ModLoaderOptions extends NormalizeModSourceOptions {
  fetch?: typeof fetch;
  viewer?: ViewerIdentity;
  /** Manifests already in the build. Keyed by canonical URL. No network. */
  bundled?: ReadonlyMap<string, OsfsModManifest>;
  /**
   * `startup-url` is `?mods=`. A third-party JS mod is refused there.
   * `user-add` is the Mods tab, which may confirm it.
   */
  entry?: "startup-url" | "user-add";
  /** Canonical keys the viewer already confirmed. */
  confirmed?: ReadonlySet<string>;
}

export class ModDependencyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ModDependencyError";
  }
}

function baseUrlOf(manifestUrl: string): string {
  const slash = manifestUrl.lastIndexOf("/");
  return slash >= 0 ? manifestUrl.slice(0, slash + 1) : manifestUrl;
}

/**
 * Loads a mod and its dependencies once per canonical URL.
 * A second request for the same URL reuses the in-flight promise.
 * A cycle throws `Circular mod dependency: A -> B -> A`.
 */
export class ModRegistry {
  readonly loadedModsByCanonicalKey = new Map<string, Promise<LoadedModRecord>>();
  readonly loadedModsById = new Map<string, LoadedModRecord>();
  private readonly options: ModLoaderOptions;

  constructor(options: ModLoaderOptions = {}) {
    this.options = options;
  }

  /** Records a manifest that was linked into the build. Dependencies are loaded the same way. */
  installBundled(manifest: OsfsModManifest, source: string): Promise<LoadedModRecord> {
    const normalized = normalizeModSource(source, this.options);
    const existing = this.loadedModsByCanonicalKey.get(normalized.canonicalKey);
    if (existing) return existing;
    const record = this.compose(manifest, normalized, source, []);
    this.loadedModsByCanonicalKey.set(normalized.canonicalKey, record);
    return record;
  }

  /** Fetches one manifest and classifies it. Does not load dependencies or cache the mod. */
  async preview(source: string): Promise<{ source: NormalizedModSource; manifest: OsfsModManifest; security: ModSecurityAssessment }> {
    const normalized = normalizeModSource(source, this.options);
    const bundled = normalized.bundled ? this.options.bundled?.get(normalized.canonicalKey) : undefined;
    const manifest = assertManifest(bundled ?? await this.fetchManifest(normalized));
    return { source: normalized, manifest, security: assessModSecurity(manifest.provenance.owner, manifest.execution, this.options.viewer) };
  }

  load(source: string, stack: readonly string[] = [], keys: readonly string[] = []): Promise<LoadedModRecord> {
    const normalized = normalizeModSource(source, this.options);
    if (stack.includes(source) || keys.includes(normalized.canonicalKey)) {
      const from = stack.includes(source) ? stack.indexOf(source) : 0;
      throw new ModDependencyError(`Circular mod dependency: ${[...stack.slice(from), source].join(" -> ")}`);
    }
    const existing = this.loadedModsByCanonicalKey.get(normalized.canonicalKey);
    if (existing) return existing;
    const pending = this.fetchAndCompose(normalized, source, stack, keys);
    this.loadedModsByCanonicalKey.set(normalized.canonicalKey, pending);
    pending.catch(() => {
      if (this.loadedModsByCanonicalKey.get(normalized.canonicalKey) === pending) {
        this.loadedModsByCanonicalKey.delete(normalized.canonicalKey);
      }
    });
    return pending;
  }

  private async fetchAndCompose(normalized: NormalizedModSource, source: string, stack: readonly string[], keys: readonly string[]): Promise<LoadedModRecord> {
    const bundled = normalized.bundled ? this.options.bundled?.get(normalized.canonicalKey) : undefined;
    const manifest = bundled ?? await this.fetchManifest(normalized);
    return this.compose(manifest, normalized, source, stack, keys);
  }

  private async compose(manifest: OsfsModManifest, normalized: NormalizedModSource, source: string, stack: readonly string[], keys: readonly string[] = []): Promise<LoadedModRecord> {
    const checked = assertManifest(manifest);
    if (checked.provenance.owner.toLowerCase() !== normalized.owner.toLowerCase() && !normalized.canonicalKey.startsWith("url:")) {
      throw new Error(`Mod ${checked.id} says it is owned by ${checked.provenance.owner}, but ${source} is owned by ${normalized.owner}.`);
    }
    const security = assessModSecurity(checked.provenance.owner, checked.execution, this.options.viewer);
    if (security.blockAutomaticUrl && this.options.entry !== "user-add") {
      throw new Error(security.message);
    }
    if (security.requiresConfirmation && !this.options.confirmed?.has(normalized.canonicalKey) && this.options.entry !== "user-add") {
      throw new Error(security.message);
    }
    const nextStack = [...stack, source];
    const nextKeys = [...keys, normalized.canonicalKey];
    const dependencies: LoadedModRecord[] = [];
    for (const dependency of checked.dependencies ?? []) {
      dependencies.push(await this.load(dependencySource(dependency), nextStack, nextKeys));
    }
    const record: LoadedModRecord = {
      manifest: checked,
      source: normalized,
      baseUrl: baseUrlOf(normalized.manifestUrl),
      security,
      dependencies,
    };
    this.loadedModsById.set(checked.id, record);
    return record;
  }

  private async fetchManifest(normalized: NormalizedModSource): Promise<OsfsModManifest> {
    const fetchImpl = this.options.fetch ?? fetch;
    const response = await fetchImpl(normalized.manifestUrl);
    if (!response.ok) throw new Error(`Failed to load mod manifest ${normalized.manifestUrl} (${response.status}).`);
    return assertManifest(await response.json());
  }
}
