/**
 * ============================================================================
 * UI / TEXTAREA (Shadcn UI)
 * ----------------------------------------------------------------------------
 * Yanıt mesajı gibi uzun metin alanları için. `maxLength` prop'u backend'deki
 * `AUTOMATION_LIMITS.MAX_REPLY_LENGTH` (1000) ile aynı değere bağlıdır.
 * ============================================================================
 */

'use client';

import * as React from 'react';

import { cn } from '@/lib/utils';

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean;
}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, invalid = false, ...props }, ref) => (
    <textarea
      ref={ref}
      aria-invalid={invalid}
      className={cn(
        'flex min-h-[96px] w-full rounded-md border bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
        invalid ? 'border-destructive focus-visible:ring-destructive' : 'border-input',
        className,
      )}
      {...props}
    />
  ),
);
Textarea.displayName = 'Textarea';

export { Textarea };