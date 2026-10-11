import { memo, useCallback, useEffect, useMemo, useRef, useState } from './react';
import { t } from './i18n';
import { RenameItem, diffNames } from './model';
import { Field, FieldOption, Params, Preset, PRESETS, SCRIPT_PRESET, defaultParams, findPreset, scriptErrors } from './presets';
import { Batch, OrderId, ORDER_OPTIONS, Plan, buildPlan, batchFromPlan, executeRenames, invertEntries } from './plan';
import { AppSettings } from './settings';
import { COLOR_VARS, FAST, Font, Icons, Radius, Space, fluent, toneColor } from './theme';
import {
    Button,
    Chip,
    ComboBox,
    Divider,
    EmptyState,
    FieldRow,
    InfoBar,
    NumberField,
    Panel,
    SectionHeader,
    StackedRow,
    Text,
    TextArea,
    TextField,
    ToggleSwitch,
    TonePill,
    iconElement,
    type TextTone,
    useHoverActive
} from './ui';

export const WINDOW_WIDTH = 1060;
export const WINDOW_HEIGHT = 720;

const KEY_ESCAPE = 256;
const KEY_ENTER = 257;
const KEY_UP = 265;
const KEY_DOWN = 264;
const COL_PRESETS = 208;
const COL_PREVIEW = 408;
const COL_PARAMS = WINDOW_WIDTH - 2 * Space.xl - 2 * Space.xl - COL_PRESETS - COL_PREVIEW;
const PREVIEW_LIMIT = 200;
const ROW_HEIGHT = 28;

// 单选时的快捷方式: 直接改完整文件名, 比先选预设再填参数少走两步。
const MANUAL_PRESET: Preset = {
    id: 'manual',
    icon: Icons.rename,
    title: t('手动改名', 'Manual rename'),
    description: t('直接编辑完整文件名', 'Edit the full file name'),
    extMode: 'ignore',
    defaults: { name: '' },
    fields: [{ kind: 'text', key: 'name', label: t('新名称', 'New name'), grow: true }],
    transform: ({ item, index }, params) => {
        if (index !== 0) return null;
        const name = String(params.name ?? '');
        if (!name || name === item.name) return null;
        return { base: name, ext: '' };
    }
};

const presetById = (id: string): Preset => (id === 'manual' ? MANUAL_PRESET : findPreset(id));


const savableParams = (params: Record<string, Params>) => {
    const out: Record<string, Params> = {};
    for (const key of Object.keys(params)) {
        if (key === 'manual') continue;
        out[key] = params[key];
    }
    return out;
};

// 估算一段文字画出来有多宽: CJK 按一个字宽, 其它按 0.55 字宽。
const estimateWidth = (text: string, size: number) =>
    Array.from(text).reduce((sum, char) => sum + (char.charCodeAt(0) > 0x2e80 ? size : size * 0.55), 0);

/* --------------------------------------------------------------- 预设列表 */

const PresetRow = memo(({ preset, selected, onClick }: { preset: Preset; selected: boolean; onClick: () => void }) => {
    const c = fluent();
    const hover = useHoverActive();
    return (
        <flex
            horizontal
            alignItems="center"
            gap={Space.lg}
            height={50}
            flexShrink={0}
            paddingLeft={Space.md}
            paddingRight={Space.md}
            borderRadius={Radius.md}
            borderWidth={selected ? 1 : 0}
            borderColor={c.accent}
            backgroundColor={selected ? c.accentSubtle : hover.isHovered ? c.cardHover : c.transparent}
            onClick={onClick}
            onMouseEnter={hover.onMouseEnter}
            onMouseLeave={hover.onMouseLeave}
            animatedVars={COLOR_VARS}
            animationCurve={{ ...FAST, vars: COLOR_VARS }}
        >
            <flex
                width={24}
                height={24}
                flexShrink={0}
                borderRadius={Radius.md}
                justifyContent="center"
                alignItems="center"
                backgroundColor={selected ? c.accent : c.subtle}
            >
                {iconElement(preset.icon, 15, selected ? c.accentText : c.textSecondary)}
            </flex>
            <flex flexGrow={1} flexShrink={1} gap={1}>
                <Text size={Font.body} weight={selected ? 600 : 400} tone={selected ? 'primary' : 'secondary'} ellipsis>
                    {preset.title}
                </Text>
                <Text size={Font.tiny} tone="tertiary" ellipsis>
                    {preset.description}
                </Text>
            </flex>
        </flex>
    );
});

