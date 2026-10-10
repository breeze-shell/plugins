import { memo, useCallback, useEffect, useMemo, useRef, useState } from './react';
import { t } from './i18n';
import { RenameItem, diffNames } from './model';
import { FieldOption, Params, Preset, PRESETS, SCRIPT_PRESET, defaultParams, findPreset, scriptErrors } from './presets';
import { Batch, OrderId, ORDER_OPTIONS, Plan, buildPlan, batchFromPlan, executeRenames, invertEntries } from './plan';
import { AppSettings } from './settings';
import { COLOR_VARS, FAST, fluent, Icons, toneColor } from './theme';
import {
    Button,
    Chip,
    ComboBox,
    Divider,
    EmptyState,
    FieldRow,
    InfoBar,
    NumberBox,
    SectionLabel,
    Text,
    TextArea,
    TextField,
    ToggleSwitch,
    iconElement,
    useHoverActive
} from './ui';

export const WINDOW_WIDTH = 1040;
export const WINDOW_HEIGHT = 700;

const PREVIEW_LIMIT = 200;

// 单选时的快捷方式: 直接改完整文件名, 比先选预设再填参数少走两步。
const MANUAL_PRESET: Preset = {
    id: 'manual',
    icon: Icons.rename,
    title: t('手动改名', 'Manual rename'),
    description: t('直接编辑完整文件名', 'Edit the full file name'),
    extMode: 'ignore',
    defaults: { name: '' },
    fields: [
        {
            kind: 'text',
            key: 'name',
            label: t('新名称', 'New name'),
            width: 320,
            hint: t('改名结果会立刻显示在右侧', 'The preview updates as you type')
        }
    ],
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

type DisplayStatus = 'changed' | 'same' | 'error' | 'applied' | 'failed';

type DisplayRow = {
    key: string;
    index: number;
    oldName: string;
    newName: string;
    status: DisplayStatus;
    reason?: string;
};

const statusIcon = (status: DisplayStatus, c: ReturnType<typeof fluent>) => {
    if (status === 'error' || status === 'failed') return iconElement(Icons.close, 13, toneColor('danger', c).fg);
    if (status === 'same') return iconElement(Icons.skip, 13, c.textTertiary);
    if (status === 'applied') return iconElement(Icons.checkCircle, 13, toneColor('success', c).fg);
    return iconElement(Icons.check, 13, c.accent);
};

const PreviewRow = memo(
    ({ row, c, width }: { row: DisplayRow; c: ReturnType<typeof fluent>; width: number }) => {
        const hover = useHoverActive();
        const bad = row.status === 'error' || row.status === 'failed';
        const dim = row.status === 'same';
        return (
            <flex
                gap={1}
                padding={7}
                borderRadius={6}
                alignItems="stretch"
                backgroundColor={hover.isHovered ? c.cardHover : c.transparent}
                onMouseEnter={hover.onMouseEnter}
                onMouseLeave={hover.onMouseLeave}
                animatedVars={COLOR_VARS}
                animationCurve={{ ...FAST, vars: COLOR_VARS }}
            >
                <flex horizontal alignItems="center" gap={8}>
                    <flex width={22} justifyContent="end">
                        <Text fontSize={11} color={c.textTertiary} fontFamily="monospace">
                            {row.index + 1}
                        </Text>
                    </flex>
                    <flex flexGrow={1} flexShrink={1} cropOverflow>
                        <DiffText
                            oldName={row.oldName}
                            newName={row.newName}
                            part="old"
                            c={c}
                            fontSize={12}
                            maxWidth={width - 60}
                        />
                    </flex>
                    {statusIcon(row.status, c)}
                </flex>
                <flex horizontal alignItems="center" gap={8} paddingTop={2}>
                    <flex width={22} />
                    {iconElement(Icons.arrow, 12, bad ? toneColor('danger', c).fg : dim ? c.textTertiary : c.accent)}
                    <flex flexGrow={1} flexShrink={1} cropOverflow>
                        {bad ? (
                            <Text fontSize={12} color={toneColor('danger', c).fg} maxWidth={width - 60}>
                                {row.reason ?? t('无法重命名', 'Cannot rename')}
                            </Text>
                        ) : dim ? (
                            <Text fontSize={12} color={c.textTertiary} maxWidth={width - 60}>
                                {t('名称没有变化', 'Name unchanged')}
                            </Text>
                        ) : (
                            <DiffText
                                oldName={row.oldName}
                                newName={row.newName}
                                part="new"
                                c={c}
                                fontSize={12} 
                                maxWidth={width - 60}
                            />
                        )}
                    </flex>
                </flex>
            </flex>
        );
    }
);

const PresetCard = memo(
    ({ preset, selected, onClick }: { preset: Preset; selected: boolean; onClick: () => void }) => {
        const c = fluent();
        const hover = useHoverActive();
        return (
            <flex
                horizontal
                alignItems="center"
                gap={11}
                padding={10}
                borderRadius={6}
                borderWidth={selected ? 1 : 0}
                borderColor={selected ? c.accent : c.transparent}
                backgroundColor={selected ? c.accentSubtle : hover.isHovered ? c.cardHover : c.transparent}
                onClick={onClick}
                onMouseEnter={hover.onMouseEnter}
                onMouseLeave={hover.onMouseLeave}
                animatedVars={COLOR_VARS}
                animationCurve={{ ...FAST, vars: COLOR_VARS }}
            >
                <flex
                    width={30}
                    height={30}
                    borderRadius={7}
                    justifyContent="center"
                    alignItems="center"
                    backgroundColor={selected ? c.accent : c.subtle}
                >
                    {iconElement(preset.icon, 16, selected ? c.accentText : c.textSecondary)}
                </flex>
                <flex gap={2} flexGrow={1} flexShrink={1}>
                    <Text fontSize={13} fontWeight={selected ? 600 : 400} color={c.text} maxWidth={140}>
                        {preset.title}
                    </Text>
                    <Text fontSize={11} color={c.textTertiary} maxWidth={140}>
                        {preset.description}
                    </Text>
                </flex>
            </flex>
        );
    }
);

export type { FieldOption };

// breeze-ui 没有换行, 按字符宽度手工折行, 否则一排 chip 会被面板裁掉。
export const layoutChips = (options: FieldOption[], maxWidth = 400): FieldOption[][] => {
    const rows: FieldOption[][] = [];
    let row: FieldOption[] = [];
    let width = 0;
    for (const option of options) {
        const estimated =
            26 + Array.from(option.label).reduce((sum, char) => sum + (char.charCodeAt(0) > 0x2e80 ? 13 : 7), 0);
        if (row.length > 0 && width + estimated > maxWidth) {
            rows.push(row);
            row = [];
            width = 0;
        }
        row.push(option);
        width += estimated;
    }
    if (row.length > 0) rows.push(row);
    return rows;
};

const ParamsPanel = ({
    preset,
    params,
    onChange,
    c
}: {
    preset: Preset;
    params: Params;
    onChange: (key: string, value: string | number | boolean) => void;
    c: ReturnType<typeof fluent>;
}) => {
    const fields = preset.fields.filter(field => !field.showIf || field.showIf(params));
    const set = (key: string, value: string | number | boolean) => onChange(key, value);
    return (
        <flex gap={2} alignItems="stretch">
            {fields.map((field, index) => {
                if (field.kind === 'chips') {
                    return (
                        <FieldRow key={`${field.kind}-${index}`} label={field.label} stacked>
                            <flex gap={6} alignItems="stretch">
                                {layoutChips(field.options ?? []).map(row => (
                                    <flex key={row[0].value} horizontal gap={6} alignItems="center">
                                        {row.map(option => (
                                            <Chip
                                                key={option.label}
                                                label={option.label}
                                                onClick={() => {
                                                    if (field.onPick) {
                                                        const next = field.onPick(params, option.value);
                                                        for (const key of Object.keys(next)) {
                                                            if (next[key] !== params[key]) set(key, next[key]);
                                                        }
                                                    } else {
                                                        set(field.key, option.value);
                                                    }
                                                }}
                                            />
                                        ))}
                                    </flex>
                                ))}
                            </flex>
                        </FieldRow>
                    );
                }
                if (field.kind === 'textarea') {
                    return (
                        <FieldRow key={`${field.kind}-${index}`} label={field.label} hint={field.hint} stacked>
                            <TextArea
                                value={String(params[field.key] ?? '')}
                                onChange={value => set(field.key, value)}
                                placeholder={field.placeholder}
                                height={field.height}
                            />
                        </FieldRow>
                    );
                }
                if (field.kind === 'toggle') {
                    return (
                        <FieldRow key={`${field.kind}-${index}`} label={field.label}>
                            <ToggleSwitch value={params[field.key] === true} onChange={value => set(field.key, value)} />
                        </FieldRow>
                    );
                }
                if (field.kind === 'number') {
                    return (
                        <FieldRow key={`${field.kind}-${index}`} label={field.label} hint={field.hint}>
                            <NumberBox
                                value={Number(params[field.key] ?? 0)}
                                min={field.min ?? 0}
                                max={field.max ?? 9999}
                                step={field.step ?? 1}
                                width={field.width ?? 84}
                                suffix={field.suffix}
                                onChange={value => set(field.key, value)}
                            />
                        </FieldRow>
                    );
                }
                if (field.kind === 'select') {
                    return (
                        <FieldRow key={`${field.kind}-${index}`} label={field.label} hint={field.hint}>
                            <ComboBox
                                value={String(params[field.key] ?? '')}
                                options={field.options ?? []}
                                onChange={value => set(field.key, value)}
                                width={field.width ?? 170}
                            />
                        </FieldRow>
                    );
                }
                return (
                    <FieldRow key={`${field.kind}-${index}`} label={field.label} hint={field.hint}>
                        <TextField
                            value={String(params[field.key] ?? '')}
                            onChange={value => set(field.key, value)}
                            placeholder={field.placeholder}
                            width={field.width ?? 180}
                            mono={field.mono}
                        />
                    </FieldRow>
                );
            })}
            {preset.id === 'script' && <ScriptHelp c={c} />}
        </flex>
    );
};

const ScriptHelp = ({ c }: { c: ReturnType<typeof fluent> }) => (
    <flex gap={6} padding={10} borderRadius={6} backgroundColor={c.codeBg} alignItems="stretch">
        <Text fontSize={12} fontWeight={600} color={c.textSecondary}>
            {t('可用变量', 'Available variables')}
        </Text>
        <Text fontSize={11}  color={c.textSecondary} fontFamily="monospace" maxWidth={430}>
            name base ext path dir isDir size mtime i index total
        </Text>
        <Text fontSize={11}  color={c.textSecondary} fontFamily="monospace" maxWidth={430}>
            pad(n,d) lower(s) upper(s) slug(s) date(fmt) now(fmt) humanSize(n)
        </Text>
        <Text fontSize={11} color={c.textTertiary} maxWidth={430}>
            {t(
                '最后 return 新的文件名（含扩展名）；返回 null 表示跳过该项。脚本在界面线程运行，避免死循环。',
                'Return the new file name (with extension); return null to skip. The script runs on the UI thread, so avoid infinite loops.'
            )}
        </Text>
    </flex>
);

const StatPill = ({ label, value, tone, c }: { label: string; value: number; tone: 'accent' | 'success' | 'warning' | 'danger' | 'neutral'; c: ReturnType<typeof fluent> }) => {
    const style = toneColor(tone, c);
    return (
        <flex horizontal alignItems="center" gap={6} paddingLeft={8} paddingRight={9} height={24} borderRadius={12} backgroundColor={style.bg}>
            <Text fontSize={11} color={style.fg} fontWeight={600}>
                {String(value)}
            </Text>
            <Text fontSize={11}  color={tone === 'neutral' ? c.textSecondary : style.fg}>
                {label}
            </Text>
        </flex>
    );
};

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
    latestSettings.current = {
        keepExt,
        order,
        lastPreset: presetId,
        params: savableParams(paramsMap)
    };

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
                setItemList(prev =>
                    prev.map(item => (map[item.path] ? { ...item, mtime: map[item.path] } : item))
                );
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
            status: row.status === 'changed' ? 'changed' : row.status === 'same' ? 'same' : 'error',
            reason: row.reason
        }));
    }, [plan, applied]);

    const apply = () => {
        if (!plan.canApply || applying) return;
        setApplying(true);
        const nextBatch = batchFromPlan(plan);
        const result = executeRenames(nextBatch.entries);
        const doneSet = new Set(result.done.map(entry => entry.from));
        const appliedEntries = nextBatch.entries.filter(entry => doneSet.has(entry.from));
        const byFrom = new Map(appliedEntries.map(entry => [entry.from, entry]));
        const nextItems = itemList.map(item => {
            const entry = byFrom.get(item.path);
            if (!entry) return item;
            const name = entry.toName;
            const dot = item.isDir ? -1 : name.lastIndexOf('.');
            return {
                ...item,
                path: entry.to,
                name,
                base: dot <= 0 ? name : name.slice(0, dot),
                ext: dot <= 0 ? '' : name.slice(dot)
            };
        });

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
        setItemList(nextItems);
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
                const name = entry.fromName;
                const dot = item.isDir ? -1 : name.lastIndexOf('.');
                return {
                    ...item,
                    path: entry.from,
                    name,
                    base: dot <= 0 ? name : name.slice(0, dot),
                    ext: dot <= 0 ? '' : name.slice(dot)
                };
            })
        );
        setBatch(null);
        setApplied(null);
        setFailure(
            result.failed.length > 0
                ? t(`撤销时有 ${result.failed.length} 项失败`, `${result.failed.length} items failed to revert`)
                : null
        );
        onSettings({
            keepExt,
            order,
            lastPreset: presetId,
            params: savableParams(paramsMap),
            lastBatch: null
        });
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
        itemList.length === 0
            ? t('没有选中任何项目', 'No items selected')
            : itemList.length === 1
              ? t(`已选中：${itemList[0].name}`, `Selected: ${itemList[0].name}`)
              : t(
                    `已选中 ${itemList.length} 个项目（${fileCount} 个文件${dirCount > 0 ? `、${dirCount} 个文件夹` : ''}）`,
                    `${itemList.length} items selected (${fileCount} files${dirCount > 0 ? `, ${dirCount} folders` : ''})`
                );

    const scriptError = preset.id === 'script' ? scriptErrors(String(params.code ?? '')) : null;
    const blockedByScript = scriptError !== null && params.onError === 'block';
    const errorCount = plan.errors.length;
    const canApply = plan.canApply && !blockedByScript && !applying;

    const previewHeader = applied
        ? { tone: 'success' as const, text: t(`已重命名 ${applied.entries.length} 项`, `${applied.entries.length} renamed`) }
        : errorCount > 0
          ? { tone: 'warning' as const, text: t(`${errorCount} 项将被跳过`, `${errorCount} will be skipped`) }
          : plan.canApply
            ? { tone: 'accent' as const, text: t(`${plan.changed.length} 项将重命名`, `${plan.changed.length} to rename`) }
            : { tone: 'neutral' as const, text: t('没有需要重命名的项目', 'Nothing to rename') };

    if (itemList.length === 0) {
        return (
            <flex
                width={WINDOW_WIDTH}
                height={WINDOW_HEIGHT}
                gap={14}
                padding={18}
                alignItems="stretch"
                backgroundColor={c.light ? '#F3F3F3FF' : '#202020FF'}
            >
                <flex horizontal alignItems="center" gap={14}>
                    <flex width={40} height={40} borderRadius={9} backgroundColor={c.accent} justifyContent="center" alignItems="center">
                        {iconElement(Icons.rename, 21, c.accentText)}
                    </flex>
                    <flex gap={2} flexGrow={1}>
                        <Text fontSize={20} fontWeight={600} color={c.text}>
                            {t('重命名 Plus', 'Rename Plus')}
                        </Text>
                        <Text fontSize={12} color={c.textSecondary}>
                            {t('还没有选择文件', 'No files selected yet')}
                        </Text>
                    </flex>
                    <Button icon={Icons.close} variant="subtle" onClick={onClose} />
                </flex>
                <flex
                    flexGrow={1}
                    borderRadius={8}
                    borderWidth={1}
                    borderColor={c.cardStroke}
                    backgroundColor={c.card}
                    alignItems="stretch"
                >
                    <EmptyState
                        icon={Icons.rename}
                        title={t('没有待重命名的项目', 'Nothing to rename')}
                        message={t(
                            '在资源管理器中选中文件或文件夹，右键选择「重命名 Plus」，就能在这里批量改名。',
                            'Select files or folders in Explorer, right-click and choose "Rename Plus" to rename them here.'
                        )}
                    >
                        <flex gap={10} paddingTop={8} alignItems="stretch">
                            {[
                                t('1. 选中 1 个或多个项目', '1. Select one or more items'),
                                t('2. 右键 → 重命名 Plus', '2. Right-click → Rename Plus'),
                                t('3. 选预设或写脚本，右侧看预览', '3. Pick a preset or write a script, preview on the right'),
                                t('4. 点应用，随时可以撤销', '4. Apply, and undo any time')
                            ].map(line => (
                                <Text key={line} fontSize={12} color={c.textSecondary}>
                                    {line}
                                </Text>
                            ))}
                        </flex>
                    </EmptyState>
                </flex>
                <flex horizontal alignItems="center" justifyContent="end">
                    <Button label={t('关闭', 'Close')} onClick={onClose} />
                </flex>
            </flex>
        );
    }

    return (
        <flex
            width={WINDOW_WIDTH}
            height={WINDOW_HEIGHT}
            gap={14}
            padding={18}
            alignItems="stretch"
            backgroundColor={c.light ? '#F3F3F3FF' : '#202020FF'}
        >
            <flex horizontal alignItems="center" gap={14}>
                <flex width={40} height={40} borderRadius={9} backgroundColor={c.accent} justifyContent="center" alignItems="center">
                    {iconElement(Icons.rename, 21, c.accentText)}
                </flex>
                <flex gap={2} flexGrow={1} flexShrink={1}>
                    <Text fontSize={20} fontWeight={600} color={c.text}>
                        {t('重命名 Plus', 'Rename Plus')}
                    </Text>
                    <Text fontSize={12} color={c.textSecondary} maxWidth={600}>
                        {subtitle}
                    </Text>
                </flex>
                {batch && (
                    <Button
                        icon={Icons.undo}
                        label={t('撤销上次', 'Undo last')}
                        variant="standard"
                        onClick={undo}
                    />
                )}
                <Button icon={Icons.close} variant="subtle" onClick={onClose} />
            </flex>

            <flex horizontal alignItems="center" gap={14} paddingLeft={2} paddingRight={2}>
                <flex width={200}>
                    <ToggleSwitch value={keepExt} onChange={value => setKeepExt(value)} label={t('保留扩展名', 'Keep extension')} />
                </flex>
                <Divider vertical />
                <flex horizontal alignItems="center" gap={8}>
                    {iconElement(Icons.sort, 14, c.textSecondary)}
                    <Text fontSize={12} color={c.textSecondary}>
                        {t('重命名顺序', 'Order')}
                    </Text>
                    <ComboBox value={order} options={ORDER_OPTIONS} onChange={value => setOrder(value as OrderId)} width={150} />
                </flex>
                <spacer />
                <Button icon={Icons.reset} label={t('恢复默认参数', 'Reset options')} variant="subtle" onClick={resetParams} />
            </flex>

            <flex horizontal gap={14} flexGrow={1} alignItems="stretch">
                <flex width={216} gap={2} enableScrolling alignItems="stretch">
                    {itemList.length === 1 && (
                        <>
                            <SectionLabel text={t('单个项目', 'Single item')} c={c} />
                            <PresetCard
                                preset={MANUAL_PRESET}
                                selected={MANUAL_PRESET.id === presetId}
                                onClick={() => setPresetId(MANUAL_PRESET.id)}
                            />
                            <flex paddingTop={8} paddingBottom={4}>
                                <Divider />
                            </flex>
                        </>
                    )}
                    <SectionLabel text={t('常用预设', 'Presets')} c={c} />
                    {PRESETS.map(item => (
                        <PresetCard
                            key={item.id}
                            preset={item}
                            selected={item.id === presetId}
                            onClick={() => setPresetId(item.id)}
                        />
                    ))}
                    <flex paddingTop={8} paddingBottom={4}>
                        <Divider />
                    </flex>
                    <SectionLabel text={t('高级', 'Advanced')} c={c} />
                    <PresetCard
                        preset={SCRIPT_PRESET}
                        selected={SCRIPT_PRESET.id === presetId}
                        onClick={() => setPresetId(SCRIPT_PRESET.id)}
                    />
                </flex>

                <flex
                    flexGrow={1}
                    flexShrink={1}
                    gap={10}
                    padding={14}
                    borderRadius={8}
                    borderWidth={1}
                    borderColor={c.cardStroke}
                    backgroundColor={c.card}
                    alignItems="stretch"
                    enableScrolling
                    enableChildClipping
                >
                    <flex gap={2}>
                        <Text fontSize={15} fontWeight={600} color={c.text}>
                            {preset.title}
                        </Text>
                        <Text fontSize={12} color={c.textSecondary} maxWidth={330}>
                            {preset.description}
                        </Text>
                    </flex>
                    <Divider />
                    <ParamsPanel preset={preset} params={params} onChange={setParam} c={c} />
                    {scriptError && (
                        <InfoBar
                            severity="danger"
                            title={t('脚本无法编译', 'Script cannot be compiled')}
                            message={scriptError}
                            maxTextWidth={330}
                        />
                    )}
                    {needsDates && !datesLoading && itemList.some(item => !item.mtime) && (
                        <InfoBar
                            severity="warning"
                            title={t('部分项目没有文件修改时间', 'Some items have no modified time')}
                            message={t('这些项目会退回使用当前时间。', 'Those items fall back to the current time.')}
                            maxTextWidth={330}
                        />
                    )}
                    {datesLoading && (
                        <InfoBar severity="info" title={t('正在读取文件修改时间…', 'Reading modified times...')} maxTextWidth={330} />
                    )}
                </flex>

                <flex width={392} gap={8} padding={12} borderRadius={8} borderWidth={1} borderColor={c.cardStroke} backgroundColor={c.card} alignItems="stretch">
                    <flex horizontal alignItems="center" gap={6}>
                        <StatPill label={t('项将重命名', 'to rename')} value={plan.changed.length} tone="accent" c={c} />
                        {plan.sameCount > 0 && <StatPill label={t('项无变化', 'unchanged')} value={plan.sameCount} tone="neutral" c={c} />}
                        {errorCount > 0 && <StatPill label={t('项有问题', 'with issues')} value={errorCount} tone="danger" c={c} />}
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
                        <flex gap={1} enableScrolling flexGrow={1} enableChildClipping cropOverflow alignItems="stretch">
                            {displayRows.map(row => (
                                <PreviewRow key={row.key} row={row} c={c} width={360} />
                            ))}
                            {!applied && plan.rows.length > PREVIEW_LIMIT && (
                                <flex padding={8} justifyContent="center">
                                    <Text fontSize={11} color={c.textTertiary}>
                                        {t(
                                            `仅显示前 ${PREVIEW_LIMIT} 项，共 ${plan.rows.length} 项`,
                                            `Showing first ${PREVIEW_LIMIT} of ${plan.rows.length}`
                                        )}
                                    </Text>
                                </flex>
                            )}
                        </flex>
                    )}
                </flex>
            </flex>

            <flex horizontal alignItems="center" gap={12}>
                <flex flexGrow={1} flexShrink={1}>
                    {failure ? (
                        <InfoBar severity="danger" title={failure} maxTextWidth={430} />
                    ) : applied ? (
                        <InfoBar
                            severity="success"
                            title={t(`已重命名 ${applied.entries.length} 项`, `Renamed ${applied.entries.length} items`)}
                            message={t('可以撤销，或换个预设继续重命名。', 'Undo it, or keep renaming with another preset.')}
                            maxTextWidth={430}
                        >
                            <flex horizontal gap={8} paddingTop={6}>
                                <Button icon={Icons.undo} label={t('撤销', 'Undo')} onClick={undo} />
                                <Button
                                    icon={Icons.refresh}
                                    label={t('继续重命名', 'Continue')}
                                    variant="subtle"
                                    onClick={() => {
                                        setApplied(null);
                                        setBatch(null);
                                    }}
                                />
                            </flex>
                        </InfoBar>
                    ) : scriptError ? (
                        <InfoBar severity="danger" title={t('脚本有语法错误，无法应用', 'Fix the script before applying')} maxTextWidth={430} />
                    ) : errorCount > 0 ? (
                        <InfoBar
                            severity="warning"
                            title={t(`${errorCount} 项有冲突或非法名称，将被跳过`, `${errorCount} items will be skipped`)}
                            message={plan.errors[0]?.reason}
                            maxTextWidth={430}
                        />
                    ) : plan.unchecked ? (
                        <InfoBar
                            severity="info"
                            title={t('项目较多，已跳过重名检查', 'Too many items, duplicate check skipped')}
                            maxTextWidth={430}
                        />
                    ) : (
                        <Text fontSize={12} color={c.textSecondary}>
                            {previewHeader.text}
                        </Text>
                    )}
                </flex>
                <Button label={t('取消', 'Cancel')} variant="standard" onClick={onClose} />
                <Button
                    label={
                        applying
                            ? t('处理中…', 'Working...')
                            : plan.changed.length > 0
                              ? t(`应用（${plan.changed.length} 项）`, `Apply (${plan.changed.length})`)
                              : t('应用', 'Apply')
                    }
                    variant="accent"
                    disabled={!canApply}
                    minWidth={138}
                    onClick={apply}
                />
            </flex>
        </flex>
    );
};

