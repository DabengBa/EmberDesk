import { typedValue } from './typed-value.ts';

export function dynamicValue(): string {
    return `dynamic-${typedValue()}`;
}
