import { formatDate, padNumber } from './model';
import { t } from './i18n';

export type ScriptContext = {
    name: string;
    base: string;
    ext: string;
    path: string;
    dir: string;
    isDir: boolean;
    size: number;
    mtime: string;
    index: number;
    i: number;
    total: number;
    now: Date;
    stamp: Date;
};

type Compiled = { fn: (context: Record<string, unknown>) => unknown; error?: undefined } | { fn?: undefined; error: string };

const cache = new Map<string, Compiled>();
const CACHE_LIMIT = 8;

const helpers = (context: ScriptContext) => ({
    pad: (value: number, digits: number) => padNumber(value, digits),
    lower: (text: unknown) => String(text ?? '').toLowerCase(),
    upper: (text: unknown) => String(text ?? '').toUpperCase(),
    trim: (text: unknown) => String(text ?? '').trim(),
    slug: (text: unknown) =>
        String(text ?? '')
            .toLowerCase()
            .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
            .replace(/^-+|-+$/g, ''),
    // 有文件修改时间就按它来, 否则用重命名时的当前时间。
    date: (pattern: string, offsetDays = 0) =>
        formatDate(new Date(context.stamp.getTime() + offsetDays * 86400000), pattern || 'YYYY-MM-DD'),
    now: (pattern: string) => formatDate(context.now, pattern || 'YYYY-MM-DD'),
    humanSize: (bytes: number) => {
        const units = ['B', 'KB', 'MB', 'GB', 'TB'];
        let value = Math.max(0, Number(bytes) || 0);
        let unit = 0;
        while (value >= 1024 && unit < units.length - 1) {
            value /= 1024;
            unit++;
        }
        return `${unit === 0 ? value : value.toFixed(1)}${units[unit]}`;
    }
});

const compile = (source: string): Compiled => {
    const cached = cache.get(source);
    if (cached) return cached;

    let compiled: Compiled;
    try {
        const trimmed = source.trim();
        // 没有 return 的单行脚本当成表达式, 其余按语句体处理。
        const hasReturn = /(^|[^\w.$])return(\s|\(|;|\[|$)/.test(trimmed);
        const body = hasReturn || /[\n;]/.test(trimmed) ? trimmed : `return (${trimmed});`;
        const fn = new Function('ctx', `with (ctx) {\n${body}\n}`) as (context: Record<string, unknown>) => unknown;
        compiled = { fn };
    } catch (error) {
        compiled = { error: error instanceof Error ? error.message : String(error) };
    }

    if (cache.size >= CACHE_LIMIT) cache.clear();
    cache.set(source, compiled);
    return compiled;
};

export const validateScript = (source: string): string | null => {
    if (!source.trim()) return t('脚本为空', 'Script is empty');
    const compiled = compile(source);
    if (compiled.error) return compiled.error;
    return null;
};

export const runScript = (source: string, context: ScriptContext): unknown => {
    const compiled = compile(source);
    if (compiled.error || !compiled.fn) {
        throw new Error(compiled.error ?? t('脚本无法编译', 'Script failed to compile'));
    }
    const scope = { ...context, ...helpers(context) };
    return compiled.fn(scope);
};
