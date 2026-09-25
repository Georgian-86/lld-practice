import { BaseEdge, EdgeLabelRenderer, useInternalNode, type Edge, type EdgeProps } from '@xyflow/react';
import { cn } from '@/lib/cn';
import { borderPoint, center } from './uml-edge';

export type CallEdgeData = { index: number; message: string; ok: boolean; parallelIndex: number; parallelCount: number };
export type CallEdgeType = Edge<CallEdgeData, 'call'>;

/** A numbered call from a scenario walkthrough, drawn over the class diagram. */
export function CallEdge({ id, source, target, data }: EdgeProps<CallEdgeType>) {
  const s = useInternalNode(source);
  const t = useInternalNode(target);
  if (!s || !t || !data) return null;
  const colour = data.ok ? 'var(--ai)' : 'var(--danger)';
  let path: string;
  let labelX: number;
  let labelY: number;
  if (source === target) {
    const c = center(s);
    const x = c.x - c.w / 2;
    const spread = 14 + data.parallelIndex * 10;
    path = `M ${x} ${c.y - spread} C ${x - 80} ${c.y - spread - 40}, ${x - 80} ${c.y + spread + 40}, ${x} ${c.y + spread}`;
    labelX = x - 62;
    labelY = c.y;
  } else {
    const cs = center(s);
    const ct = center(t);
    // Calls sit beside the relationship line (offset ≥ 1 lane) so both stay readable.
    const offset = (data.parallelIndex + 1) * 16;
    const len = Math.hypot(ct.x - cs.x, ct.y - cs.y) || 1;
    const nx = (-(ct.y - cs.y) / len) * offset;
    const ny = ((ct.x - cs.x) / len) * offset;
    const a = borderPoint(s, { x: ct.x + nx, y: ct.y + ny });
    const b = borderPoint(t, { x: cs.x + nx, y: cs.y + ny });
    const start = { x: a.x + nx, y: a.y + ny };
    const end = { x: b.x + nx, y: b.y + ny };
    path = `M ${start.x} ${start.y} L ${end.x} ${end.y}`;
    labelX = start.x + (end.x - start.x) * 0.45;
    labelY = start.y + (end.y - start.y) * 0.45;
  }
  const message = data.message.trim();
  return (
    <>
      <BaseEdge id={id} path={path} markerEnd={`url(#${data.ok ? 'call-ok' : 'call-bad'})`} style={{ stroke: colour, strokeWidth: 2, strokeDasharray: data.ok ? undefined : '5 4' }} />
      <EdgeLabelRenderer>
        <div
          className={cn(
            'nodrag nopan pointer-events-none absolute flex max-w-44 items-center gap-1 rounded-full border bg-surface py-0.5 pl-0.5 pr-2 text-[11px] font-medium shadow-sm',
            data.ok ? 'border-ai/40 text-ai-soft-fg' : 'border-danger/50 text-danger-soft-fg',
          )}
          style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
          data-testid="call-label"
        >
          <span className={cn('inline-flex size-4 shrink-0 items-center justify-center rounded-full text-[10px] text-white', data.ok ? 'bg-ai' : 'bg-danger')}>{data.index + 1}</span>
          <span className="truncate font-mono">{message || 'call'}</span>
        </div>
      </EdgeLabelRenderer>
    </>
  );
}