/* ------------------------------------------------------------- 参数面板 */

const FieldControl = ({
    field,
    params,
    set
}: {
    field: Field;
    params: Params;
    set: (key: string, value: string | number | boolean) => void;
}) => {
    if (field.kind === 'text') {
        return (
            <TextField
                value={String(params[field.key] ?? '')}
                onChange={value => set(field.key, value)}
                placeholder={field.placeholder}
                width={field.width}
                grow={field.grow ?? !field.width}
                mono={field.mono}
            />
        );
    }
    if (field.kind === 'number') {
        return (
            <NumberField
                value={Number(params[field.key] ?? 0)}
                min={field.min ?? 0}
                max={field.max ?? 9999}
                step={field.step ?? 1}
                width={field.width ?? 96}
                suffix={field.suffix}
                onChange={value => set(field.key, value)}
            />
        );
    }
    if (field.kind === 'select') {
        return (
            <ComboBox
                value={String(params[field.key] ?? '')}
                options={field.options ?? []}
                onChange={value => set(field.key, value)}
                width={field.width}
                grow={field.grow ?? !field.width}
            />
        );
    }
    if (field.kind === 'toggle') {
        return <ToggleSwitch value={params[field.key] === true} onChange={value => set(field.key, value)} />;
    }
    return null;
};

const ChipsRow = ({ options, onPick }: { options: FieldOption[]; onPick: (value: string) => void }) => (
    <flex horizontal gap={Space.md} flexWrap="wrap" minWidth={0} alignItems="center">
        {options.map(option => (
            <Chip key={option.label} label={option.label} onClick={() => onPick(option.value)} />
        ))}
    </flex>
);
const ScriptHelp = ({ c }: { c: ReturnType<typeof fluent> }) => (
    <flex gap={Space.sm} padding={Space.lg} borderRadius={Radius.md} backgroundColor={c.codeBg} alignItems="stretch">
        <Text size={Font.tiny} weight={600} tone="tertiary">
            {t('可用变量', 'Available variables')}
        </Text>
        <Text size={Font.tiny} tone="secondary" fontFamily="monospace" maxWidth={430} minWidth={0}>
            name base ext path dir isDir size mtime i index total
        </Text>
        <Text size={Font.tiny} tone="secondary" fontFamily="monospace" maxWidth={430} minWidth={0}>
            pad(n,d) lower(s) upper(s) slug(s) date(fmt) now(fmt) humanSize(n)
        </Text>
        <Text size={Font.tiny} tone="tertiary" maxWidth={430} minWidth={0}>
            {t(
                '最后 return 新的文件名；返回 null 跳过该项。',
                'Return the new name; null skips the item.'
            )}
        </Text>
    </flex>
);
const ParamsPanel = ({
    preset,
    params,
    set,
    c
}: {
    preset: Preset;
    params: Params;
    set: (key: string, value: string | number | boolean) => void;
    c: ReturnType<typeof fluent>;
}) => {
    const fields = preset.fields.filter(field => !field.showIf || field.showIf(params));

    return (
        <flex gap={Space.md} alignItems="stretch">
            {fields.map((field, index) => {
                const previous = fields[index - 1];
                const grouped = field.group && field.group !== previous?.group;
                const control =
                    field.kind === 'chips' ? (
                        <StackedRow key={`f-${index}`} label={field.label} hint={field.hint} help={field.help}>
                            <ChipsRow
                                options={field.options ?? []}
                                onPick={value => {
                                    if (field.onPick) {
                                        const next = field.onPick(params, value);
                                        for (const key of Object.keys(next)) {
                                            if (next[key] !== params[key]) set(key, next[key]);
                                        }
                                    } else {
                                        set(field.key, value);
                                    }
                                }}
                            />
                        </StackedRow>
                    ) : field.kind === 'textarea' ? (
                        <StackedRow key={`f-${index}`} label={field.label} hint={field.hint} help={field.help}>
                            <TextArea
                                value={String(params[field.key] ?? '')}
                                onChange={value => set(field.key, value)}
                                placeholder={field.placeholder}
                                height={field.height}
                                grow
                            />
                        </StackedRow>
                    ) : (
                        <FieldRow key={`f-${index}`} label={field.label} hint={field.hint} help={field.help}>
                            <FieldControl field={field} params={params} set={set} />
                        </FieldRow>
                    );

                return grouped ? (
                    <flex key={`g-${index}`} gap={Space.md} alignItems="stretch">
                        <SectionHeader title={field.group ?? ''} c={c} />
                        {control}
                    </flex>
                ) : (
                    control
                );
            })}
            {preset.id === 'script' && <ScriptHelp c={c} />}
        </flex>
    );
};

