export interface NormalizedModSource {
  /** `github:<owner>/<repo>@<ref>` or `pages:` / `url:` for a non-GitHub host. */
  canonicalKey: string;
  /** Where `0sfs-mod.json` is fetched. Built-ins stay on the local `/mods/` tree. */
  manifestUrl: string;
  owner: string;
  repo: string;
  ref: string;
  /** True when this build already has the manifest and must not fetch it. */
  bundled: boolean;
}

export interface NormalizeModSourceOptions {
  /**
   * Repo slugs, lowercase `owner/repo`, whose HEAD manifest is linked into this build
   * at `/mods/<repo>/0sfs-mod.json`.
   */
  bundledRepos?: ReadonlySet<string>;
  /** Prefix for a bundled manifest URL. Empty uses a site-root `/mods/...` path. */
  assetRoot?: string;
}

const SHORTHAND = /^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)(?:@([^?#\s]+))?$/;

function bundledUrl(repo: string, assetRoot = ""): string {
  const prefix = assetRoot === "" ? "" : assetRoot.replace(/\/$/, "");
  return `${prefix}/mods/${repo.toLowerCase()}/0sfs-mod.json`;
}

function github(owner: string, repo: string, ref: string, options: NormalizeModSourceOptions): NormalizedModSource {
  const ownerLower = owner.toLowerCase();
  const repoLower = repo.toLowerCase();
  const bundled = ref === "HEAD" && (options.bundledRepos?.has(`${ownerLower}/${repoLower}`) ?? false);
  const manifestUrl = bundled
    ? bundledUrl(repoLower, options.assetRoot)
    : ref === "HEAD"
      ? `https://${ownerLower}.github.io/${repo}/0sfs-mod.json`
      : `https://raw.githubusercontent.com/${owner}/${repo}/${ref}/public/0sfs-mod.json`;
  return {
    canonicalKey: `github:${ownerLower}/${repoLower}@${ref}`,
    manifestUrl,
    owner,
    repo,
    ref,
    bundled,
  };
}

function fromGithubPath(owner: string, repoName: string, rest: string, options: NormalizeModSourceOptions): NormalizedModSource {
  const repo = repoName.replace(/\.git$/, "");
  const tree = /^tree\/(.+)$/.exec(rest);
  const ref = tree ? decodeURIComponent(tree[1].replace(/\/$/, "")) : "HEAD";
  return github(owner, repo, ref || "HEAD", options);
}

/**
 * Canonical identity for a shorthand, a github.com URL, a GitHub Pages URL, or a direct manifest URL.
 * Bundled first-party mods keep `github:0sfs/<repo>@HEAD` and load from `/mods/<repo>/0sfs-mod.json`.
 */
export function normalizeModSource(source: string, options: NormalizeModSourceOptions = {}): NormalizedModSource {
  const trimmed = source.trim();
  if (!trimmed) throw new Error("A mod source is empty.");
  if (trimmed.startsWith("local:")) {
    const inner = normalizeModSource(trimmed.slice("local:".length), options);
    return {
      canonicalKey: `local:${inner.owner.toLowerCase()}/${inner.repo.toLowerCase()}@${inner.ref}`,
      manifestUrl: `/dev-mods/${inner.repo.toLowerCase()}/0sfs-mod.json`,
      owner: inner.owner,
      repo: inner.repo,
      ref: inner.ref,
      bundled: false,
    };
  }
  const shorthand = SHORTHAND.exec(trimmed);
  if (shorthand) {
    const owner = shorthand[1]!;
    const repo = shorthand[2]!;
    const ref = shorthand[3] ? decodeURIComponent(shorthand[3]) : "HEAD";
    return github(owner, repo, ref, options);
  }
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new Error(`Cannot read mod source ${trimmed}.`);
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error(`Unsupported mod URL ${trimmed}.`);
  const host = url.hostname.toLowerCase();
  if (host === "github.com" || host === "www.github.com") {
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts.length < 2) throw new Error(`GitHub URL ${trimmed} does not name a repository.`);
    const owner = parts[0]!;
    const repo = parts[1]!;
    return fromGithubPath(owner, repo, parts.slice(2).join("/"), options);
  }
  if (host.endsWith(".github.io")) {
    const owner = host.slice(0, -".github.io".length);
    const parts = url.pathname.split("/").filter(Boolean);
    const repo = parts[0];
    if (!owner || !repo || repo === "0sfs-mod.json") throw new Error(`GitHub Pages URL ${trimmed} does not name a repository.`);
    const ref = "HEAD";
    const ownerLower = owner.toLowerCase();
    const repoLower = repo.toLowerCase();
    const bundled = options.bundledRepos?.has(`${ownerLower}/${repoLower}`) ?? false;
    return {
      canonicalKey: `github:${ownerLower}/${repoLower}@${ref}`,
      manifestUrl: bundled ? bundledUrl(repoLower, options.assetRoot) : `${url.origin}/${repo}/0sfs-mod.json`,
      owner,
      repo,
      ref,
      bundled,
    };
  }
  if (!url.pathname.endsWith("0sfs-mod.json")) throw new Error(`Mod URL ${trimmed} is not a 0sfs-mod.json manifest.`);
  url.hash = "";
  return {
    canonicalKey: `url:${url.href}`,
    manifestUrl: url.href,
    owner: url.hostname,
    repo: url.pathname.split("/").filter(Boolean).at(-2) ?? "mod",
    ref: "HEAD",
    bundled: false,
  };
}
