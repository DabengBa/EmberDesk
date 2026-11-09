import { isMediaUrlAllowed } from './external-media-policy.js';

// Only functions whose arguments cannot introduce a resource except via a nested
// url() or image-set() are accepted. Unknown syntax fails closed.
const safeFunctions = new Set(['linear-gradient', 'radial-gradient', 'conic-gradient', 'repeating-linear-gradient', 'repeating-radial-gradient', 'repeating-conic-gradient', 'rgb', 'rgba', 'hsl', 'hsla', 'hwb', 'lab', 'lch', 'oklab', 'oklch', 'color', 'color-mix', 'calc', 'min', 'max', 'clamp', 'cubic-bezier', 'steps', 'translate', 'translatex', 'translatey', 'translatez', 'translate3d', 'scale', 'scalex', 'scaley', 'scalez', 'scale3d', 'rotate', 'rotatex', 'rotatey', 'rotatez', 'rotate3d', 'skew', 'skewx', 'skewy', 'matrix', 'matrix3d', 'blur', 'brightness', 'contrast', 'drop-shadow', 'grayscale', 'hue-rotate', 'invert', 'opacity', 'saturate', 'sepia', 'polygon', 'circle', 'ellipse', 'inset', 'rect', 'path', 'inset', 'type']);

/** Rewrite only the parsed animation-name longhand, never identifiers in time units. */
export function isolateMessageAnimation(property, value, animationNames) {
    if (value.includes('\\') || /["']/.test(value)) return null;
    const important = /\s*!\s*important\s*$/i.test(value);
    if (important) value = value.replace(/\s*!\s*important\s*$/i, '');
    const style = document.createElement('div').style;
    style.setProperty(property, value);
    const names = style.getPropertyValue('animation-name').split(',').map(name => name.trim());
    if (!names.length || names.some(name => name !== 'none' && !animationNames.has(name))) return null;
    style.setProperty('animation-name', names.map(name => animationNames.get(name) ?? name).join(', '));
    const result = style.getPropertyValue(property);
    return result ? `${result}${important ? ' !important' : ''}` : null;
}

function safeValue(value, allowExternalMedia) {
    // Escapes are deliberately not decoded by this scanner. Reject rather than
    // risk treating an escaped function name or URL as an innocuous token.
    if (value.includes('\\')) return false;
    let i = 0;
    function scan(end, imageSet = false) {
        while (i < value.length) {
            const ch = value[i];
            if (ch === ')') { if (!end) return false; i++; return true; }
            if (ch === '"' || ch === '\'') {
                const quote = ch;
                const start = ++i;
                while (i < value.length && value[i] !== quote) i++;
                if (i === value.length) return false;
                const str = value.slice(start, i++);
                if (imageSet && !isMediaUrlAllowed(str, allowExternalMedia)) return false;
                continue;
            }
            if (/[a-zA-Z_-]/.test(ch)) {
                const start = i++;
                while (i < value.length && /[a-zA-Z0-9_-]/.test(value[i])) i++;
                const name = value.slice(start, i).toLowerCase();
                if (value[i] !== '(') continue;
                i++;
                if (name === 'url') {
                    while (/\s/.test(value[i] ?? '') && i < value.length) i++;
                    let url;
                    if (value[i] === '"' || value[i] === '\'') {
                        const quote = value[i++], startUrl = i;
                        while (i < value.length && value[i] !== quote) i++;
                        if (i === value.length) return false;
                        url = value.slice(startUrl, i++);
                        while (/\s/.test(value[i] ?? '') && i < value.length) i++;
                    } else {
                        const startUrl = i;
                        while (i < value.length && value[i] !== ')') i++;
                        url = value.slice(startUrl, i).trim();
                        if (/[\s("']/.test(url)) return false;
                    }
                    if (value[i++] !== ')' || !isMediaUrlAllowed(url, allowExternalMedia)) return false;
                } else if (name === 'image-set' || name === '-webkit-image-set') {
                    if (!scan(true, true)) return false;
                } else if (safeFunctions.has(name)) {
                    if (!scan(true, false)) return false;
                } else return false;
                continue;
            }
            if (ch === '(' || ch === '{' || ch === '}' || ch === ';' || ch === '@') return false;
            i++;
        }
        return !end;
    }
    return scan(false);
}

// CSSOM keeps the authored text of a shorthand whose value contains var() while
// every longhand it expands to stays empty, so the longhand scan below cannot
// see the URL hidden in the fallback. Drop such declarations before parsing.
function splitTopLevelDeclarations(input) {
    const declarations = [];
    let start = 0, quote = '', depth = 0, comment = false;
    for (let i = 0; i < input.length; i++) {
        const ch = input[i];
        if (comment) { if (ch === '*' && input[i + 1] === '/') { comment = false; i++; } continue; }
        if (quote) { if (ch === quote) quote = ''; continue; }
        if (ch === '/' && input[i + 1] === '*') { comment = true; i++; } else if (ch === '"' || ch === '\'') quote = ch;
        else if (ch === '(') depth++;
        else if (ch === ')') depth--;
        else if (ch === ';' && depth === 0) { declarations.push(input.slice(start, i)); start = i + 1; }
    }
    declarations.push(input.slice(start));
    return declarations.filter(declaration => declaration.trim() && !containsVarFunction(declaration));
}

function containsVarFunction(text) {
    let quote = '', comment = false;
    for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (comment) { if (ch === '*' && text[i + 1] === '/') { comment = false; i++; } continue; }
        if (quote) { if (ch === quote) quote = ''; continue; }
        if (ch === '/' && text[i + 1] === '*') { comment = true; i++; continue; }
        if (ch === '"' || ch === '\'') { quote = ch; continue; }
        if ((ch === 'v' || ch === 'V') && !/[a-zA-Z0-9_-]/.test(text[i - 1] ?? '')) {
            const match = /^var\s*\(/i.exec(text.slice(i));
            if (match) return true;
        }
    }
    return false;
}

/** Parse declarations with CSSOM, dropping unsupported and uninspectable values. */
export function sanitizeMessageCssDeclarations(input, allowExternalMedia = false, animationNames = new Map()) {
    if (typeof input !== 'string' || input.includes('\\')) return '';
    let quote = '', depth = 0;
    for (const ch of input) {
        if (quote) { if (ch === quote) quote = ''; continue; }
        if (ch === '"' || ch === '\'') quote = ch;
        else if (ch === '(') depth++;
        else if (ch === ')' && --depth < 0) return '';
    }
    if (quote || depth) return '';
    input = splitTopLevelDeclarations(input).join(';');
    if (!input.trim()) return '';
    const style = document.createElement('div').style;
    style.cssText = input;
    for (const property of [...style]) {
        const value = style.getPropertyValue(property);
        if (property.startsWith('--') || property.startsWith('-webkit-animation') || !safeValue(value, allowExternalMedia)) {
            style.removeProperty(property);
        } else if (property === 'animation' || property === 'animation-name') {
            const rewritten = isolateMessageAnimation(property, value, animationNames);
            if (rewritten === null) style.removeProperty(property);
            else style.setProperty(property, rewritten, style.getPropertyPriority(property));
        }
    }
    return style.cssText;
}

export function isMessageCssDeclarationAllowed(property, value, allowExternalMedia = false) {
    if (typeof property !== 'string' || typeof value !== 'string' || property.startsWith('--') || property.includes('\\') || value.includes('\\') || !safeValue(value, allowExternalMedia)) return false;
    const style = document.createElement('div').style;
    style.setProperty(property, value.replace(/\s*!\s*important\s*$/i, ''));
    return style.length > 0 && [...style].every(name => safeValue(style.getPropertyValue(name), allowExternalMedia));
}

export function filterMessageInlineStyles(html, allowExternalMedia = false, animationNames = new Map()) {
    const template = document.createElement('template');
    template.innerHTML = html;
    for (const element of template.content.querySelectorAll('[style]')) {
        const style = sanitizeMessageCssDeclarations(element.getAttribute('style'), allowExternalMedia, animationNames);
        if (style) element.setAttribute('style', style);
        else element.removeAttribute('style');
    }
    const svgResourceAttributes = ['fill', 'stroke', 'filter', 'mask', 'clip-path', 'marker', 'marker-start', 'marker-mid', 'marker-end', 'cursor', 'color-profile'];
    for (const element of template.content.querySelectorAll('*')) {
        if (element.namespaceURI !== 'http://www.w3.org/2000/svg') continue;
        for (const name of svgResourceAttributes) {
            if (element.hasAttribute(name) && !isMessageCssDeclarationAllowed(name, element.getAttribute(name), allowExternalMedia)) element.removeAttribute(name);
        }
    }
    return template.innerHTML;
}