/* --------------------------------------------------------------- 预览表格 */

type DisplayStatus = 'changed' | 'same' | 'error' | 'applied';

type DisplayRow = {
    key: string;
    index: number;
    oldName: string;
    newName: string;
    status: DisplayStatus;
    reason?: string;
};

const statusIcon = (status: DisplayStatus, c: ReturnType<typeof fluent>) => {
    if (status === 'error') return iconElement(Icons.close, 12, toneColor('danger', c).fg);
    if (status === 'same') return iconElement(Icons.skip, 12, c.textTertiary);
    if (status === 'applied') return iconElement(Icons.checkCircle, 12, toneColor('success', c).fg);
    return iconElement(Icons.check, 12, c.accent);
};

const NewName = ({ oldName, newName, width, tone }: { oldName: string; newName: string; width: number; tone: TextTone }) => {
    const parts = diffNames(oldName, newName).filter(part => part.kind !== 'del');
    const total = parts.reduce((sum, part) => sum + estimateWidth(part.text, Font.small), 0);
    if (total > width) {
        return (
            <Text size={Font.small} tone={tone} maxWidth={width} ellipsis>
                {newName}
            </Text>
        );
    }
    return (
        <flex horizontal alignItems="center">
            {parts.map((part, index) => (
                <Text key={index} size={Font.small} weight={part.kind === 'add' ? 600 : 400} tone={part.kind === 'add' ? 'accent' : tone}>
                    {part.text}
                </Text>
            ))}
        </flex>
    );
};

const PreviewRow = memo(({ row, nameWidth, c }: { row: DisplayRow; nameWidth: number; c: ReturnType<typeof fluent> }) => {
    const hover = useHoverActive();
    const bad = row.status === 'error';
    const dim = row.status === 'same';
    return (
        <flex
            horizontal
            alignItems="center"
            gap={Space.md}
            height={ROW_HEIGHT}
            flexShrink={0}
            paddingLeft={Space.md}
            paddingRight={Space.md}
            borderRadius={Radius.sm}
            backgroundColor={hover.isHovered ? c.cardHover : c.transparent}
            onMouseEnter={hover.onMouseEnter}
            onMouseLeave={hover.onMouseLeave}
            animatedVars={COLOR_VARS}
            animationCurve={{ ...FAST, vars: COLOR_VARS }}
        >
            <flex width={20} justifyContent="end" flexShrink={0}>
                <Text size={Font.tiny} tone="tertiary" fontFamily="monospace">
                    {row.index + 1}
                </Text>
            </flex>
            <flex width={nameWidth} flexShrink={0} cropOverflow>
                <Text size={Font.small} tone={bad || dim ? 'tertiary' : 'secondary'} maxWidth={nameWidth} ellipsis>
                    {row.oldName}
                </Text>
            </flex>
            <flex width={14} justifyContent="center" flexShrink={0}>
                {iconElement(Icons.arrow, 12, bad ? toneColor('danger', c).fg : dim ? c.textTertiary : c.accent)}
            </flex>
            <flex width={nameWidth} flexShrink={0} cropOverflow>
                {bad ? (
                    <Text size={Font.small} tone="danger" maxWidth={nameWidth} ellipsis>
                        {row.reason ?? t('无法重命名', 'Cannot rename')}
                    </Text>
                ) : dim ? (
                    <Text size={Font.small} tone="tertiary">
                        {t('名称没有变化', 'Name unchanged')}
                    </Text>
                ) : (
                    <NewName oldName={row.oldName} newName={row.newName} width={nameWidth} tone={row.status === 'applied' ? 'success' : 'primary'} />
                )}
            </flex>
            <flex width={16} justifyContent="center" flexShrink={0}>
                {statusIcon(row.status, c)}
            </flex>
        </flex>
    );
});

