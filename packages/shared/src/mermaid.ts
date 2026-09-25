import type { DesignModel, Entity, EntityKind, Relationship, RelationshipType } from './design';
import { nameKey } from './design';

/**
 * Parser and generator for a pragmatic subset of Mermaid `classDiagram`.
 *
 * Direction convention used across the design model:
 *  - inheritance / implementation: from = child,   to = parent
 *  - composition / aggregation:    from = whole,   to = part
 *  - association / dependency:     from = user,    to = used
 */

export interface MermaidIssue {
  line: number;
  message: string;
}

export interface MermaidParseResult {
  entities: Entity[];
  relationships: Relationship[];
  errors: MermaidIssue[];
  warnings: MermaidIssue[];
}

interface ArrowSpec {
  type: RelationshipType;
  /** true when the arrow points "backwards", i.e. the right-hand side is `from`. */
  reversed: boolean;
}

// Longest tokens first so `<|--` is not matched as `--`.
const ARROWS: [string, ArrowSpec][] = [
  ['<|--', { type: 'inheritance', reversed: true }],
  ['--|>', { type: 'inheritance', reversed: false }],
  ['<|..', { type: 'implementation', reversed: true }],
  ['..|>', { type: 'implementation', reversed: false }],
  ['*--', { type: 'composition', reversed: false }],
  ['--*', { type: 'composition', reversed: true }],
  ['o--', { type: 'aggregation', reversed: false }],
  ['--o', { type: 'aggregation', reversed: true }],
  ['-->', { type: 'association', reversed: false }],
  ['<--', { type: 'association', reversed: true }],
  ['..>', { type: 'dependency', reversed: false }],
  ['<..', { type: 'dependency', reversed: true }],
  ['--', { type: 'association', reversed: false }],
  ['..', { type: 'dependency', reversed: false }],
];

