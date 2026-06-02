export const PUBLIC_DIRECTORIES = {
    images: 'public/img/',
    backups: 'backups/',
    sounds: 'public/sounds',
    extensions: 'public/scripts/extensions',
    globalExtensions: 'public/scripts/extensions/third-party',
};

export const SETTINGS_FILE = 'settings.json';

/**
 * @type {import('./users.js').UserDirectoryList}
 * @readonly
 * @enum {string}
 */
export const USER_DIRECTORY_TEMPLATE = Object.freeze({
    root: '',
    thumbnails: 'thumbnails',
    thumbnailsBg: 'thumbnails/bg',
    thumbnailsAvatar: 'thumbnails/avatar',
    thumbnailsPersona: 'thumbnails/persona',
    worlds: 'worlds',
    user: 'user',
    avatars: 'User Avatars',
    userImages: 'user/images',
    groups: 'groups',
    groupChats: 'group chats',
    chats: 'chats',
    characters: 'characters',
    backgrounds: 'backgrounds',
    novelAI_Settings: 'NovelAI Settings',
    koboldAI_Settings: 'KoboldAI Settings',
    openAI_Settings: 'OpenAI Settings',
    textGen_Settings: 'TextGen Settings',
    themes: 'themes',
    movingUI: 'movingUI',
    extensions: 'extensions',
    instruct: 'instruct',
    context: 'context',
    quickreplies: 'QuickReplies',
    assets: 'assets',
    comfyWorkflows: 'user/workflows',
    files: 'user/files',
    vectors: 'vectors',
    backups: 'backups',
    sysprompt: 'sysprompt',
    reasoning: 'reasoning',
});

/**
 * @type {import('./users.js').User}
 * @readonly
 */
export const DEFAULT_USER = Object.freeze({
    handle: 'default-user',
    name: 'User',
    created: Date.now(),
    password: '',
    admin: true,
    enabled: true,
    salt: '',
});

export const UNSAFE_EXTENSIONS = [
    '.php',
    '.exe',
    '.com',
    '.dll',
    '.pif',
    '.application',
    '.gadget',
    '.msi',
    '.jar',
    '.cmd',
    '.bat',
    '.reg',
    '.sh',
    '.py',
    '.js',
    '.jse',
    '.jsp',
    '.pdf',
    '.html',
    '.htm',
    '.hta',
    '.vb',
    '.vbs',
    '.vbe',
    '.cpl',
    '.msc',
    '.scr',
    '.sql',
    '.iso',
    '.img',
    '.dmg',
    '.ps1',
    '.ps1xml',
    '.ps2',
    '.ps2xml',
    '.psc1',
    '.psc2',
    '.msh',
    '.msh1',
    '.msh2',
    '.mshxml',
    '.msh1xml',
    '.msh2xml',
    '.scf',
    '.lnk',
    '.inf',
    '.reg',
    '.doc',
    '.docm',
    '.docx',
    '.dot',
    '.dotm',
    '.dotx',
    '.xls',
    '.xlsm',
    '.xlsx',
    '.xlt',
    '.xltm',
    '.xltx',
    '.xlam',
    '.ppt',
    '.pptm',
    '.pptx',
    '.pot',
    '.potm',
    '.potx',
    '.ppam',
    '.ppsx',
    '.ppsm',
    '.pps',
    '.ppam',
    '.sldx',
    '.sldm',
    '.ws',
];

export const GEMINI_SAFETY = [
    {
        category: 'HARM_CATEGORY_HARASSMENT',
        threshold: 'OFF',
    },
    {
        category: 'HARM_CATEGORY_HATE_SPEECH',
        threshold: 'OFF',
    },
    {
        category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
        threshold: 'OFF',
    },
    {
        category: 'HARM_CATEGORY_DANGEROUS_CONTENT',
        threshold: 'OFF',
    },
    {
        category: 'HARM_CATEGORY_CIVIC_INTEGRITY',
        threshold: 'OFF',
    },
];