const PreviewTable = ({ rows, applied, hiddenCount, c }: { rows: DisplayRow[]; applied: boolean; hiddenCount: number; c: ReturnType<typeof fluent> }) => {
    const inner = COL_PREVIEW - 2 * Space.xl - 2 * Space.md;
    const nameWidth = Math.floor((inner - 20 - 14 - 16 - 4 * Space.md) / 2);
    return (
        <flex
            gap={2}
            flexGrow={1}
            alignItems="stretch"
            enableScrolling
            enableChildClipping
            scrollBarColor={c.scrollBar}
            scrollBarWidth={5}
            scrollBarRadius={3}
            scrollBarMargin={2}
        >
            <flex horizontal alignItems="center" gap={Space.md} height={22} flexShrink={0} paddingLeft={Space.md} paddingRight={Space.md}>
                <flex width={20} flexShrink={0} />
                <flex width={nameWidth} flexShrink={0}>
                    <Text size={Font.tiny} weight={600} tone="tertiary">
                        {t('当前名称', 'Current name')}
                    </Text>
                </flex>
                <flex width={14} flexShrink={0} />
                <flex width={nameWidth} flexShrink={0}>
                    <Text size={Font.tiny} weight={600} tone="tertiary">
                        {applied ? t('重命名后', 'Renamed to') : t('新名称', 'New name')}
                    </Text>
                </flex>
                <flex width={16} flexShrink={0} />
            </flex>
            {rows.map(row => (
                <PreviewRow key={row.key} row={row} nameWidth={nameWidth} c={c} />
            ))}
            {hiddenCount > 0 && (
                <flex padding={Space.md} justifyContent="center">
                    <Text size={Font.tiny} tone="tertiary">
                        {t(`还有 ${hiddenCount} 项未显示`, `${hiddenCount} more not shown`)}
                    </Text>
                </flex>
            )}
        </flex>
    );
};

/* ------------------------------------------------------------------- App */

export type RenameAppProps = {
    items: RenameItem[];
    settings: AppSettings;
    onSettings: (patch: Partial<AppSettings>) => void;
    requestModTimes: (paths: string[], done: (map: Record<string, Date>) => void) => void;
    onClose: () => void;
};

