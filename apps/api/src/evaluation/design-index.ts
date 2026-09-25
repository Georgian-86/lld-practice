import type { DesignModel, Entity, Relationship } from '@blueprint/shared';
import { nameKey } from '@blueprint/shared';

/**
 * Read-only, precomputed view over a DesignModel so each rule stays a few
 * lines of intent instead of re-deriving graph structure.
 */
export class DesignIndex {
  readonly entities: Entity[];
  readonly relationships: Relationship[];
  private readonly byKey = new Map<string, Entity>();
  private readonly neighbours = new Map<string, Set<string>>();

  constructor(readonly design: DesignModel) {
    this.entities = design.entities;
    this.relationships = design.relationships;
    for (const entity of design.entities) {
      this.byKey.set(nameKey(entity.name), entity);
      this.neighbours.set(nameKey(entity.name), new Set());
    }
    for (const rel of this.resolvedRelationships()) {
      const from = nameKey(rel.from);
      const to = nameKey(rel.to);
      if (from === to) continue;
      this.neighbours.get(from)!.add(to);
      this.neighbours.get(to)!.add(from);
    }
  }

  find(name: string): Entity | undefined {
    return this.byKey.get(nameKey(name));
  }

  has(name: string): boolean {
    return this.byKey.has(nameKey(name));
  }

  /** Relationships whose both ends exist. */
  resolvedRelationships(): Relationship[] {
    return this.relationships.filter((r) => this.has(r.from) && this.has(r.to));
  }

  danglingRelationships(): Relationship[] {
    return this.relationships.filter((r) => !this.has(r.from) || !this.has(r.to));
  }

  /** Number of distinct entities this entity is directly related to. */
  degree(name: string): number {
    return this.neighbours.get(nameKey(name))?.size ?? 0;
  }

  /** Entities that extend or implement `name`. */
  implementorsOf(name: string): Entity[] {
    const key = nameKey(name);
    return this.resolvedRelationships()
      .filter((r) => (r.type === 'implementation' || r.type === 'inheritance') && nameKey(r.to) === key)
      .map((r) => this.find(r.from)!)
      .filter(Boolean);
  }

  /** Direct parents via inheritance or implementation. */
  parentsOf(name: string): Entity[] {
    const key = nameKey(name);
    return this.resolvedRelationships()
      .filter((r) => (r.type === 'implementation' || r.type === 'inheritance') && nameKey(r.from) === key)
      .map((r) => this.find(r.to)!)
      .filter(Boolean);
  }

  isAbstraction(entity: Entity): boolean {
    return entity.kind === 'interface' || entity.kind === 'abstract';
  }

  /** Longest inheritance chain above `name` (0 = no parent). Cycle-safe. */
  inheritanceDepth(name: string, seen = new Set<string>()): number {
    const key = nameKey(name);
    if (seen.has(key)) return 0;
    seen.add(key);
    const parents = this.parentsOf(name).filter((p) => p.kind !== 'interface');
    if (parents.length === 0) return 0;
    return 1 + Math.max(...parents.map((p) => this.inheritanceDepth(p.name, new Set(seen))));
  }

  /** All searchable text about an entity: name, responsibilities and members. */
  describe(entity: Entity): string {
    return [entity.name, ...entity.responsibilities, ...entity.methods, ...entity.attributes].join(' ');
  }

  /**
   * Finds elementary cycles in the directed graph formed by relationships of
   * the given types. Returns each cycle once, as a list of entity names.
   */
  cycles(types: Relationship['type'][], maxCycles = 5): string[][] {
    const adjacency = new Map<string, string[]>();
    for (const rel of this.resolvedRelationships()) {
      if (!types.includes(rel.type)) continue;
      const from = nameKey(rel.from);
      const to = nameKey(rel.to);
      if (from === to) continue;
      adjacency.set(from, [...(adjacency.get(from) ?? []), to]);
    }
    const found: string[][] = [];
    const signatures = new Set<string>();
    const visit = (start: string, node: string, path: string[], onPath: Set<string>) => {
      if (found.length >= maxCycles) return;
      for (const next of adjacency.get(node) ?? []) {
        if (next === start && path.length >= 2) {
          const signature = [...path].sort().join('|');
          if (!signatures.has(signature)) {
            signatures.add(signature);
            found.push(path.map((k) => this.byKey.get(k)!.name));
          }
        } else if (!onPath.has(next) && next > start) {
          // `next > start` ensures each cycle is discovered from its smallest node only.
          onPath.add(next);
          visit(start, next, [...path, next], onPath);
          onPath.delete(next);
        }
      }
    };
    for (const start of [...adjacency.keys()].sort()) visit(start, start, [start], new Set([start]));
    return found;
  }
}
