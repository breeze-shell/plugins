import * as shell from 'mshell';
import { RenameItem, compareByName, joinPath, splitPath, validateName } from './model';
import { Params, Preset } from './presets';
import { t } from './i18n';

export type OrderId = 'name' | 'nameDesc' | 'date' | 'size' | 'picked';

export const ORDER_OPTIONS: { value: OrderId; label: string }[] = [
    { value: 'name', label: t('名称（自然序）', 'Name (natural)') },
    { value: 'nameDesc', label: t('名称（倒序）', 'Name (reversed)') },
    { value: 'date', label: t('修改时间', 'Modified time') },
    { value: 'size', label: t('文件大小', 'File size') },
    { value: 'picked', label: t('选择顺序', 'Selection order') }
];

export const sortItems = (items: RenameItem[], order: OrderId) => {
    const copy = items.slice();
    const byName = (a: RenameItem, b: RenameItem) => compareByName(a, b);
    switch (order) {
        case 'nameDesc':
            return copy.sort((a, b) => byName(b, a));
        case 'date':
            return copy.sort((a, b) => {
                const left = a.mtime ? a.mtime.getTime() : 0;
                const right = b.mtime ? b.mtime.getTime() : 0;
                return left - right || byName(a, b);
            });
        case 'size':
            return copy.sort((a, b) => a.size - b.size || byName(a, b));
        case 'picked':
            return copy.sort((a, b) => a.pickedIndex - b.pickedIndex);
        default:
            return copy.sort(byName);
    }
};

export type RowStatus = 'changed' | 'same' | 'error';

export type Row = {
    item: RenameItem;
    newName: string;
    status: RowStatus;
    reason?: string;
    index: number;
};

export type Plan = {
    rows: Row[];
    changed: Row[];
    errors: Row[];
    sameCount: number;
    canApply: boolean;
    unchecked: boolean;
};

export type PlanOptions = {
    keepExt: boolean;
    order: OrderId;
    now: Date;
    checkExisting?: boolean;
};

const describeIssue = (issue: string) => {
    switch (issue) {
        case 'empty':
            return t('名称为空', 'Name is empty');
        case 'illegal':
            return t('包含非法字符 < > : " / \\ | ? *', 'Contains illegal characters');
        case 'reserved':
            return t('与系统保留名称冲突', 'Reserved system name');
        case 'trailing':
            return t('名称不能以空格或点结尾', 'Name cannot end with a space or dot');
        case 'toolong':
            return t('名称或路径过长', 'Name or path is too long');
        default:
            return t('名称不可用', 'Name is not usable');
    }
};

const resolveParts = (item: RenameItem, keepExt: boolean, preset: Preset) => {
    if (preset.extMode === 'respect' && keepExt) return { base: item.base, ext: item.ext };
    if (preset.extMode === 'respect') return { base: item.name, ext: '' };
    return { base: item.base, ext: item.ext };
};

export const buildPlan = (items: RenameItem[], preset: Preset, params: Params, options: PlanOptions): Plan => {
    const ordered = preset.supportsOrder === false ? items.slice() : sortItems(items, options.order);
    const total = ordered.length;

    const rows: Row[] = ordered.map((item, index) => {
        const parts = resolveParts(item, options.keepExt, preset);
        try {
            const output = preset.transform(
                { ...parts, item, index, total, now: options.now },
                params
            );
            if (!output) return { item, newName: item.name, status: 'same', index };
            const newName = output.base + output.ext;
            if (newName === item.name) return { item, newName, status: 'same', index };
            return { item, newName, status: 'changed', index };
        } catch (error) {
            return {
                item,
                newName: item.name,
                status: 'error',
                reason: error instanceof Error ? error.message : String(error),
                index
            };
        }
    });

    for (const row of rows) {
        if (row.status !== 'changed') continue;
        const issue = validateName(row.newName, row.item.dir, row.item.isDir);
        if (issue) {
            row.status = 'error';
            row.reason = describeIssue(issue);
        }
    }

    const byTarget = new Map<string, Row[]>();
    for (const row of rows) {
        if (row.status !== 'changed') continue;
        const key = joinPath(row.item.dir, row.newName).toLowerCase();
        const bucket = byTarget.get(key);
        if (bucket) bucket.push(row);
        else byTarget.set(key, [row]);
    }
    for (const bucket of byTarget.values()) {
        if (bucket.length < 2) continue;
        for (const row of bucket) {
            row.status = 'error';
            row.reason = t(
                `与「${bucket.find(other => other !== row)?.newName}」重名`,
                `Duplicate of "${bucket.find(other => other !== row)?.newName}"`
            );
        }
    }

    const unchecked = options.checkExisting === false || rows.length > 800;
    if (!unchecked) {
        const sources = new Set(
            rows.filter(row => row.status === 'changed').map(row => row.item.path.toLowerCase())
        );
        for (const row of rows) {
            if (row.status !== 'changed') continue;
            if (row.newName.toLowerCase() === row.item.name.toLowerCase()) continue;
            const target = joinPath(row.item.dir, row.newName);
            if (sources.has(target.toLowerCase())) continue;
            let occupied = false;
            try {
                occupied = shell.fs.exists(target);
            } catch {
                occupied = false;
            }
            if (occupied) {
                row.status = 'error';
                row.reason = t('目标名称已存在', 'Target already exists');
            }
        }
    }

    const changed = rows.filter(row => row.status === 'changed');
    const errors = rows.filter(row => row.status === 'error');
    return {
        rows,
        changed,
        errors,
        sameCount: rows.filter(row => row.status === 'same').length,
        canApply: changed.length > 0,
        unchecked
    };
};

