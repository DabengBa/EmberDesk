export interface ProviderConnectionInput {
    customUrl: string;
    openaiModel: string;
    hasSavedSecret: boolean;
}

export interface ProviderConnectionResult {
    status: 'online';
    models: unknown[] | null;
}

export interface ProviderConnectionDependencies {
    fetch: typeof fetch;
    requestHeaders: () => HeadersInit | Promise<HeadersInit>;
    signal?: AbortSignal;
}

export class ProviderConnectionError extends Error {}

function validateInput(input: ProviderConnectionInput, test: boolean) {
    const customUrl = input.customUrl.trim();
    const model = input.openaiModel.trim();
    if (customUrl) {
        try {
            const url = new URL(customUrl);
            if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error();
        } catch {
            throw new ProviderConnectionError('Enter a valid HTTP or HTTPS endpoint URL.');
        }
    } else if (!input.hasSavedSecret) {
        throw new ProviderConnectionError('Save an API key or configure a custom endpoint URL first.');
    }
    if (test && !model) throw new ProviderConnectionError('Fill in the primary model before testing.');
    return { customUrl, model };
}

async function requestProvider(input: ProviderConnectionInput, dependencies: ProviderConnectionDependencies, test: boolean): Promise<ProviderConnectionResult> {
    const { customUrl, model } = validateInput(input, test);
    const message = test
        ? 'Test request failed: the endpoint returned no usable reply. Check the connection settings and API key.'
        : 'Connection failed: the endpoint did not return a model list. Check the endpoint URL and API key.';
    const controller = new AbortController();
    const signal = dependencies.signal ? AbortSignal.any([controller.signal, dependencies.signal]) : controller.signal;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    let timedOut = false;
    try {
        const request = async () => {
            const headers = await dependencies.requestHeaders();
            const { fetch: fetchProvider } = dependencies;
            const response = await fetchProvider(`/api/backends/chat-completions/${test ? 'generate' : 'status'}`, {
                method: 'POST', headers, signal,
                body: JSON.stringify({
                    chat_completion_source: 'openai',
                    ...(customUrl ? { custom_url: customUrl } : {}),
                    ...(test ? { model, messages: [{ role: 'user', content: 'Hi' }], max_tokens: 1, stream: false } : {}),
                }),
            });
            if (!response.ok) throw new Error(message);
            const data: unknown = await response.json();
            if (test && typeof data === 'string') return { status: 'online' as const, models: null };
            if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error(message);
            const payload = data as Record<string, unknown>;
            if (payload.error) throw new Error(message);
            if (test) {
                const choices = payload.choices;
                const choice = Array.isArray(choices) ? choices[0] : null;
                const topMessage = payload.message;
                const hasTopMessage = topMessage && typeof topMessage === 'object' && (
                    typeof (topMessage as Record<string, unknown>).tool_plan === 'string'
                    || Array.isArray((topMessage as Record<string, unknown>).content)
                );
                const hasChoice = choice && typeof choice === 'object' && (
                    (choice.message && typeof choice.message === 'object') || typeof choice.text === 'string'
                );
                if (!hasChoice && !hasTopMessage && typeof payload.text !== 'string' && !Array.isArray(payload.content)) throw new Error(message);
            }
            return { status: 'online' as const, models: Array.isArray(payload.data) ? payload.data : null };
        };
        if (!test) return await request();
        return await Promise.race([
            request(),
            new Promise<never>((_resolve, reject) => {
                timeout = setTimeout(() => {
                    timedOut = true;
                    controller.abort();
                    reject(new Error('API connection test timed out.'));
                }, 15000);
            }),
        ]);
    } catch {
        throw new ProviderConnectionError(timedOut ? 'API connection test timed out.' : message);
    } finally {
        if (timeout !== undefined) clearTimeout(timeout);
    }
}

export function connectProvider(input: ProviderConnectionInput, dependencies: ProviderConnectionDependencies): Promise<ProviderConnectionResult> {
    return requestProvider(input, dependencies, false);
}

export function testProviderConnection(input: ProviderConnectionInput, dependencies: ProviderConnectionDependencies): Promise<ProviderConnectionResult> {
    return requestProvider(input, dependencies, true);
}
