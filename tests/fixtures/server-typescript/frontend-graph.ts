import { humanFileSize } from '@/lib/format';
import { jsValue } from './value';

export function frontendGraph(): string {
    return `${jsValue()}:${humanFileSize(1024)}`;
}
