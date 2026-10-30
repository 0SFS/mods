/** A mod replacement shadows a value until its owner is removed. Reads allocate nothing. */
export class OwnedRegistry<T> {
  private readonly entries = new Map<string, { layers: Map<string, T>; current: T }>();

  set(id: string, value: T, owner = "direct"): void {
    let entry = this.entries.get(id);
    if (!entry) this.entries.set(id, entry = { layers: new Map(), current: value });
    entry.layers.delete(owner);
    entry.layers.set(owner, value);
    entry.current = value;
  }

  get(id: string): T | undefined { return this.entries.get(id)?.current; }

  values(): readonly T[] { return [...this.entries.values()].map(entry => entry.current); }

  remove(id: string, owner = "direct"): void {
    const entry = this.entries.get(id);
    if (!entry || !entry.layers.delete(owner)) return;
    if (!entry.layers.size) { this.entries.delete(id); return; }
    for (const value of entry.layers.values()) entry.current = value;
  }
}
