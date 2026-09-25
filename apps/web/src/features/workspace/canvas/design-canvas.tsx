import '@xyflow/react/dist/style.css';
import * as Dropdown from '@radix-ui/react-dropdown-menu';
import type { DesignModel, DiagramLayout, Entity, EntityKind, Finding, ProblemDTO, Relationship, RelationshipType } from '@blueprint/shared';
import { nameKey } from '@blueprint/shared';
import {
  applyEdgeChanges,
  applyNodeChanges,
  Background,
  BackgroundVariant,
  ConnectionMode,
  Controls,
  MiniMap,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Connection,
  type EdgeChange,
  type NodeChange,
} from '@xyflow/react';
import { Check, ChevronDown, LayoutGrid, Maximize, Plus } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type DragEvent } from 'react';
import { toast } from 'sonner';
import { useTheme } from '@/hooks/use-theme';
import { cn } from '@/lib/cn';
import { newId } from '@/lib/format';
import { isMapped, type DraftAction } from '../draft-reducer';
import { KIND_LABELS, KindIcon } from '../kind-icon';
import { ClassNode, type ClassNodeType } from './class-node';
import { CanvasInspector } from './inspector';
import { autoLayout, fillMissingPositions, findFreeSpot, NODE_WIDTH } from './layout';
import { RELATIONSHIP_ORDER, RelationshipGlyph, UML, UmlMarkerDefs } from './uml';
import { UmlEdge, type UmlEdgeType } from './uml-edge';
import { issuesByEntity } from './use-live-checks';

const nodeTypes = { class: ClassNode };
const edgeTypes = { uml: UmlEdge };
const REQ_MIME = 'application/x-blueprint-requirement';

export interface DesignCanvasProps {
  problem: ProblemDTO;
  design: DesignModel;
  layout?: DiagramLayout;
  /** Omit for a read-only canvas (e.g. the feedback report). */
  dispatch?: Dispatch<DraftAction>;
  /** Live checks while editing, or the evaluation's findings when read-only. */
  findings?: Finding[] | null;
  checking?: boolean;
  /** Entity name to select and centre (deep links from feedback). */
  focus?: string | null;
  className?: string;
}

export type CanvasSelection = { kind: 'node'; id: string } | { kind: 'edge'; id: string } | null;

export function DesignCanvas(props: DesignCanvasProps) {
  return (
    <ReactFlowProvider>
      <CanvasInner {...props} />
    </ReactFlowProvider>
  );
}

