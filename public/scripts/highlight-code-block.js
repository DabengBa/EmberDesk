/** Highlight immediately when the language is loaded; otherwise defer without blocking copy. */
export function highlightCodeBlock(hljs, code, copyButton) {
    if (!hljs.loadAllLanguages) {
        hljs.highlightElement(code);
        return;
    }

    const classes = `${code.className} ${code.parentNode?.className ?? ''}`;
    const explicit = /\blang(?:uage)?-([\w-]+)\b/i.exec(classes)?.[1];
    const firstClass = classes.trim().split(/\s+/)[0];
    const language = explicit ?? firstClass;
    if (/^(no-?highlight)$/i.test(language)) return;
    if (language && hljs.getLanguage(language)) {
        hljs.highlightElement(code);
        return;
    }

    const originalText = code.textContent;
    void hljs.loadAllLanguages().then(() => {
        if (code.dataset.highlighted || code.textContent !== originalText) return;
        const attached = copyButton.parentNode === code;
        if (attached) code.removeChild(copyButton);
        try {
            hljs.highlightElement(code);
        } finally {
            if (attached) code.appendChild(copyButton);
        }
    }).catch(error => console.warn('Unable to load syntax highlighting:', error));
}
