import type { DesignModel, Flow, FlowAnalysis, ProblemDTO } from '@blueprint/shared';
import { describeStepProblem, flowToMermaidSequence } from '@blueprint/shared';
import { AlertTriangle, ArrowRight, CheckCircle2, CornerDownRight, Maximize2, MousePointerClick, Plus, Trash2, Undo2, X } from 'lucide-react';
import { useId, useState, type Dispatch } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Label } from '@/components/ui/misc';
import { cn } from '@/lib/cn';
import type { DraftAction } from '../draft-reducer';
import { MermaidView } from '../mermaid-view';

interface ScenarioPanelProps {
  problem: ProblemDTO;
  design: DesignModel;
  /** Omit for a read-only replay (the feedback report). */
  dispatch?: Dispatch<DraftAction>;
  flow?: Flow;
  analyses: Map<string, FlowAnalysis>;
  caller: string | null;
  onSelectFlow: (id: string) => void;
  onCreate: (requirementId: string) => void;
  onSetCaller: (name: string | null) => void;
  onClose?: () => void;
}

/** Inspector content while the canvas is in scenario mode. */
export function ScenarioPanel({ problem, design, dispatch, flow, analyses, caller, onSelectFlow, onCreate, onSetCaller, onClose }: ScenarioPanelProps) {
  const pickerId = useId();
  const [expanded, setExpanded] = useState(false);
  const readOnly = !dispatch;
  const flows = design.flows ?? [];
  const covered = new Set(flows.map((f) => f.requirementId));
  const available = problem.functionalRequirements.filter((r) => !covered.has(r.id));
  const requirement = flow ? problem.functionalRequirements.find((r) => r.id === flow.requirementId) : undefined;
  const analysis = flow ? analyses.get(flow.id) : undefined;
  const problems = analysis ? analysis.steps.reduce((n, s) => n + s.problems.length, 0) + analysis.breaks.length : 0;

  return (
    <>
      <div className="flex h-12 shrink-0 items-center justify-between gap-2 border-b border-border px-4">
        <div className="min-w-0">
          <div className="truncate text-[13px] font-semibold text-fg">Scenario walkthrough</div>
          <div className="truncate text-[11.5px] text-muted">
            {readOnly ? 'The calls you submitted for each requirement' : 'Show the calls that fulfil a requirement'}
          </div>
        </div>
        {onClose && (
          <button type="button" onClick={onClose} className="rounded-md p-1 text-muted hover:bg-surface-2 hover:text-fg" aria-label="Leave scenario mode">
            <X className="size-4" />
          </button>
        )}
      </div>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4 scrollbar-thin">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Scenarios">
          {flows.map((f) => {
            const a = analyses.get(f.id);
            return (
              <button
                key={f.id}
                type="button"
                aria-pressed={f.id === flow?.id}
                onClick={() => onSelectFlow(f.id)}
                className={cn(
                  'inline-flex h-7 items-center gap-1.5 rounded-md border px-2 font-mono text-[12px] font-medium transition',
                  f.id === flow?.id ? 'border-ai bg-ai-soft text-ai-soft-fg' : 'border-border text-fg-2 hover:bg-surface-2',
                )}
              >
                <span className={cn('size-1.5 rounded-full', !a || a.steps.length === 0 ? 'bg-subtle' : a.valid ? 'bg-success' : 'bg-danger')} aria-hidden />
                {f.requirementId}
              </button>
            );
          })}
          {!readOnly && available.length > 0 && (
            <label className="relative inline-flex h-7 items-center gap-1 rounded-md border border-dashed border-border-strong px-2 text-[12px] font-medium text-fg-2 hover:bg-surface-2">
              <Plus className="size-3.5" aria-hidden />
              {flows.length ? 'Another' : 'Pick a requirement'}
              <select
                id={pickerId}
                aria-label="Walk through a requirement"
                value=""
                onChange={(e) => e.target.value && onCreate(e.target.value)}
                className="absolute inset-0 cursor-pointer opacity-0"
              >
                <option value="">Choose…</option>
                {available.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.id}: {r.text}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>

        {!flow && readOnly ? (
          <p className="text-[13px] text-muted">This version has no walkthroughs.</p>
        ) : !flow ? (
          <div className="space-y-3 text-[13px] text-fg-2">
            <p>
              A class diagram shows <em>what</em> exists. A walkthrough shows <em>how it works</em>: the ordered calls between your classes that carry out one
              requirement. Interviewers ask for exactly this.
            </p>
            <p className="flex gap-2">
              <MousePointerClick className="mt-0.5 size-3.5 shrink-0 text-ai" />
              <span>Pick a requirement, then click classes on the canvas in the order they call each other.</span>
            </p>
            <p className="flex gap-2">
              <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-success" />
              <span>Each call is checked: a class can only call a class it has a relationship with, and only methods it declares.</span>
            </p>
          </div>
        ) : (
          <>
            {requirement && (
              <p className="rounded-lg bg-surface-2 px-3 py-2 text-[12.5px] text-fg-2">
                <span className="font-mono font-semibold text-fg">{requirement.id}</span> {requirement.text}
              </p>
            )}

            {!readOnly && (
              <div className="flex items-start gap-2 rounded-lg border border-ai/30 bg-ai-soft px-3 py-2 text-[12.5px] text-ai-soft-fg">
                <MousePointerClick className="mt-0.5 size-3.5 shrink-0" />
                {caller ? (
                  <span className="min-w-0 flex-1">
                    Click the class that <span className="font-semibold">{caller}</span> calls next.{' '}
                    <button type="button" className="underline underline-offset-2" onClick={() => onSetCaller(null)}>
                      Start from another class
                    </button>
                  </span>
                ) : (
                  <span className="min-w-0 flex-1">Click the class where the scenario starts (e.g. the entry point or controller).</span>
                )}
              </div>
            )}

            {analysis && analysis.steps.length > 0 && (
              <div className={cn('flex items-center gap-2 text-[12.5px] font-medium', analysis.valid ? 'text-success' : 'text-warning')} role="status">
                {analysis.valid ? <CheckCircle2 className="size-4" /> : <AlertTriangle className="size-4" />}
                {analysis.valid ? 'Every call is backed by your diagram' : `${problems} problem${problems === 1 ? '' : 's'} in this walkthrough`}
              </div>
            )}

            <ol className="space-y-2" aria-label="Calls">
              {flow.steps.length === 0 && <li className="text-[13px] text-muted">No calls yet.</li>}
              {flow.steps.map((step, i) => {
                const a = analysis?.steps[i];
                const broken = analysis?.breaks.includes(i);
                const bad = Boolean(a?.problems.length || broken);
                return (
                  <li key={step.id} className={cn('rounded-lg border p-2', bad ? 'border-danger/40 bg-danger-soft/40' : 'border-border')}>
                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          'inline-flex size-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold text-white',
                          bad ? 'bg-danger' : 'bg-ai',
                        )}
                      >
                        {i + 1}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-fg">
                        {step.from} <ArrowRight className="inline size-3 text-muted" aria-label="calls" /> {step.to}
                      </span>
                      {dispatch && (
                        <>
                          <button
                            type="button"
                            onClick={() => onSetCaller(step.to)}
                            className="rounded p-1 text-muted hover:bg-surface-2 hover:text-fg"
                            title={`Continue from ${step.to}`}
                            aria-label={`Continue from ${step.to}`}
                          >
                            <CornerDownRight className="size-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => dispatch({ type: 'flow/step-remove', flowId: flow.id, stepId: step.id })}
                            className="rounded p-1 text-muted hover:bg-danger-soft hover:text-danger"
                            aria-label={`Remove call ${i + 1}`}
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                        </>
                      )}
                    </div>
                    {dispatch ? (
                      <input
                        value={step.message}
                        onChange={(e) => dispatch({ type: 'flow/step-update', flowId: flow.id, stepId: step.id, patch: { message: e.target.value } })}
                        className="field mt-1.5 h-8 font-mono text-[12.5px]"
                        placeholder="method(args)"
                        aria-label={`Message for call ${i + 1}`}
                        maxLength={120}
                      />
                    ) : (
                      <div className="mt-1 truncate pl-7 font-mono text-[12px] text-fg-2">{step.message || 'call'}</div>
                    )}
                    {(a?.problems.length || broken) && (
                      <ul className="mt-1.5 space-y-0.5 text-[11.5px] text-danger-soft-fg">
                        {a?.problems.map((p, k) => (
                          <li key={k}>{describeStepProblem(p, step)}</li>
                        ))}
                        {broken && <li>{step.from} was not part of the chain yet. Who asked it to do this?</li>}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ol>

            {flow.steps.length > 0 && (
              <div>
                <div className="flex items-center justify-between">
                  <Label>Sequence diagram</Label>
                  <button
                    type="button"
                    onClick={() => setExpanded(true)}
                    className="-mt-1.5 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[12px] font-medium text-primary hover:bg-primary-soft"
                  >
                    <Maximize2 className="size-3" /> Expand
                  </button>
                </div>
                <Dialog open={expanded} onOpenChange={setExpanded} size="lg" title={`Sequence diagram · ${flow.requirementId}`} description={requirement?.text}>
                  <MermaidView source={flowToMermaidSequence(flow)} />
                </Dialog>
                <div className="overflow-x-auto rounded-lg border border-border bg-surface p-2 scrollbar-thin" data-testid="sequence-diagram">
                  <MermaidView source={flowToMermaidSequence(flow)} />
                </div>
              </div>
            )}

            {dispatch && (
              <div className="flex flex-wrap gap-2">
                {flow.steps.length > 0 && (
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={<Undo2 className="size-3.5" />}
                    onClick={() => {
                      const last = flow.steps.at(-1)!;
                      dispatch({ type: 'flow/step-remove', flowId: flow.id, stepId: last.id });
                      onSetCaller(last.from);
                    }}
                  >
                    Remove last call
                  </Button>
                )}
                <Button size="sm" variant="danger" icon={<Trash2 className="size-3.5" />} onClick={() => dispatch({ type: 'flow/remove', id: flow.id })}>
                  Delete walkthrough
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}
