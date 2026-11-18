import { IGNORE_SYMBOL } from './constants.js';
import { translate } from './i18n.js';
import { createChatMemoryCore } from './chat-memory-shared.js';

export const { CHAT_MEMORY_METADATA_KEY, CHAT_MEMORY_HISTORY_LIMIT, TURN_SUMMARY_STATUS, CHAT_MEMORY_MAX_AUTO_ATTEMPTS, getDefaultChatMemoryPrompt, getDefaultChatMemoryWrap, CHAT_MEMORY_ROLES, ensureChatMessageIds, partitionChatTurns, computeMemoryWindow, stripMarkupForSummary, extractTurnSourceText, computeTurnHash, resolveChatMemorySettings, getChatMemoryMetadata, appendChatMemoryHistory, reconcileChatMemory, renderSummaryWrap, applySummariesToCoreChat, filterMemoryForBranch } = createChatMemoryCore(translate, IGNORE_SYMBOL);
