const fs = require('fs');
const path = require('path');

const basePath = path.join(__dirname, 'public');

// ============================================================
// PART 1: Process openai.js
// ============================================================
let js = fs.readFileSync(path.join(basePath, 'scripts', 'openai.js'), 'utf-8');
const jsLines = js.split('\n');

// Non-target provider identifiers (lowercase values used in chat_completion_sources)
const nonTargetProviders = [
    'OPENROUTER', 'AI21', 'MISTRALAI', 'COHERE', 'PERPLEXITY', 'GROQ',
    'CHUTES', 'SILICONFLOW', 'MINIMAX', 'ELECTRONHUB', 'NANOGPT',
    'DEEPSEEK', 'AIMLAPI', 'POLLINATIONS', 'MOONSHOT', 'FIREWORKS',
    'COMETAPI', 'VERTEXAI', 'ZAI', 'WORKERS_AI', 'AZURE_OPENAI',
];

const nonTargetProviderValues = [
    'openrouter', 'ai21', 'mistralai', 'cohere', 'perplexity', 'groq',
    'chutes', 'siliconflow', 'minimax', 'electronhub', 'nanogpt',
    'deepseek', 'aimlapi', 'pollinations', 'moonshot', 'fireworks',
    'cometapi', 'vertexai', 'zai', 'workers_ai', 'azure_openai',
];

// Target providers to keep
const targetProviders = ['openai', 'claude', 'makersuite', 'custom'];

// 1. Fix imports (lines 82-83)
js = js.replace(
    /import \{ COMETAPI_IGNORE_PATTERNS, IGNORE_SYMBOL, MEDIA_DISPLAY, MEDIA_TYPE \} from '\.\/constants\.js';/,
    "import { IGNORE_SYMBOL, MEDIA_DISPLAY, MEDIA_TYPE } from './constants.js';"
);
js = js.replace(
    /import \{ syncNanoGptProvidersForModel, syncOpenRouterProvidersForModel, updateNanoGptProvidersWarning, updateOpenRouterProvidersWarning \} from '\.\/textgen-models\.js';/,
    ''
);

// 2. Remove mistral_max_temp (line 140)
js = js.replace(/^const mistral_max_temp = 1\.5;\n/m, '');

// 3. Remove openrouter_website_model (line 141)
js = js.replace(/^const openrouter_website_model = 'OR_Website';\n/m, '');

// 4. Remove openrouter_middleout_types (lines 208-212)
js = js.replace(
    /const openrouter_middleout_types = \{[\s\S]*?\};\n/,
    ''
);

// 5. Update chat_completion_sources to add MAKERSUITE
js = js.replace(
    /export const chat_completion_sources = \{\s*\n\s*OPENAI: 'openai',\s*\n\s*CLAUDE: 'claude',\s*\n\s*CUSTOM: 'custom',\s*\n\};/,
    `export const chat_completion_sources = {\n    OPENAI: 'openai',\n    CLAUDE: 'claude',\n    MAKERSUITE: 'makersuite',\n    CUSTOM: 'custom',\n};`
);

// 6. Remove ZAI_ENDPOINT, SILICONFLOW_ENDPOINT, MINIMAX_ENDPOINT (lines 241-254)
js = js.replace(
    /export const ZAI_ENDPOINT = \{[\s\S]*?\};\n\nexport const SILICONFLOW_ENDPOINT = \{[\s\S]*?\};\n\nexport const MINIMAX_ENDPOINT = \{[\s\S]*?\};\n/,
    ''
);

// 7. Remove non-target entries from sensitiveFields
js = js.replace(
    /    'vertexai_region',\n    'vertexai_express_project_id',\n.*?    'workers_ai_account_id',\n/s,
    ''
);

// 8. Remove non-target entries from settingsToUpdate
// Remove each non-target line individually
const settingsToRemove = [
    /    openrouter_model:.*\n/,
    /    openrouter_use_fallback:.*\n/,
    /    openrouter_providers:.*\n/,
    /    openrouter_quantizations:.*\n/,
    /    openrouter_allow_fallbacks:.*\n/,
    /    openrouter_middleout:.*\n/,
    /    ai21_model:.*\n/,
    /    mistralai_model:.*\n/,
    /    cohere_model:.*\n/,
    /    perplexity_model:.*\n/,
    /    groq_model:.*\n/,
    /    chutes_model:.*\n/,
    /    siliconflow_model:.*\n/,
    /    siliconflow_endpoint:.*\n/,
    /    minimax_model:.*\n/,
    /    minimax_endpoint:.*\n/,
    /    electronhub_model:.*\n/,
    /    nanogpt_model:.*\n/,
    /    nanogpt_provider:.*\n/,
    /    nanogpt_payg_override:.*\n/,
    /    deepseek_model:.*\n/,
    /    aimlapi_model:.*\n/,
    /    xai_model:.*\n/,
    /    pollinations_model:.*\n/,
    /    moonshot_model:.*\n/,
    /    fireworks_model:.*\n/,
    /    cometapi_model:.*\n/,
    /    vertexai_model:.*\n/,
    /    zai_model:.*\n/,
    /    zai_endpoint:.*\n/,
    /    workers_ai_model:.*\n/,
    /    workers_ai_account_id:.*\n/,
    /    azure_base_url:.*\n/,
    /    azure_deployment_name:.*\n/,
    /    azure_api_version:.*\n/,
    /    azure_openai_model:.*\n/,
    /    vertexai_auth_mode:.*\n/,
    /    vertexai_region:.*\n/,
    /    vertexai_express_project_id:.*\n/,
];
for (const regex of settingsToRemove) {
    js = js.replace(regex, '');
}