const ARROW_PATTERN = ARROWS.map(([token]) => token.replace(/[|*.]/g, (c) => `\\${c}`)).join('|');
const NAME = '([A-Za-z_][\\w~]*)';
const RELATIONSHIP_RE = new RegExp(
  `^${NAME}\\s*(?:"([^"]*)")?\\s*(${ARROW_PATTERN})\\s*(?:"([^"]*)")?\\s*${NAME}\\s*(?::\\s*(.*))?$`,
);
const CLASS_OPEN_RE = /^class\s+([A-Za-z_][\w~]*)\s*(?:\[\s*"[^"]*"\s*\])?\s*\{\s*$/;
const CLASS_DECL_RE = /^class\s+([A-Za-z_][\w~]*)\s*(?:\[\s*"[^"]*"\s*\])?\s*$/;
const ANNOTATION_LINE_RE = /^<<\s*(\w+)\s*>>\s*([A-Za-z_][\w~]*)?\s*$/;
const MEMBER_LINE_RE = /^([A-Za-z_][\w~]*)\s*:\s*(.+)$/;

function stripGenerics(name: string): string {
  return name.replace(/~[^~]*~/g, '');
}

function kindFromAnnotation(annotation: string): EntityKind | null {
  const a = annotation.toLowerCase();
  if (a === 'interface') return 'interface';
  if (a === 'abstract') return 'abstract';
  if (a === 'enumeration' || a === 'enum') return 'enum';
  return null;
}

export function parseMermaidClassDiagram(source: string): MermaidParseResult {
  const entities = new Map<string, Entity>();
  const relationships: Relationship[] = [];
  const errors: MermaidIssue[] = [];
  const warnings: MermaidIssue[] = [];
  let sawHeader = false;
  let openClass: Entity | null = null;

  const ensureEntity = (rawName: string): Entity => {
    const name = stripGenerics(rawName);
    const key = nameKey(name);
    let entity = entities.get(key);
    if (!entity) {
      entity = {
        id: `m-e${entities.size + 1}`,
        name,
        kind: 'class',
        responsibilities: [],
        attributes: [],
        methods: [],
      };
      entities.set(key, entity);
    }
    return entity;
  };

  const addMember = (entity: Entity, member: string) => {
    const text = member.trim();
    if (!text) return;
    const annotation = text.match(/^<<\s*(\w+)\s*>>$/);
    if (annotation) {
      const kind = kindFromAnnotation(annotation[1]!);
      if (kind) entity.kind = kind;
      return;
    }
    if (text.includes('(')) entity.methods.push(text);
    else if (entity.kind === 'enum') entity.attributes.push(text);
    else entity.attributes.push(text);
  };

  const lines = source.split(/\r?\n/);
  lines.forEach((rawLine, index) => {
    const lineNo = index + 1;
    const line = rawLine.replace(/%%.*$/, '').trim();
    if (!line) return;

    if (openClass) {
      if (line === '}') {
        openClass = null;
        return;
      }
      addMember(openClass, line);
      return;
    }

    if (!sawHeader) {
      if (/^classDiagram(-v2)?\b/.test(line)) {
        sawHeader = true;
        return;
      }
      errors.push({ line: lineNo, message: 'Diagram must start with "classDiagram".' });
      sawHeader = true; // report once, keep parsing to surface more issues
    }

    if (/^(direction|note|style|classDef|cssClass|click|link|callback)\b/.test(line)) return;

    let match = line.match(CLASS_OPEN_RE);
    if (match) {
      openClass = ensureEntity(match[1]!);
      return;
    }
    match = line.match(CLASS_DECL_RE);
    if (match) {
      ensureEntity(match[1]!);
      return;
    }
    match = line.match(ANNOTATION_LINE_RE);
    if (match) {
      const kind = kindFromAnnotation(match[1]!);
      if (!match[2]) {
        warnings.push({ line: lineNo, message: 'Annotation outside a class block has no target class.' });
      } else if (kind) {
        ensureEntity(match[2]).kind = kind;
      }
      return;
    }
    match = line.match(RELATIONSHIP_RE);
    if (match) {
      const [, left, leftCard, arrow, rightCard, right, label] = match;
      const spec = ARROWS.find(([token]) => token === arrow)![1];
      const leftEntity = ensureEntity(left!);
      const rightEntity = ensureEntity(right!);
      const [from, to] = spec.reversed ? [rightEntity, leftEntity] : [leftEntity, rightEntity];
      const cardinality = [leftCard, rightCard].filter(Boolean);
      relationships.push({
        id: `m-r${relationships.length + 1}`,
        from: from.name,
        to: to.name,
        type: spec.type,
        ...(label?.trim() ? { label: label.trim() } : {}),
        ...(cardinality.length ? { multiplicity: (spec.reversed ? cardinality.reverse() : cardinality).join(' → ') } : {}),
      });
      return;
    }
    match = line.match(MEMBER_LINE_RE);
    if (match) {
      addMember(ensureEntity(match[1]!), match[2]!);
      return;
    }
    warnings.push({ line: lineNo, message: `Could not understand "${line.slice(0, 60)}" — line ignored.` });
  });

  if (openClass) {
    errors.push({ line: lines.length, message: `Class "${(openClass as Entity).name}" is missing a closing "}".` });
  }
  if (!sawHeader) {
    errors.push({ line: 1, message: 'Diagram is empty. Start with "classDiagram".' });
  } else if (entities.size === 0 && errors.length === 0) {
    errors.push({ line: 1, message: 'No classes found in the diagram.' });
  }

  return { entities: [...entities.values()], relationships, errors, warnings };
}

/* ------------------------------------------------------------------------ */
/* Generator                                                                 */
/* ------------------------------------------------------------------------ */

const TYPE_TO_ARROW: Record<RelationshipType, string> = {
  inheritance: '--|>',
  implementation: '..|>',
  composition: '*--',
  aggregation: 'o--',
  association: '-->',
  dependency: '..>',
};

/** Mermaid identifiers must be simple words; keep a stable mapping from display names. */
export function mermaidId(name: string): string {
  const cleaned = name.trim().replace(/[^A-Za-z0-9_]/g, '_');
  if (!cleaned) return '_';
  return /^[0-9]/.test(cleaned) ? `_${cleaned}` : cleaned;
}

function sanitizeMember(text: string): string {
  // Mermaid writes return types as `method(args) Type`; `method(args): Type` renders as ": :".
  const normalised = text.includes('(') ? text.replace(/\)\s*:\s*/, ') ') : text;
  return normalised
    .replace(/[{}]/g, '')
    .replace(/[<>]/g, '~')
    .replace(/%%/g, '')
    .replace(/[\r\n]+/g, ' ')
    .trim();
}

function sanitizeLabel(text: string): string {
  return text.replace(/["\r\n:;]/g, ' ').trim();
}

export function designToMermaid(design: Pick<DesignModel, 'entities' | 'relationships'>): string {
  const lines = ['classDiagram'];
  const known = new Map<string, string>();
  for (const entity of design.entities) {
    if (!entity.name.trim()) continue;
    const id = mermaidId(entity.name);
    known.set(nameKey(entity.name), id);
    const annotation =
      entity.kind === 'interface'
        ? '<<interface>>'
        : entity.kind === 'abstract'
          ? '<<abstract>>'
          : entity.kind === 'enum'
            ? '<<enumeration>>'
            : null;
    const members = [...entity.attributes, ...entity.methods].map(sanitizeMember).filter(Boolean);
    if (!annotation && members.length === 0) {
      lines.push(`  class ${id}`);
      continue;
    }
    lines.push(`  class ${id} {`);
    if (annotation) lines.push(`    ${annotation}`);
    for (const member of members) lines.push(`    ${member}`);
    lines.push('  }');
  }
  for (const rel of design.relationships) {
    const from = known.get(nameKey(rel.from));
    const to = known.get(nameKey(rel.to));
    if (!from || !to) continue; // dangling references are reported by rules, not drawn
    const label = rel.label ? sanitizeLabel(rel.label) : '';
    lines.push(`  ${from} ${TYPE_TO_ARROW[rel.type]} ${to}${label ? ` : ${label}` : ''}`);
  }
  return lines.join('\n');
}
