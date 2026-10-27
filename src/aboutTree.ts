import type { LoadedModRecord } from "./loader";

/** One row of the About dependency tree. `from` is `mod`, beside the build's checkout and registry rows. */
export interface ModAboutPart {
  name: string;
  from: "mod";
  version?: string;
  commit?: string;
  repository?: string;
  history?: readonly { hash: string; at: string; subject: string }[];
  /** A shared engine or payload already drawn in full higher in the tree. */
  listedAbove?: boolean;
  parts?: ModAboutPart[];
}

function partFrom(record: LoadedModRecord, seen: Set<string>): ModAboutPart {
  const version = record.manifest.provenance.version;
  const commit = record.manifest.provenance.commit;
  if (seen.has(record.source.canonicalKey)) {
    return {
      name: record.manifest.name,
      from: "mod",
      version,
      commit,
      repository: record.manifest.provenance.repository,
      listedAbove: true,
    };
  }
  seen.add(record.source.canonicalKey);
  const children = record.dependencies.filter(dependency => dependency.manifest.kind === "engine" || dependency.manifest.kind === "payload" || dependency.manifest.kind === "aircraft");
  return {
    name: record.manifest.name,
    from: "mod",
    version,
    commit,
    repository: record.manifest.provenance.repository,
    history: commit ? [{ hash: commit, at: "", subject: record.manifest.summary }] : undefined,
    parts: children.map(dependency => partFrom(dependency, seen)),
  };
}

/**
 * Aircraft and plugin mods are roots. Their engines and payload items nest underneath.
 * A dependency used by two aircraft is expanded once and then shown as the same copy.
 */
export function modAboutParts(records: readonly LoadedModRecord[]): ModAboutPart[] {
  const referenced = new Set<string>();
  for (const record of records) {
    for (const dependency of record.dependencies) referenced.add(dependency.source.canonicalKey);
  }
  const roots = records.filter(record => !referenced.has(record.source.canonicalKey) || record.manifest.kind === "aircraft" || record.manifest.kind === "plugin");
  const uniqueRoots = roots.filter((record, index) => roots.findIndex(other => other.source.canonicalKey === record.source.canonicalKey) === index);
  const seen = new Set<string>();
  return uniqueRoots.map(record => partFrom(record, seen));
}
