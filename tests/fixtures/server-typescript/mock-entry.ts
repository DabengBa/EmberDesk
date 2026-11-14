import { dependency } from './mock-dependency.ts';

export function readDependency(): string {
    return dependency();
}
