import type { DesignModel, ProblemDTO } from '@blueprint/shared';
import { Lightbulb, Plus, X } from 'lucide-react';
import { useId, type Dispatch } from 'react';
import { Button } from '@/components/ui/button';
import { Label, SectionTitle } from '@/components/ui/misc';
import { AutoTextarea } from '@/components/ui/textarea';
import type { DraftAction } from './draft-reducer';

export function ReasoningPanel({ problem, design, dispatch }: { problem: ProblemDTO; design: DesignModel; dispatch: Dispatch<DraftAction> }) {
  const extensionId = useId();
  const notesId = useId();
  const tradeOffs = design.tradeOffs.length ? design.tradeOffs : [''];
  const setTradeOffs = (value: string[]) => dispatch({ type: 'tradeoffs/set', value });

  return (
    <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto p-5">
      <div className="mx-auto max-w-3xl space-y-8">
        <section>
          <SectionTitle>Trade-offs</SectionTitle>
          <p className="mb-3 mt-1 text-[13px] text-muted">
            Two or three decisions, each with the alternative you rejected and what your choice costs.
          </p>
          <ul className="space-y-2">
            {tradeOffs.map((t, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="mt-2.5 w-4 shrink-0 text-right text-xs tabular-nums text-subtle">{i + 1}.</span>
                <AutoTextarea
                  value={t}
                  onChange={(e) => setTradeOffs(tradeOffs.map((x, j) => (j === i ? e.target.value : x)))}
                  placeholder="I chose A over B because …, at the cost of …"
                  minRows={2}
                  aria-label={`Trade-off ${i + 1}`}
                />
                <Button
                  size="icon-sm"
                  variant="ghost"
                  className="mt-1.5"
                  onClick={() => setTradeOffs(tradeOffs.filter((_, j) => j !== i))}
                  aria-label={`Remove trade-off ${i + 1}`}
                  disabled={tradeOffs.length === 1 && !t}
                >
                  <X className="size-3.5" />
                </Button>
              </li>
            ))}
          </ul>
          <Button className="ml-6 mt-2" size="sm" variant="soft" icon={<Plus className="size-3.5" />} onClick={() => setTradeOffs([...tradeOffs, ''])}>
            Add trade-off
          </Button>
        </section>

        <section>
          <SectionTitle>Extension scenario</SectionTitle>
          <div className="mb-3 mt-2 flex gap-3 rounded-xl border border-warning/25 bg-warning-soft px-4 py-3">
            <Lightbulb className="mt-0.5 size-4 shrink-0 text-warning" />
            <p className="text-[13px] leading-relaxed text-warning-soft-fg">{problem.extensionScenario.prompt}</p>
          </div>
          <Label htmlFor={extensionId} hint="Name the classes you add, change and leave untouched">
            Your answer
          </Label>
          <AutoTextarea
            id={extensionId}
            value={design.extensionAnswer}
            onChange={(e) => dispatch({ type: 'text/set', field: 'extensionAnswer', value: e.target.value })}
            placeholder="Add … implementing …; register it in …; … and … stay untouched because …"
            minRows={4}
          />
        </section>

        <section>
          <Label htmlFor={notesId} hint="Optional">
            Notes for the reviewer
          </Label>
          <AutoTextarea
            id={notesId}
            value={design.notes}
            onChange={(e) => dispatch({ type: 'text/set', field: 'notes', value: e.target.value })}
            placeholder="Assumptions, concurrency handling, anything else worth knowing."
            minRows={3}
          />
        </section>
      </div>
    </div>
  );
}
