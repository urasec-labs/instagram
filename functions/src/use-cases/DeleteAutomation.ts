/**
 * ============================================================================
 * USE-CASES / DELETE AUTOMATION
 * ----------------------------------------------------------------------------
 * Otomasyonu kalıcı olarak siler. ToggleAutomation ile aynı güvenlik
 * kontrolü burada da geçerlidir: sahibi eşleşmeyen kayıt silinmez.
 * ============================================================================
 */

import { ForbiddenError } from '../domain/errors/DomainError';
import type { IAutomationRepository } from '../domain/interfaces/IAutomationRepository';
import type { ILogger } from '../services/Logger';

export class DeleteAutomationUseCase {
  public constructor(
    private readonly automations: IAutomationRepository,
    private readonly logger: ILogger,
  ) {}

  public async execute(ownerId: string, automationId: string): Promise<void> {
    // Guard clause 1: varlık kontrolü → 404.
    const existing = await this.automations.findById(automationId);

    // Guard clause 2: yetki kontrolü → 403.
    if (existing.ownerId !== ownerId) {
      throw new ForbiddenError('Bu otomasyonu silme yetkiniz yok.');
    }

    await this.automations.delete(automationId);

    this.logger.info('Otomasyon silindi.', { automationId, ownerId });
  }
}