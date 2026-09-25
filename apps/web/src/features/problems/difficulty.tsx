import type { Difficulty } from '@blueprint/shared';
import { Badge } from '@/components/ui/badge';

const TONES = { easy: 'success', medium: 'warning', hard: 'danger' } as const;

export function DifficultyBadge({ difficulty }: { difficulty: Difficulty }) {
  return (
    <Badge tone={TONES[difficulty]} className="capitalize">
      {difficulty}
    </Badge>
  );
}
