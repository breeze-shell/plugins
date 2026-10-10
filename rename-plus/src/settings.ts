import { ALL_PRESETS, Params, defaultParams } from './presets';
import { Batch, OrderId } from './plan';

export type AppSettings = {
    keepExt: boolean;
    order: OrderId;
    lastPreset: string;
    params: Record<string, Params>;
    lastBatch: Batch | null;
};

const ORDER_IDS: OrderId[] = ['name', 'nameDesc', 'date', 'size', 'picked'];

export const defaultSettings = (): AppSettings => ({
    keepExt: true,
    order: 'name',
    lastPreset: 'numbering',
    params: defaultParams(),
    lastBatch: null
});

const MERGE_LIMIT = 200;

export const normalizeSettings = (raw: unknown): AppSettings => {
    const base = defaultSettings();
    if (!raw || typeof raw !== 'object') return base;
    const input = raw as Partial<AppSettings> & { params?: Record<string, Params> };
    if (typeof input.keepExt === 'boolean') base.keepExt = input.keepExt;
    if (input.order && ORDER_IDS.includes(input.order)) base.order = input.order;
    if (typeof input.lastPreset === 'string' && ALL_PRESETS.some(preset => preset.id === input.lastPreset)) {
        base.lastPreset = input.lastPreset;
    }
    if (input.params && typeof input.params === 'object') {
        for (const preset of ALL_PRESETS) {
            const saved = input.params[preset.id];
            if (saved && typeof saved === 'object') base.params[preset.id] = { ...preset.defaults, ...saved };
        }
    }
    const batch = input.lastBatch;
    if (batch && Array.isArray(batch.entries) && batch.entries.length > 0) {
        base.lastBatch = {
            time: Number(batch.time) || 0,
            dir: String(batch.dir ?? ''),
            entries: batch.entries.slice(0, MERGE_LIMIT).map(entry => ({
                from: String(entry.from),
                to: String(entry.to),
                fromName: String(entry.fromName),
                toName: String(entry.toName)
            }))
        };
    }
    return base;
};
