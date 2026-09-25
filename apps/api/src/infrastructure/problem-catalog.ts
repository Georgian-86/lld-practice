import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { problemSchema, type Problem } from '@blueprint/shared';
import type { ProblemCatalog } from '../domain/ports';

const DIFFICULTY_ORDER = { easy: 0, medium: 1, hard: 2 } as const;

/**
 * Problems are data, not code: one JSON file per problem, validated at
 * startup so a malformed problem fails fast instead of at evaluation time.
 */
export class InMemoryProblemCatalog implements ProblemCatalog {
  private readonly problems: Map<string, Problem>;

  constructor(problems: Problem[]) {
    const sorted = [...problems].sort(
      (a, b) => DIFFICULTY_ORDER[a.difficulty] - DIFFICULTY_ORDER[b.difficulty] || a.title.localeCompare(b.title),
    );
    this.problems = new Map(sorted.map((p) => [p.id, p]));
  }

  static fromDirectory(directory: string): InMemoryProblemCatalog {
    const files = readdirSync(directory).filter((f) => f.endsWith('.json'));
    const problems = files.map((file) => {
      const raw = JSON.parse(readFileSync(join(directory, file), 'utf8'));
      const result = problemSchema.safeParse(raw);
      if (!result.success) {
        throw new Error(`Invalid problem file ${file}: ${result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`);
      }
      const hintLevels = result.data.hints.map((h) => h.level);
      if (new Set(hintLevels).size !== hintLevels.length) throw new Error(`Duplicate hint levels in ${file}`);
      return result.data;
    });
    return new InMemoryProblemCatalog(problems);
  }

  list(): Problem[] {
    return [...this.problems.values()];
  }

  get(id: string): Problem | undefined {
    return this.problems.get(id);
  }
}
