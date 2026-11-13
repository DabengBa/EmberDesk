/** Create one retryable upload. The file and all request fields stay fixed for its lifetime. */
export function createChatImportOperation(formData, { send, operationId = crypto.randomUUID() }) {
    const entries = Array.from(formData.entries()).filter(([key]) => key !== 'operationId');
    let inFlight;

    async function attempt() {
        const body = new FormData();
        for (const [key, value] of entries) body.append(key, value);
        body.set('operationId', operationId);
        const response = await send(body);
        let data;
        try {
            data = await response.json();
        } catch {
            data = {};
        }
        if (response.ok && data.res === true && Array.isArray(data.fileNames)) {
            return { ok: true, fileNames: data.fileNames };
        }
        return { ok: false, error: typeof data.error === 'string' ? data.error : 'import_failed', completed: Array.isArray(data.completed) ? data.completed : [], status: response.status };
    }

    return {
        run() {
            if (inFlight) return inFlight;
            inFlight = (async () => {
                for (let i = 0; i < 2; i++) {
                    try {
                        const result = await attempt();
                        if (result.ok || result.status < 500 || i === 1) return result;
                    } catch (error) {
                        if (i === 1) return { ok: false, error: 'network_error', completed: [], status: 0 };
                    }
                }
            })().finally(() => { inFlight = null; });
            return inFlight;
        },
    };
}