export default RenameApp;

const DiffText = memo(
    ({
        oldName,
        newName,
        part,
        c,
        fontSize,
        maxWidth
    }: {
        oldName: string;
        newName: string;
        part: 'old' | 'new';
        c: ReturnType<typeof fluent>;
        fontSize: number;
        maxWidth: number;
    }) => {
        const segments = diffNames(oldName, newName).filter(segment =>
            part === 'old' ? segment.kind !== 'add' : segment.kind !== 'del'
        );
        return (
            <flex horizontal alignItems="center">
                {segments.map((segment, index) => {
                    if (part === 'old' && segment.kind === 'del') {
                        return (
                            <Text key={index} fontSize={fontSize} color={toneColor('danger', c).fg} maxWidth={maxWidth}>
                                {segment.text}
                            </Text>
                        );
                    }
                    if (part === 'new' && segment.kind === 'add') {
                        return (
                            <flex
                                key={index}
                                horizontal
                                backgroundColor={c.accentSubtle}
                                borderRadius={3}
                                paddingLeft={2}
                                paddingRight={2}
                            >
                                <Text fontSize={fontSize} fontWeight={600} color={c.accent} maxWidth={maxWidth}>
                                    {segment.text}
                                </Text>
                            </flex>
                        );
                    }
                    return (
                        <Text key={index} fontSize={fontSize} color={part === 'old' ? c.textSecondary : c.text} maxWidth={maxWidth}>
                            {segment.text}
                        </Text>
                    );
                })}
            </flex>
        );
    }
);
