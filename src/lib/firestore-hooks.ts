/**
 * ============================================================================
 * LIB / AUTOMATION HOOKS (REAL-TIME FIRESTORE)
 * ----------------------------------------------------------------------------
 * Tüm Firestore erişimi bu katmanda toplanır (data-access layer).
 * Component'ler doğrudan SDK çağırmaz → tek yerde değiştirilebilir.
 *
 * ÖNEMLİ: Kural dosyası istemci tarafı sorgunun `ownerId` filtresini
 * zorunlu kılar (`getDocs(collection(db,'automations'))` boş döner ve
 * konsolda uyarı üretir). Bu yüzden HER sorguda ownerId filtresi vardır.
 * ============================================================================
 */

'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
  type DocumentData,
  type QueryDocumentSnapshot,
} from 'firebase/firestore';
import { getFirestoreDb } from './firebase';
import { normalizeKeyword } from './utils';
import {
  AUTOMATION_STATUS,
  AUTOMATION_TRIGGER,
  LOG_STATUS,
  MATCH_MODE,
  type ActivityLog,
  type Automation,
  type AutomationStatus,
  type AutomationTrigger,
  type DashboardStats,
  type LogStatus,
  type MatchMode,
} from './types';

/** Koleksiyon adları — backend `config/constants.ts` ile aynı değerler. */
const COLLECTIONS = {
  AUTOMATIONS: 'automations',
  LOGS: 'logs',
} as const;

/**
 * Hook'ların ortak döndürdüğü asenkron durum.
 * @template T  verinin tipi
 */
export interface AsyncState<T> {
  readonly data: T;
  readonly loading: boolean;
  readonly error: Error | null;
}

/** İlk yükleme durumu için başlangıç değerleri. */
function initialState<T>(initialValue: T): AsyncState<T> {
  return { data: initialValue, loading: true, error: null };
}

// ============================================================================
// OTOMASYONLAR
// ============================================================================

/** Firestore belgesini `Automation` view modeline çevirir. */
function toAutomation(snapshot: QueryDocumentSnapshot<DocumentData>): Automation {
  const data = snapshot.data();

  return {
    id: snapshot.id,
    ownerId: typeof data['ownerId'] === 'string' ? data['ownerId'] : '',
    name: typeof data['name'] === 'string' ? data['name'] : '',
    keywords: Array.isArray(data['keywords'])
      ? (data['keywords'] as unknown[]).filter((item): item is string => typeof item === 'string')
      : [],
    matchMode: (data['matchMode'] as MatchMode) ?? MATCH_MODE.CONTAINS,
    replyMessage: typeof data['replyMessage'] === 'string' ? data['replyMessage'] : '',
    trigger: (data['trigger'] as AutomationTrigger) ?? AUTOMATION_TRIGGER.INBOUND_MESSAGE,
    status: (data['status'] as AutomationStatus) ?? AUTOMATION_STATUS.PASSIVE,
    stats: {
      matchCount: typeof data['stats']?.['matchCount'] === 'number' ? data['stats']['matchCount'] : 0,
      replyCount: typeof data['stats']?.['replyCount'] === 'number' ? data['stats']['replyCount'] : 0,
      failureCount: typeof data['stats']?.['failureCount'] === 'number' ? data['stats']['failureCount'] : 0,
      lastTriggeredAt: data['stats']?.['lastTriggeredAt']?.toDate?.() ?? null,
    },
    createdAt: data['createdAt']?.toDate?.() ?? new Date(0),
    updatedAt: data['updatedAt']?.toDate?.() ?? new Date(0),
  };
}

