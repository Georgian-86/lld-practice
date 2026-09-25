import type { DesignModel, Finding } from '@blueprint/shared';
import { useEffect, useRef, useState } from 'react';
import { api } from '@/api/client';

/**
 * Runs the deterministic design rules on the server as the learner draws
 * (debounced). Only the latest request's answer is kept, so fast edits never
 * show stale results.
 */
export function useLiveChecks(problemId: string, design: DesignModel, enabled = true, delayMs = 500) {
  const [findings, setFindings] = useState<Finding[] | null>(null);
  const [checking, setChecking] = useState(false);
  const sequence = useRef(0);

  useEffect(() => {
    if (!enabled) return;
    const seq = ++sequence.current;
    setChecking(true);
    const timer = setTimeout(() => {
      api
        .lint(problemId, design)
        .then((res) => {
          if (seq === sequence.current) setFindings(res.findings);
        })
        .catch(() => {
          /* live checks are best-effort; submission scoring is authoritative */
        })
        .finally(() => {
          if (seq === sequence.current) setChecking(false);
        });
    }, delayMs);
    return () => clearTimeout(timer);
  }, [problemId, design, enabled, delayMs]);

  return { findings, checking };
}

/** Issues (not strengths / optional ideas) grouped by the class they point at. */
export function issuesByEntity(findings: Finding[] | null | undefined): Map<string, Finding[]> {
  const map = new Map<string, Finding[]>();
  for (const f of findings ?? []) {
    if (f.kind === 'strength' || f.severity === 'info') continue;
    for (const name of f.evidence.entities ?? []) {
      const key = name.trim().toLowerCase();
      map.set(key, [...(map.get(key) ?? []), f]);
    }
  }
  return map;
}
