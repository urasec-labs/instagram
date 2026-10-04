/**
 * ============================================================================
 * COMPONENTS / DASHBOARD / AUTOMATION FORM DIALOG
 * ----------------------------------------------------------------------------
 * Otomasyon ekleme / düzenleme modalı.
 *
 * Sorumlulukler:
 *  - Form alanlarını yönetir (yerel state)
 *  - Backend ile AYNI doğrulama kurallarını istemcide de uygular (anında geri bildirim)
 *  - Submit sırasında `createAutomation` / `updateAutomation` hook'unu çağırır
 *
 * Neden doğrulama iki yerde? Kullanıcı deneyimi (istemci) + güvenlik
 * (sunucu). İstemci doğrulaması asla güvenlik olarak kullanılmaz; sunucu
 * her koşulda yeniden doğrular.
 * ============================================================================
 */

'use client';

import * as React from 'react';
import { Loader2 } from 'lucide-react';

import { KeywordInput } from '@/components/dashboard/KeywordInput';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, type SelectOption } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  AUTOMATION_TRIGGER,
  MATCH_MODE,
  type Automation,
  type AutomationTrigger,
  type MatchMode,
} from '@/lib/types';

/** İş kuralları — backend `AUTOMATION_LIMITS` ile BİREBİR aynı. */
export const AUTOMATION_LIMITS = {
  MAX_KEYWORDS: 30,
  MAX_KEYWORD_LENGTH: 60,
  MAX_REPLY_LENGTH: 1000,
  MAX_NAME_LENGTH: 80,
} as const;

/** Modal içi form state. */
interface FormState {
  name: string;
  keywords: string[];
  matchMode: MatchMode;
  replyMessage: string;
  trigger: AutomationTrigger;
}

/** Alan bazlı hata mesajları. */
type FormErrors = Partial<Record<keyof FormState, string>>;

const MATCH_MODE_OPTIONS: readonly SelectOption<MatchMode>[] = [
  { value: MATCH_MODE.CONTAINS, label: 'İçinde geçen (Contains)', description: 'Mesajın içinde kelime arar' },
  { value: MATCH_MODE.EXACT, label: 'Tam eşleşme (Exact)', description: 'Mesaj kelimeyle birebir aynı olmalı' },
];

const TRIGGER_OPTIONS: readonly SelectOption<AutomationTrigger>[] = [
  { value: AUTOMATION_TRIGGER.INBOUND_MESSAGE, label: 'Gelen DM', description: 'Instagram mesajı' },
  { value: AUTOMATION_TRIGGER.INBOUND_COMMENT, label: 'Yorum', description: 'Gelen yorum' },
];

export interface AutomationFormDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  /** `null` → yeni otomasyon; doluysa → düzenleme modu. */
  readonly automation?: Automation | null;
  readonly onSubmit: (data: {
    name: string;
    keywords: string[];
    matchMode: MatchMode;
    replyMessage: string;
    trigger: AutomationTrigger;
  }) => Promise<void>;
}