const RenameApp = ({ items, settings, onSettings, requestModTimes, onClose }: RenameAppProps) => {
    const c = fluent();
    const [presetId, setPresetId] = useState(settings.lastPreset);
    const [paramsMap, setParamsMap] = useState<Record<string, Params>>(() => {
        const initial = { ...settings.params };
        if (items.length === 1) initial.manual = { name: items[0].name };
        return initial;
    });
    const [keepExt, setKeepExt] = useState(settings.keepExt);
    const [order, setOrder] = useState<OrderId>(settings.order);
    const [itemList, setItemList] = useState<RenameItem[]>(items);
    const [batch, setBatch] = useState<Batch | null>(settings.lastBatch);
    const [applied, setApplied] = useState<Batch | null>(null);
    const [applying, setApplying] = useState(false);
    const [failure, setFailure] = useState<string | null>(null);
    const [datesLoading, setDatesLoading] = useState(false);
    const nowRef = useRef(new Date());
    const dateRequested = useRef(false);

    const preset = presetById(presetId);
    const params = paramsMap[presetId] ?? preset.defaults;

    const plan: Plan = useMemo(
        () => buildPlan(itemList, preset, params, { keepExt, order, now: nowRef.current }),
        [itemList, presetId, paramsMap, keepExt, order]
    );

    const setParam = useCallback(
        (key: string, value: string | number | boolean) => {
            setParamsMap(prev => ({ ...prev, [presetId]: { ...prev[presetId], [key]: value } }));
        },
        [presetId]
    );

    const latestSettings = useRef<Partial<AppSettings>>({});
    latestSettings.current = { keepExt, order, lastPreset: presetId, params: savableParams(paramsMap) };

    useEffect(() => {
        return () => onSettings(latestSettings.current);
    }, []);

    useEffect(() => {
        setApplied(null);
        setFailure(null);
    }, [presetId]);

    const needsDates = preset.id === 'dateTime' && params.source === 'file';
    useEffect(() => {
        if (!needsDates || dateRequested.current || itemList.length === 0) return;
        if (itemList.every(item => item.mtime)) return;
        dateRequested.current = true;
        setDatesLoading(true);
        requestModTimes(
            itemList.map(item => item.path),
            map => {
                setDatesLoading(false);
                setItemList(prev => prev.map(item => (map[item.path] ? { ...item, mtime: map[item.path] } : item)));
            }
        );
    }, [needsDates]);

    const displayRows: DisplayRow[] = useMemo(() => {
        if (applied) {
            return applied.entries.map((entry, index) => ({
                key: `${entry.from}-${index}`,
                index,
                oldName: entry.fromName,
                newName: entry.toName,
                status: 'applied' as DisplayStatus
            }));
        }
        return plan.rows.slice(0, PREVIEW_LIMIT).map(row => ({
            key: `${row.index}-${row.item.path}`,
            index: row.index,
            oldName: row.item.name,
            newName: row.status === 'changed' ? row.newName : row.item.name,
            status: row.status === 'changed' ? 'changed' : row.status === 'same' ? 'same' : ('error' as DisplayStatus),
            reason: row.reason
        }));
    }, [plan, applied]);

    const renameItem = (item: RenameItem, name: string, path: string): RenameItem => {
        const dot = item.isDir ? -1 : name.lastIndexOf('.');
        return {
            ...item,
            path,
            name,
            base: dot <= 0 ? name : name.slice(0, dot),
            ext: dot <= 0 ? '' : name.slice(dot)
        };
    };

    const apply = () => {
        if (!plan.canApply || applying) return;
        setApplying(true);
        const nextBatch = batchFromPlan(plan);
        const result = executeRenames(nextBatch.entries);
        const doneSet = new Set(result.done.map(entry => entry.from));
        const appliedEntries = nextBatch.entries.filter(entry => doneSet.has(entry.from));
        const byFrom = new Map(appliedEntries.map(entry => [entry.from, entry]));
        setItemList(prev =>
            prev.map(item => {
                const entry = byFrom.get(item.path);
                return entry ? renameItem(item, entry.toName, entry.to) : item;
            })
        );

        if (appliedEntries.length > 0) {
            const record: Batch = { ...nextBatch, entries: appliedEntries };
            setBatch(record);
            setApplied(record);
            onSettings({
                keepExt,
                order,
                lastPreset: presetId,
                params: savableParams(paramsMap),
                lastBatch: { ...record, entries: record.entries.slice(0, 200) }
            });
        }
        setFailure(
            result.failed.length > 0
                ? t(
                      `${result.failed.length} 项失败：${result.failed[0].entry.fromName} — ${result.failed[0].error}`,
                      `${result.failed.length} failed: ${result.failed[0].entry.fromName} — ${result.failed[0].error}`
                  )
                : null
        );
        setApplying(false);
    };

    const undo = () => {
        if (!batch || batch.entries.length === 0) return;
        const result = executeRenames(invertEntries(batch.entries));
        const doneSet = new Set(result.done.map(entry => entry.from));
        const byTarget = new Map(batch.entries.map(entry => [entry.to, entry]));
        setItemList(prev =>
            prev.map(item => {
                const entry = byTarget.get(item.path);
                if (!entry || !doneSet.has(entry.to)) return item;
                return renameItem(item, entry.fromName, entry.from);
            })
        );
        setBatch(null);
        setApplied(null);
        setFailure(result.failed.length > 0 ? t(`撤销时有 ${result.failed.length} 项失败`, `${result.failed.length} items failed to revert`) : null);
        onSettings({ keepExt, order, lastPreset: presetId, params: savableParams(paramsMap), lastBatch: null });
    };

    const resetParams = () => {
        const defaults = defaultParams();
        if (itemList.length === 1) defaults.manual = { name: itemList[0].name };
        setParamsMap(defaults);
        onSettings({ keepExt, order, lastPreset: presetId, params: savableParams(defaults) });
    };

    const fileCount = itemList.filter(item => !item.isDir).length;
    const dirCount = itemList.length - fileCount;
    const subtitle =
        itemList.length === 1
            ? t(`已选中：${itemList[0].name}`, `Selected: ${itemList[0].name}`)
            : t(
                  `已选中 ${itemList.length} 个项目（${fileCount} 个文件${dirCount > 0 ? `、${dirCount} 个文件夹` : ''}）`,
                  `${itemList.length} items selected (${fileCount} files${dirCount > 0 ? `, ${dirCount} folders` : ''})`
              );

    const scriptError = preset.id === 'script' ? scriptErrors(String(params.code ?? '')) : null;
    const blockedByScript = scriptError !== null && params.onError === 'block';
    const errorCount = plan.errors.length;
    const canApply = plan.canApply && !blockedByScript && !applying;
    const overLimit = applied ? 0 : Math.max(0, plan.rows.length - PREVIEW_LIMIT);

    // 没有输入控件聚焦时 shell 会把按键冒泡到根节点, Esc 关窗、Enter 应用。
    const presetIds = [...(itemList.length === 1 ? [MANUAL_PRESET.id] : []), ...PRESETS.map(item => item.id), SCRIPT_PRESET.id];
    const onKeyDown = (key: number) => {
        if (key === KEY_DOWN || key === KEY_UP) {
            const step = key === KEY_DOWN ? 1 : -1;
            const at = presetIds.indexOf(presetId);
            setPresetId(presetIds[(at + step + presetIds.length) % presetIds.length]);
            return true;
        }
        if (key === KEY_ESCAPE) {
            onClose();
            return true;
        }
        if (key === KEY_ENTER && canApply) {
            apply();
            return true;
        }
        return false;
    };
    const header = (
        <>
            <flex horizontal alignItems="center" gap={Space.xl} height={64} flexShrink={0} paddingLeft={Space.xxl} paddingRight={Space.lg}>
                <flex width={36} height={36} borderRadius={Radius.lg} backgroundColor={c.accentSubtle} justifyContent="center" alignItems="center">
                    {iconElement(Icons.rename, 19, c.accent)}
                </flex>
                <flex gap={2} flexGrow={1} flexShrink={1}>
                    <Text size={Font.title} weight={600}>
                        {t('重命名 Plus', 'Rename Plus')}
                    </Text>
                    <Text size={Font.small} tone="secondary" ellipsis>
                        {subtitle}
                    </Text>
                </flex>
                {batch && <Button icon={Icons.undo} label={t('撤销上次', 'Undo last')} size={Font.small} onClick={undo} />}
            </flex>
            <Divider />
        </>
    );

    if (itemList.length === 0) {
        return (
            <flex width={WINDOW_WIDTH} height={WINDOW_HEIGHT} backgroundColor={c.windowBg} alignItems="stretch" onKeyDown={onKeyDown}>
                {header}
                <flex flexGrow={1} padding={Space.xl} alignItems="stretch">
                    <Panel c={c} grow>
                        <EmptyState
                            icon={Icons.rename}
                            title={t('没有待重命名的项目', 'Nothing to rename')}
                            message={t(
                                '在资源管理器中选中文件或文件夹，右键选择「重命名 Plus」，就能在这里批量改名。',
                                'Select files or folders in Explorer, right-click and choose "Rename Plus" to rename them here.'
                            )}
                        >
                            <flex gap={Space.sm} paddingTop={Space.md} alignItems="stretch">
                                {[
                                    t('1. 选中 1 个或多个项目', '1. Select one or more items'),
                                    t('2. 右键 → 重命名 Plus', '2. Right-click → Rename Plus'),
                                    t('3. 选预设或写脚本，右侧看预览', '3. Pick a preset or write a script, preview on the right'),
                                    t('4. 点应用，随时可以撤销', '4. Apply, and undo any time')
                                ].map(line => (
                                    <Text key={line} size={Font.small} tone="secondary">
                                        {line}
                                    </Text>
                                ))}
                            </flex>
                        </EmptyState>
                    </Panel>
                </flex>
                <Divider />
                <flex horizontal alignItems="center" justifyContent="end" height={60} flexShrink={0} paddingRight={Space.xxl}>
                    <Button label={t('关闭', 'Close')} onClick={onClose} />
                </flex>
            </flex>
        );
    }

    const statusBar = failure ? (
        <InfoBar severity="danger" title={failure} maxTextWidth={460} />
    ) : applied ? (
        <InfoBar
            severity="success"
            title={t(`已重命名 ${applied.entries.length} 项`, `Renamed ${applied.entries.length} items`)}
            message={t('要退回就点右上角的「撤销上次」。', 'Use "Undo last" in the top right to revert.')}
            maxTextWidth={460}
        />
    ) : scriptError ? (
        <InfoBar severity="danger" title={t('脚本有语法错误，无法应用', 'Fix the script before applying')} maxTextWidth={460} />
    ) : errorCount > 0 ? (
        <InfoBar
            severity="warning"
            title={t(`${errorCount} 项有冲突或非法名称，将被跳过`, `${errorCount} items will be skipped`)}
            message={plan.errors[0]?.reason}
            maxTextWidth={460}
        />
    ) : plan.unchecked ? (
        <InfoBar severity="info" title={t('项目较多，已跳过重名检查', 'Too many items, duplicate check skipped')} maxTextWidth={460} />
    ) : (
        <Text size={Font.small} tone="secondary">
            {plan.canApply
                ? t(`${plan.changed.length} 项将被重命名，${plan.sameCount} 项无变化`, `${plan.changed.length} to rename, ${plan.sameCount} unchanged`)
                : t('没有需要重命名的项目', 'Nothing to rename')}
        </Text>
    );

    return (
        <flex width={WINDOW_WIDTH} height={WINDOW_HEIGHT} backgroundColor={c.windowBg} alignItems="stretch" onKeyDown={onKeyDown}>
            {header}

            <flex horizontal alignItems="center" gap={Space.lg} height={48} flexShrink={0} paddingLeft={Space.xxl} paddingRight={Space.xxl}>
                <flex width={188} flexShrink={0}>
                    <ToggleSwitch value={keepExt} onChange={setKeepExt} label={t('保留扩展名', 'Keep extension')} />
                </flex>
                <Divider vertical />
                <flex horizontal alignItems="center" gap={Space.md}>
                    {iconElement(Icons.sort, 14, c.textSecondary)}
                    <Text size={Font.small} tone="secondary">
                        {t('重命名顺序', 'Order')}
                    </Text>
                    <ComboBox value={order} options={ORDER_OPTIONS} onChange={value => setOrder(value as OrderId)} width={160} />
                </flex>
                <spacer />
                <Button icon={Icons.reset} label={t('恢复默认参数', 'Reset options')} size={Font.small} variant="subtle" onClick={resetParams} />
            </flex>
            <Divider />

            <flex horizontal gap={Space.xl} flexGrow={1} flexShrink={1} minHeight={0} padding={Space.xl} alignItems="stretch">
                <Panel c={c} width={COL_PRESETS} padding={Space.md} gap={2} scroll bordered={false} background={c.columnBg}>
                    {itemList.length === 1 && (
                        <>
                            <SectionHeader title={t('单个项目', 'Single item')} c={c} />
                            <PresetRow
                                preset={MANUAL_PRESET}
                                selected={MANUAL_PRESET.id === presetId}
                                onClick={() => setPresetId(MANUAL_PRESET.id)}
                            />
                        </>
                    )}
                    <SectionHeader title={t('常用预设', 'Presets')} c={c} />
                    {PRESETS.map(item => (
                        <PresetRow key={item.id} preset={item} selected={item.id === presetId} onClick={() => setPresetId(item.id)} />
                    ))}
                    <SectionHeader title={t('高级', 'Advanced')} c={c} />
                    <PresetRow preset={SCRIPT_PRESET} selected={SCRIPT_PRESET.id === presetId} onClick={() => setPresetId(SCRIPT_PRESET.id)} />
                </Panel>

                <Panel c={c} width={COL_PARAMS} scroll padding={Space.xl} gap={Space.lg}>
                    <flex gap={2} flexShrink={0}>
                        <Text size={Font.heading} weight={600}>
                            {preset.title}
                        </Text>
                    </flex>
                    <Divider />
                    <ParamsPanel preset={preset} params={params} set={setParam} c={c} />
                    {scriptError && (
                        <InfoBar severity="danger" title={t('脚本无法编译', 'Script cannot be compiled')} message={scriptError} maxTextWidth={360} />
                    )}
                    {needsDates && !datesLoading && itemList.some(item => !item.mtime) && (
                        <InfoBar
                            severity="warning"
                            title={t('部分项目没有文件修改时间', 'Some items have no modified time')}
                            message={t('这些项目会退回使用当前时间。', 'Those items fall back to the current time.')}
                            maxTextWidth={360}
                        />
                    )}
                    {datesLoading && <InfoBar severity="info" title={t('正在读取文件修改时间…', 'Reading modified times...')} maxTextWidth={360} />}
                </Panel>

                <Panel c={c} width={COL_PREVIEW} padding={Space.xl} gap={Space.md}>
                    <flex horizontal alignItems="center" gap={Space.md} flexShrink={0}>
                        <TonePill
                            tone={applied ? 'success' : errorCount > 0 ? 'warning' : plan.canApply ? 'accent' : 'neutral'}
                            c={c}
                            size={Font.small}
                            text={
                                applied
                                    ? t(`${applied.entries.length} 项已重命名`, `${applied.entries.length} renamed`)
                                    : errorCount > 0
                                      ? t(`${errorCount} 项跳过`, `${errorCount} skipped`)
                                      : plan.canApply
                                        ? t(`${plan.changed.length} 项待重命名`, `${plan.changed.length} to rename`)
                                        : t('没有变化', 'No change')
                            }
                        />
                        {plan.sameCount > 0 && !applied && (
                            <Text size={Font.tiny} tone="tertiary">
                                {t(`${plan.sameCount} 项无变化`, `${plan.sameCount} unchanged`)}
                            </Text>
                        )}
                        <spacer />
                        {iconElement(Icons.preview, 14, c.textTertiary)}
                    </flex>
                    <Divider />
                    {displayRows.length === 0 ? (
                        <EmptyState
                            icon={Icons.rename}
                            title={t('没有预览内容', 'Nothing to preview')}
                            message={t('先在左侧选择一个预设并填写参数。', 'Pick a preset on the left and fill in its options.')}
                        />
                    ) : (
                        <PreviewTable rows={displayRows} applied={applied !== null} hiddenCount={overLimit} c={c} />
                    )}
                </Panel>
            </flex>

            <Divider />
            <flex horizontal alignItems="center" gap={Space.xl} height={64} flexShrink={0} paddingLeft={Space.xxl} paddingRight={Space.xxl}>
                <flex flexGrow={1} flexShrink={1}>
                    {statusBar}
                </flex>
                <Button label={t('取消', 'Cancel')} onClick={onClose} />
                <Button
                    variant="accent"
                    minWidth={148}
                    disabled={!canApply}
                    label={
                        applying
                            ? t('处理中…', 'Working...')
                            : plan.changed.length > 0
                              ? t(`应用（${plan.changed.length} 项）`, `Apply (${plan.changed.length})`)
                              : t('应用', 'Apply')
                    }
                    onClick={apply}
                />
            </flex>
        </flex>
    );
};

export default RenameApp;
