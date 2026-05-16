import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import type {
  Agent,
  AgentAnnotatePayload,
  AgentAnnotateResult,
  AgentMentionInstruction,
  AgentMentionInstructionPayload,
  AgentMessagePayload,
  AnnotationMetadata,
  AnnotationMetadataPayload,
  AppSettings,
  ArticleRecord,
  ArticleReadingProgress,
  Comment,
  DesktopStore,
  FocusCoReadingRoutePayload,
  FocusCoReadingRouteResult,
  LlmProvider,
  ProviderModel,
  ReadingDeliberationRecord,
  ReadingCardRecord,
  ReadingCardReviewRecord,
  UserProfile,
} from '@yomitomo/shared';
import type { ReadingCardEvidenceUnit, ReadingReceiptDecision } from '@yomitomo/core';
import type { AppUpdateState } from '../app-update-types';

export type GenerateReadingCardInput = {
  article: ArticleRecord;
  articleText: string;
  evidenceUnits: ReadingCardEvidenceUnit[];
  receiptDecisions?: ReadingReceiptDecision[];
  readingDeliberation?: ReadingDeliberationRecord;
};

export type GenerateReadingDeliberationInput = {
  article: ArticleRecord;
  articleText: string;
  evidenceUnits: ReadingCardEvidenceUnit[];
  receiptDecisions?: ReadingReceiptDecision[];
};

export type ReadingReceiptClarificationStance = 'include' | 'exclude';

export type ReadingReceiptClarificationOpinion = {
  agentId: string;
  agentNickname: string;
  agentUsername: string;
  agentAvatar: string;
  agentColor: string;
  stance: ReadingReceiptClarificationStance;
  reason: string;
};

export type ReadingReceiptClarificationAgent = Omit<
  ReadingReceiptClarificationOpinion,
  'stance' | 'reason'
>;

export type ReadingReceiptClarificationStreamEvent =
  | { type: 'agent_start'; agent: ReadingReceiptClarificationAgent }
  | { type: 'agent_delta'; agentId: string; delta: string }
  | { type: 'agent_done'; opinion: ReadingReceiptClarificationOpinion };

export type ReadingReceiptClarificationRoundInput = {
  userThought?: string;
  opinions: ReadingReceiptClarificationOpinion[];
};

export type GenerateReadingReceiptClarificationInput = {
  article: ArticleRecord;
  evidenceUnit: ReadingCardEvidenceUnit;
  selectedAgentIds: string[];
  previousRounds?: ReadingReceiptClarificationRoundInput[];
  userThought?: string;
};

export type ReviewReadingCardInput = GenerateReadingCardInput & {
  readingCard: ReadingCardRecord;
  previousReview?: ReadingCardReviewRecord;
  reviewAgentIds?: string[];
};

export type ArticleImportResult = {
  status: 'imported' | 'duplicate';
  article: ArticleRecord;
  store: DesktopStore;
};

export type EbookImportFileInput = {
  fileName: string;
  mimeType?: string;
  data: ArrayBuffer;
};

export type AppInfo = {
  desktopVersion: string;
};

export type PerformanceTimingInput = {
  event: string;
  data?: Record<string, unknown>;
};

