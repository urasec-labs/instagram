/**
 * ============================================================================
 * APP / DASHBOARD / AUTOMATIONS PAGE — CRUD TABLOSU & MODAL
 * ----------------------------------------------------------------------------
 * Otomasyon yönetim ekranı:
 *  - Firestore `onSnapshot` ile canlı tablo
 *  - "Yeni Otomasyon" modal'ı (KeywordInput ile etiket ekleme)
 *  - Satır içi aktif/pasif anahtarı (Switch)
 *  - Düzenleme ve silme aksiyonları
 *  - Arama metni ile istemci tarafı filtreleme
 *
 * RESPONSIVE TASARIM:
 *  - `md+` → tablo görünümü
 *  - `<md` → kart görünümü (AutomationCard)
 * ============================================================================
 */

'use client';

import * as React from 'react';
import {
  AlertCircle,
  Hash,
  Pencil,
  Plus,
  Search,
  Trash2,
  Workflow,
} from 'lucide-react';

import { AutomationCard, statusBadgeLabel } from '@/components/dashboard/AutomationCard';
import { AutomationFormDialog } from '@/components/dashboard/AutomationFormDialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useAuth } from '@/providers/AuthProvider';
import { useAutomations } from '@/lib/firestore-hooks';
import { cn, formatNumber, formatRelativeTime, truncate } from '@/lib/utils';
import { AUTOMATION_STATUS, type Automation } from '@/lib/types';

/** Filtreleme seçenekleri. */
type StatusFilter = 'ALL' | 'ACTIVE' | 'PASSIVE';

const FILTERS: readonly { value: StatusFilter; label: string }[] = [
  { value: 'ALL', label: 'Tümü' },
  { value: 'ACTIVE', label: 'Aktif' },
  { value: 'PASSIVE', label: 'Pasif' },
];

