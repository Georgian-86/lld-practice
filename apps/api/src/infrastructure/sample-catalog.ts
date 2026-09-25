import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { draftSchema, type Draft } from '@blueprint/shared';
import type { SampleDesigns } from '../domain/ports';

/**
 * Worked sample designs (one JSON draft per problem id) that let a newcomer
 * see a real report in seconds. Validated at startup like the problems.
 */
export class InMemorySampleDesigns implements SampleDesigns {
  constructor(private readonly samples: Map<string, Draft>) {}

  static fromDirectory(directory: string, knownProblemIds: string[]): InMemorySampleDesigns {
    const samples = new Map<string, Draft>();
    if (!existsSync(directory)) return new InMemorySampleDesigns(samples);
    for (const file of readdirSync(directory).filter((f) => f.endsWith('.json'))) {
      const problemId = basename(file, '.json');
      if (!knownProblemIds.includes(problemId)) throw new Error(`Sample ${file} does not match a problem id`);
      const result = draftSchema.safeParse(JSON.parse(readFileSync(join(directory, file), 'utf8')));
      if (!result.success) throw new Error(`Invalid sample ${file}: ${result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`);
      samples.set(problemId, result.data);
    }
    return new InMemorySampleDesigns(samples);
  }

  get(problemId: string): Draft | undefined {
    return this.samples.get(problemId);
  }
}