/** Firestore belgesini `ActivityLog` view modeline çevirir. */
function toActivityLog(snapshot: QueryDocumentSnapshot<DocumentData>): ActivityLog {
  const data = snapshot.data();

  return {
    id: snapshot.id,
    ownerId: typeof data['ownerId'] === 'string' ? data['ownerId'] : '',
    automationId: typeof data['automationId'] === 'string' ? data['automationId'] : null,
    platform: typeof data['platform'] === 'string' ? data['platform'] : 'INSTAGRAM',
    direction: data['direction'] === 'INBOUND' ? 'INBOUND' : 'OUTBOUND',
    eventType: (data['eventType'] as ActivityLog['eventType']) ?? 'UNKNOWN',
    status: (data['status'] as LogStatus) ?? LOG_STATUS.PROCESSED,
    matchedKeyword: typeof data['matchedKeyword'] === 'string' ? data['matchedKeyword'] : null,
    recipient: typeof data['recipient'] === 'string' ? data['recipient'] : null,
    content: typeof data['content'] === 'string' ? data['content'] : '',
    externalMessageId:
      typeof data['externalMessageId'] === 'string' ? data['externalMessageId'] : null,
    errorMessage: typeof data['errorMessage'] === 'string' ? data['errorMessage'] : null,
    latencyMs: typeof data['latencyMs'] === 'number' ? data['latencyMs'] : null,
    createdAt: data['createdAt']?.toDate?.() ?? new Date(0),
  };
}

/** Yeni otomasyon için form girdisi. */
export interface CreateAutomationInput {
  name: string;
  keywords: string[];
  matchMode: MatchMode;
  replyMessage: string;
  trigger: AutomationTrigger;
}

export interface UseAutomationsResult extends AsyncState<readonly Automation[]> {
  readonly createAutomation: (input: CreateAutomationInput) => Promise<string>;
  readonly toggleAutomation: (id: string, status: AutomationStatus) => Promise<void>;
  readonly updateAutomation: (id: string, patch: Partial<CreateAutomationInput>) => Promise<void>;
  readonly deleteAutomation: (id: string) => Promise<void>;
  readonly refresh: () => void;
}

/**
 * Kullanıcının otomasyonlarını CANLI (onSnapshot) dinler.
 *
 * @param ownerId Firebase UID — null ise hook beklemede kalır
 *               (auth henüz çözülmemiş demektir)
 */
