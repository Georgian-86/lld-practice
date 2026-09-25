import type { DesignModel, Finding } from '@blueprint/shared';
import { NotFoundError } from '../domain/errors';
import type { ProblemCatalog } from '../domain/ports';
import { DesignIndex } from '../evaluation/design-index';
import type { DesignRule } from '../evaluation/evaluator';
import { normaliseDesign } from '../formats/submission-parser';

/**
 * Live design checks while the learner draws: the deterministic rules only,
 * synchronous, nothing persisted, no AI. Same rules as submission scoring,
 * so what the canvas flags is exactly what the report will say.
 */
export class LintService {
  constructor(
    private readonly problems: ProblemCatalog,
    private readonly rules: DesignRule[],
  ) {}

  lint(problemId: string, design: DesignModel): Finding[] {
    const problem = this.problems.get(problemId);
    if (!problem) throw new NotFoundError('Problem', problemId);
    const index = new DesignIndex(normaliseDesign(design));
    return this.rules.flatMap((rule) => rule.check(index, problem));
  }
}