// 9. Remove non-target entries from default_settings
const defaultSettingsToRemove = [
    /    vertexai_model:.*\n/,
    /    ai21_model:.*\n/,
    /    mistralai_model:.*\n/,
    /    cohere_model:.*\n/,
    /    perplexity_model:.*\n/,
    /    groq_model:.*\n/,
    /    chutes_model:.*\n/,
    /    siliconflow_model:.*\n/,
    /    siliconflow_endpoint:.*\n/,
    /    minimax_model:.*\n/,
    /    minimax_endpoint:.*\n/,
    /    electronhub_model:.*\n/,
    /    nanogpt_model:.*\n/,
    /    nanogpt_provider:.*\n/,
    /    nanogpt_payg_override:.*\n/,
    /    deepseek_model:.*\n/,
    /    aimlapi_model:.*\n/,
    /    xai_model:.*\n/,
    /    pollinations_model:.*\n/,
    /    cometapi_model:.*\n/,
    /    moonshot_model:.*\n/,
    /    fireworks_model:.*\n/,
    /    zai_model:.*\n/,
    /    zai_endpoint:.*\n/,
    /    workers_ai_model:.*\n/,
    /    workers_ai_account_id:.*\n/,
    /    openrouter_model:.*\n/,
    /    openrouter_use_fallback:.*\n/,
    /    openrouter_providers:.*\n/,
    /    openrouter_quantizations:.*\n/,
    /    openrouter_allow_fallbacks:.*\n/,
    /    openrouter_middleout:.*\n/,
    /    vertexai_auth_mode:.*\n/,
    /    vertexai_region:.*\n/,
    /    vertexai_express_project_id:.*\n/,
    /    azure_base_url:.*\n/,
    /    azure_deployment_name:.*\n/,
    /    azure_api_version:.*\n/,
    /    azure_openai_model:.*\n/,
];
for (const regex of defaultSettingsToRemove) {
    js = js.replace(regex, '');
}

// 10. Fix getChatCompletionModel - remove non-target cases
js = js.replace(
    /        case chat_completion_sources\.PERPLEXITY:\s*\n\s*return settings\.perplexity_model;\s*\n\s*case chat_completion_sources\.GROQ:\s*\n\s*return settings\.groq_model;\s*\n/,
    ''
);

// 11. Remove helper functions for non-target providers
// getOpenRouterModelTemplate
js = js.replace(/function getOpenRouterModelTemplate\(option\) \{[\s\S]*?^    \(`\)\);\n\}\n/m, '');
// calculateOpenRouterCost - handle the oddly-formatted function
js = js.replace(/function calculateOpenRouterCost\(\) \{\s*\n\s*\}\s*\n[\s\S]*?\$\('#openrouter_max_prompt_cost'\)\.text\(cost\);\n\}/m, '');
// getElectronHubModelTemplate
js = js.replace(/function getElectronHubModelTemplate\(option\) \{[\s\S]*?^    \(`\)\);\n\}\n/m, '');
// calculateElectronHubCost
js = js.replace(/function calculateElectronHubCost\(\) \{\s*\n\s*\}\s*\n[\s\S]*?\$\('#electronhub_max_prompt_cost'\)\.text\(cost\);\n\}/m, '');
// getChutesModelTemplate
js = js.replace(/function getChutesModelTemplate\(option\) \{[\s\S]*?^    \(`\)\);\n\}\n/m, '');
// calculateChutesCost
js = js.replace(/function calculateChutesCost\(\) \{\s*\n\s*\}\s*\n[\s\S]*?\$\('#chutes_max_prompt_cost'\)\.text\(cost\);\n\}/m, '');
// getNanoGptModelTemplate
js = js.replace(/function getNanoGptModelTemplate\(option\) \{[\s\S]*?^    \(`\)\);\n\}\n/m, '');
// getAimlapiModelTemplate
js = js.replace(/function getAimlapiModelTemplate\(option\) \{[\s\S]*?\n\}\n(?=\n)/m, '');

// Remove getMaxContext helper functions for non-target providers
const maxContextFns = [
    'getMistralMaxContext', 'getGroqMaxContext', 'getZaiMaxContext',
    'getSiliconflowMaxContext', 'getMoonshotMaxContext', 'getFireworksMaxContext',
    'getChutesMaxContext', 'getElectronHubMaxContext', 'getNanoGptMaxContext',
];
for (const fn of maxContextFns) {
    const regex = new RegExp(`/\\*\\*\\s*\\n[^]*?function ${fn}\\(model, isUnlocked\\) \\{[^]*?^\\}\\n`, 'm');
    js = js.replace(regex, '');
}

// 12. Clean up saveModelList - remove non-target provider blocks
// The function starts at line 1922 and the non-target blocks start after CUSTOM block (line 1995)
// Remove from the OpenRouter block (line 1926-1938) and non-target blocks (lines 1997-2070)
// First remove the orphaned OpenRouter block at the beginning (lines 1926-1938)
js = js.replace(
    /\n                models\.forEach\(\(model\) => \{\s*\n                    optgroup\.append\(\$\('<option>'\), \{ value: model\.id, text: model\.name \}\)\);\s*\n                \}\);\s*\n                \$\('#model_openrouter_select'\)\.append\(optgroup\);\s*\n            \}\);\s*\n        \} else \{\s*\n            model_list\.forEach\(\(model\) => \{\s*\n                \$\('#model_openrouter_select'\)\.append\(\$\('<option>'\), \{ value: model\.id, text: model\.name \}\)\);\s*\n            \}\);\s*\n        \}\s*\n\s*\n        \$\('#model_openrouter_select'\)\.val\(oai_settings\.openrouter_model\)\.trigger\('change'\);\s*\n    \}/,
    ''
);

// Remove non-target blocks after CUSTOM block in saveModelList
// These are the AIMLAPI, ELECTRONHUB, CHUTES, NANOGPT blocks (lines 1997-2070)
js = js.replace(
    /\n                models\.forEach\(\(model\) => \{\s*\n                    optgroup\.append\(\$\('<option>'\), \{ value: model\.id, text: model\.info\?\.name \|\| model\.id \}\)\);\s*\n                \}\);\s*\n                \$\('#model_aimlapi_select'\)\.append\(optgroup\);\s*\n[\s\S]*?\$\('#model_aimlapi_select'\)\.val\(oai_settings\.aimlapi_model\)\.trigger\('change'\);\s*\n    \}/,
    ''
);

