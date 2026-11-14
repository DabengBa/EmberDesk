import { jsValue } from './value.js';
import { typedValue } from './typed-value.ts';

export function describe(): string {
    return `${jsValue()}:${typedValue()}`;
}
