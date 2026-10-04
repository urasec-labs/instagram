/**
 * ============================================================================
 * COMPOSITION ROOT (DI CONTAINER)
 * ----------------------------------------------------------------------------
 * Uygulamanın TEK assembly noktası.
 *
 * - Somut sınıfları (Firestore*, Meta*) burada birbirine bağlar.
 * - Portlar (I*Repository, IMessagingService) yalnızca burada somutlaştırılır.
 * - Use-case'ler hiçbir yerde `new` ile kendi bağımlılıklarını kurmaz → test
 *   sırasında mock/repo/fake ile değiştirilebilir (DIP'in somut kanıtı).
 *
 * Bu dosya bir "service locator" DEĞİLDİR: bağımlılıklar burada kurulur,
 * sonra açıkça (explicitly) constructor'lara geçirilir.
 * ============================================================================
 */

import { getEnv } from './config/env';
import type { IMessagingService } from './domain/interfaces/IMessagingService';
import type { IPayloadParser } from './domain/interfaces/IPayloadParser';
import type { IWebhookSignatureVerifier } from './domain/interfaces/IWebhookSignatureVerifier';
import { FirestoreAccountRepository } from './services/FirestoreAccountRepository';
import { FirebaseTokenVerifier } from './services/FirebaseTokenVerifier';
import { FirestoreAutomationRepository } from './services/FirestoreAutomationRepository';
import { FirestoreLogRepository } from './services/FirestoreLogRepository';
import { MetaGraphHttpClient } from './services/MetaGraphHttpClient';
import { MetaInstagramService } from './services/MetaInstagramService';
import { MetaWebhookPayloadParser } from './services/MetaWebhookPayloadParser';
import { MetaWebhookSignatureVerifier } from './services/MetaWebhookSignatureVerifier';
import { StructuredLogger, type ILogger } from './services/Logger';
import { WebhookController } from './adapters/http/webhookController';
import { AutomationController } from './adapters/http/automationController';
import { CreateAutomationUseCase } from './use-cases/CreateAutomation';
import { DeleteAutomationUseCase } from './use-cases/DeleteAutomation';
import { GetDashboardStatsUseCase } from './use-cases/GetDashboardStats';
import { HandleWebhookEventUseCase } from './use-cases/HandleWebhookEvent';
import { ListAutomationsUseCase } from './use-cases/ListAutomations';
import { ToggleAutomationUseCase } from './use-cases/ToggleAutomation';
import { VerifyWebhookUseCase } from './use-cases/VerifyWebhook';

/**
 * Tüm uygulamanın bağımlılık grafiğini içeren tek nesne.
 * Fonksiyonlar arasında paylaşılan bir `container` (module-level singleton).
 */
export interface AppContainer {
  readonly logger: ILogger;
  readonly controllers: {
    readonly webhook: WebhookController;
    readonly automation: AutomationController;
  };
  /**
   * Use-case'ler de dışa açıktır: Callable (onCall) fonksiyonlar HTTP
   * katmanını atlayıp doğrudan use-case çağırır. Controller'da HTTP'ye
   * çevirmek zorunda kalmadan aynı iş kuralına erişilir.
   */
  readonly useCases: {
    readonly createAutomation: CreateAutomationUseCase;
    readonly toggleAutomation: ToggleAutomationUseCase;
    readonly listAutomations: ListAutomationsUseCase;
    readonly deleteAutomation: DeleteAutomationUseCase;
    readonly getDashboardStats: GetDashboardStatsUseCase;
  };
}

/**
 * Container'ı kurar.
 * @param logger Test sırasında NoopLogger enjekte edilebilir.
 */
export function buildContainer(logger: ILogger = new StructuredLogger()): AppContainer {
  // getEnv() burada çağrılır: eksik ortam değişkeni EN ERKEN noktada patlar.
  getEnv();

  // --- Altyapı servisleri (stateless, paylaşılabilir) -----------------------
  const graphHttpClient = new MetaGraphHttpClient(logger);
  const signatureVerifier: IWebhookSignatureVerifier = new MetaWebhookSignatureVerifier(logger);
  const payloadParser: IPayloadParser = new MetaWebhookPayloadParser(logger);

  // --- Platform servisleri -------------------------------------------------
  // OCP: WhatsApp/Telegram eklendiğinde bu diziye bir eleman daha konur,
  // use-case ve controller'lar HİÇ değişmez.
  const messagingServices: readonly IMessagingService[] = [
    new MetaInstagramService(graphHttpClient, logger),
  ];

  // --- Repository implementasyonları --------------------------------------
  const automationRepository = new FirestoreAutomationRepository();
  const logRepository = new FirestoreLogRepository();
  const accountRepository = new FirestoreAccountRepository();

  // --- Use-case'ler --------------------------------------------------------
  const verifyWebhook = new VerifyWebhookUseCase();
  const handleWebhookEvent = new HandleWebhookEventUseCase(
    payloadParser,
    accountRepository,
    automationRepository,
    logRepository,
    messagingServices,
    logger,
  );
  const createAutomation = new CreateAutomationUseCase(automationRepository, logger);
  const toggleAutomation = new ToggleAutomationUseCase(automationRepository, logger);
  const listAutomations = new ListAutomationsUseCase(automationRepository);
  const deleteAutomation = new DeleteAutomationUseCase(automationRepository, logger);
  const getDashboardStats = new GetDashboardStatsUseCase(automationRepository, logRepository);

  // --- Controller'lar ------------------------------------------------------
  const webhookController = new WebhookController({
    verifyWebhook,
    handleWebhookEvent,
    signatureVerifier,
    logger,
  });

  const automationController = new AutomationController({
    createAutomation,
    toggleAutomation,
    listAutomations,
    deleteAutomation,
    getDashboardStats,
    tokenVerifier: new FirebaseTokenVerifier(logger),
    logger,
  });

  return {
    logger,
    controllers: {
      webhook: webhookController,
      automation: automationController,
    },
    useCases: {
      createAutomation,
      toggleAutomation,
      listAutomations,
      deleteAutomation,
      getDashboardStats,
    },
  };
}