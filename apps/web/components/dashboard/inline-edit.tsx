/**
 * InlineEdit — Click-to-edit field with blur/enter save
 * TASK 5: FORM YASAK — inline edit, blur/save otomatik
 */

'use client';

import { useState, useRef, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { Pencil } from 'lucide-react';

interface InlineEditProps {
  value: string | number;
  onSave: (newValue: string) => void;
  /** Format display value (e.g. currency, minutes) */
  formatDisplay?: (value: string | number) => string;
  /** Input type */
  type?: 'text' | 'number';
  /** Suffix shown after value (e.g. "dk", "₺") */
  suffix?: string;
  /** Prefix shown before value */
  prefix?: string;
  className?: string;
  /** Size of the display text */
  size?: 'sm' | 'md';
}

export function InlineEdit({
  value,
  onSave,
  formatDisplay,
  type = 'text',
  suffix,
  prefix,
  className,
  size = 'sm',
}: InlineEditProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value));
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  function handleSave() {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== String(value)) {
      onSave(trimmed);
    }
    setEditing(false);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') {
      handleSave();
    } else if (e.key === 'Escape') {
      setDraft(String(value));
      setEditing(false);
    }
  }

  const displayValue = formatDisplay ? formatDisplay(value) : String(value);

  if (editing) {
    return (
      <div className={cn('flex items-center gap-1', className)}>
        {prefix && <span className="text-xs text-muted-foreground">{prefix}</span>}
        <input
          ref={inputRef}
          type={type}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={handleSave}
          onKeyDown={handleKeyDown}
          className={cn(
            'border rounded px-1.5 py-0.5 bg-background focus:outline-none focus:ring-1 focus:ring-primary',
            size === 'sm' ? 'text-xs w-16' : 'text-sm w-20',
          )}
          min={type === 'number' ? 0 : undefined}
        />
        {suffix && <span className="text-xs text-muted-foreground">{suffix}</span>}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => { setDraft(String(value)); setEditing(true); }}
      className={cn(
        'group inline-flex items-center gap-1 rounded px-1 -mx-1 transition-colors hover:bg-accent',
        className,
      )}
      title="Değeri düzenle"
    >
      {prefix && <span className="text-xs text-muted-foreground">{prefix}</span>}
      <span className={cn(
        'font-medium',
        size === 'sm' ? 'text-xs' : 'text-sm',
      )}>
        {displayValue}
      </span>
      {suffix && <span className="text-xs text-muted-foreground">{suffix}</span>}
      <Pencil className="h-2.5 w-2.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
    </button>
  );
}
