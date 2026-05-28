export function parseI18nAttributeSpecs(dataI18n) {
    return String(dataI18n ?? '')
        .split(';')
        .map(spec => spec.trim())
        .filter(Boolean)
        .map(spec => {
            const attributes = [];
            let key = spec;

            while (key.startsWith('[')) {
                const closingIndex = key.indexOf(']');
                if (closingIndex <= 1) {
                    break;
                }

                attributes.push(key.slice(1, closingIndex));
                key = key.slice(closingIndex + 1);
            }

            return {
                raw: spec,
                attributes,
                key,
            };
        });
}

export function applyI18nTranslations(element, dataI18n, localeData) {
    for (const entry of parseI18nAttributeSpecs(dataI18n)) {
        if (!entry.key) {
            continue;
        }

        const localizedValue = localeData?.[entry.key];
        if (localizedValue !== '' && !localizedValue) {
            continue;
        }

        if (entry.attributes.length > 0) {
            for (const attribute of entry.attributes) {
                element.setAttribute(attribute, localizedValue);
            }
            continue;
        }

        element.textContent = localizedValue;
    }
}