export const VERTEX_SAFETY = [
    {
        category: 'HARM_CATEGORY_IMAGE_HATE',
        threshold: 'OFF',
    },
    {
        category: 'HARM_CATEGORY_IMAGE_DANGEROUS_CONTENT',
        threshold: 'OFF',
    },
    {
        category: 'HARM_CATEGORY_IMAGE_HARASSMENT',
        threshold: 'OFF',
    },
    {
        category: 'HARM_CATEGORY_IMAGE_SEXUALLY_EXPLICIT',
        threshold: 'OFF',
    },
    {
        category: 'HARM_CATEGORY_JAILBREAK',
        threshold: 'OFF',
    },
];

export const CHAT_COMPLETION_SOURCES = {
    OPENAI: 'openai',
    CLAUDE: 'claude',
    MAKERSUITE: 'makersuite',
    VERTEXAI: 'vertexai',
};

/**
 * Path to multer file uploads under the data root.
 */
export const UPLOADS_DIRECTORY = '_uploads';

export const AVATAR_WIDTH = 512;
export const AVATAR_HEIGHT = 768;
export const DEFAULT_AVATAR_PATH = './public/img/ai4.png';

export const OPENROUTER_HEADERS = {
    'HTTP-Referer': 'https://github.com/DabengBa/EmberDesk',
    'X-Title': 'EmberDesk',
};

export const AIMLAPI_HEADERS = {
    'HTTP-Referer': 'https://github.com/DabengBa/EmberDesk',
    'X-Title': 'EmberDesk',
};

export const FEATHERLESS_HEADERS = {
    'HTTP-Referer': 'https://github.com/DabengBa/EmberDesk',
    'X-Title': 'EmberDesk',
};


export const OPENAI_VERBOSITY_MODELS = /^gpt-5/;

export const OPENAI_REASONING_EFFORT_MODELS = [
    'o1',
    'o3-mini',
    'o3-mini-2025-01-31',
    'o4-mini',
    'o4-mini-2025-04-16',
    'o3',
    'o3-2025-04-16',
    'gpt-5',
    'gpt-5-2025-08-07',
    'gpt-5-mini',
    'gpt-5-mini-2025-08-07',
    'gpt-5-nano',
    'gpt-5-nano-2025-08-07',
    'gpt-5.1',
    'gpt-5.1-2025-11-13',
    'gpt-5.1-chat-latest',
    'gpt-5.2',
    'gpt-5.2-2025-12-11',
    'gpt-5.2-chat-latest',
    'gpt-5.3-chat-latest',
    'gpt-5.4',
    'gpt-5.4-2026-03-05',
    'gpt-5.4-mini',
    'gpt-5.4-mini-2026-03-17',
    'gpt-5.4-nano',
    'gpt-5.4-nano-2026-03-17',
    'gpt-5.5',
    'gpt-5.5-2026-04-23',
];

export const OPENAI_REASONING_EFFORT_MAP = {
    min: 'minimal',
};

/**
 * Models that only accept a single fixed reasoning effort value.
 * @type {Record<string, string>}
 */
export const OPENAI_FIXED_REASONING_EFFORT = {
    'gpt-5.3-chat-latest': 'medium',
};


export const LOG_LEVELS = {
    DEBUG: 0,
    INFO: 1,
    WARN: 2,
    ERROR: 3,
};

/**
 * An array of supported media file extensions.
 * This is used to validate file uploads and ensure that only supported media types are processed.
 */
export const MEDIA_EXTENSIONS = [
    'bmp',
    'png',
    'jpg',
    'webp',
    'jpeg',
    'jfif',
    'gif',
    'mp4',
    'avi',
    'mov',
    'wmv',
    'flv',
    'webm',
    '3gp',
    'mkv',
    'mpg',
    'mp3',
    'wav',
    'ogg',
    'flac',
    'aac',
    'm4a',
    'aiff',
];

/**
 * Bitwise flag-style media request types.
 */
export const MEDIA_REQUEST_TYPE = {
    IMAGE: 0b001,
    VIDEO: 0b010,
    AUDIO: 0b100,
};


export const ZAI_ENDPOINT = {
    COMMON: 'common',
    CODING: 'coding',
};

export const SILICONFLOW_ENDPOINT = {
    GLOBAL: 'global',
    CN: 'cn',
};

export const MINIMAX_ENDPOINT = {
    GLOBAL: 'global',
    CN: 'cn',
};
