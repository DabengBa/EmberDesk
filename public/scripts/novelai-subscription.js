import { abortStatusCheck } from '../script.js';
import { getRequestHeaders } from './request-context.js';

const nai_tiers = {
    0: 'Paper',
    1: 'Tablet',
    2: 'Scroll',
    3: 'Opus',
};

let novel_data = null;

export function setNovelData(data) {
    novel_data = data;
}

export function getNovelTier() {
    return nai_tiers[novel_data?.tier] ?? 'no_connection';
}

export function getNovelAnlas() {
    return novel_data?.trainingStepsLeft?.fixedTrainingStepsLeft ?? 0;
}

export function getNovelUnlimitedImageGeneration() {
    return novel_data?.perks?.unlimitedImageGeneration ?? false;
}

export async function loadNovelSubscriptionData() {
    const result = await fetch('/api/novelai/status', {
        method: 'POST',
        headers: getRequestHeaders(),
        signal: abortStatusCheck.signal,
    });

    if (result.ok) {
        const data = await result.json();
        setNovelData(data);
    }

    return result.ok;
}
