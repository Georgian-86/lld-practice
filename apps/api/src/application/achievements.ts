import type { AchievementDTO, Difficulty, EvaluationReport } from '@blueprint/shared';
import { analyseFlow, diffDesigns } from '@blueprint/shared';
import type { SubmissionSnapshot } from '../domain/submission';

export interface AchievementInput {
  submissions: SubmissionSnapshot[];
  reports: Map<string, EvaluationReport>;
  problems: { id: string; difficulty: Difficulty }[];
}

interface Definition {
  id: string;
  title: string;
  description: string;
  /** Submissions (oldest first) that qualify; the first one dates the achievement. */
  qualifies?: (s: SubmissionSnapshot, ctx: Context) => boolean;
  /** Count-based achievements: current value towards a target. */
  count?: (ctx: Context) => { current: number; target: number; at: string | null };
}

interface Context {
  report: (s: SubmissionSnapshot) => EvaluationReport | undefined;
  previous: (s: SubmissionSnapshot) => SubmissionSnapshot | undefined;
  difficulty: (problemId: string) => Difficulty | undefined;
  input: AchievementInput;
  ordered: SubmissionSnapshot[];
}

const score = (ctx: Context, s: SubmissionSnapshot) => ctx.report(s)?.overallScore;

/** A curveball answer compared with the version it was taken after. */
function curveballImpact(s: SubmissionSnapshot, ctx: Context) {
  const challenge = s.draft.challenge;
  if (!challenge || challenge.fromVersion >= s.version) return null;
  const base = ctx.ordered.find((b) => b.attemptId === s.attemptId && b.version === challenge.fromVersion);
  return base ? diffDesigns(base.design, s.design) : null;
}

const DEFINITIONS: Definition[] = [
  {
    id: 'first-blueprint',
    title: 'First blueprint',
    description: 'Get your first design reviewed.',
    qualifies: (s, ctx) => score(ctx, s) !== undefined,
  },
  {
    id: 'iterator',
    title: 'Iterator',
    description: 'Improve the score of a design by revising it.',
    qualifies: (s, ctx) => {
      const prev = ctx.previous(s);
      const now = score(ctx, s);
      const before = prev ? score(ctx, prev) : undefined;
      return now !== undefined && before !== undefined && now > before;
    },
  },
  {
    id: 'walkthrough',
    title: 'Walked it through',
    description: 'Submit a scenario walkthrough of three or more calls that the diagram fully supports.',
    qualifies: (s) => (s.design.flows ?? []).some((f) => f.steps.length >= 3 && analyseFlow(s.design, f).valid),
  },
  {
    id: 'open-closed',
    title: 'Open for extension',
    description: 'Absorb a curveball without changing any existing class.',
    qualifies: (s, ctx) => curveballImpact(s, ctx)?.verdict === 'extended',
  },
  {
    id: 'seam-finder',
    title: 'Seam finder',
    description: 'Answer a curveball by plugging a new class into an abstraction you had already drawn.',
    qualifies: (s, ctx) => (curveballImpact(s, ctx)?.seams.length ?? 0) > 0,
  },
  {
    id: 'beat-the-clock',
    title: 'Beat the clock',
    description: 'Score 70 or more on a timed interview, submitted within the time.',
    qualifies: (s, ctx) => {
      const t = s.draft.timer;
      const sc = score(ctx, s);
      return Boolean(t && sc !== undefined && sc >= 70 && Date.parse(s.submittedAt) - Date.parse(t.startedAt) <= t.minutes * 60_000);
    },
  },
  {
    id: 'no-hints',
    title: 'No hints needed',
    description: 'Score 80 or more without revealing a hint.',
    qualifies: (s, ctx) => (score(ctx, s) ?? 0) >= 80 && s.hintsUsed === 0,
  },
  {
    id: 'ninety-club',
    title: '90 club',
    description: 'Score 90 or more on any problem.',
    qualifies: (s, ctx) => (score(ctx, s) ?? 0) >= 90,
  },
  {
    id: 'hard-mode',
    title: 'Hard mode',
    description: 'Score 70 or more on a hard problem.',
    qualifies: (s, ctx) => ctx.difficulty(s.problemId) === 'hard' && (score(ctx, s) ?? 0) >= 70,
  },
  {
    id: 'full-catalogue',
    title: 'Full catalogue',
    description: 'Get a design reviewed for every problem.',
    count: (ctx) => {
      const done = new Map<string, string>();
      for (const s of ctx.ordered) if (score(ctx, s) !== undefined && !done.has(s.problemId)) done.set(s.problemId, s.submittedAt);
      const target = ctx.input.problems.length;
      const at = done.size >= target ? [...done.values()].sort().at(-1)! : null;
      return { current: Math.min(done.size, target), target, at };
    },
  },
];

/**
 * Milestones derived from what was actually submitted. They reward the
 * behaviours that make someone better at LLD (iterating, walking designs
 * through, absorbing change through abstractions), not just high scores.
 */
export function computeAchievements(input: AchievementInput): AchievementDTO[] {
  const ordered = [...input.submissions].sort((a, b) => a.submittedAt.localeCompare(b.submittedAt));
  const ctx: Context = {
    input,
    ordered,
    report: (s) => input.reports.get(s.id),
    previous: (s) => ordered.filter((p) => p.attemptId === s.attemptId && p.version < s.version).at(-1),
    difficulty: (id) => input.problems.find((p) => p.id === id)?.difficulty,
  };
  return DEFINITIONS.map((d) => {
    if (d.count) {
      const { current, target, at } = d.count(ctx);
      return { id: d.id, title: d.title, description: d.description, earnedAt: at, progress: { current, target } };
    }
    const first = ordered.find((s) => d.qualifies!(s, ctx));
    return { id: d.id, title: d.title, description: d.description, earnedAt: first?.submittedAt ?? null };
  });
}
