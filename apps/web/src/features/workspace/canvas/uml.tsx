import type { RelationshipType } from '@blueprint/shared';

/**
 * UML notation for each relationship type, drawn with SVG markers.
 * Markers use `orient="auto-start-reverse"` so one definition serves both ends.
 */
export const UML: Record<
  RelationshipType,
  { verb: string; dashed: boolean; start?: string; end?: string; help: string }
> = {
  association: { verb: 'uses', dashed: false, end: 'uml-arrow', help: 'Holds a reference to' },
  dependency: { verb: 'depends on', dashed: true, end: 'uml-arrow', help: 'Uses briefly (parameter, local, return)' },
  aggregation: { verb: 'has', dashed: false, start: 'uml-diamond', help: 'Groups; parts can outlive the whole' },
  composition: { verb: 'owns', dashed: false, start: 'uml-diamond-filled', help: 'Owns; parts live and die with the whole' },
  inheritance: { verb: 'extends', dashed: false, end: 'uml-triangle', help: 'Is a subclass of' },
  implementation: { verb: 'implements', dashed: true, end: 'uml-triangle', help: 'Implements the interface' },
};

export const RELATIONSHIP_ORDER: RelationshipType[] = ['association', 'dependency', 'aggregation', 'composition', 'inheritance', 'implementation'];

/** Rendered once per canvas; edges reference the markers by id. */
export function UmlMarkerDefs() {
  const stroke = 'var(--uml-line)';
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden>
      <defs>
        <marker id="uml-triangle" viewBox="0 0 20 20" refX="19" refY="10" markerWidth="18" markerHeight="18" markerUnits="userSpaceOnUse" orient="auto-start-reverse">
          <path d="M1,1 L19,10 L1,19 Z" fill="var(--surface)" stroke={stroke} strokeWidth="1.6" strokeLinejoin="round" />
        </marker>
        <marker id="uml-diamond" viewBox="0 0 24 14" refX="23" refY="7" markerWidth="24" markerHeight="14" markerUnits="userSpaceOnUse" orient="auto-start-reverse">
          <path d="M1,7 L12,1 L23,7 L12,13 Z" fill="var(--surface)" stroke={stroke} strokeWidth="1.6" strokeLinejoin="round" />
        </marker>
        <marker id="uml-diamond-filled" viewBox="0 0 24 14" refX="23" refY="7" markerWidth="24" markerHeight="14" markerUnits="userSpaceOnUse" orient="auto-start-reverse">
          <path d="M1,7 L12,1 L23,7 L12,13 Z" fill={stroke} stroke={stroke} strokeWidth="1.6" strokeLinejoin="round" />
        </marker>
        <marker id="uml-arrow" viewBox="0 0 16 16" refX="15" refY="8" markerWidth="14" markerHeight="14" markerUnits="userSpaceOnUse" orient="auto-start-reverse">
          <path d="M1,1 L15,8 L1,15" fill="none" stroke={stroke} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </marker>
      </defs>
    </svg>
  );
}

/** Small inline glyph of a relationship's notation, for pickers and legends. */
export function RelationshipGlyph({ type, className }: { type: RelationshipType; className?: string }) {
  const v = UML[type];
  const s = 'currentColor';
  return (
    <svg viewBox="0 0 40 14" className={className} width="40" height="14" aria-hidden>
      <line x1={v.start ? 12 : 2} y1="7" x2={v.end === 'uml-triangle' ? 29 : 36} y2="7" stroke={s} strokeWidth="1.5" strokeDasharray={v.dashed ? '4 3' : undefined} />
      {v.start === 'uml-diamond' && <path d="M1,7 L7,3.5 L13,7 L7,10.5 Z" fill="none" stroke={s} strokeWidth="1.3" />}
      {v.start === 'uml-diamond-filled' && <path d="M1,7 L7,3.5 L13,7 L7,10.5 Z" fill={s} stroke={s} strokeWidth="1.3" />}
      {v.end === 'uml-triangle' && <path d="M29,2 L38,7 L29,12 Z" fill="none" stroke={s} strokeWidth="1.3" strokeLinejoin="round" />}
      {v.end === 'uml-arrow' && <path d="M31,3 L38,7 L31,11" fill="none" stroke={s} strokeWidth="1.4" strokeLinecap="round" />}
    </svg>
  );
}