export type BatchEntry = { from: string; to: string; fromName: string; toName: string };
export type Batch = { time: number; dir: string; entries: BatchEntry[] };

export const batchFromPlan = (plan: Plan): Batch => {
    const entries = plan.changed.map(row => ({
        from: row.item.path,
        to: joinPath(row.item.dir, row.newName),
        fromName: row.item.name,
        toName: row.newName
    }));
    return { time: Date.now(), dir: plan.changed[0]?.item.dir ?? '', entries };
};

export type ExecuteResult = {
    done: BatchEntry[];
    failed: { entry: BatchEntry; error: string }[];
};

const messageOf = (error: unknown) =>
    error instanceof Error ? error.message : String(error ?? t('未知错误', 'Unknown error'));

const tempNameFor = (entry: BatchEntry, slot: number) =>
    joinPath(splitPath(entry.from).dir, `.rename-plus-${Date.now().toString(36)}-${slot}.tmp`);

const occupied = (entry: BatchEntry) => {
    if (entry.to.toLowerCase() === entry.from.toLowerCase()) return false;
    try {
        return shell.fs.exists(entry.to);
    } catch {
        return false;
    }
};

// std::filesystem::rename 在 Windows 上会覆盖同名目标, 所以每次改名之前都要
// 再确认目标没有被占用; 批量内互相占位时先全部改到临时名再落地。
export const executeRenames = (entries: BatchEntry[]): ExecuteResult => {
    const changes = entries.filter(entry => entry.from !== entry.to);
    const done: BatchEntry[] = [];
    const failed: { entry: BatchEntry; error: string }[] = [];
    if (changes.length === 0) return { done, failed };

    const sources = new Set(changes.map(entry => entry.from.toLowerCase()));
    const overlapping = changes.some(entry => sources.has(entry.to.toLowerCase()));

    if (!overlapping) {
        for (const entry of changes) {
            if (occupied(entry)) {
                failed.push({ entry, error: t('目标名称已存在', 'Target already exists') });
                continue;
            }
            try {
                shell.fs.rename(entry.from, entry.to);
                done.push(entry);
            } catch (error) {
                failed.push({ entry, error: messageOf(error) });
            }
        }
        return { done, failed };
    }

    const staged: { entry: BatchEntry; temp: string }[] = [];
    let stagingFailed = false;
    changes.forEach((entry, slot) => {
        if (stagingFailed) return;
        const temp = tempNameFor(entry, slot);
        try {
            shell.fs.rename(entry.from, temp);
            staged.push({ entry, temp });
        } catch (error) {
            stagingFailed = true;
            failed.push({ entry, error: messageOf(error) });
        }
    });

    if (stagingFailed) {
        for (const item of staged) {
            try {
                shell.fs.rename(item.temp, item.entry.from);
            } catch {
                failed.push({
                    entry: item.entry,
                    error: t('改名失败且无法还原', 'Rename failed and could not be reverted')
                });
            }
        }
        return { done, failed };
    }

    for (const item of staged) {
        if (occupied(item.entry)) {
            failed.push({ entry: item.entry, error: t('目标名称已存在', 'Target already exists') });
            try {
                shell.fs.rename(item.temp, item.entry.from);
            } catch {
                failed.push({
                    entry: item.entry,
                    error: t('目标被占用且无法还原', 'Target occupied and could not be reverted')
                });
            }
            continue;
        }
        try {
            shell.fs.rename(item.temp, item.entry.to);
            done.push(item.entry);
        } catch (error) {
            failed.push({ entry: item.entry, error: messageOf(error) });
            try {
                shell.fs.rename(item.temp, item.entry.from);
            } catch {
                failed.push({
                    entry: item.entry,
                    error: t('改名失败且无法还原', 'Rename failed and could not be reverted')
                });
            }
        }
    }

    return { done, failed };
};

export const invertEntries = (entries: BatchEntry[]): BatchEntry[] =>
    entries
        .slice()
        .reverse()
        .map(entry => ({ from: entry.to, to: entry.from, fromName: entry.toName, toName: entry.fromName }));

export const previewNames = (items: RenameItem[], preset: Preset, params: Params, options: PlanOptions, limit = 1) =>
    buildPlan(items.slice(0, Math.max(limit, 1)), preset, params, options).rows;