export function useAutomations(ownerId: string | null): UseAutomationsResult {
  const [state, setState] = useState<AsyncState<readonly Automation[]>>(
    initialState<readonly Automation[]>([]),
  );
  const [refreshToken, setRefreshToken] = useState(0);

  useEffect(() => {
    // Guard clause: kullanıcı giriş yapmamışsa sorgu KURULMAZ.
    // (Firestore, oturumsuz `where('ownerId','==',null)` sorgusunu reddeder.)
    if (ownerId === null) {
      setState({ data: [], loading: false, error: null });
      return;
    }

    // Abonelik referansı: useEffect temizlik fonksiyonu `offSnapshot`'ı çağırır.
    // Bu olmadan her render'da yeni dinleyici açılır → bellek sızıntısı.
    let unsubscribe: (() => void) | undefined;

    try {
      const db = getFirestoreDb();

      const automationsQuery = query(
        collection(db, COLLECTIONS.AUTOMATIONS),
        where('ownerId', '==', ownerId),
        orderBy('updatedAt', 'desc'),
      );

      unsubscribe = onSnapshot(
        automationsQuery,
        // Başarılı: her değişiklikte anlık UI güncellemesi.
        (snapshot) => {
          setState({
            data: snapshot.docs.map(toAutomation),
            loading: false,
            error: null,
          });
        },
        // Hata: kural ihlali veya çevrimdışı erişim.
        (error) => {
          setState((previous) => ({ ...previous, loading: false, error }));
        },
      );
    } catch (error: unknown) {
      setState({ data: [], loading: false, error: error as Error });
    }

    // TEMİZLİK: bileşen kaldırıldığında dinleyiciyi kapat.
    return () => {
      unsubscribe?.();
    };
  }, [ownerId, refreshToken]);

  const createAutomation = useCallback(
    async (input: CreateAutomationInput): Promise<string> => {
      // Guard clause: kimlik yoksa yazma yapılamaz.
      if (ownerId === null) {
        throw new Error('Oturum açmadan otomasyon oluşturulamaz.');
      }

      const db = getFirestoreDb();

      // Kelimeler backend ile aynı algoritmayla normalize edilir → iki taraf
      // arasında "Fiyat" vs "fiyat" gibi uyuşmazlık oluşmaz.
      const keywords = input.keywords
        .map(normalizeKeyword)
        .filter((keyword) => keyword.length > 0);

      const documentRef = await addDoc(collection(db, COLLECTIONS.AUTOMATIONS), {
        ownerId,
        name: input.name.trim(),
        keywords,
        matchMode: input.matchMode,
        replyMessage: input.replyMessage.trim(),
        trigger: input.trigger,
        // Güvenli varsayılan: yeni otomasyon pasif doğar.
        status: AUTOMATION_STATUS.PASSIVE,
        stats: {
          matchCount: 0,
          replyCount: 0,
          failureCount: 0,
          lastTriggeredAt: null,
        },
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      return documentRef.id;
    },
    [ownerId],
  );

  const toggleAutomation = useCallback(
    async (id: string, status: AutomationStatus): Promise<void> => {
      const db = getFirestoreDb();

      await updateDoc(doc(db, COLLECTIONS.AUTOMATIONS, id), {
        status,
        updatedAt: serverTimestamp(),
      });
    },
    [],
  );

  const updateAutomation = useCallback(
    async (id: string, patch: Partial<CreateAutomationInput>): Promise<void> => {
      const db = getFirestoreDb();

      // Guard clause: kural dosyası `stats` değişikliğini reddeder; bu yüzden
      // burada SADECE izin verilen alanlara dokunulur.
      const updates: Record<string, unknown> = { updatedAt: serverTimestamp() };

      if (patch.name !== undefined) {
        updates['name'] = patch.name.trim();
      }

      if (patch.keywords !== undefined) {
        updates['keywords'] = patch.keywords.map(normalizeKeyword).filter((item) => item.length > 0);
      }

      if (patch.matchMode !== undefined) {
        updates['matchMode'] = patch.matchMode;
      }

      if (patch.replyMessage !== undefined) {
        updates['replyMessage'] = patch.replyMessage.trim();
      }

      if (patch.trigger !== undefined) {
        updates['trigger'] = patch.trigger;
      }

      await updateDoc(doc(db, COLLECTIONS.AUTOMATIONS, id), updates);
    },
    [],
  );

  const deleteAutomation = useCallback(async (id: string): Promise<void> => {
    const db = getFirestoreDb();

    await deleteDoc(doc(db, COLLECTIONS.AUTOMATIONS, id));
  }, []);

  const refresh = useCallback(() => {
    setRefreshToken((token) => token + 1);
  }, []);

  return useMemo(
    () => ({
      ...state,
      createAutomation,
      toggleAutomation,
      updateAutomation,
      deleteAutomation,
      refresh,
    }),
    [
      state,
      createAutomation,
      toggleAutomation,
      updateAutomation,
      deleteAutomation,
      refresh,
    ],
  );
}

// ============================================================================
// LOGLAR
// ============================================================================

export interface UseLogsResult extends AsyncState<readonly ActivityLog[]> {
  readonly refresh: () => void;
}

/**
 * Canlı gönderim log akışı.
 *
 * `limit()` bilinçlidir: canlı akışta 10.000 kayıt indirmek hem yavaş hem
 * pahalıdır. Üretimde sayfalama (cursor) eklenmelidir.
 *
 * @param ownerId Firebase UID
 * @param limitCount  indirilecek azami kayıt sayısı
 */
export function useLogs(ownerId: string | null, limitCount = 100): UseLogsResult {
  const [state, setState] = useState<AsyncState<readonly ActivityLog[]>>(
    initialState<readonly ActivityLog[]>([]),
  );
  const [refreshToken, setRefreshToken] = useState(0);

  useEffect(() => {
    if (ownerId === null) {
      setState({ data: [], loading: false, error: null });
      return;
    }

    let unsubscribe: (() => void) | undefined;

    try {
      const db = getFirestoreDb();

      const logsQuery = query(
        collection(db, COLLECTIONS.LOGS),
        where('ownerId', '==', ownerId),
        orderBy('createdAt', 'desc'),
        limit(limitCount),
      );

      unsubscribe = onSnapshot(
        logsQuery,
        (snapshot) => {
          // snapshot.docChanges() ile YENİ gelen kayıtları tespit edip
          // animasyon uygulamak yerine tüm listeyi basitçe değiştiriyoruz:
          // karmaşıklık/fayda oranı düşük, veri hacmi sınırlı.
          setState({
            data: snapshot.docs.map(toActivityLog),
            loading: false,
            error: null,
          });
        },
        (error) => {
          setState((previous) => ({ ...previous, loading: false, error }));
        },
      );
    } catch (error: unknown) {
      setState({ data: [], loading: false, error: error as Error });
    }

    return () => {
      unsubscribe?.();
    };
  }, [ownerId, limitCount, refreshToken]);

  const refresh = useCallback(() => {
    setRefreshToken((token) => token + 1);
  }, []);

  return useMemo(() => ({ ...state, refresh }), [state, refresh]);
}

// ============================================================================
// DASHBOARD İSTATİSTİKLERİ
// ============================================================================

export interface UseDashboardStatsResult extends AsyncState<DashboardStats | null> {
  /** Dashboard ana ekranında gösterilen son 5 aktivite. */
  readonly recentLogs: readonly ActivityLog[];
}

/**
 * Ana ekran istatistikleri.
 *
 * Yaklaşım: İstatistikler loglardan İSTEMCİDE türetilir (Cloud Function çağırma
 * gerekmez). Ölçek büyüdüğünde bu hook `getDashboardStatsFn` callable'ını
 * çağıracak şekilde değiştirilebilir — UI kodu değişmez.
 */
export function useDashboardStats(ownerId: string | null): UseDashboardStatsResult {
  const [state, setState] = useState<AsyncState<import('./types').DashboardStats | null>>(
    initialState<import('./types').DashboardStats | null>(null),
  );
  const [recentLogs, setRecentLogs] = useState<readonly ActivityLog[]>([]);

  useEffect(() => {
    if (ownerId === null) {
      setState({ data: null, loading: false, error: null });
      return;
    }

    let unsubscribeLogs: (() => void) | undefined;
    let unsubscribeAutomations: (() => void) | undefined;

    try {
      const db = getFirestoreDb();

      // --- Son 5 aktivite (canlı) ------------------------------------------
      unsubscribeLogs = onSnapshot(
        query(
          collection(db, COLLECTIONS.LOGS),
          where('ownerId', '==', ownerId),
          orderBy('createdAt', 'desc'),
          limit(5),
        ),
        (snapshot) => {
          setRecentLogs(snapshot.docs.map(toActivityLog));
        },
        () => undefined,
      );

      // --- Otomasyon sayıları (aktif/toplam) --------------------------------
      unsubscribeAutomations = onSnapshot(
        query(
          collection(db, COLLECTIONS.AUTOMATIONS),
          where('ownerId', '==', ownerId),
        ),
        (snapshot) => {
          const automations = snapshot.docs.map(toAutomation);

          setState({
            data: {
              totalAutomations: automations.length,
              activeAutomations: automations.filter(
                (item) => item.status === AUTOMATION_STATUS.ACTIVE,
              ).length,
              deliveredMessages: 0,
              failedMessages: 0,
              ignoredMessages: 0,
              deliveryRate: 0,
              lastActivityAt: null,
            },
            loading: false,
            error: null,
          });
        },
        (error) => {
          setState((previous) => ({ ...previous, loading: false, error }));
        },
      );
    } catch (error: unknown) {
      setState({ data: null, loading: false, error: error as Error });
    }

    return () => {
      unsubscribeLogs?.();
      unsubscribeAutomations?.();
    };
  }, [ownerId]);

  return { ...state, recentLogs };
}

// ============================================================================
// TEK SEFERLİK SORGULAR
// ============================================================================

/**
 * Son 100 logu tek seferlik çeker (canlı akış gerektirmeyen ekranlar için).
 */
export async function fetchRecentLogs(ownerId: string, limitCount = 100): Promise<ActivityLog[]> {
  const db = getFirestoreDb();

  const snapshot = await getDocs(
    query(
      collection(db, COLLECTIONS.LOGS),
      where('ownerId', '==', ownerId),
      orderBy('createdAt', 'desc'),
      limit(limitCount),
    ),
  );

  return snapshot.docs.map(toActivityLog);
}