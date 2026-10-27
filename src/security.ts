import type { ModExecutionMode } from "./schema";

/**
 * Who is looking at a mod. Today this is the optional developer username.
 * A future FOSS Earth login can fill `githubUsername` from the session.
 */
export interface ViewerIdentity {
  githubUsername?: string | null;
  authenticatedProvider?: "github" | "google" | "microsoft" | "email" | null;
}

export type ModSecurityTier = "official" | "user" | "third-party";
export type ModSecuritySeverity = "none" | "notice" | "warning" | "high";

export interface ModSecurityAssessment {
  tier: ModSecurityTier;
  execution: ModExecutionMode;
  requiresConfirmation: boolean;
  /** JS from a shared URL never runs until someone adds it in the Mods tab. */
  blockAutomaticUrl: boolean;
  severity: ModSecuritySeverity;
  owner: string;
  message: string;
}

const OFFICIAL = new Set(["0sfs", "foss-earth"]);

export function assessModSecurity(owner: string, execution: ModExecutionMode, viewer: ViewerIdentity = {}): ModSecurityAssessment {
  const ownerKey = owner.toLowerCase();
  const user = viewer.githubUsername?.trim().toLowerCase() || null;
  if (OFFICIAL.has(ownerKey)) {
    return {
      tier: "official", execution, requiresConfirmation: false, blockAutomaticUrl: false, severity: "none", owner,
      message: `${owner} is an official mod source.`,
    };
  }
  if (user && ownerKey === user) {
    return {
      tier: "user", execution, requiresConfirmation: false, blockAutomaticUrl: false, severity: "none", owner,
      message: `This mod is owned by the signed-in developer @${viewer.githubUsername}.`,
    };
  }
  if (execution === "declarative") {
    return {
      tier: "third-party", execution, requiresConfirmation: true, blockAutomaticUrl: false, severity: "notice", owner,
      message: `Third-party mod by @${owner}. It is data only (JSON, XML and models) and runs no code. Confirm to enable it.`,
    };
  }
  if (execution === "wasm") {
    return {
      tier: "third-party", execution, requiresConfirmation: true, blockAutomaticUrl: false, severity: "warning", owner,
      message: `Unverified third-party WASM mod by @${owner}. It runs in a sandbox with no host imports. Confirm to enable it.`,
    };
  }
  return {
    tier: "third-party", execution, requiresConfirmation: true, blockAutomaticUrl: true, severity: "high", owner,
    message: `UNSANDBOXED CODE by @${owner}. This JavaScript mod is not sandboxed and will not start from a shared link. Add it in the Mods tab only if you trust @${owner}.`,
  };
}
