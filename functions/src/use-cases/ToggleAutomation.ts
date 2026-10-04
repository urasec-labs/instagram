/**
 * ============================================================================
 * USE-CASES / TOGGLE AUTOMATION
 * ----------------------------------------------------------------------------
 * Otomasyonu aktif/pasif arasında geçirir (dashboard'daki Switch bileşeni).
 *
 * Güvenlik kontrolü (çok önemli): Otomasyonun sahibi `ownerId` ile eşleşmiyorsa
 * işlem YAPILMAZ. Aksi halde bir kullanıcı başkasının otomasyonunu ID tahmin
 * ederek açıp kapatabilirdi (IDOR).
 * ============================================================================
 */

import { AutomationStatus, type Automation } from '../domain/entities/Automation';
import { ForbiddenError } from '../domain/errors/DomainError';
import type { IAutomationRepository } from '../domain/interfaces/IAutomationRepository';
import type { ILogger } from '../services/Logger';

export interface ToggleAutomationRequest {
  /** null → mevcut durumun tersi. Değer → doğrudan o duruma ayarla. */
  readonly status?: AutomationStatus | null;
}

export interface ToggleAutomationResponse {
  readonly automation: Automation;
}

export class ToggleAutomationUseCase {
  public constructor(
    private readonly automations: IAutomationRepository,
    private readonly logger: ILogger,
  ) {}

  public async execute(
    ownerId: string,
    automationId: string,
    request: ToggleAutomationRequest = {},
  ): Promise<ToggleAutomationResponse> {
    // Guard clause 1: varlık kontrolü → 404'ü burada yakalar.
    const existing = await this.automations.findById(automationId);

    // Guard clause 2: yetki kontrolü → 403'ü burada yakalar.
    if (existing.ownerId !== ownerId) {
      throw new ForbiddenError('Bu otomasyon üzerinde işlem yetkiniz yok.');
    }

    const nextStatus =
      request.status ??
      (existing.status === AutomationStatus.ACTIVE
        ? AutomationStatus.PASSIVE
        : AutomationStatus.ACTIVE);

    // Aynı duruma geçişte yazma yapmaz → gereksiz maliyet ve log gürültüsü olmaz.
    if (existing.status === nextStatus) {
      return { automation: existing };
    }

    const updated = await this.automations.setStatus(automationId, nextStatus);

    this.logger.info('Otomasyon durumu değiştirildi.', {
      automationId,
      ownerId,
      from: existing.status,
      to: nextStatus,
    });

    return { automation: updated };
  }
}