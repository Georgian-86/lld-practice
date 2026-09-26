import { ArrowRight, Check, FileSearch, MessagesSquare, PenTool, Route, Sparkles, Zap } from 'lucide-react';
import type { ComponentType, ReactNode } from 'react';
import { Link } from 'react-router';
import { ScoreRing } from '@/components/ui/score';
import { cn } from '@/lib/cn';
import { HeroDiagram } from './hero-diagram';

/*
 * The landing page. The hero is deliberately dark in both themes ("midnight
 * blueprint"): a drafting grid under soft indigo/violet/cyan light, with the
 * product itself (a live diagram, a score, an AI finding, a curveball result)
 * as the visual instead of an illustration. Colours here are fixed, not theme
 * tokens, because the band never changes with the theme; each text colour is
 * chosen to stay above WCAG AA on #070b1f.
 */

export function LandingHero({ primary, onSample, sampleLoading }: { primary?: { to: string; label: string }; onSample?: () => void; sampleLoading?: boolean }) {
  return (
    <section className="relative isolate overflow-hidden bg-[#070b1f] text-white" aria-labelledby="hero-heading">
      {/* Light and grid */}
      <div
        className="absolute inset-0 -z-10"
        aria-hidden
        style={{
          background:
            'radial-gradient(700px circle at 12% 18%, rgba(99,102,241,0.38), transparent 60%), radial-gradient(640px circle at 88% 22%, rgba(168,85,247,0.30), transparent 60%), radial-gradient(760px circle at 62% 105%, rgba(34,211,238,0.20), transparent 60%)',
        }}
      />
      <div
        className="absolute inset-0 -z-10 opacity-60 [mask-image:radial-gradient(ellipse_at_center,black_35%,transparent_80%)]"
        aria-hidden
        style={{
          backgroundImage: 'linear-gradient(rgba(148,163,184,0.09) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.09) 1px, transparent 1px)',
          backgroundSize: '32px 32px',
        }}
      />

      <div className="mx-auto grid max-w-[1200px] grid-cols-1 items-center gap-12 px-4 pb-10 pt-14 sm:px-6 sm:pt-20 lg:grid-cols-[1fr_1.05fr] lg:gap-10 lg:pb-16">
        <div>
          <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 py-1 pl-1 pr-3 text-[12.5px] font-medium text-indigo-100 backdrop-blur">
            <span className="rounded-full bg-gradient-to-r from-indigo-500 to-violet-500 px-2 py-0.5 text-[11px] font-semibold text-white">New</span>
            Curveballs aimed at your own design
          </span>
          <h1 id="hero-heading" className="mt-6 text-[38px] font-semibold leading-[1.06] tracking-[-0.02em] sm:text-[52px]">
            Low-level design,
            <br />
            practised like the
            <br />
            <span className="bg-gradient-to-r from-indigo-300 via-fuchsia-300 to-amber-200 bg-clip-text text-transparent">real interview.</span>
          </h1>
          <p className="mt-5 max-w-xl text-[16px] leading-relaxed text-slate-300 sm:text-[17px]">
            Draw your classes on a UML canvas, walk a requirement through them, and take the interviewer’s curveball. Every attempt gets explainable feedback
            from 16 design rules and an AI reviewer, scored on the properties of your design, not on matching one “right” answer.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            {primary && (
              <Link
                to={primary.to}
                className="group inline-flex h-12 items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 px-5 text-[15px] font-semibold text-white shadow-[0_8px_30px_-6px_rgba(99,102,241,0.65)] transition hover:brightness-110 focus-visible:outline-white"
              >
                {primary.label}
                <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
              </Link>
            )}
            {onSample && (
              <button
                type="button"
                onClick={onSample}
                disabled={sampleLoading}
                className="inline-flex h-12 items-center gap-2 rounded-xl border border-white/20 bg-white/[0.07] px-5 text-[15px] font-semibold text-white backdrop-blur transition hover:bg-white/[0.12] focus-visible:outline-white disabled:opacity-70"
              >
                <FileSearch className="size-4" />
                {sampleLoading ? 'Opening sample…' : 'See a sample report'}
              </button>
            )}
          </div>

          <ul className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-[13px] text-slate-300">
            {['No sign-up', 'Free', 'Your history is kept'].map((t) => (
              <li key={t} className="inline-flex items-center gap-1.5">
                <Check className="size-3.5 text-emerald-300" /> {t}
              </li>
            ))}
          </ul>
        </div>

        <ProductShot />
      </div>

      <dl className="mx-auto grid max-w-[1200px] grid-cols-2 gap-px overflow-hidden border-t border-white/10 sm:grid-cols-4">
        {[
          ['16', 'deterministic design rules'],
          ['4', 'interview problems'],
          ['12', 'curveballs, plus one aimed at you'],
          ['AI', 'review grounded on the rules'],
        ].map(([value, label]) => (
          <div key={label} className="px-4 py-5 text-center sm:px-6">
            <dt className="sr-only">{label}</dt>
            <dd>
              <span className="block text-[26px] font-semibold tracking-tight text-white">{value}</span>
              <span className="mt-0.5 block text-[12.5px] text-slate-400">{label}</span>
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/** The product as the hero visual: an app window with the diagram, plus the three things that come back from it. */
function ProductShot() {
  return (
    <div className="relative mx-auto hidden w-full max-w-[600px] sm:block" aria-hidden>
      <div className="absolute -inset-6 -z-10 rounded-[32px] bg-gradient-to-tr from-indigo-500/25 via-violet-500/10 to-cyan-400/20 blur-2xl" />
      <div className="overflow-hidden rounded-2xl border border-white/15 bg-surface shadow-[0_30px_80px_-20px_rgba(0,0,0,0.7)] ring-1 ring-black/5">
        <div className="flex items-center gap-1.5 border-b border-border bg-surface-2 px-3.5 py-2.5">
          <span className="size-2.5 rounded-full bg-[#ff5f57]" />
          <span className="size-2.5 rounded-full bg-[#febc2e]" />
          <span className="size-2.5 rounded-full bg-[#28c840]" />
          <span className="ml-3 rounded-md bg-surface px-2.5 py-0.5 text-[11px] text-muted">Parking Lot · Draft v2</span>
        </div>
        <div className="blueprint-grid bg-[var(--canvas-bg)] p-2">
          <HeroDiagram className="w-full" />
        </div>
      </div>

      <FloatingCard className="-right-5 -top-7 hidden w-[190px] lg:flex">
        <ScoreRing score={86} size={46} stroke={5} />
        <div>
          <div className="text-[13px] font-semibold text-fg">Excellent</div>
          <div className="text-[11.5px] text-muted">
            <span className="font-semibold text-success">+17</span> since v1
          </div>
        </div>
      </FloatingCard>

      <FloatingCard className="-left-12 top-[52%] hidden w-[240px] items-start lg:flex">
        <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-ai-soft text-ai">
          <Sparkles className="size-3.5" />
        </span>
        <div className="min-w-0">
          <div className="text-[12.5px] font-semibold text-fg">Pricing is behind a seam</div>
          <div className="mt-0.5 text-[11.5px] leading-snug text-muted">New tariffs become new classes, not edits to ParkingLot.</div>
        </div>
      </FloatingCard>

      <FloatingCard className="-bottom-8 -right-6 hidden w-[235px] lg:flex">
        <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-success-soft text-success">
          <Zap className="size-3.5" />
        </span>
        <div>
          <div className="text-[12.5px] font-semibold text-fg">Curveball absorbed</div>
          <div className="text-[11.5px] text-muted">
            <span className="font-semibold text-success">+1 new</span> · 0 existing classes changed
          </div>
        </div>
      </FloatingCard>
    </div>
  );
}

function FloatingCard({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('absolute z-10 items-center gap-3 rounded-xl border border-border bg-surface/95 p-3 shadow-xl backdrop-blur', className)}>
      {children}
    </div>
  );
}

const FEATURES: { icon: ComponentType<{ className?: string }>; title: string; text: string; tone: string }[] = [
  {
    icon: PenTool,
    title: 'Draw real UML',
    text: 'Classes, interfaces and proper relationship notation on a canvas, with design checks running live as you draw.',
    tone: 'from-indigo-500 to-blue-500',
  },
  {
    icon: Route,
    title: 'Walk it through',
    text: 'Click classes in call order to prove a requirement works. Every call is checked against your diagram and becomes a sequence diagram.',
    tone: 'from-emerald-500 to-teal-500',
  },
  {
    icon: Zap,
    title: 'Survive the curveball',
    text: 'The interviewer changes the requirements. See the blast radius: which classes you added, and which existing ones had to change.',
    tone: 'from-amber-500 to-orange-500',
  },
  {
    icon: MessagesSquare,
    title: 'Feedback that explains itself',
    text: 'Every point says whether a rule or the AI raised it, names your own classes, and links back into the editor.',
    tone: 'from-violet-500 to-fuchsia-500',
  },
];

export function LandingFeatures() {
  return (
    <section className="mx-auto w-full max-w-[1200px] px-4 pt-16 sm:px-6" aria-labelledby="features-heading">
      <div className="max-w-2xl">
        <p className="text-[13px] font-semibold uppercase tracking-wider text-primary">Why Blueprint</p>
        <h2 id="features-heading" className="mt-2 text-[28px] font-semibold leading-tight tracking-tight text-fg sm:text-[32px]">
          The parts of an LLD interview that other tools skip
        </h2>
        <p className="mt-3 text-[15px] leading-relaxed text-muted">
          Reading solutions feels like learning. Designing, defending and adapting your own is what actually gets tested.
        </p>
      </div>
      <ul className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {FEATURES.map((f) => (
          <li
            key={f.title}
            className="group relative overflow-hidden rounded-2xl border border-border bg-surface p-5 shadow-xs transition hover:-translate-y-0.5 hover:shadow-md"
          >
            <span className={cn('grid size-10 place-items-center rounded-xl bg-gradient-to-br text-white shadow-sm', f.tone)}>
              <f.icon className="size-5" />
            </span>
            <h3 className="mt-4 text-[15px] font-semibold text-fg">{f.title}</h3>
            <p className="mt-1.5 text-[13.5px] leading-relaxed text-muted">{f.text}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

const STEPS = [
  { title: 'Pick a problem', text: 'Clear requirements and the likely points of change.' },
  { title: 'Design it', text: 'Draw, trace requirements, walk scenarios through.' },
  { title: 'Get feedback', text: 'Rules and AI, scored on a rubric, in seconds.' },
  { title: 'Take the curveball', text: 'Adapt the design and measure the blast radius.' },
];

export function LandingSteps() {
  return (
    <section className="mx-auto w-full max-w-[1200px] px-4 pt-14 sm:px-6" aria-labelledby="steps-heading">
      <h2 id="steps-heading" className="sr-only">
        How it works
      </h2>
      <ol className="grid grid-cols-1 gap-4 rounded-2xl border border-border bg-gradient-to-br from-primary-soft/60 via-surface to-surface p-5 sm:grid-cols-2 lg:grid-cols-4 lg:gap-0 lg:p-0">
        {STEPS.map((s, i) => (
          <li key={s.title} className={cn('flex gap-3 lg:p-6', i > 0 && 'lg:border-l lg:border-border')}>
            <span className="grid size-8 shrink-0 place-items-center rounded-full bg-primary-solid text-[13px] font-semibold text-primary-fg">{i + 1}</span>
            <div>
              <div className="text-[14px] font-semibold text-fg">{s.title}</div>
              <div className="mt-0.5 text-[13px] leading-relaxed text-muted">{s.text}</div>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
