# Agent instructions

This repository is the 0SFS mod loader and the Mods tab. Aircraft, engines, weapons, pods and external tanks are GitHub repositories; this package loads their `0sfs-mod.json` manifests.

Follow the shared rules for every 0SFS repository in
[0SFS/.github/AGENTS.md](https://github.com/0SFS/.github/blob/main/AGENTS.md)
(in a local checkout of the organization: `../.github/AGENTS.md`).

The fly app depends on this package and runs its tests. From the `fly` directory, `npm test` includes them.