const api = {
  getAppInfo: () => ipcRenderer.invoke('app:info') as Promise<AppInfo>,
  showMainWindow: () => ipcRenderer.send('app:renderer-ready'),
  getState: () => ipcRenderer.invoke('store:get') as Promise<DesktopStore>,
  onStoreUpdated: (callback: (store: DesktopStore) => void) => {
    const listener = (_event: IpcRendererEvent, store: DesktopStore) => callback(store);
    ipcRenderer.on('store:updated', listener);
    return () => ipcRenderer.removeListener('store:updated', listener);
  },
  saveUser: (user: Partial<UserProfile>) =>
    ipcRenderer.invoke('user:save', user) as Promise<DesktopStore>,
  saveSettings: (settings: AppSettings) =>
    ipcRenderer.invoke('settings:save', settings) as Promise<DesktopStore>,
  saveProvider: (provider: Partial<LlmProvider> & { removeApiKey?: boolean }) =>
    ipcRenderer.invoke('provider:save', provider) as Promise<DesktopStore>,
  deleteProvider: (id: string) =>
    ipcRenderer.invoke('provider:delete', id) as Promise<DesktopStore>,
  testProvider: (id: string) =>
    ipcRenderer.invoke('provider:test', id) as Promise<{ ok: boolean; message: string }>,
  listProviderModels: (provider: Partial<LlmProvider>) =>
    ipcRenderer.invoke('provider:list-models', provider) as Promise<ProviderModel[]>,
  inferAnnotationMetadata: (payload: AnnotationMetadataPayload) =>
    ipcRenderer.invoke('annotation:metadata', payload) as Promise<AnnotationMetadata>,
  planAgentMentionInstructions: (payload: AgentMentionInstructionPayload) =>
    ipcRenderer.invoke('agent:mention-instructions', payload) as Promise<AgentMentionInstruction[]>,
  planFocusCoReadingRoute: (payload: FocusCoReadingRoutePayload) =>
    ipcRenderer.invoke('focus-co-reading:route', payload) as Promise<FocusCoReadingRouteResult>,
  getLogPath: () => ipcRenderer.invoke('log:path') as Promise<string>,
  readLog: () => ipcRenderer.invoke('log:read') as Promise<string>,
  clearLog: () => ipcRenderer.invoke('log:clear') as Promise<void>,
  recordPerformanceTiming: (input: PerformanceTimingInput) =>
    ipcRenderer.invoke('performance:timing', input) as Promise<void>,
  getUpdateStatus: () => ipcRenderer.invoke('updates:get-status') as Promise<AppUpdateState>,
  checkForUpdates: () => ipcRenderer.invoke('updates:check') as Promise<AppUpdateState>,
  downloadUpdate: () => ipcRenderer.invoke('updates:download') as Promise<AppUpdateState>,
  installUpdate: () => ipcRenderer.invoke('updates:install') as Promise<AppUpdateState>,
  onUpdateStatus: (callback: (state: AppUpdateState) => void) => {
    const listener = (_event: IpcRendererEvent, state: AppUpdateState) => callback(state);
    ipcRenderer.on('updates:status', listener);
    return () => ipcRenderer.removeListener('updates:status', listener);
  },
  openUrl: (url: string) => ipcRenderer.invoke('url:open', url) as Promise<void>,
  saveArticle: (article: ArticleRecord) =>
    ipcRenderer.invoke('article:save', article) as Promise<DesktopStore>,
  saveArticleReadingProgress: (articleId: string, progress: ArticleReadingProgress) =>
    ipcRenderer.invoke('article:reading-progress', {
      articleId,
      progress,
    }) as Promise<DesktopStore>,
  importArticleUrl: (url: string) =>
    ipcRenderer.invoke('article:import-url', url) as Promise<ArticleImportResult>,
  importEbookFile: (input: EbookImportFileInput) =>
    ipcRenderer.invoke('ebook:import-file', input) as Promise<ArticleImportResult>,
  readEbookFile: (articleId: string) =>
    ipcRenderer.invoke('ebook:read-file', articleId) as Promise<ArrayBuffer>,
  deleteArticle: (id: string) => ipcRenderer.invoke('article:delete', id) as Promise<DesktopStore>,
  requestAgentComment: (payload: AgentMessagePayload) =>
    ipcRenderer.invoke('agent:comment', payload) as Promise<Comment>,
  requestAgentCommentStream: (
    payload: AgentMessagePayload,
    onEvent: (
      event: { type: 'start'; comment: Comment } | { type: 'delta'; delta: string },
    ) => void,
  ) => {
    const requestId = makeRequestId();
    const channel = `agent:comment:stream:${requestId}`;
    return new Promise<Comment>((resolve, reject) => {
      const listener = (
        _event: IpcRendererEvent,
        message:
          | { type: 'start'; comment: Comment }
          | { type: 'delta'; delta: string }
          | { type: 'done'; comment: Comment }
          | { type: 'error'; message: string },
      ) => {
        if (message.type === 'start' || message.type === 'delta') {
          onEvent(message);
          return;
        }
        ipcRenderer.removeListener(channel, listener);
        if (message.type === 'done') resolve(message.comment);
        else reject(new Error(message.message));
      };
      ipcRenderer.on(channel, listener);
      ipcRenderer.send('agent:comment:stream', { requestId, payload });
    });
  },
  requestAgentAnnotations: (payload: AgentAnnotatePayload) =>
    ipcRenderer.invoke('agent:annotate', payload) as Promise<AgentAnnotateResult>,
  requestAgentAnnotationsStream: (
    payload: AgentAnnotatePayload,
    onEvent: (
      event: { type: 'start' } | { type: 'item'; annotation: ArticleRecord['annotations'][number] },
    ) => void,
  ) => {
    const requestId = makeRequestId();
    const channel = `agent:annotate:stream:${requestId}`;
    return new Promise<AgentAnnotateResult>((resolve, reject) => {
      const listener = (
        _event: IpcRendererEvent,
        message:
          | { type: 'start' }
          | { type: 'item'; annotation: ArticleRecord['annotations'][number] }
          | {
              type: 'done';
              annotations: ArticleRecord['annotations'];
              readingMemory?: AgentAnnotateResult['readingMemory'];
            }
          | { type: 'error'; message: string },
      ) => {
        if (message.type === 'start' || message.type === 'item') {
          onEvent(message);
          return;
        }
        ipcRenderer.removeListener(channel, listener);
        if (message.type === 'done')
          resolve({ annotations: message.annotations, readingMemory: message.readingMemory });
        else reject(new Error(message.message));
      };
      ipcRenderer.on(channel, listener);
      ipcRenderer.send('agent:annotate:stream', { requestId, payload });
    });
  },
  generateReadingCard: (input: GenerateReadingCardInput) =>
    ipcRenderer.invoke('reading-card:generate', input) as Promise<{
      readingCard: ReadingCardRecord;
    }>,
  generateReadingDeliberation: (input: GenerateReadingDeliberationInput) =>
    ipcRenderer.invoke('reading-deliberation:generate', input) as Promise<{
      readingDeliberation: ReadingDeliberationRecord;
    }>,
  generateReadingReceiptClarification: (input: GenerateReadingReceiptClarificationInput) =>
    ipcRenderer.invoke('reading-clarification:generate', input) as Promise<{
      opinions: ReadingReceiptClarificationOpinion[];
    }>,
  generateReadingReceiptClarificationStream: (
    input: GenerateReadingReceiptClarificationInput,
    onEvent: (event: ReadingReceiptClarificationStreamEvent) => void,
  ) => {
    const requestId = makeRequestId();
    const channel = `reading-clarification:generate:stream:${requestId}`;
    return new Promise<{ opinions: ReadingReceiptClarificationOpinion[] }>((resolve, reject) => {
      const listener = (
        _event: IpcRendererEvent,
        message:
          | ReadingReceiptClarificationStreamEvent
          | { type: 'done'; opinions: ReadingReceiptClarificationOpinion[] }
          | { type: 'error'; message: string },
      ) => {
        if (
          message.type === 'agent_start' ||
          message.type === 'agent_delta' ||
          message.type === 'agent_done'
        ) {
          onEvent(message);
          return;
        }
        ipcRenderer.removeListener(channel, listener);
        if (message.type === 'done') resolve({ opinions: message.opinions });
        else reject(new Error(message.message));
      };
      ipcRenderer.on(channel, listener);
      ipcRenderer.send('reading-clarification:generate:stream', { requestId, payload: input });
    });
  },
  reviewReadingCard: (input: ReviewReadingCardInput) =>
    ipcRenderer.invoke('reading-card:review', input) as Promise<{
      review: ReadingCardReviewRecord;
    }>,
  saveAgent: (agent: Partial<Agent>) =>
    ipcRenderer.invoke('agent:save', agent) as Promise<DesktopStore>,
  deleteAgent: (id: string) => ipcRenderer.invoke('agent:delete', id) as Promise<DesktopStore>,
};

contextBridge.exposeInMainWorld('yomitomoDesktop', api);

export type YomitomoDesktopApi = typeof api;

function makeRequestId() {
  return `request_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}