// Remove ELECTRONHUB block in saveModelList
js = js.replace(
    /\n                models\.forEach\(\(model\) => \{\s*\n                    optgroup\.append\(\$\('<option>'\), \{ value: model\.id, text: model\.name \}\)\);\s*\n                \}\);\s*\n                \$\('#model_electronhub_select'\)\.append\(optgroup\);\s*\n[\s\S]*?\$\('#model_electronhub_select'\)\.val\(oai_settings\.electronhub_model\)\.trigger\('change'\);\s*\n    \}/,
    ''
);

// Remove CHUTES block in saveModelList
js = js.replace(
    /\n                models\.forEach\(\(model\) => \{\s*\n                    optgroup\.append\(\$\('<option>'\), \{ value: model\.id, text: model\.id \}\)\);\s*\n                \}\);\s*\n                \$\('#model_chutes_select'\)\.append\(optgroup\);\s*\n[\s\S]*?\$\('#model_chutes_select'\)\.val\(oai_settings\.chutes_model\)\.trigger\('change'\);\s*\n    \}/,
    ''
);

// Remove NANOGPT block in saveModelList
js = js.replace(
    /\n                    optgroup\.append\(\$\('<option>'\), \{ value: model\.id, text: model\.name \|\| model\.id \}\)\);\s*\n                \}\);\s*\n                \$\('#model_nanogpt_select'\)\.append\(optgroup\);\s*\n[\s\S]*?\$\('#model_nanogpt_select'\)\.val\(oai_settings\.nanogpt_model\)\.trigger\('change'\);\s*\n    \}/,
    ''
);

// 13. Clean up createGenerationParameters
// Remove non-target providers from gptSources array
js = js.replace(
    /const gptSources = \[\s*\n\s*chat_completion_sources\.OPENAI,\s*\n\s*chat_completion_sources\.AZURE_OPENAI,\s*\n\s*chat_completion_sources\.OPENROUTER,\s*\n\s*\];/,
    `const gptSources = [\n        chat_completion_sources.OPENAI,\n    ];`
);

// Remove non-target providers from seedSupportedSources
js = js.replace(
    /const seedSupportedSources = \[\s*\n\s*chat_completion_sources\.OPENAI,\s*\n\s*chat_completion_sources\.AZURE_OPENAI,\s*\n\s*chat_completion_sources\.OPENROUTER,\s*\n\s*chat_completion_sources\.MISTRALAI,\s*\n\s*chat_completion_sources\.CUSTOM,\s*\n\s*chat_completion_sources\.COHERE,\s*\n\s*chat_completion_sources\.GROQ,\s*\n\s*chat_completion_sources\.ELECTRONHUB,\s*\n\s*chat_completion_sources\.NANOGPT,\s*\n\s*chat_completion_sources\.XAI,\s*\n\s*chat_completion_sources\.POLLINATIONS,\s*\n\s*chat_completion_sources\.AIMLAPI,\s*\n\s*chat_completion_sources\.VERTEXAI,\s*\n\s*chat_completion_sources\.MAKERSUITE,\s*\n\s*chat_completion_sources\.CHUTES,\s*\n\s*\];/,
    `const seedSupportedSources = [\n        chat_completion_sources.OPENAI,\n        chat_completion_sources.CUSTOM,\n        chat_completion_sources.MAKERSUITE,\n    ];`
);

// Remove non-target providers from proxySupportedSources
js = js.replace(
    /const proxySupportedSources = \[\s*\n\s*chat_completion_sources\.CLAUDE,\s*\n\s*chat_completion_sources\.OPENAI,\s*\n\s*chat_completion_sources\.MISTRALAI,\s*\n\s*chat_completion_sources\.MAKERSUITE,\s*\n\s*chat_completion_sources\.VERTEXAI,\s*\n\s*chat_completion_sources\.DEEPSEEK,\s*\n\s*chat_completion_sources\.XAI,\s*\n\s*chat_completion_sources\.ZAI,\s*\n\s*chat_completion_sources\.MOONSHOT,\s*\n\s*\];/,
    `const proxySupportedSources = [\n        chat_completion_sources.CLAUDE,\n        chat_completion_sources.OPENAI,\n        chat_completion_sources.MAKERSUITE,\n    ];`
);

// Remove non-target providers from logprobsSupportedSources
js = js.replace(
    /const logprobsSupportedSources = \[\s*\n\s*chat_completion_sources\.OPENAI,\s*\n\s*chat_completion_sources\.AZURE_OPENAI,\s*\n\s*chat_completion_sources\.CUSTOM,\s*\n\s*chat_completion_sources\.DEEPSEEK,\s*\n\s*chat_completion_sources\.XAI,\s*\n\s*chat_completion_sources\.AIMLAPI,\s*\n\s*chat_completion_sources\.CHUTES,\s*\n\s*\];/,
    `const logprobsSupportedSources = [\n        chat_completion_sources.OPENAI,\n        chat_completion_sources.CUSTOM,\n    ];`
);

// Remove non-target providers from logitBiasSources
js = js.replace(
    /const logitBiasSources = \[\s*\n\s*chat_completion_sources\.OPENAI,\s*\n\s*chat_completion_sources\.AZURE_OPENAI,\s*\n\s*chat_completion_sources\.OPENROUTER,\s*\n\s*chat_completion_sources\.ELECTRONHUB,\s*\n\s*chat_completion_sources\.CHUTES,\s*\n\s*chat_completion_sources\.CUSTOM,\s*\n\s*\];/,
    `const logitBiasSources = [\n        chat_completion_sources.OPENAI,\n        chat_completion_sources.CUSTOM,\n    ];`
);

