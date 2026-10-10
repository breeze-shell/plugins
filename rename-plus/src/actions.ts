import * as shell from 'mshell';
import { t } from './i18n';
import { RenameItem, parseDateText, splitName, splitPath } from './model';
import { findPreset } from './presets';
import { Batch, batchFromPlan, executeRenames, invertEntries } from './plan';
import { AppSettings } from './settings';
import { planFor } from './menu';

export const BATCH_LIMIT = 200;
export const DATE_LIMIT = 400;
const UNDO_SAMPLE = 12;

export const collectItems = (paths: string[]): RenameItem[] => {
    const out: RenameItem[] = [];
    const readSize = paths.length <= 2000;
    paths.forEach((path, pickedIndex) => {
        if (!path) return;
        const { dir, name } = splitPath(path);
        if (!name) return;
        let isDir = false;
        try {
            isDir = shell.fs.isdir(path);
        } catch {
            isDir = false;
        }
        let size = 0;
        if (!isDir && readSize) {
            try {
                size = shell.breeze.file_size(path) || 0;
            } catch {
                size = 0;
            }
        }
        out.push({
            path,
            dir,
            name,
            ...splitName(name, isDir),
            isDir,
            size,
            mtime: null,
            pickedIndex
        });
    });
    return out;
};

const toBase64Utf16 = (text: string) => {
    let binary = '';
    for (let index = 0; index < text.length; index++) {
        const code = text.charCodeAt(index);
        binary += String.fromCharCode(code & 0xff, (code >>> 8) & 0xff);
    }
    return shell.infra.btoa(binary);
};

const quotePowerShell = (path: string) => `'${path.replace(/'/g, "''")}'`;

// breeze 没有暴露文件时间接口, 需要精确到秒的修改时间时只能问一次 PowerShell
// (-WindowStyle Hidden 是为了不闪控制台窗口)。
export const requestModTimes = (paths: string[], done: (map: Record<string, Date>) => void) => {
    const subset = paths.filter(Boolean).slice(0, DATE_LIMIT);
    if (subset.length === 0) {
        done({});
        return;
    }
    const script = [
        '$ErrorActionPreference = "SilentlyContinue"',
        '[Console]::OutputEncoding = [System.Text.Encoding]::UTF8',
        `Get-Item -LiteralPath ${subset.map(quotePowerShell).join(',')} | ForEach-Object { $_.FullName + "|" + $_.LastWriteTime.ToString("yyyy-MM-dd HH:mm:ss") }`
    ].join('; ');
    const command = `powershell.exe -NoProfile -NonInteractive -WindowStyle Hidden -EncodedCommand ${toBase64Utf16(script)}`;
    shell.subproc.run_async(command, result => {
        const byPath: Record<string, Date> = {};
        for (const line of (result.out || '').split(/\r?\n/)) {
            const cut = line.lastIndexOf('|');
            if (cut <= 0) continue;
            const path = line.slice(0, cut).trim();
            const text = line.slice(cut + 1).trim();
            if (path && text) byPath[path.toLowerCase()] = parseDateText(text, new Date(0));
        }
        const map: Record<string, Date> = {};
        for (const path of subset) {
            const found = byPath[path.toLowerCase()];
            if (found) map[path] = found;
        }
        done(map);
    });
};

export type ActionDeps = {
    settings: () => AppSettings;
    save: (patch: Partial<AppSettings>) => void;
    log: (message: string) => void;
};

export const makeActions = ({ settings, save, log }: ActionDeps) => {
    const rememberBatch = (batch: Batch) =>
        save({ lastBatch: { ...batch, entries: batch.entries.slice(0, BATCH_LIMIT) } });

    const undoLast = (): boolean => {
        const batch = settings().lastBatch;
        if (!batch || batch.entries.length === 0) return false;
        const result = executeRenames(invertEntries(batch.entries));
        if (result.failed.length > 0) {
            log(t(`撤销失败：${result.failed[0].error}`, `Undo failed: ${result.failed[0].error}`));
            return false;
        }
        save({ lastBatch: null });
        log(t(`已撤销 ${result.done.length} 项重命名`, `Reverted ${result.done.length} renames`));
        return true;
    };

    // 抽样检查, 免得为了点亮一个菜单项把整批文件都 stat 一遍。
    const canUndo = () => {
        const batch = settings().lastBatch;
        if (!batch || batch.entries.length === 0) return false;
        for (const entry of batch.entries.slice(0, UNDO_SAMPLE)) {
            try {
                if (!shell.fs.exists(entry.to)) return false;
            } catch {
                return true;
            }
        }
        return true;
    };

    const quickApply = (items: RenameItem[], presetId: string) => {
        const state = settings();
        const preset = findPreset(presetId);
        const plan = planFor(items, presetId, state.params, state, true);
        if (plan.changed.length === 0) {
            log(t(`${preset.title}：没有需要重命名的项目`, `${preset.title}: nothing to rename`));
            return;
        }

        const batch = batchFromPlan(plan);
        const result = executeRenames(batch.entries);
        const doneSet = new Set(result.done.map(entry => entry.from));
        const applied: Batch = { ...batch, entries: batch.entries.filter(entry => doneSet.has(entry.from)) };
        if (applied.entries.length > 0) rememberBatch(applied);

        if (result.failed.length > 0) {
            log(
                t(
                    `已重命名 ${applied.entries.length} 项，${result.failed.length} 项失败：${result.failed[0].error}`,
                    `Renamed ${applied.entries.length}, ${result.failed.length} failed: ${result.failed[0].error}`
                )
            );
            return;
        }

        const names = applied.entries.slice(0, 3).map(entry => entry.toName);
        log(
            t(
                `已重命名 ${applied.entries.length} 项：${names.join('、')}${applied.entries.length > names.length ? ' …' : ''}`,
                `Renamed ${applied.entries.length} items`
            )
        );
    };

    return {
        undoLast,
        canUndo,
        quickApply,
        lastBatchSize: () => settings().lastBatch?.entries.length ?? 0
    };
};