export function AutomationFormDialog({
  open,
  onOpenChange,
  automation = null,
  onSubmit,
}: AutomationFormDialogProps): JSX.Element {
  /** Düzenleme modunda mevcut değerlerle başlat, ekleme modunda boş başlat. */
  const buildInitialState = React.useCallback(
    (): FormState =>
      automation !== null
        ? {
            name: automation.name,
            keywords: [...automation.keywords],
            matchMode: automation.matchMode,
            replyMessage: automation.replyMessage,
            trigger: automation.trigger,
          }
        : {
            name: '',
            keywords: [],
            matchMode: MATCH_MODE.CONTAINS,
            replyMessage: '',
            trigger: AUTOMATION_TRIGGER.INBOUND_MESSAGE,
          },
    [automation],
  );

  const [form, setForm] = React.useState<FormState>(buildInitialState);
  const [errors, setErrors] = React.useState<FormErrors>({});
  const [submitting, setSubmitting] = React.useState<boolean>(false);
  const [submitError, setSubmitError] = React.useState<string | null>(null);

  /**
   * Modal her açıldığında formu sıfırla/yükle.
   * `useEffect` (mount değil) → `automation` prop'u değiştiğinde de çalışır.
   */
  React.useEffect(() => {
    if (open) {
      setForm(buildInitialState());
      setErrors({});
      setSubmitError(null);
    }
  }, [open, buildInitialState]);

  /**
   * Doğrulama — backend `AutomationValidator` ile aynı kurallar.
   * @returns hata varsa true (submit durdurulur)
   */
  const validate = (state: FormState): boolean => {
    const next: FormErrors = {};

    if (state.name.trim().length === 0) {
      next['name'] = 'Otomasyon adı zorunludur.';
    } else if (state.name.trim().length > AUTOMATION_LIMITS.MAX_NAME_LENGTH) {
      next['name'] = `En fazla ${AUTOMATION_LIMITS.MAX_NAME_LENGTH} karakter.`;
    }

    if (state.keywords.length === 0) {
      next['keywords'] = 'En az bir tetikleyici kelime ekleyin.';
    } else if (state.keywords.length > AUTOMATION_LIMITS.MAX_KEYWORDS) {
      next['keywords'] = `En fazla ${AUTOMATION_LIMITS.MAX_KEYWORDS} kelime.`;
    }

    if (state.replyMessage.trim().length === 0) {
      next['replyMessage'] = 'Yanıt mesajı zorunludur.';
    } else if (state.replyMessage.length > AUTOMATION_LIMITS.MAX_REPLY_LENGTH) {
      next['replyMessage'] = `En fazla ${AUTOMATION_LIMITS.MAX_REPLY_LENGTH} karakter.`;
    }

    setErrors(next);

    return Object.keys(next).length === 0;
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();

    // Guard clause: geçersiz form sunucuya GİTMEZ.
    if (!validate(form)) {
      return;
    }

    setSubmitting(true);
    setSubmitError(null);

    try {
      await onSubmit(form);
      onOpenChange(false);
    } catch (error: unknown) {
      setSubmitError(error instanceof Error ? error.message : 'Kaydedilemedi.');
    } finally {
      setSubmitting(false);
    }
  };

  const isEditing = automation !== null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Otomasyonu Düzenle' : 'Yeni Otomasyon Ekle'}</DialogTitle>
          <DialogDescription>
            Gelen mesajda tetikleyici kelimelerden biri bulunduğunda yanıtınız otomatik gönderilir.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={(event) => {
          void handleSubmit(event);
        }} className="space-y-4">
          {/* --- Otomasyon adı --- */}
          <div className="space-y-2">
            <Label htmlFor="automation-name">Otomasyon Adı</Label>
            <Input
              id="automation-name"
              value={form.name}
              onChange={(event) => {
                setForm((previous) => ({ ...previous, name: event.target.value }));
              }}
              placeholder="Örn: Fiyat Sorgulama"
              maxLength={AUTOMATION_LIMITS.MAX_NAME_LENGTH}
              invalid={errors['name'] !== undefined}
              aria-describedby={errors['name'] !== undefined ? 'name-error' : undefined}
              disabled={submitting}
            />
            {errors['name'] !== undefined ? (
              <p id="name-error" className="text-xs text-destructive">
                {errors['name']}
              </p>
            ) : null}
          </div>

          {/* --- Tetikleyici kelimeler --- */}
          <div className="space-y-2">
            <Label htmlFor="automation-keywords">Tetikleyici Kelimeler</Label>
            <KeywordInput
              value={form.keywords}
              onChange={(keywords) => {
                setForm((previous) => ({ ...previous, keywords }));
                setErrors((previous) => ({ ...previous, keywords: undefined }));
              }}
              maxKeywords={AUTOMATION_LIMITS.MAX_KEYWORDS}
              maxKeywordLength={AUTOMATION_LIMITS.MAX_KEYWORD_LENGTH}
              invalid={errors['keywords'] !== undefined}
              disabled={submitting}
            />
            {errors['keywords'] !== undefined ? (
              <p className="text-xs text-destructive">{errors['keywords']}</p>
            ) : null}
          </div>

          {/* --- Eşleşme modu + tetikleyici tipi --- */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="automation-match-mode">Eşleşme Modu</Label>
              <Select
                id="automation-match-mode"
                options={MATCH_MODE_OPTIONS}
                value={form.matchMode}
                onValueChange={(matchMode) => {
                  setForm((previous) => ({ ...previous, matchMode }));
                }}
                disabled={submitting}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="automation-trigger">Tetikleyici Tipi</Label>
              <Select
                id="automation-trigger"
                options={TRIGGER_OPTIONS}
                value={form.trigger}
                onValueChange={(trigger) => {
                  setForm((previous) => ({ ...previous, trigger }));
                }}
                disabled={submitting}
              />
            </div>
          </div>

          {/* --- Yanıt mesajı --- */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="automation-reply">Yanıt Mesajı</Label>
              <span className="text-xs tabular-nums text-muted-foreground">
                {form.replyMessage.length}/{AUTOMATION_LIMITS.MAX_REPLY_LENGTH}
              </span>
            </div>

            <Textarea
              id="automation-reply"
              value={form.replyMessage}
              onChange={(event) => {
                setForm((previous) => ({ ...previous, replyMessage: event.target.value }));
              }}
              placeholder="Merhaba {username}! Fiyat listemiz için ..."
              maxLength={AUTOMATION_LIMITS.MAX_REPLY_LENGTH}
              invalid={errors['replyMessage'] !== undefined}
              disabled={submitting}
              className="min-h-[110px]"
            />

            {errors['replyMessage'] !== undefined ? (
              <p className="text-xs text-destructive">{errors['replyMessage']}</p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Kullanılabilir değişkenler:{' '}
                <code className="rounded bg-muted px-1 py-0.5">{'{username}'}</code>,{' '}
                <code className="rounded bg-muted px-1 py-0.5">{'{date}'}</code>,{' '}
                <code className="rounded bg-muted px-1 py-0.5">{'{time}'}</code>
              </p>
            )}
          </div>

          {/* --- Sunucu hata mesajı --- */}
          {submitError !== null ? (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"
            >
              <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin" aria-hidden="true" />
              <span>{submitError}</span>
            </div>
          ) : null}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                onOpenChange(false);
              }}
              disabled={submitting}
            >
              Vazgeç
            </Button>

            <Button type="submit" loading={submitting}>
              {isEditing ? 'Değişiklikleri Kaydet' : 'Otomasyonu Oluştur'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}