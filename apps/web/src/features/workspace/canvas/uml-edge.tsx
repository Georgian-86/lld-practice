import type { Relationship } from '@blueprint/shared';
import { BaseEdge, EdgeLabelRenderer, useInternalNode, type Edge, type EdgeProps, type InternalNode } from '@xyflow/react';
import { cn } from '@/lib/cn';
import { UML } from './uml';

export type UmlEdgeData = { relationship: Relationship; parallelIndex: number; parallelCount: number };
export type UmlEdgeType = Edge<UmlEdgeData, 'uml'>;

function center(node: InternalNode) {
  const w = node.measured.width ?? 0;
  const h = node.measured.height ?? 0;
  return { x: node.internals.positionAbsolute.x + w / 2, y: node.internals.positionAbsolute.y + h / 2, w, h };
}

/** Where the line from this node's centre towards `toward` crosses the node's border. */
function borderPoint(node: InternalNode, toward: { x: number; y: number }) {
  const c = center(node);
  const dx = toward.x - c.x;
  const dy = toward.y - c.y;
  if (dx === 0 && dy === 0) return { x: c.x, y: c.y };
  const sx = c.w / 2 / Math.abs(dx || 1e-6);
  const sy = c.h / 2 / Math.abs(dy || 1e-6);
  const s = Math.min(sx, sy);
  return { x: c.x + dx * s, y: c.y + dy * s };
}

/**
 * Floating UML edge: attaches wherever the straight line between two classes
 * meets their borders, so it never tangles on fixed handles. Parallel edges
 * between the same pair are fanned out so both stay readable.
 */
export function UmlEdge({ id, source, target, data, selected }: EdgeProps<UmlEdgeType>) {
  const s = useInternalNode(source);
  const t = useInternalNode(target);
  if (!s || !t || !data) return null;
  const visual = UML[data.relationship.type];

  let path: string;
  let labelX: number;
  let labelY: number;
  if (source === target) {
    const c = center(s);
    const x = c.x + c.w / 2;
    const y1 = c.y - 18;
    const y2 = c.y + 18;
    path = `M ${x} ${y1} C ${x + 70} ${y1 - 40}, ${x + 70} ${y2 + 40}, ${x} ${y2}`;
    labelX = x + 58;
    labelY = c.y;
  } else {
    const cs = center(s);
    const ct = center(t);
    // Fan parallel edges out perpendicular to the line between centres.
    const offset = (data.parallelIndex - (data.parallelCount - 1) / 2) * 22;
    const len = Math.hypot(ct.x - cs.x, ct.y - cs.y) || 1;
    const nx = (-(ct.y - cs.y) / len) * offset;
    const ny = ((ct.x - cs.x) / len) * offset;
    const a = borderPoint(s, { x: ct.x + nx, y: ct.y + ny });
    const b = borderPoint(t, { x: cs.x + nx, y: cs.y + ny });
    const start = { x: a.x + nx, y: a.y + ny };
    const end = { x: b.x + nx, y: b.y + ny };
    path = `M ${start.x} ${start.y} L ${end.x} ${end.y}`;
    labelX = (start.x + end.x) / 2;
    labelY = (start.y + end.y) / 2;
  }

  const label = [data.relationship.label, data.relationship.multiplicity].filter(Boolean).join(' · ');
  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        markerStart={visual.start ? `url(#${visual.start})` : undefined}
        markerEnd={visual.end ? `url(#${visual.end})` : undefined}
        interactionWidth={18}
        style={{
          stroke: selected ? 'var(--primary)' : 'var(--uml-line)',
          strokeWidth: selected ? 2.2 : 1.6,
          strokeDasharray: visual.dashed ? '6 4' : undefined,
        }}
      />
      {label && (
        <EdgeLabelRenderer>
          <div
            className={cn(
              'nodrag nopan pointer-events-none absolute rounded bg-[var(--canvas-bg)] px-1.5 py-0.5 text-[11px] text-fg-2',
              selected && 'text-primary',
            )}
            style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
          >
            {label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}
