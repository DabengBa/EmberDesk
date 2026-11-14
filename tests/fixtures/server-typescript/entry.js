import { describe } from './graph.ts';

export async function readGraph() {
    const { dynamicValue } = await import('./dynamic.ts');
    return `${describe()}:${dynamicValue()}`;
}
