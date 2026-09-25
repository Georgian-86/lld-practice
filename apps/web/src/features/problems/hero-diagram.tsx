import type { CSSProperties } from 'react';

/**
 * Decorative illustration for the home page: a small class diagram that
 * assembles itself, with a scenario walkthrough and a curveball class, i.e.
 * the three things that make Blueprint different. Pure SVG + theme tokens.
 */
const delay = (ms: number): CSSProperties => ({ animationDelay: `${Math.round(ms * 0.6)}ms` });

function Box({
  x,
  y,
  w = 150,
  name,
  stereotype,
  members,
  tone = 'primary',
  at,
}: {
  x: number;
  y: number;
  w?: number;
  name: string;
  stereotype?: string;
  members: string[];
  tone?: 'primary' | 'ai' | 'success';
  at: number;
}) {
  const head = stereotype ? 40 : 28;
  const h = head + 10 + members.length * 16;
  const fill = { primary: 'var(--primary-soft)', ai: 'var(--ai-soft)', success: 'var(--success-soft)' }[tone];
  const stroke = tone === 'success' ? 'var(--success)' : 'var(--uml-border)';
  return (
    <g className="hero-rise" style={delay(at)}>
      <rect x={x} y={y} width={w} height={h} rx={8} fill="var(--surface)" stroke={stroke} strokeWidth={tone === 'success' ? 2 : 1.2} />
      <path d={`M${x} ${y + 8} a8 8 0 0 1 8 -8 h${w - 16} a8 8 0 0 1 8 8 v${head - 8} h${-w} z`} fill={fill} />
      {stereotype && (
        <text x={x + w / 2} y={y + 15} textAnchor="middle" fontSize="9.5" fill="var(--muted)">
          {stereotype}
        </text>
      )}
      <text x={x + w / 2} y={y + head - 10} textAnchor="middle" fontSize="12.5" fontWeight="600" fill="var(--fg)">
        {name}
      </text>
      <line x1={x} x2={x + w} y1={y + head} y2={y + head} stroke="var(--uml-border)" />
      {members.map((m, i) => (
        <text key={m} x={x + 10} y={y + head + 18 + i * 16} fontSize="10.5" fontFamily="'JetBrains Mono', ui-monospace, monospace" fill="var(--fg-2)">
          {m}
        </text>
      ))}
    </g>
  );
}

function Call({ d, n, label, lx, ly, at }: { d: string; n: number; label: string; lx: number; ly: number; at: number }) {
  return (
    <g>
      <g className="hero-rise" style={delay(at)}>
        <path d={d} fill="none" stroke="var(--ai)" strokeWidth={2} markerEnd="url(#hero-call)" className="hero-draw" style={delay(at)} />
      </g>
      <g className="hero-rise" style={delay(at + 500)}>
        <rect x={lx} y={ly - 10} width={label.length * 6.4 + 28} height={20} rx={10} fill="var(--surface)" stroke="var(--ai)" strokeOpacity={0.45} />
        <circle cx={lx + 10} cy={ly} r={7} fill="var(--ai)" />
        <text x={lx + 10} y={ly + 3.5} textAnchor="middle" fontSize="9.5" fontWeight="700" fill="#fff">
          {n}
        </text>
        <text x={lx + 22} y={ly + 3.5} fontSize="10.5" fontFamily="'JetBrains Mono', ui-monospace, monospace" fill="var(--ai-soft-fg)">
          {label}
        </text>
      </g>
    </g>
  );
}

export function HeroDiagram({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 540 400" className={className} role="img" aria-label="A class diagram of a parking lot with a numbered call sequence and a newly added class">
      <defs>
        <marker id="hero-call" viewBox="0 0 12 12" refX="11" refY="6" markerWidth="10" markerHeight="10" orient="auto">
          <path d="M1,1 L11,6 L1,11 Z" fill="var(--ai)" />
        </marker>
        <marker id="hero-triangle" viewBox="0 0 20 20" refX="19" refY="10" markerWidth="16" markerHeight="16" markerUnits="userSpaceOnUse" orient="auto">
          <path d="M1,1 L19,10 L1,19 Z" fill="var(--surface)" stroke="var(--uml-line)" strokeWidth="1.5" strokeLinejoin="round" />
        </marker>
        <marker id="hero-arrow" viewBox="0 0 16 16" refX="15" refY="8" markerWidth="12" markerHeight="12" markerUnits="userSpaceOnUse" orient="auto">
          <path d="M1,1 L15,8 L1,15" fill="none" stroke="var(--uml-line)" strokeWidth="1.5" strokeLinecap="round" />
        </marker>
        <marker id="hero-diamond" viewBox="0 0 24 14" refX="1" refY="7" markerWidth="22" markerHeight="13" markerUnits="userSpaceOnUse" orient="auto">
          <path d="M1,7 L12,1 L23,7 L12,13 Z" fill="var(--uml-line)" />
        </marker>
      </defs>

      {/* Relationships */}
      <g className="hero-rise" style={delay(700)} stroke="var(--uml-line)" strokeWidth={1.4} fill="none">
        <path d="M105 106 L220 168" strokeDasharray="6 4" markerEnd="url(#hero-arrow)" />
        <path d="M345 190 L380 106" markerEnd="url(#hero-arrow)" />
        <path d="M270 238 L200 292" markerStart="url(#hero-diamond)" />
        <path d="M395 290 L420 122" strokeDasharray="6 4" markerEnd="url(#hero-triangle)" />
      </g>

      <Box x={20} y={40} name="EntryGate" members={['enter(vehicle)']} at={0} />
      <Box x={200} y={170} w={160} name="ParkingLot" members={['park(vehicle)', 'unpark(ticket)']} at={120} />
      <Box x={360} y={30} w={160} name="PricingStrategy" stereotype="«interface»" members={['fee(ticket)']} tone="ai" at={240} />
      <Box x={60} y={292} w={150} name="Floor" members={['findFree(type)']} at={360} />

      {/* The curveball class: added, nothing else touched */}
      <g>
        <Box x={330} y={290} w={180} name="EvChargingPricing" members={['fee(ticket)']} tone="success" at={1500} />
        <g className="hero-rise" style={delay(1700)}>
          <rect x={340} y={278} width={34} height={18} rx={9} fill="var(--success)" />
          <text x={357} y={290.5} textAnchor="middle" fontSize="10" fontWeight="700" fill="#fff">
            new
          </text>
        </g>
      </g>

      {/* Scenario walkthrough */}
      <Call d="M150 70 C 230 70, 270 110, 276 162" n={1} label="park(v)" lx={196} ly={96} at={900} />
      <Call d="M362 200 C 420 190, 450 150, 446 116" n={2} label="fee(t)" lx={430} ly={168} at={1150} />
    </svg>
  );
}
