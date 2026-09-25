import { useId } from 'react';
import { AutoTextarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/misc';
import { cn } from '@/lib/cn';
import { nonBlank } from './draft-reducer';

/**
 * A list edited as "one item per line". Blank lines are kept while typing
 * (so the caret never jumps) and dropped when the design is evaluated.
 */
export function LinesField({
  label,
  value,
  onChange,
  placeholder,
  mono = false,
  minRows = 3,
}: {
  label: string;
  value: string[];
  onChange: (lines: string[]) => void;
  placeholder: string;
  mono?: boolean;
  minRows?: number;
}) {
  const id = useId();
  const count = nonBlank(value).length;
  return (
    <div>
      <Label htmlFor={id} hint={count ? `${count} ${count === 1 ? 'item' : 'items'}` : 'One per line'}>
        {label}
      </Label>
      <AutoTextarea
        id={id}
        value={value.join('\n')}
        onChange={(e) => onChange(e.target.value.split('\n'))}
        placeholder={placeholder}
        minRows={minRows}
        className={cn(mono && 'font-mono text-[13px]')}
        spellCheck={!mono}
      />
    </div>
  );
}