export default function AutomationsPage(): JSX.Element {
  const { user } = useAuth();
  const ownerId = user?.uid ?? null;

  const {
    data: automations,
    loading,
    error,
    createAutomation,
    updateAutomation,
    toggleAutomation,
    deleteAutomation,
  } = useAutomations(ownerId);

  const [dialogOpen, setDialogOpen] = React.useState<boolean>(false);
  const [editing, setEditing] = React.useState<Automation | null>(null);
  const [search, setSearch] = React.useState<string>('');
  const [filter, setFilter] = React.useState<StatusFilter>('ALL');
  const [actionError, setActionError] = React.useState<string | null>(null);

  /**
   * Arama + durum filtresi.
   * `useMemo`: her render'da yeniden hesaplamak yerine bağımlılıklar değiştiğinde
   * hesaplanır (gereksiz filtreleme ve render maliyeti önlenir).
   */
  const filtered = React.useMemo<readonly Automation[]>(() => {
    const query = search.trim().toLocaleLowerCase('tr-TR');

    return automations.filter((automation) => {
      // Durum filtresi
      if (filter !== 'ALL' && automation.status !== filter) {
        return false;
      }

      // Arama: ad, kelimeler veya yanıt metninde ara
      if (query.length === 0) {
        return true;
      }

      const haystack = [
        automation.name,
        automation.replyMessage,
        ...automation.keywords,
      ]
        .join(' ')
        .toLocaleLowerCase('tr-TR');

      return haystack.includes(query);
    });
  }, [automations, filter, search]);

  /** Modal'ı "yeni otomasyon" modunda açar. */
  const openCreateDialog = (): void => {
    setEditing(null);
    setActionError(null);
    setDialogOpen(true);
  };

  /** Modal'ı "düzenleme" modunda açar. */
  const openEditDialog = (automation: Automation): void => {
    setEditing(automation);
    setActionError(null);
    setDialogOpen(true);
  };

  /**
   * Modal submit işleyicisi — tek fonksiyon iki işi yapar (create/update).
   * Bu, iki ayrı form bileşeni yazmaktan daha az kod ve tek doğrulama yolu demektir.
   */
  const handleFormSubmit = async (data: {
    name: string;
    keywords: string[];
    matchMode: Automation['matchMode'];
    replyMessage: string;
    trigger: Automation['trigger'];
  }): Promise<void> => {
    setActionError(null);

    try {
      if (editing !== null) {
        await updateAutomation(editing.id, data);
        return;
      }

      await createAutomation(data);

      // Kullanıcıyı bilgilendir: otomasyon PASİF oluşturuldu.
      setActionError(null);
    } catch (caught: unknown) {
      setActionError(caught instanceof Error ? caught.message : 'Kaydedilemedi.');
      throw caught; // Modal'ın hata gösterimini de tetikler
    }
  };

  /**
   * Tek bir otomasyonu siler.
   * Ekran okuyucu dostu onay: `window.confirm` yeterlidir ama erişilebilirlik
   * için mesaj metni açıklayıcıdır.
   */
  const handleDelete = async (automation: Automation): Promise<void> => {
    if (typeof window !== 'undefined' && !window.confirm(`"${automation.name}" silinecek. Onaylıyor musunuz?`)) {
      return;
    }

    setActionError(null);

    try {
      await deleteAutomation(automation.id);
    } catch (caught: unknown) {
      setActionError(caught instanceof Error ? caught.message : 'Silinemedi.');
    }
  };

  return (
    <div className="space-y-6">
      {/* ======================================================================
          BAŞLIK + EYLEMLER
          ====================================================================== */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Otomasyonlar</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Anahtar kelimeye tepki verecek yanıt kurallarınızı yönetin.
          </p>
        </div>

        <Button onClick={openCreateDialog}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          Yeni Otomasyon
        </Button>
      </div>

      {/* --- Hata bildirimi --- */}
      {error !== null || actionError !== null ? (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{error?.message ?? actionError}</span>
        </div>
      ) : null}

      {/* ======================================================================
          FİLTRE ÇUBUĞU
          ====================================================================== */}
      <Card>
        <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
          {/* Arama */}
          <div className="relative flex-1">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
              }}
              placeholder="Otomasyon adı, kelime veya yanıt metninde ara..."
              className="pl-9"
              aria-label="Otomasyonlarda ara"
            />
          </div>

          {/* Durum filtresi */}
          <div className="flex rounded-lg border p-0.5" role="group" aria-label="Durum filtresi">
            {FILTERS.map((item) => (
              <button
                key={item.value}
                type="button"
                onClick={() => {
                  setFilter(item.value);
                }}
                aria-pressed={filter === item.value}
                className={cn(
                  'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                  filter === item.value
                    ? 'bg-secondary text-secondary-foreground'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {item.label}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* ======================================================================
          İÇERİK
          ====================================================================== */}
      {/* --- Yükleme --- */}
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={index} className="h-16 w-full" />
          ))}
        </div>
      ) : null}

      {/* --- Boş durumlar --- */}
      {!loading && automations.length === 0 ? (
        <EmptyState
          icon={Workflow}
          title="Henüz otomasyon yok"
          description="Anahtar kelimeye otomatik yanıt vermek için ilk otomasyonunuzu oluşturun."
          actionLabel="İlk Otomasyonu Oluştur"
          onAction={openCreateDialog}
        />
      ) : null}

      {/* --- Filtre sonucu boş --- */}
      {!loading && automations.length > 0 && filtered.length === 0 ? (
        <EmptyState
          icon={Search}
          title="Sonuç bulunamadı"
          description="Arama kriterlerinize uyan otomasyon yok. Filtreleri değiştirmeyi deneyin."
          actionLabel="Filtreleri Temizle"
          onAction={() => {
            setSearch('');
            setFilter('ALL');
          }}
        />
      ) : null}

      {/* --- Masaüstü: Tablo --- */}
      {!loading && filtered.length > 0 ? (
        <>
          <Card className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[30%]">Otomasyon</TableHead>
                  <TableHead className="w-[25%]">Tetikleyiciler</TableHead>
                  <TableHead className="w-[20%]">Yanıt</TableHead>
                  <TableHead className="w-[15%] text-center">İstatistik</TableHead>
                  <TableHead className="w-[10%] text-right">Durum</TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {filtered.map((automation) => (
                  <TableRow key={automation.id}>
                    {/* --- Ad + kelimeler --- */}
                    <TableCell>
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{automation.name}</span>
                          <Badge variant="outline" className="font-normal">
                            {automation.matchMode === 'EXACT' ? 'Tam' : 'İçinde'}
                          </Badge>
                          <Badge variant="outline" className="font-normal">
                            {automation.trigger === 'INBOUND_COMMENT' ? 'Yorum' : 'DM'}
                          </Badge>
                        </div>

                        <div className="flex flex-wrap gap-1">
                          {automation.keywords.slice(0, 4).map((keyword) => (
                            <Badge key={keyword} variant="secondary" className="gap-0.5 font-normal">
                              <Hash className="h-2.5 w-2.5" aria-hidden="true" />
                              {keyword}
                            </Badge>
                          ))}
                          {automation.keywords.length > 4 ? (
                            <Badge variant="muted">+{automation.keywords.length - 4}</Badge>
                          ) : null}
                        </div>
                      </div>
                    </TableCell>

                    {/* --- Anahtar kelime sayısı --- */}
                    <TableCell className="text-sm text-muted-foreground">
                      {automation.keywords.length} kelime
                    </TableCell>

                    {/* --- Yanıt metni --- */}
                    <TableCell>
                      <p
                        className="max-w-[280px] truncate text-sm text-muted-foreground"
                        title={automation.replyMessage}
                      >
                        {truncate(automation.replyMessage, 70)}
                      </p>
                    </TableCell>

                    {/* --- İstatistik --- */}
                    <TableCell>
                      <div className="text-sm">
                        <p className="tabular-nums">
                          {formatNumber(automation.stats.replyCount)} yanıt
                        </p>
                        <p className="text-xs tabular-nums text-muted-foreground">
                          {automation.stats.lastTriggeredAt !== null
                            ? formatRelativeTime(automation.stats.lastTriggeredAt)
                            : 'hiç çalışmadı'}
                        </p>
                      </div>
                    </TableCell>

                    {/* --- Aksiyonlar --- */}
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            openEditDialog(automation);
                          }}
                          aria-label={`${automation.name} otomasyonunu düzenle`}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>

                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            void handleDelete(automation);
                          }}
                          aria-label={`${automation.name} otomasyonunu sil`}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>

                        <Switch
                          checked={automation.status === AUTOMATION_STATUS.ACTIVE}
                          onCheckedChange={() => {
                            void toggleAutomation(
                              automation.id,
                              automation.status === AUTOMATION_STATUS.ACTIVE
                                ? AUTOMATION_STATUS.PASSIVE
                                : AUTOMATION_STATUS.ACTIVE,
                            );
                          }}
                          aria-label={`${automation.name} otomasyonunu ${statusBadgeLabel(
                            automation.status === AUTOMATION_STATUS.ACTIVE
                              ? AUTOMATION_STATUS.PASSIVE
                              : AUTOMATION_STATUS.ACTIVE,
                          )}`}
                        />
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>

          {/* --- Mobil: Kart listesi --- */}
          <div className="space-y-3 md:hidden">
            {filtered.map((automation) => (
              <AutomationCard
                key={automation.id}
                automation={automation}
                onToggle={toggleAutomation}
                onEdit={openEditDialog}
                onDelete={(item) => {
                  void handleDelete(item);
                }}
              />
            ))}
          </div>
        </>
      ) : null}

      {/* ======================================================================
          MODAL
          ====================================================================== */}
      <AutomationFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        automation={editing}
        onSubmit={handleFormSubmit}
      />
    </div>
  );
}

/** Boş durum bileşeni (tekrar eden JSX'i önler). */
function EmptyState({
  icon: Icon,
  title,
  description,
  actionLabel,
  onAction,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  actionLabel: string;
  onAction: () => void;
}): JSX.Element {
  return (
    <Card>
      <CardContent className="flex flex-col items-center justify-center gap-3 py-14 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
          <Icon className="h-6 w-6 text-muted-foreground" />
        </span>

        <div className="space-y-1">
          <h3 className="font-medium">{title}</h3>
          <p className="max-w-sm text-sm text-muted-foreground">{description}</p>
        </div>

        <Button onClick={onAction} variant="outline">
          <Plus className="h-4 w-4" aria-hidden="true" />
          {actionLabel}
        </Button>
      </CardContent>
    </Card>
  );
}