function CanvasInner({ problem, design, layout, dispatch, findings, checking, focus, className }: DesignCanvasProps) {
  const readOnly = !dispatch;
  const { theme } = useTheme();
  const flow = useReactFlow();
  const wrapper = useRef<HTMLDivElement>(null);
  const [tool, setTool] = useState<RelationshipType>('association');
  const [selection, setSelection] = useState<CanvasSelection>(null);
  const [focusName, setFocusName] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);

  /* ------------------------------ positions ------------------------------ */
  const missing = useMemo(() => fillMissingPositions(design, layout), [design, layout]);
  useEffect(() => {
    if (missing && dispatch) dispatch({ type: 'layout/set', positions: missing });
  }, [missing, dispatch]);
  const positions = useMemo(() => ({ ...(missing ?? {}), ...(layout ?? {}) }), [missing, layout]);

  /* ------------------------------ derived data ---------------------------- */
  const idByName = useMemo(() => {
    const map = new Map<string, string>();
    for (const e of design.entities) if (e.name.trim()) map.set(nameKey(e.name), e.id);
    return map;
  }, [design.entities]);
  const issues = useMemo(() => issuesByEntity(findings), [findings]);
  const requirementsByEntity = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const [reqId, names] of Object.entries(design.requirementMap)) {
      for (const n of names) map.set(nameKey(n), [...(map.get(nameKey(n)) ?? []), reqId]);
    }
    return map;
  }, [design.requirementMap]);

  /* -------------------------------- nodes -------------------------------- */
  const [nodes, setNodes] = useState<ClassNodeType[]>([]);
  useEffect(() => {
    setNodes((prev) => {
      const byId = new Map(prev.map((n) => [n.id, n]));
      return design.entities.map((entity): ClassNodeType => {
        const existing = byId.get(entity.id);
        const key = nameKey(entity.name);
        return {
          ...existing,
          id: entity.id,
          type: 'class',
          position: positions[entity.id] ?? existing?.position ?? { x: 0, y: 0 },
          selected: selection?.kind === 'node' && selection.id === entity.id,
          draggable: !readOnly,
          connectable: !readOnly,
          deletable: !readOnly,
          data: {
            entity,
            issues: key ? (issues.get(key) ?? []) : [],
            requirements: key ? (requirementsByEntity.get(key) ?? []).sort() : [],
            readOnly,
            dropTarget: dropTarget === entity.id,
          },
        };
      });
    });
  }, [design.entities, positions, issues, requirementsByEntity, readOnly, dropTarget, selection]);

  /* -------------------------------- edges -------------------------------- */
  const [edges, setEdges] = useState<UmlEdgeType[]>([]);
  useEffect(() => {
    const resolved = design.relationships
      .map((r) => ({ r, source: idByName.get(nameKey(r.from)), target: idByName.get(nameKey(r.to)) }))
      .filter((x): x is { r: Relationship; source: string; target: string } => Boolean(x.source && x.target));
    const pairCount = new Map<string, number>();
    const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
    for (const x of resolved) pairCount.set(pairKey(x.source, x.target), (pairCount.get(pairKey(x.source, x.target)) ?? 0) + 1);
    const seen = new Map<string, number>();
    setEdges(
      resolved.map(({ r, source, target }) => {
        const key = pairKey(source, target);
        const index = seen.get(key) ?? 0;
        seen.set(key, index + 1);
        // Keep the fan-out direction stable regardless of which end is "from".
        const flip = source > target ? -1 : 1;
        const count = pairCount.get(key) ?? 1;
        return {
          id: r.id,
          source,
          target,
          type: 'uml',
          selected: selection?.kind === 'edge' && selection.id === r.id,
          deletable: !readOnly,
          data: { relationship: r, parallelIndex: flip === 1 ? index : count - 1 - index, parallelCount: count },
        };
      }),
    );
  }, [design.relationships, idByName, selection, readOnly]);

  /* ------------------------------ interaction ---------------------------- */
  const onNodesChange = useCallback((changes: NodeChange<ClassNodeType>[]) => {
    setNodes((ns) => applyNodeChanges(changes, ns));
  }, []);
  const onEdgesChange = useCallback((changes: EdgeChange<UmlEdgeType>[]) => {
    setEdges((es) => applyEdgeChanges(changes, es));
  }, []);

  const onSelectionChange = useCallback(({ nodes: ns, edges: es }: { nodes: { id: string }[]; edges: { id: string }[] }) => {
    const next: CanvasSelection =
      ns.length === 1 && es.length === 0
        ? { kind: 'node', id: ns[0]!.id }
        : es.length === 1 && ns.length === 0
          ? { kind: 'edge', id: es[0]!.id }
          : null;
    // Same selection → keep the same object so derived nodes/edges don't rebuild in a loop.
    setSelection((prev) => (prev?.kind === next?.kind && prev?.id === next?.id ? prev : next));
  }, []);

  const onConnect = useCallback(
    (c: Connection) => {
      if (!dispatch) return;
      const from = design.entities.find((e) => e.id === c.source);
      const to = design.entities.find((e) => e.id === c.target);
      if (!from || !to) return;
      if (!from.name.trim() || !to.name.trim()) {
        toast.error('Name both classes before connecting them');
        return;
      }
      const duplicate = design.relationships.some(
        (r) => nameKey(r.from) === nameKey(from.name) && nameKey(r.to) === nameKey(to.name) && r.type === tool,
      );
      if (duplicate) {
        toast.info(`${from.name} already ${UML[tool].verb} ${to.name}`);
        return;
      }
      const id = newId('r');
      dispatch({ type: 'relationship/add', relationship: { id, from: from.name.trim(), to: to.name.trim(), type: tool } });
      setSelection({ kind: 'edge', id });
    },
    [dispatch, design.entities, design.relationships, tool],
  );

  const onNodeDragStop = useCallback(
    (_: unknown, _node: ClassNodeType, dragged: ClassNodeType[]) => {
      if (!dispatch) return;
      const positionsUpdate: DiagramLayout = {};
      for (const n of dragged) positionsUpdate[n.id] = { x: Math.round(n.position.x), y: Math.round(n.position.y) };
      dispatch({ type: 'layout/set', positions: positionsUpdate });
    },
    [dispatch],
  );

  const onNodesDelete = useCallback(
    (deleted: ClassNodeType[]) => {
      for (const n of deleted) dispatch?.({ type: 'entity/remove', id: n.id });
      setSelection(null);
    },
    [dispatch],
  );
  const onEdgesDelete = useCallback(
    (deleted: UmlEdgeType[]) => {
      for (const e of deleted) dispatch?.({ type: 'relationship/remove', id: e.id });
      setSelection(null);
    },
    [dispatch],
  );

  const addEntity = (kind: EntityKind) => {
    if (!dispatch) return;
    const rect = wrapper.current?.getBoundingClientRect();
    const centre = rect ? flow.screenToFlowPosition({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }) : { x: 0, y: 0 };
    const occupied = flow.getNodes().map((n) => ({
      x: n.position.x,
      y: n.position.y,
      width: n.measured?.width ?? NODE_WIDTH,
      height: n.measured?.height ?? 150,
    }));
    const spot = findFreeSpot({ x: centre.x - NODE_WIDTH / 2, y: centre.y - 75 }, occupied);
    const base = kind === 'interface' ? 'NewInterface' : kind === 'enum' ? 'NewEnum' : 'NewClass';
    const taken = new Set(design.entities.map((e) => nameKey(e.name)));
    let name = base;
    for (let i = 2; taken.has(nameKey(name)); i++) name = `${base}${i}`;
    const id = newId('e');
    dispatch({ type: 'entity/add', id, name, kind, position: spot });
    setSelection({ kind: 'node', id });
    setFocusName(id);
  };

  const relayout = () => {
    if (!dispatch) return;
    dispatch({ type: 'layout/set', positions: autoLayout(design), replace: true });
    setTimeout(() => void flow.fitView({ padding: 0.15, duration: 400 }), 60);
  };

  // Deep link: select and centre a class by name.
  useEffect(() => {
    if (!focus) return;
    const id = idByName.get(nameKey(focus));
    if (!id) return;
    setSelection({ kind: 'node', id });
    const timer = setTimeout(() => {
      const node = flow.getNode(id);
      if (node) void flow.setCenter(node.position.x + NODE_WIDTH / 2, node.position.y + 80, { zoom: 1.1, duration: 500 });
    }, 250);
    return () => clearTimeout(timer);
  }, [focus, idByName, flow]);

  const focusEntity = useCallback(
    (name: string) => {
      const id = idByName.get(nameKey(name));
      if (!id) return;
      setSelection({ kind: 'node', id });
      const node = flow.getNode(id);
      if (node) void flow.setCenter(node.position.x + NODE_WIDTH / 2, node.position.y + 80, { zoom: 1, duration: 400 });
    },
    [idByName, flow],
  );

  /* ------------------------ requirement drag & drop ----------------------- */
  const nodeUnderPointer = (e: DragEvent) =>
    (document.elementFromPoint(e.clientX, e.clientY)?.closest('.react-flow__node') as HTMLElement | null)?.dataset.id ?? null;
  const onDragOver = (e: DragEvent) => {
    if (readOnly || !e.dataTransfer.types.includes(REQ_MIME)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'link';
    const id = nodeUnderPointer(e);
    if (id !== dropTarget) setDropTarget(id);
  };
  const onDrop = (e: DragEvent) => {
    const requirementId = e.dataTransfer.getData(REQ_MIME);
    setDropTarget(null);
    if (!dispatch || !requirementId) return;
    e.preventDefault();
    const id = nodeUnderPointer(e);
    const entity = design.entities.find((x) => x.id === id);
    if (!entity) return;
    if (!entity.name.trim()) {
      toast.error('Name the class before assigning requirements to it');
      return;
    }
    const already = (design.requirementMap[requirementId] ?? []).some((n) => nameKey(n) === nameKey(entity.name));
    if (already) {
      toast.info(`${requirementId} is already owned by ${entity.name}`);
      return;
    }
    dispatch({ type: 'trace/toggle', requirementId, entityName: entity.name.trim() });
    toast.success(`${requirementId} → ${entity.name}`);
  };

  const selectedEntity: Entity | undefined = selection?.kind === 'node' ? design.entities.find((e) => e.id === selection.id) : undefined;
  const selectedRelationship: Relationship | undefined =
    selection?.kind === 'edge' ? design.relationships.find((r) => r.id === selection.id) : undefined;

  return (
    <div className={cn('flex min-h-0 flex-1 flex-col', className)}>
      {!readOnly && (
        <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-b border-border bg-surface px-3 py-2">
          <Toolbar tool={tool} onTool={setTool} onAdd={addEntity} onRelayout={relayout} onFit={() => void flow.fitView({ padding: 0.15, duration: 400 })} />
          <RequirementsDock
            problem={problem}
            design={design}
            selectedEntity={selection?.kind === 'node' ? design.entities.find((e) => e.id === selection.id) : undefined}
            onToggle={(requirementId, entityName) => dispatch?.({ type: 'trace/toggle', requirementId, entityName })}
          />
        </div>
      )}
      <div className="flex min-h-0 flex-1">
        <div
          ref={wrapper}
          className="blueprint-canvas relative min-h-0 min-w-0 flex-1"
          onDragOver={onDragOver}
          onDragLeave={() => setDropTarget(null)}
          onDrop={onDrop}
        >
          <UmlMarkerDefs />
          <ReactFlow<ClassNodeType, UmlEdgeType>
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onSelectionChange={onSelectionChange}
            onConnect={onConnect}
            onNodeDragStop={onNodeDragStop}
            onNodesDelete={onNodesDelete}
            onEdgesDelete={onEdgesDelete}
            onNodeDoubleClick={(_, n) => {
              setSelection({ kind: 'node', id: n.id });
              setFocusName(n.id);
            }}
            connectionMode={ConnectionMode.Loose}
            connectionLineStyle={{ stroke: 'var(--primary)', strokeWidth: 2, strokeDasharray: UML[tool].dashed ? '6 4' : undefined }}
            deleteKeyCode={readOnly ? null : ['Backspace', 'Delete']}
            nodesDraggable={!readOnly}
            nodesConnectable={!readOnly}
            elementsSelectable
            colorMode={theme}
            fitView
            fitViewOptions={{ padding: 0.15, maxZoom: 1.1 }}
            minZoom={0.2}
            maxZoom={2}
            proOptions={{ hideAttribution: true }}
          >
            <Background variant={BackgroundVariant.Dots} gap={20} size={1.2} color="var(--canvas-dot)" bgColor="var(--canvas-bg)" />
            <Controls showInteractive={false} position="bottom-left" />
            <MiniMap position="bottom-right" pannable zoomable className="!hidden md:!block" nodeColor="var(--primary-soft)" nodeStrokeColor="var(--primary)" maskColor="var(--minimap-mask)" />
            {design.entities.length === 0 && (
              <Panel position="top-center" className="!top-1/3">
                <div className="max-w-sm rounded-xl border border-dashed border-border-strong bg-surface/90 px-6 py-5 text-center shadow-sm backdrop-blur">
                  <div className="text-sm font-semibold text-fg">Start drawing your design</div>
                  <p className="mt-1 text-[13px] text-muted">
                    Add classes from the toolbar, drag from a class’s edge to another class to connect them, and drop requirement chips onto the class that owns them.
                  </p>
                </div>
              </Panel>
            )}
          </ReactFlow>
        </div>
        <CanvasInspector
          problem={problem}
          design={design}
          dispatch={dispatch}
          entity={selectedEntity}
          relationship={selectedRelationship}
          findings={findings}
          checking={checking}
          autoFocusName={Boolean(selectedEntity && focusName === selectedEntity.id)}
          onFocused={() => setFocusName(null)}
          onFocusEntity={focusEntity}
          onClose={() => setSelection(null)}
        />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------------ */

function Toolbar({
  tool,
  onTool,
  onAdd,
  onRelayout,
  onFit,
}: {
  tool: RelationshipType;
  onTool: (t: RelationshipType) => void;
  onAdd: (k: EntityKind) => void;
  onRelayout: () => void;
  onFit: () => void;
}) {
  const btn = 'inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-[12.5px] font-medium text-fg-2 transition hover:bg-surface-2 hover:text-fg';
  return (
    <div className="flex flex-wrap items-center gap-1 rounded-lg border border-border bg-surface-2/60 p-0.5">
      {(['class', 'interface', 'abstract', 'enum'] as EntityKind[]).map((kind) => (
        <button key={kind} type="button" className={btn} onClick={() => onAdd(kind)} title={`Add ${KIND_LABELS[kind].toLowerCase()}`}>
          <Plus className="size-3.5 text-muted" />
          <KindIcon kind={kind} className="size-4 text-[9px]" />
          <span className="hidden xl:inline">{KIND_LABELS[kind].replace(' class', '')}</span>
        </button>
      ))}
      <span className="mx-1 h-5 w-px bg-border" />
      <Dropdown.Root modal={false}>
        <Dropdown.Trigger asChild>
          <button type="button" className={cn(btn, 'pr-1.5')} aria-label="Relationship type for new connections">
            <span className="text-muted">Connect as</span>
            <RelationshipGlyph type={tool} className="text-fg" />
            <span className="text-fg">{UML[tool].verb}</span>
            <ChevronDown className="size-3.5 text-muted" />
          </button>
        </Dropdown.Trigger>
        <Dropdown.Portal>
          <Dropdown.Content align="start" sideOffset={6} className="z-50 min-w-64 rounded-lg border border-border bg-surface p-1 shadow-lg animate-fade-in">
            <Dropdown.RadioGroup value={tool} onValueChange={(v) => onTool(v as RelationshipType)}>
              {RELATIONSHIP_ORDER.map((t) => (
                <Dropdown.RadioItem
                  key={t}
                  value={t}
                  className="flex cursor-pointer select-none items-center gap-3 rounded-md px-2 py-1.5 outline-none data-[highlighted]:bg-surface-2"
                >
                  <RelationshipGlyph type={t} className="shrink-0 text-fg-2" />
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-medium capitalize text-fg">{UML[t].verb}</div>
                    <div className="text-[11.5px] text-muted">{UML[t].help}</div>
                  </div>
                  <Dropdown.ItemIndicator>
                    <Check className="size-3.5 text-primary" />
                  </Dropdown.ItemIndicator>
                </Dropdown.RadioItem>
              ))}
            </Dropdown.RadioGroup>
          </Dropdown.Content>
        </Dropdown.Portal>
      </Dropdown.Root>
      <span className="mx-1 h-5 w-px bg-border" />
      <button type="button" className={btn} onClick={onRelayout} title="Arrange automatically">
        <LayoutGrid className="size-3.5" /> <span className="hidden lg:inline">Auto-layout</span>
      </button>
      <button type="button" className={btn} onClick={onFit} title="Fit to screen" aria-label="Fit to screen">
        <Maximize className="size-3.5" />
      </button>
    </div>
  );
}

function RequirementsDock({
  problem,
  design,
  selectedEntity,
  onToggle,
}: {
  problem: ProblemDTO;
  design: DesignModel;
  selectedEntity?: Entity;
  onToggle: (requirementId: string, entityName: string) => void;
}) {
  const all = [...problem.functionalRequirements, ...problem.nonFunctionalRequirements];
  const mapped = problem.functionalRequirements.filter((r) => isMapped(design, r.id)).length;
  const target = selectedEntity?.name.trim() ? selectedEntity : undefined;
  return (
    <div className="flex min-w-0 flex-1 items-center gap-3 overflow-x-auto scrollbar-thin">
      <span className="shrink-0 text-xs text-muted">
        <span className="font-medium text-fg-2">
          {mapped}/{problem.functionalRequirements.length}
        </span>{' '}
        owned · {target ? <>click to assign to <span className="font-medium text-fg-2">{target.name}</span>, or drag:</> : 'drag onto its class:'}
      </span>
      <div className="flex gap-1.5">
        {all.map((r) => {
          const done = isMapped(design, r.id);
          const ownedBySelection = target ? (design.requirementMap[r.id] ?? []).some((n) => nameKey(n) === nameKey(target.name)) : false;
          return (
            <button
              key={r.id}
              type="button"
              draggable
              aria-pressed={target ? ownedBySelection : undefined}
              onDragStart={(e) => {
                e.dataTransfer.setData(REQ_MIME, r.id);
                e.dataTransfer.effectAllowed = 'link';
              }}
              onClick={() => {
                if (target) onToggle(r.id, target.name.trim());
                else toast.info(`Drag ${r.id} onto the class that owns it, or select a class first and click ${r.id}.`);
              }}
              title={`${r.id}: ${r.text}`}
              className={cn(
                'inline-flex h-7 shrink-0 cursor-grab select-none items-center gap-1 rounded-md border px-2 font-mono text-[11.5px] font-medium transition active:cursor-grabbing',
                done ? 'border-success/30 bg-success-soft text-success-soft-fg' : 'border-dashed border-border-strong bg-surface text-fg-2 hover:border-primary hover:text-primary',
                ownedBySelection && 'ring-2 ring-primary',
              )}
            >
              {done && <Check className="size-3" />}
              {r.id}
            </button>
          );
        })}
      </div>
    </div>
  );
}