// Remove non-target providers from multiswipeSources
js = js.replace(
    /const multiswipeSources = \[\s*\n\s*chat_completion_sources\.OPENAI,\s*\n\s*chat_completion_sources\.AZURE_OPENAI,\s*\n\s*chat_completion_sources\.CUSTOM,\s*\n\s*chat_completion_sources\.XAI,\s*\n\s*chat_completion_sources\.AIMLAPI,\s*\n\s*chat_completion_sources\.MOONSHOT,\s*\n\s*\];/,
    `const multiswipeSources = [\n        chat_completion_sources.OPENAI,\n        chat_completion_sources.CUSTOM,\n    ];`
);

// Remove isWorkersAIJsonMode
js = js.replace(/\s*const isWorkersAIJsonMode = settings\.chat_completion_source === chat_completion_sources\.WORKERS_AI && jsonSchema;\n/, '\n');
js = js.replace(/&& !isWorkersAIJsonMode/g, '');

// Remove non-target provider blocks in createGenerationParameters
// OPENROUTER block
js = js.replace(/\s*if \(settings\.chat_completion_source === chat_completion_sources\.OPENROUTER\) \{[\s\S]*?\n    \}\n/, '\n');
// NANOGPT block
js = js.replace(/\s*if \(settings\.chat_completion_source === chat_completion_sources\.NANOGPT\) \{[\s\S]*?\n    \}\n/, '\n');
// MISTRALAI block
js = js.replace(/\s*if \(settings\.chat_completion_source === chat_completion_sources\.MISTRALAI\) \{[\s\S]*?\n    \}\n/, '\n');
// COHERE block
js = js.replace(/\s*if \(settings\.chat_completion_source === chat_completion_sources\.COHERE\) \{[\s\S]*?\n    \}\n/, '\n');
// PERPLEXITY block
js = js.replace(/\s*if \(settings\.chat_completion_source === chat_completion_sources\.PERPLEXITY\) \{[\s\S]*?\n    \}\n/, '\n');
// GROQ block
js = js.replace(/\s*\/\/ https:\/\/console\.groq\.com\/docs\/openai\s*\n\s*if \(settings\.chat_completion_source === chat_completion_sources\.GROQ\) \{[\s\S]*?\n    \}\n/, '\n');
// DEEPSEEK block
js = js.replace(/\s*\/\/ https:\/\/api-docs\.deepseek\.com\/api\/create-chat-completion\s*\n\s*if \(settings\.chat_completion_source === chat_completion_sources\.DEEPSEEK\) \{[\s\S]*?\n    \}\n/, '\n');
// XAI block
js = js.replace(/\s*if \(settings\.chat_completion_source === chat_completion_sources\.XAI\) \{[\s\S]*?\n    \}\n/, '\n');
// ELECTRONHUB block
js = js.replace(/\s*\/\/ https:\/\/docs\.electronhub\.ai\/api-reference\/chat\/completions\s*\n\s*if \(settings\.chat_completion_source === chat_completion_sources\.ELECTRONHUB\) \{[\s\S]*?\n    \}\n/, '\n');
// CHUTES block
js = js.replace(/\s*if \(settings\.chat_completion_source === chat_completion_sources\.CHUTES\) \{[\s\S]*?\n    \}\n/, '\n');
// ZAI block
js = js.replace(/\s*\/\/ https:\/\/docs\.z\.ai\/api-reference\/llm\/chat-completion\s*\n\s*if \(settings\.chat_completion_source === chat_completion_sources\.ZAI\) \{[\s\S]*?\n    \}\n/, '\n');
// SILICONFLOW block
js = js.replace(/\s*if \(settings\.chat_completion_source === chat_completion_sources\.SILICONFLOW\) \{[\s\S]*?\n    \}\n/, '\n');
// MINIMAX block
js = js.replace(/\s*if \(settings\.chat_completion_source === chat_completion_sources\.MINIMAX\) \{[\s\S]*?\n    \}\n/, '\n');
// WORKERS_AI block
js = js.replace(/\s*if \(settings\.chat_completion_source === chat_completion_sources\.WORKERS_AI\) \{[\s\S]*?\n    \}\n/, '\n');
// NANOGPT second block
js = js.replace(/\s*\/\/ https:\/\/docs\.nano-gpt\.com\/api-reference\/endpoint\/chat-completion#temperature-&-nucleus\s*\n\s*if \(settings\.chat_completion_source === chat_completion_sources\.NANOGPT\) \{[\s\S]*?\n    \}\n/, '\n');
// MOONSHOT block
js = js.replace(/\s*\/\/ https:\/\/platform\.moonshot\.ai\/docs\/api\/chat#public-service-address\s*\n\s*if \(settings\.chat_completion_source === chat_completion_sources\.MOONSHOT\) \{[\s\S]*?\n    \}\n/, '\n');

// Remove OPENROUTER condition in the o1/o3/o4 check
js = js.replace(
    /\s*\|\|\s*\n\s*\(chat_completion_sources\.OPENROUTER === settings\.chat_completion_source && \/\^openai\\\/\(o1\|o3\|o4\)\//,
    ''
);

// Remove ELECTRONHUB reasoning effort check
js = js.replace(
    /\s*\/\/ Check if the resolved effort supported by the model\s*\n\s*if \(settings\.chat_completion_source === chat_completion_sources\.ELECTRONHUB\) \{[\s\S]*?\n\s*\}\n/,
    ''
);

// Remove OPENROUTER reasoning effort check
js = js.replace(
    /if \(chat_completion_sources\.OPENROUTER === settings\.chat_completion_source && !settings\.show_thoughts\) \{\s*\n\s*return 'none';\s*\n\s*\}\s*\n/,
    ''
);

// 14. Clean up getStreamingReply
// Remove VERTEXAI from MAKERSUITE check
js = js.replace(
    /\[chat_completion_sources\.MAKERSUITE, chat_completion_sources\.VERTEXAI\]\.includes\(chat_completion_source\)/g,
    'chat_completion_source === chat_completion_sources.MAKERSUITE'
);

// Remove COHERE branch
js = js.replace(
    /    \} else if \(chat_completion_source === chat_completion_sources\.COHERE\) \{\s*\n\s*return data\?\.\delta\?\.\message\?\.\content\?\.\text \|\| data\?\.\delta\?\.\message\?\.\tool_plan \|\| '';\s*\n/,
    ''
);

// Remove DEEPSEEK branch
js = js.replace(
    /    \} else if \(chat_completion_source === chat_completion_sources\.DEEPSEEK\) \{[\s\S]*?return data\.choices\?\.\[0\]\?\.\delta\?\.\content \|\| '';\s*\n/,
    ''
);

// Remove XAI branch
js = js.replace(
    /    \} else if \(chat_completion_source === chat_completion_sources\.XAI\) \{[\s\S]*?return data\.choices\?\.\[0\]\?\.\delta\?\.\content \|\| '';\s*\n/,
    ''
);

// Remove OPENROUTER branch
js = js.replace(
    /    \} else if \(chat_completion_source === chat_completion_sources\.OPENROUTER\) \{[\s\S]*?return data\.choices\?\.\[0\]\?\.\delta\?\.\content \?\? data\.choices\?\.\[0\]\?\.\message\?\.\content \?\? data\.choices\?\.\[0\]\?\.\text \?\? '';\s*\n/,
    ''
);

// Update CUSTOM branch to only include CUSTOM
js = js.replace(
    /\[chat_completion_sources\.CUSTOM, chat_completion_sources\.POLLINATIONS, chat_completion_sources\.AIMLAPI, chat_completion_sources\.MOONSHOT, chat_completion_sources\.COMETAPI, chat_completion_sources\.ELECTRONHUB, chat_completion_sources\.NANOGPT, chat_completion_sources\.ZAI, chat_completion_sources\.SILICONFLOW, chat_completion_sources\.CHUTES, chat_completion_sources\.WORKERS_AI\]\.includes\(chat_completion_source\)/,
    'chat_completion_source === chat_completion_sources.CUSTOM'
);

// Remove MISTRALAI branch
js = js.replace(
    /    \} else if \(chat_completion_source === chat_completion_sources\.MISTRALAI\) \{[\s\S]*?return Array\.isArray\(content\) \? content\.map\(x => x\.text\)\.filter\(x => x\)\.join\(''\) : content;\s*\n/,
    ''
);

// 15. Clean up parseChatCompletionLogprobs
// Remove AIMLAPI case
js = js.replace(
    /        case chat_completion_sources\.AIMLAPI:\s*\n\s*return Object\.keys\(data\?\.\choices\?\.\[0\]\?\.\logprobs \?\? \{\}\)\.includes\('content'\)\s*\n\s*\? parseOpenAIChatLogprobs\(data\.choices\[0\]\?\.\logprobs\)\s*\n\s*: parseOpenAITextLogprobs\(data\.choices\[0\]\?\.\logprobs\);\s*\n/,
    ''
);

// Remove DEEPSEEK, XAI, CHUTES from remaining cases
js = js.replace(
    /        case chat_completion_sources\.OPENAI:\s*\n\s*case chat_completion_sources\.AZURE_OPENAI:\s*\n\s*case chat_completion_sources\.DEEPSEEK:\s*\n\s*case chat_completion_sources\.XAI:\s*\n\s*case chat_completion_sources\.CUSTOM:\s*\n\s*case chat_completion_sources\.CHUTES:/,
    `        case chat_completion_sources.OPENAI:\n        case chat_completion_sources.CUSTOM:`
);

// 16. Clean up compressImage
js = js.replace(
    /const compressImageSources = \[\s*\n\s*chat_completion_sources\.OPENROUTER,\s*\n\s*chat_completion_sources\.MAKERSUITE,\s*\n\s*chat_completion_sources\.MISTRALAI,\s*\n\s*chat_completion_sources\.VERTEXAI,\s*\n\s*\];/,
    `const compressImageSources = [\n            chat_completion_sources.MAKERSUITE,\n        ];`
);

// 17. Clean up getStatusOpen
// Remove non-target from noValidateSources
js = js.replace(
    /const noValidateSources = \[\s*\n\s*chat_completion_sources\.CLAUDE,\s*\n\s*chat_completion_sources\.AI21,\s*\n\s*chat_completion_sources\.VERTEXAI,\s*\n\s*chat_completion_sources\.PERPLEXITY,\s*\n\s*chat_completion_sources\.ZAI,\s*\n\s*chat_completion_sources\.MINIMAX,\s*\n\s*\];/,
    `const noValidateSources = [\n        chat_completion_sources.CLAUDE,\n    ];`
);

// Remove non-target from validateProxySources
js = js.replace(
    /const validateProxySources = \[\s*\n\s*chat_completion_sources\.CLAUDE,\s*\n\s*chat_completion_sources\.OPENAI,\s*\n\s*chat_completion_sources\.MISTRALAI,\s*\n\s*chat_completion_sources\.MAKERSUITE,\s*\n\s*chat_completion_sources\.VERTEXAI,\s*\n\s*chat_completion_sources\.DEEPSEEK,\s*\n\s*chat_completion_sources\.XAI,\s*\n\s*chat_completion_sources\.ZAI,\s*\n\s*chat_completion_sources\.MOONSHOT,\s*\n\s*\];/,
    `const validateProxySources = [\n        chat_completion_sources.CLAUDE,\n        chat_completion_sources.OPENAI,\n        chat_completion_sources.MAKERSUITE,\n    ];`
);

// Remove SILICONFLOW, MINIMAX, WORKERS_AI blocks in getStatusOpen
js = js.replace(
    /\s*if \(oai_settings\.chat_completion_source === chat_completion_sources\.SILICONFLOW\) \{\s*\n\s*data\.siliconflow_endpoint = oai_settings\.siliconflow_endpoint;\s*\n\s*\}\s*\n/,
    ''
);
js = js.replace(
    /\s*if \(oai_settings\.chat_completion_source === chat_completion_sources\.MINIMAX\) \{\s*\n\s*data\.minimax_endpoint = oai_settings\.minimax_endpoint;\s*\n\s*\}\s*\n/,
    ''
);

// 18. Clean up onModelChange
// Remove non-target model select handlers
const modelSelectHandlers = [
    'model_openrouter_select', 'model_ai21_select', 'model_mistralai_select',
    'model_cohere_select', 'model_perplexity_select', 'model_groq_select',
    'model_siliconflow_select', 'model_minimax_select', 'model_electronhub_select',
    'model_chutes_select', 'model_nanogpt_select', 'model_deepseek_select',
    'model_pollinations_select', 'model_aimlapi_select', 'model_xai_select',
    'model_moonshot_select', 'model_fireworks_select', 'model_cometapi_select',
    'model_vertexai_select', 'model_zai_select', 'model_workers_ai_select',
];

for (const sel of modelSelectHandlers) {
    // Match the if blocks for each non-target model select
    const regex = new RegExp(`\\s*if \\(\\$\\(this\\)\\.is\\('#${sel}'\\)\\) \\{[\\s\\S]*?\\}\\s*\\n`, '');
    js = js.replace(regex, '\n');
}

// Remove Azure model handler
js = js.replace(/\s*if \(\$\(this\)\.is\('#azure_openai_model'\)\) \{[\s\S]*?\}\s*\n/, '\n');

// Remove non-target context/temp handlers in onModelChange
// These are the large blocks starting with "if (oai_settings.chat_completion_source == ..."
const contextHandlers = [
    'OPENROUTER', 'MISTRALAI', 'COHERE', 'PERPLEXITY', 'GROQ', 'AI21',
    'CHUTES', 'ELECTRONHUB', 'NANOGPT', 'POLLINATIONS', 'DEEPSEEK',
    'WORKERS_AI', 'COMETAPI', 'XAI', 'AIMLAPI', 'MOONSHOT', 'FIREWORKS',
    'SILICONFLOW', 'MINIMAX', 'ZAI',
];

for (const provider of contextHandlers) {
    const regex = new RegExp(`\\s*if \\(oai_settings\\.chat_completion_source [=!]= chat_completion_sources\\.${provider}\\) \\{[\\s\\S]*?\\}\\s*\\n`, '');
    js = js.replace(regex, '\n');
    // Also try === variant
    const regex2 = new RegExp(`\\s*if \\(oai_settings\\.chat_completion_source === chat_completion_sources\\.${provider}\\) \\{[\\s\\S]*?\\}\\s*\\n`, '');
    js = js.replace(regex2, '\n');
}

// Remove COHERE penalty clamping and its else block
js = js.replace(
    /\s*if \(oai_settings\.chat_completion_source === chat_completion_sources\.COHERE\) \{[\s\S]*?\} else \{\s*\n\s*\$\('#pres_pen_openai'\)\.attr\('max', 2\)\.attr\('min', -2\)\.val\(oai_settings\.pres_pen_openai\)\.trigger\('input'\);\s*\n\s*\$\('#freq_pen_openai'\)\.attr\('max', 2\)\.attr\('min', -2\)\.val\(oai_settings\.freq_pen_openai\)\.trigger\('input'\);\s*\n\s*\}\s*\n/,
    ''
);

// 19. Clean up toggleChatCompletionForms
// Remove all non-target branches
for (const provider of contextHandlers) {
    const regex = new RegExp(`    \\} else if \\(oai_settings\\.chat_completion_source [=!]= chat_completion_sources\\.${provider}\\) \\{\\s*\\n\\s*\\$\\('#model_[^']*'\\)\\.trigger\\('change'\\);\\s*\\n`, '');
    js = js.replace(regex, '');
}

// Remove VERTEXAI branch
js = js.replace(
    /    \} else if \(oai_settings\.chat_completion_source == chat_completion_sources\.VERTEXAI\) \{\s*\n\s*\$\('#model_vertexai_select'\)\.trigger\('change'\);\s*\n\s*\/\/ Update UI based on authentication mode\s*\n\s*onVertexAIAuthModeChange\.call\(\$\('#vertexai_auth_mode'\)\[0\]\);\s*\n/,
    ''
);

// Remove AZURE_OPENAI branch
js = js.replace(
    /    \} else if \(oai_settings\.chat_completion_source == chat_completion_sources\.AZURE_OPENAI\) \{\s*\n\s*\$\('#azure_openai_model'\)\.trigger\('change'\);\s*\n/,
    ''
);

// 20. Clean up isImageInliningSupported
// Remove non-target cases from the switch
const imageInlineCases = [
    'OPENROUTER', 'MISTRALAI', 'COHERE', 'XAI', 'AIMLAPI', 'CHUTES',
    'ELECTRONHUB', 'POLLINATIONS', 'COMETAPI', 'MOONSHOT', 'NANOGPT',
    'ZAI', 'SILICONFLOW', 'WORKERS_AI', 'VERTEXAI',
];

for (const provider of imageInlineCases) {
    const regex = new RegExp(`\\s*case chat_completion_sources\\.${provider}:\\s*\\n[\\s\\S]*?(?=case chat_completion_sources\\.|default:)`, '');
    js = js.replace(regex, '\n');
}

// 21. Clean up isVideoInliningSupported
js = js.replace(
    /\s*case chat_completion_sources\.VERTEXAI:\s*\n\s*return videoSupportedModels\.some\(model => oai_settings\.vertexai_model\.includes\(model\)\);\s*\n/,
    ''
);
js = js.replace(
    /\s*case chat_completion_sources\.OPENROUTER:\s*\n\s*return \(Array\.isArray\(model_list\) && model_list\.find\(m => m\.id === oai_settings\.openrouter_model\)\?\.architecture\?\.\input_modalities\?\.\includes\('video'\)\);\s*\n/,
    ''
);
js = js.replace(
    /\s*case chat_completion_sources\.ZAI:\s*\n\s*return videoSupportedModels\.some\(model => oai_settings\.zai_model\.includes\(model\)\);\s*\n/,
    ''
);

// 22. Clean up isAudioInliningSupported
js = js.replace(
    /\s*case chat_completion_sources\.VERTEXAI:\s*\n\s*return audioSupportedModels\.some\(model => oai_settings\.vertexai_model\.includes\(model\)\);\s*\n/,
    ''
);
js = js.replace(
    /\s*case chat_completion_sources\.OPENROUTER:\s*\n\s*return \(Array\.isArray\(model_list\) && model_list\.find\(m => m\.id === oai_settings\.openrouter_model\)\?\.architecture\?\.\input_modalities\?\.\includes\('audio'\)\);\s*\n/,
    ''
);

// 23. Clean up isReasoningSignatureSupported
js = js.replace(
    /const isGoogle = \[chat_completion_sources\.VERTEXAI, chat_completion_sources\.MAKERSUITE\]\.includes\(settings\.chat_completion_source\);\s*\n\s*\/\/ Need a more crunchy check for OpenRouter: look for Gemini models\s*\n\s*const isOpenRouterGemini = settings\.chat_completion_source === chat_completion_sources\.OPENROUTER && \/google\\\/gemini\/i\.test\(settings\.openrouter_model\);\s*\n\s*return isGoogle \|\| isOpenRouterGemini;/,
    `const isGoogle = settings.chat_completion_source === chat_completion_sources.MAKERSUITE;\n    return isGoogle;`
);

// 24. Remove Vertex AI functions
js = js.replace(
    /\/\*\*\s*\n\s*\* Handle Vertex AI authentication mode change[\s\S]*?function updateVertexAIServiceAccountStatus\(isValid = false, message = ''\) \{[\s\S]*?\}\s*\n/,
    ''
);

// 25. Remove OPENROUTER interleaved thinking hint reference
js = js.replace(/\s*\$\('#openrouter_interleaved_thinking_disabled_hint'\)\.toggle\(!isEnabled\);\s*\n/, '\n');

// 26. Clean up initOpenAI function
// Remove calculateOpenRouterCost, calculateElectronHubCost, calculateChutesCost calls
js = js.replace(/\s*calculateOpenRouterCost\(\);?\n/g, '\n');
js = js.replace(/\s*calculateElectronHubCost\(\);?\n/g, '\n');
js = js.replace(/\s*calculateChutesCost\(\);?\n/g, '\n');

// Remove non-target model select event bindings
const eventBindings = [
    'model_openrouter_select', 'model_ai21_select', 'model_mistralai_select',
    'model_cohere_select', 'model_perplexity_select', 'model_groq_select',
    'model_chutes_select', 'model_siliconflow_select', 'model_minimax_select',
    'model_electronhub_select', 'model_nanogpt_select', 'model_deepseek_select',
    'model_aimlapi_select', 'model_xai_select', 'model_pollinations_select',
    'model_cometapi_select', 'model_moonshot_select', 'model_fireworks_select',
    'model_vertexai_select', 'model_zai_select', 'model_workers_ai_select',
    'azure_openai_model',
];

for (const sel of eventBindings) {
    js = js.replace(new RegExp(`\\s*\\$\\('#${sel}'\\)\\.on\\('change', onModelChange\\);\\s*\\n`, ''), '');
}

// Remove Vertex AI event handlers in initOpenAI
js = js.replace(/\s*\$\('#vertexai_auth_mode'\)\.on\('change', onVertexAIAuthModeChange\);\s*\n/, '');
js = js.replace(/\s*\$\('#vertexai_region'\)\.on\('input', function \(\) \{[\s\S]*?\}\);\s*\n/, '');
js = js.replace(/\s*\$\('#vertexai_express_project_id'\)\.on\('input', function \(\) \{[\s\S]*?\}\);\s*\n/, '');
js = js.replace(/\s*\$\('#vertexai_service_account_json'\)\.on\('input', onVertexAIServiceAccountJsonChange\);\s*\n/, '');
js = js.replace(/\s*\$\('#vertexai_validate_service_account'\)\.on\('click', onVertexAIValidateServiceAccount\);\s*\n/, '');
js = js.replace(/\s*\$\('#vertexai_clear_service_account'\)\.on\('click', onVertexAIClearServiceAccount\);\s*\n/, '');

// Remove ZAI, SiliconFlow, MiniMax, WorkersAI endpoint handlers
js = js.replace(/\s*\$\('#zai_endpoint'\)\.on\('input', function \(\) \{[\s\S]*?\}\);\s*\n/, '');
js = js.replace(/\s*\$\('#siliconflow_endpoint'\)\.on\('input', function \(\) \{[\s\S]*?\}\);\s*\n/, '');
js = js.replace(/\s*\$\('#minimax_endpoint'\)\.on\('input', function \(\) \{[\s\S]*?\}\);\s*\n/, '');
js = js.replace(/\s*\$\('#workers_ai_account_id'\)\.on\('input', function \(\) \{[\s\S]*?\}\);\s*\n/, '');

// Remove OpenRouter event handlers
js = js.replace(/\s*\$\('#openrouter_use_fallback'\)\.on\('input', function \(\) \{[\s\S]*?\}\);\s*\n/, '');
js = js.replace(/\s*\$\('#openrouter_allow_fallbacks'\)\.on\('input', function \(\) \{[\s\S]*?\}\);\s*\n/, '');
js = js.replace(/\s*\$\('#openrouter_middleout'\)\.on\('input', function \(\) \{[\s\S]*?\}\);\s*\n/, '');
js = js.replace(/\s*\$\('#openrouter_providers_chat'\)\.on\('change', function \(\) \{[\s\S]*?\}\);\s*\n/, '');
js = js.replace(/\s*\$\('#openrouter_quantizations_chat'\)\.on\('change', function \(\) \{[\s\S]*?\}\);\s*\n/, '');

// Remove NanoGPT event handlers
js = js.replace(/\s*\$\('#nanogpt_provider'\)\.on\('change', function \(\) \{[\s\S]*?\}\);\s*\n/, '');
js = js.replace(/\s*\$\('#nanogpt_payg_override'\)\.on\('input', function \(\) \{[\s\S]*?\}\);\s*\n/, '');

// Remove Azure event handlers
js = js.replace(/\s*\$\('#azure_base_url'\)\.on\('input', function \(\) \{[\s\S]*?\}\);\s*\n/, '');
js = js.replace(/\s*\$\('#azure_deployment_name'\)\.on\('input', function \(\) \{[\s\S]*?\}\);\s*\n/, '');
js = js.replace(/\s*\$\('#azure_api_version'\)\.on\('input change', function \(\) \{[\s\S]*?\}\);\s*\n/, '');

// Remove select2 initializations for non-target providers
js = js.replace(/\s*\$\('#model_openrouter_select'\)\.select2\(\{[\s\S]*?\}\);\s*\n/, '');
js = js.replace(/\s*\$\('#model_aimlapi_select'\)\.select2\(\{[\s\S]*?\}\);\s*\n/, '');
js = js.replace(/\s*\$\('#model_electronhub_select'\)\.select2\(\{[\s\S]*?\}\);\s*\n/, '');
js = js.replace(/\s*\$\('#model_chutes_select'\)\.select2\(\{[\s\S]*?\}\);\s*\n/, '');
js = js.replace(/\s*\$\('#model_nanogpt_select'\)\.select2\(\{[\s\S]*?\}\);\s*\n/, '');

// 27. Remove onVertexAIAuthModeChange reference in toggleChatCompletionForms
// Already handled above

// 28. Clean up openrouter_authorize reference in index.html (handled in part 2)

// Write the cleaned JS
fs.writeFileSync(path.join(basePath, 'scripts', 'openai.js'), js, 'utf-8');
console.log('openai.js cleaned successfully');

// ============================================================
// PART 2: Process index.html
// ============================================================
let html = fs.readFileSync(path.join(basePath, 'index.html'), 'utf-8');

// Helper function to clean data-source attributes
function cleanDataSource(match, prefix, sources, suffix) {
    const sourceList = sources.split(',').map(s => s.trim());
    const filtered = sourceList.filter(s => targetProviders.includes(s));
    if (filtered.length === 0) return '';
    return `${prefix}${filtered.join(',')}${suffix}`;
}

// Clean all data-source attributes
html = html.replace(
    /(data-source(?:-mode)?=")([^"]+)(")/g,
    (match, prefix, sources, suffix) => {
        const sourceList = sources.split(',').map(s => s.trim());
        const filtered = sourceList.filter(s => targetProviders.includes(s));
        if (filtered.length === 0) {
            // If all providers are non-target, remove the attribute entirely
            // But keep the element if it has other important content
            // Return the match unchanged for now - we'll handle specific cases below
            return match;
        }
        return `${prefix}${filtered.join(',')}${suffix}`;
    }
);

// Remove standalone non-target provider blocks
// OpenRouter middleout block (lines 663-675)
html = html.replace(
    /<div data-source="openrouter" class="range-block">[\s\S]*?<\/div>\s*\n\s*<\/div>\s*\n\s*<div data-source="openrouter">\s*\n\s*<span data-i18n="Max prompt cost:">Max prompt cost:<\/span>[\s\S]*?<\/div>\s*\n\s*<div data-source="electronhub">[\s\S]*?<\/div>\s*\n\s*<div data-source="chutes">[\s\S]*?<\/div>/g,
    ''
);

// Remove the Authorize button for OpenRouter
html = html.replace(
    /\s*<div data-source="openrouter" class="menu_button menu_button_icon openrouter_authorize"[^>]*>[^<]*<\/div>/g,
    ''
);

// Remove the OpenRouter cost display
html = html.replace(
    /<div data-source="openrouter">\s*\n\s*<span data-i18n="Max prompt cost:">[\s\S]*?<\/div>\s*\n/g,
    ''
);

// Remove ElectronHub cost display
html = html.replace(
    /<div data-source="electronhub">\s*\n\s*<span data-i18n="Max prompt cost:">[\s\S]*?<\/div>\s*\n/g,
    ''
);

// Remove Chutes cost display
html = html.replace(
    /<div data-source="chutes">\s*\n\s*<span data-i18n="Max prompt cost:">[\s\S]*?<\/div>\s*\n/g,
    ''
);

// Clean up the Custom Base URL drawer data-source
html = html.replace(
    /data-source="openai,claude,mistralai,makersuite,vertexai,deepseek,xai,zai,moonshot"/,
    'data-source="openai,claude,makersuite,custom"'
);

// Remove OpenRouter web search fee hint
html = html.replace(
    /\s*<b data-source="openrouter" data-i18n="openrouter_web_search_fee">[\s\S]*?<\/b>/g,
    ''
);

// Remove OpenRouter interleaved thinking hints
html = html.replace(
    /\s*<strong class="toggle-description justifyLeft marginBot5" data-source="openrouter">[\s\S]*?<\/strong>/g,
    ''
);

// Write the cleaned HTML
fs.writeFileSync(path.join(basePath, 'index.html'), html, 'utf-8');
console.log('index.html cleaned successfully');

console.log('\nDone! Review the changes with git diff.');
