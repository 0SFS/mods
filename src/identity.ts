import type { ViewerIdentity } from "./security";

/** Developer setting until a FOSS Earth login supplies the GitHub username. */
export const DEVELOPER_USERNAME_KEY = "osfs.mods.developerGithubUsername";

export interface IdentityStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function readViewerIdentity(storage: IdentityStorage | null | undefined): ViewerIdentity {
  const githubUsername = storage?.getItem(DEVELOPER_USERNAME_KEY)?.trim() || null;
  return { githubUsername, authenticatedProvider: githubUsername ? "github" : null };
}

export function writeDeveloperUsername(storage: IdentityStorage, username: string): void {
  storage.setItem(DEVELOPER_USERNAME_KEY, username.trim());
}
