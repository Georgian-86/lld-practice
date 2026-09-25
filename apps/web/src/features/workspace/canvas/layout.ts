import dagre from '@dagrejs/dagre';
import type { DesignModel, DiagramLayout, Entity } from '@blueprint/shared';
import { nameKey } from '@blueprint/shared';

export const NODE_WIDTH = 232;
const HEADER = 46;
const LINE = 19;
const SECTION_PAD = 12;
const MAX_LINES = 6;

const visibleLines = (items: string[]) => Math.min(items.filter((s) => s.trim()).length, MAX_LINES);

/** Height estimate used for layout before the browser has measured the node. */
export function estimateNodeHeight(entity: Entity): number {
  const attrs = visibleLines(entity.attributes);
  const methods = visibleLines(entity.methods);
  return HEADER + SECTION_PAD * 2 + Math.max(1, attrs) * LINE + Math.max(1, methods) * LINE + 24;
}

/**
 * Layered layout (dagre): parents above children, wholes above parts, users
 * above what they use — the reading order of a class diagram.
 */
export function autoLayout(design: Pick<DesignModel, 'entities' | 'relationships'>): DiagramLayout {
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: 'TB', nodesep: 56, ranksep: 88, marginx: 24, marginy: 24 });
  g.setDefaultEdgeLabel(() => ({}));
  const idByName = new Map<string, string>();
  for (const e of design.entities) {
    g.setNode(e.id, { width: NODE_WIDTH, height: estimateNodeHeight(e) });
    if (e.name.trim()) idByName.set(nameKey(e.name), e.id);
  }
  for (const r of design.relationships) {
    const from = idByName.get(nameKey(r.from));
    const to = idByName.get(nameKey(r.to));
    if (!from || !to || from === to) continue;
    const parentFirst = r.type === 'inheritance' || r.type === 'implementation';
    if (parentFirst) g.setEdge(to, from);
    else g.setEdge(from, to);
  }
  dagre.layout(g);
  const layout: DiagramLayout = {};
  for (const e of design.entities) {
    const n = g.node(e.id);
    if (n) layout[e.id] = { x: Math.round(n.x - n.width / 2), y: Math.round(n.y - n.height / 2) };
  }
  return layout;
}

/** Positions for entities that have none yet, without moving existing ones. */
export function fillMissingPositions(design: DesignModel, layout: DiagramLayout | undefined): DiagramLayout | null {
  const missing = design.entities.filter((e) => !layout?.[e.id]);
  if (missing.length === 0) return null;
  if (!layout || Object.keys(layout).length === 0) return autoLayout(design);
  // Place newcomers in a row below everything that is already on the canvas.
  const bottom = Math.max(...Object.values(layout).map((p) => p.y)) + 260;
  const left = Math.min(...Object.values(layout).map((p) => p.x));
  const placed: DiagramLayout = {};
  missing.forEach((e, i) => (placed[e.id] = { x: left + i * (NODE_WIDTH + 40), y: bottom }));
  return placed;
}

/**
 * Nearest free spot to `near` (top-left coordinates) that doesn't overlap any
 * existing box, searched on a spiral of grid cells.
 */
export function findFreeSpot(
  near: { x: number; y: number },
  occupied: { x: number; y: number; width: number; height: number }[],
  size = { width: NODE_WIDTH, height: 150 },
): { x: number; y: number } {
  const gap = 36;
  const stepX = size.width + gap;
  const stepY = size.height + gap;
  const overlaps = (x: number, y: number) =>
    occupied.some((o) => x < o.x + o.width + gap && x + size.width + gap > o.x && y < o.y + o.height + gap && y + size.height + gap > o.y);
  for (let ring = 0; ring < 12; ring++) {
    for (let dy = -ring; dy <= ring; dy++) {
      for (let dx = -ring; dx <= ring; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
        const x = Math.round(near.x + dx * stepX);
        const y = Math.round(near.y + dy * stepY);
        if (!overlaps(x, y)) return { x, y };
      }
    }
  }
  return near;
}
