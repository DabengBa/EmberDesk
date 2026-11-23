import fs from 'node:fs';
import { parse, printParseErrorCode, type ParseError } from 'jsonc-parser';
import { configSchema, type AppConfig } from './config-schema.ts';

export const defaultConfigPath = () => process.env.EMBERDESK_CONFIG_PATH || './config.jsonc';

export const canonicalConfigPath = (filename: string) => filename.replace(/\.ya?ml$/i, '.jsonc');

export function validateConfig(value: unknown, filename: string): AppConfig {
    const result = configSchema.safeParse(value);
    if (!result.success) {
        const issues = result.error.issues.map(issue => `${issue.path.join('.') || '<root>'}: ${issue.message}`);
        throw new Error(`Invalid configuration in ${filename}: ${issues.join('; ')}`);
    }
    return result.data;
}

export function parseConfig(text: string, filename: string): AppConfig {
    const errors: ParseError[] = [];
    const value: unknown = parse(text.replace(/^\uFEFF/, ''), errors, { allowTrailingComma: true });
    if (errors.length) {
        const { offset, error } = errors[0];
        const lines = text.slice(0, offset).split(/\r\n|\n|\r/);
        throw new Error(`Invalid JSONC in ${filename}:${lines.length}:${lines.at(-1)!.length + 1}: ${printParseErrorCode(error)}`);
    }
    return validateConfig(value, filename);
}

export function readConfigFile(filename: string): AppConfig {
    return parseConfig(fs.readFileSync(filename, 'utf8'), filename);
}
