import type { DesignModel } from '@blueprint/shared';
import { designToMermaid, parseMermaidClassDiagram } from '@blueprint/shared';
import { Check, ClipboardCopy, FileInput, Network } from 'lucide-react';
import { useMemo, useState, type Dispatch } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/misc';
import { AutoTextarea } from '@/components/ui/textarea';
import type { DraftAction } from './draft-reducer';
import { MermaidView } from './mermaid-view';

const SAMPLE = `classDiagram
  class ParkingLot {
    +park(vehicle) Ticket
  }
  class PricingStrategy {
    <<interface>>
    +fee(ticket) Money
  }
  ParkingLot "1" *-- "many" Floor : has
  HourlyPricing ..|> PricingStrategy
  ParkingLot --> PricingStrategy`;

export function DiagramPanel({ design, dispatch }: { design: DesignModel; dispatch: Dispatch<DraftAction> }) {
  const source = useMemo(() => designToMermaid(design), [design]);
  const [importOpen, setImportOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const hasClasses = design.entities.some((e) => e.name.trim());

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(source);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error('Could not copy to the clipboard');
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-2.5">
        <p className="text-xs text-muted">Live class diagram generated from your design.</p>
        <div className="flex gap-2">
          <Button size="sm" variant="ghost" icon={copied ? <Check className="size-3.5" /> : <ClipboardCopy className="size-3.5" />} onClick={copy} disabled={!hasClasses}>
            {copied ? 'Copied' : 'Copy Mermaid'}
          </Button>
          <Button size="sm" icon={<FileInput className="size-3.5" />} onClick={() => setImportOpen(true)}>
            Import Mermaid
          </Button>
        </div>
      </div>
      <div className="scrollbar-thin min-h-0 flex-1 overflow-auto bg-surface-2/50 p-6">
        {hasClasses ? (
          <MermaidView source={source} className="mx-auto flex justify-center [&_svg]:h-auto [&_svg]:max-w-full" />
        ) : (
          <EmptyState
            icon={<Network className="size-5" />}
            title="Nothing to draw yet"
            description="Add classes and relationships, or import an existing Mermaid class diagram."
          />
        )}
      </div>
      <ImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        hasExisting={design.entities.length > 0}
        onImport={(entities, relationships) => {
          dispatch({ type: 'diagram/replace', entities, relationships });
          toast.success(`Imported ${entities.length} classes and ${relationships.length} relationships`);
          setImportOpen(false);
        }}
      />
    </div>
  );
}

function ImportDialog({
  open,
  onOpenChange,
  onImport,
  hasExisting,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImport: (...args: [DesignModel['entities'], DesignModel['relationships']]) => void;
  hasExisting: boolean;
}) {
  const [text, setText] = useState('');
  const result = useMemo(() => (text.trim() ? parseMermaidClassDiagram(text) : null), [text]);
  const ok = result && result.errors.length === 0 && result.entities.length > 0;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) setText('');
      }}
      size="lg"
      title="Import a Mermaid class diagram"
      description="Paste a classDiagram. Classes and relationships replace the ones in your design; responsibilities you already wrote are kept for classes with the same name."
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="primary" disabled={!ok} onClick={() => result && onImport(result.entities, result.relationships)}>
            {hasExisting ? 'Replace classes & relationships' : 'Import'}
          </Button>
        </>
      }
    >
      <AutoTextarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={SAMPLE}
        minRows={10}
        maxRows={18}
        className="font-mono text-[13px]"
        spellCheck={false}
        aria-label="Mermaid source"
      />
      <div className="mt-3 min-h-10 text-[13px]" aria-live="polite">
        {!result ? (
          <p className="text-muted">Supports class blocks, annotations (&lt;&lt;interface&gt;&gt;), members and all relationship arrows.</p>
        ) : result.errors.length ? (
          <ul className="space-y-1 text-danger">
            {result.errors.map((e) => (
              <li key={`${e.line}-${e.message}`}>
                Line {e.line}: {e.message}
              </li>
            ))}
          </ul>
        ) : (
          <div>
            <p className="font-medium text-success">
              Found {result.entities.length} classes and {result.relationships.length} relationships.
            </p>
            {result.warnings.length > 0 && (
              <ul className="mt-1 space-y-0.5 text-warning-soft-fg">
                {result.warnings.slice(0, 5).map((w) => (
                  <li key={`${w.line}-${w.message}`}>
                    Line {w.line}: {w.message}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </Dialog>
  );
}
