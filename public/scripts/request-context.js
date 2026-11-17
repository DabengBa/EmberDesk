let token;

export function getRequestHeaders({ omitContentType = false } = {}) {
    const headers = {
        'Content-Type': 'application/json',
        'X-CSRF-Token': token,
    };

    if (omitContentType) {
        delete headers['Content-Type'];
    }

    return headers;
}

export async function loadCsrfToken() {
    const tokenResponse = await fetch('/csrf-token');
    const tokenData = await tokenResponse.json();
    token = tokenData.token;
}
