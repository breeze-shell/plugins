import * as shell from 'mshell';
import { IconSpec, MenuKind, Node, Profile, Settings, Snapshot } from './types';
import { MENU_KINDS } from './types';
import { t } from './i18n';
import {
    clampIndex,
    countItems,
    duplicateNode,
    flatten,
    groupNode,
    insertNode,
    itemNode,
    locate,
    moveNode,
    nodesOf,
    reidentify,
    removeNode,
    sepNode,
    unwrapGroup,
    updateNode,
    wrapInGroup
} from './model';
import { CanvasRow, PlanWarningKind, adoptUnmanaged, analysePlan, buildCanvas } from './plan';
import { History, emptyHistory, recordHistory, redoHistory, undoHistory } from './history';
import { ShortcutAction, shortcutFor, stepIndex } from './shortcuts';
import { COLOR_VARS, FAST, Icons, fluent, toneColor } from './theme';
import {
    Badge,
    Button,
    Card,
    Chip,
    Divider,
    EmptyState,
    FieldRow,
    InfoBar,
    SegmentedControl,
    SectionLabel,
    Text,
    TextArea,
    TextField,
    ToggleSwitch,
    iconElement,
    isTyping,
    useHoverActive
} from './ui';
import { Fragment, ReactNode, memo, useCallback, useEffect, useMemo, useRef, useState } from './react';

export const WINDOW_WIDTH = 1240;
export const WINDOW_HEIGHT = 780;
const RAIL_WIDTH = 232;
const INSPECTOR_WIDTH = 304;
const CANVAS_WIDTH = WINDOW_WIDTH - RAIL_WIDTH - INSPECTOR_WIDTH;
const ROW_HEIGHT = 32;

const ICON_PALETTE = [
    'star', 'pin', 'file', 'folder', 'folderOpen', 'link', 'command', 'shield', 'search', 'settings',
    'copy', 'trash', 'eye', 'palette', 'sparkle', 'list', 'layers', 'grid', 'window', 'desktop',
    'taskbar', 'save', 'check', 'info', 'warning', 'ban', 'arrowUp', 'arrowDown', 'importFile',
    'exportFile', 'reset', 'refresh', 'pencil', 'plus', 'close', 'more', 'text', 'sliders'
];

const KIND_META: Record<MenuKind, { icon: string; label: string; hint: string }> = {
    files: { icon: 'file', label: t('选中文件', 'Selected files'), hint: t('资源管理器里选中一个或多个文件时', 'When files are selected in Explorer') },
    folder: { icon: 'folderOpen', label: t('文件夹空白处', 'Folder background'), hint: t('在文件夹空白处右键时', 'Right-click on empty area of a folder') },
    desktop: { icon: 'desktop', label: t('桌面', 'Desktop'), hint: t('桌面图标或桌面空白处', 'Desktop icons or desktop background') },
    taskbar: { icon: 'taskbar', label: t('任务栏', 'Taskbar'), hint: t('任务栏按钮与任务栏空白处', 'Taskbar buttons and empty area') },
    other: { icon: 'window', label: t('其他程序', 'Other apps'), hint: t('不属于上面几类的窗口菜单', 'Menus of windows that match none of the above') }
};

const IDLE_HINT = t('拖动行可以排序；拖到分组标题上放进分组；行右侧的按钮可以改名和隐藏', 'Drag rows to reorder, onto a group title to nest; the row buttons rename and hide');

const HEADER_HEIGHT = 54;
const STATUS_HEIGHT = 28;
const ACTION_ROW_HEIGHT = 32;
const ACTION_GAP = 5;
const ACTION_PAD = 8;

// 宿主的 flexShrink 压不动滚动容器, 表单区高度只能按操作条行数自己算
const actionBarHeight = (rows: number) => ACTION_PAD * 2 + rows * ACTION_ROW_HEIGHT + (rows - 1) * ACTION_GAP;
const formMaxHeight = (rows: number) => WINDOW_HEIGHT - HEADER_HEIGHT - STATUS_HEIGHT - 1 - actionBarHeight(rows);

const WARNING_TEXT: Record<PlanWarningKind, string> = {
    'empty-group': t('空分组不会出现在菜单里', 'Empty group never shows'),
    'unknown-ref': t('匹配不到原生项，不会出现', 'No matching native item'),
    'ignored-in-row': t('横排里放不下分组，会被忽略', 'A group in a row is ignored'),
    'dead-separator': t('这里的分隔线会被省略', 'This separator is dropped')
};

type DropTarget = { parentId: string | null; index: number; slot: number; mode: 'before' | 'after' | 'inside' };
type DragState = { sourceKey: string; label: string };
type ArmState = { sourceKey: string; label: string; moves: number; row: string | null };

const DOUBLE_CLICK_MS = 400;

const clockText = (at: number): string => {
    if (!at) return '-';
    const date = new Date(at);
    const pad = (value: number) => String(value).padStart(2, '0');
    return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
};

const nodeLabel = (node: Node, fallback: string): string => {
    if (node.kind === 'group') return node.label;
    if (node.kind === 'sep') return t('分隔线', 'Separator');
    return node.label ?? node.ref?.name ?? fallback;
};

const withIcon = (node: Node, icon: IconSpec): Node => (node.kind === 'sep' ? node : { ...node, icon });
const toggledHidden = (node: Node): Node => (node.kind === 'sep' ? node : { ...node, hidden: !node.hidden });
const orderKey = (nodes: Node[]): string => flatten(nodes).map(entry => entry.node.id).join('|');

const nodeGlyph = (row: CanvasRow, color: string, size: number) => {
    const { node } = row;
    if (node.kind === 'group') {
        const icon = node.layout === 'row' ? Icons.rowStack : node.icon.source === 'svg' ? node.icon.svg : Icons.folder;
        return iconElement(icon, size, color);
    }
    if (node.kind === 'sep') return iconElement(Icons.separator, size, color);
    if (node.icon.source === 'svg') return iconElement(node.icon.svg, size, color);
    if (node.icon.source === 'none') return <spacer size={0} />;
    if (node.ref?.hasSubmenu) return iconElement(Icons.layers, size, color);
    return iconElement(Icons.file, size, color);
};

export type EditorProps = {
    settings: Settings;
    initialKind: MenuKind;
    status: string;
    onProfile: (kind: MenuKind, profile: Profile) => void;
    subscribe: (listener: (next: Settings) => void) => () => void;
    onClose: () => void;
};

export const ContextMenuEditor = memo((props: EditorProps) => {
    const c = useMemo(() => fluent(), []);
    const [kind, setKind] = useState<MenuKind>(props.initialKind);
    const [settings, setSettings] = useState<Settings>(props.settings);
    const [selected, setSelected] = useState<string | null>(null);
    const [expanded, setExpanded] = useState<string[]>([]);
    const [drag, setDrag] = useState<DragState | null>(null);
    const [drop, setDrop] = useState<DropTarget | null>(null);
    const [status, setStatus] = useState(props.status || IDLE_HINT);
    const [history, setHistory] = useState<History>(emptyHistory);
    const [customSvg, setCustomSvg] = useState('');
    const [editing, setEditing] = useState<{ key: string; value: string } | null>(null);

    const dropRef = useRef<DropTarget | null>(null);
    const offerTakenRef = useRef(false);
    const offerTimerRef = useRef<number | null>(null);
    const armRef = useRef<ArmState | null>(null);
    const claimRef = useRef<string | null>(null);
    const claimTimer = useRef<number | null>(null);
    const dragActiveRef = useRef(false);
    const suppressResetRef = useRef(false);
    const clickRef = useRef<{ key: string; at: number } | null>(null);
    const renamingRef = useRef(false);

    const profile = settings.profiles[kind];
    const snapshot: Snapshot | null = settings.snapshots[kind] ?? null;
    const rows = useMemo(() => buildCanvas(profile, snapshot, expanded), [profile, snapshot, expanded]);
    const selectedRow = selected ? rows.find(row => row.key === selected) ?? null : null;

    const stats = useMemo(
        () => ({
            native: snapshot?.items.filter(item => !item.separator).length ?? 0,
            managed: countItems(profile.nodes),
            virtual: rows.filter(row => row.virtual).length
        }),
        [profile.nodes, rows, snapshot]
    );

    const warnings = useMemo(() => {
        const map = new Map<string, PlanWarningKind>();
        for (const warning of analysePlan(profile, snapshot)) {
            if (!map.has(warning.id)) map.set(warning.id, warning.kind);
        }
        return map;
    }, [profile, snapshot]);

    const commit = useCallback((target: MenuKind, next: Profile, note?: string) => {
        props.onProfile(target, next);
        if (note) setStatus(note);
    }, []);

    // 历史里存整份 Profile: 光存 nodes 的话, 启用开关、未列项策略、进程/标题过滤都撤销不了
    const pushHistory = useCallback(
        (mergeKey?: string) => setHistory(history => recordHistory(history, { kind, profile }, mergeKey ?? null)),
        [kind, profile]
    );

    const mutate = useCallback(
        (nodes: Node[], note?: string, keepSelection = true, mergeKey?: string) => {
            pushHistory(mergeKey);
            if (!keepSelection) setSelected(null);
            commit(kind, { ...profile, nodes, updatedAt: Date.now() }, note);
        },
        [commit, kind, profile, pushHistory]
    );

    const patchProfile = useCallback(
        (patch: Partial<Profile>, note?: string, mergeKey?: string) => {
            pushHistory(mergeKey);
            commit(kind, { ...profile, ...patch, updatedAt: Date.now() }, note);
        },
        [commit, kind, profile, pushHistory]
    );

    useEffect(() => props.subscribe(setSettings), []);

    useEffect(() => {
        // 撤销跨类型恢复时 setKind 是程序触发的, 不能顺手清掉选中与展开状态
        if (suppressResetRef.current) {
            suppressResetRef.current = false;
            return;
        }
        setSelected(null);
        stopEditing();
        setExpanded([]);
    }, [kind]);

    const claim = useCallback((key: string) => {
        claimRef.current = key;
        if (claimTimer.current !== null) shell.infra.clearTimeout(claimTimer.current);
        claimTimer.current = shell.infra.setTimeout(() => {
            claimTimer.current = null;
            claimRef.current = null;
        }, 0);
    }, []);

    const anchorOf = useCallback(
        (row: CanvasRow): { parentId: string | null; index: number } => {
            if (!row.virtual) return { parentId: row.parentId, index: row.index };
            const at = rows.indexOf(row);
            let index = 0;
            for (let i = 0; i < at; i += 1) {
                if (!rows[i].virtual && rows[i].parentId === null) index += 1;
            }
            return { parentId: null, index };
        },
        [rows]
    );

    const editRow = useCallback(
        (row: CanvasRow, patch: (node: Node) => Node, note: string, mergeKey?: string) => {
            if (!row.virtual) {
                mutate(updateNode(profile.nodes, row.node.id, patch), note, true, mergeKey);
                return;
            }
            const anchor = anchorOf(row);
            const node = patch(reidentify(row.node));
            mutate(insertNode(profile.nodes, node, anchor.parentId, anchor.index), note, true, mergeKey);
            setSelected(node.id);
        },
        [anchorOf, mutate, profile.nodes]
    );

    const startRename = useCallback((row: CanvasRow) => {
        if (row.node.kind === 'sep') return;
        setSelected(row.key);
        renamingRef.current = true;
        setEditing({ key: row.key, value: nodeLabel(row.node, '') });
        setStatus(t('点一下输入框就能改名字（Ctrl+A 全选），回车保存，Esc 取消', 'Click the field to type (Ctrl+A selects all), Enter saves, Esc cancels'));
    }, []);

    const asRule = useCallback(
        (row: CanvasRow): { nodes: Node[]; id: string; fresh: boolean } => {
            if (!row.virtual) return { nodes: profile.nodes, id: row.node.id, fresh: false };
            const anchor = anchorOf(row);
            const node = reidentify(row.node);
            return { nodes: insertNode(profile.nodes, node, anchor.parentId, anchor.index), id: node.id, fresh: true };
        },
        [anchorOf, profile.nodes]
    );

    const onRowDown = useCallback(
        (row: CanvasRow): boolean => {
            const at = Date.now();
            const previous = clickRef.current;
            clickRef.current = { key: row.key, at };
            if (!previous || previous.key !== row.key || at - previous.at > DOUBLE_CLICK_MS) return false;
            clickRef.current = null;
            startRename(row);
            return true;
        },
        [startRename]
    );

    const offer = useCallback((target: DropTarget) => {
        if (offerTakenRef.current) return;
        offerTakenRef.current = true;
        if (offerTimerRef.current !== null) shell.infra.clearTimeout(offerTimerRef.current);
        offerTimerRef.current = shell.infra.setTimeout(() => {
            offerTimerRef.current = null;
            offerTakenRef.current = false;
        }, 0);
        dropRef.current = target;
        setDrop(target);
    }, []);

    const arm = useCallback((sourceKey: string, label: string) => {
        armRef.current = { sourceKey, label, moves: 0, row: null };
    }, []);

    const noteArmMove = useCallback(
        (overRow: string) => {
            const state = armRef.current;
            if (!state || dragActiveRef.current) return;
            state.moves += 1;
            const moved = state.row !== null && state.row !== overRow;
            state.row = overRow;
            if (state.moves < 2 && !moved) return;
            dragActiveRef.current = true;
            setDrag({ sourceKey: state.sourceKey, label: state.label });
        },
        []
    );

    const endDrag = useCallback(() => {
        armRef.current = null;
        dragActiveRef.current = false;
        setDrag(null);
        dropRef.current = null;
        setDrop(null);
    }, []);

    const applyDrop = useCallback(
        (target: DropTarget, sourceKey: string) => {
            const source = rows.find(row => row.key === sourceKey);
            if (!source) return;

            if (target.parentId === '__trash') {
                if (source.virtual) return;
                const name = nodeLabel(source.node, '');
                mutate(removeNode(profile.nodes, source.node.id).nodes, t(`已把「${name}」移出规则 · Ctrl+Z 撤销`, `Removed “${name}” from the rules · Ctrl+Z undoes it`), false);
                return;
            }

            const host = target.parentId === null ? null : rows.find(row => row.node.id === target.parentId && !row.virtual);
            if (host && host.node.kind === 'group' && host.node.layout === 'row' && source.node.kind === 'group') {
                setStatus(t('横排里放不下分组：先把它改成「分组」再拖进来', 'A row cannot hold a group: switch the row to 分组 first'));
                return;
            }

            if (target.parentId !== null && target.parentId !== '__trash') {
                const parentId = target.parentId;
                setExpanded(prev => (prev.includes(parentId) ? prev : [...prev, parentId]));
            }

            if (source.virtual) {
                const node = reidentify(source.node);
                mutate(insertNode(profile.nodes, node, target.parentId, target.index), t(`已把「${nodeLabel(source.node, '')}」纳入规则 · Ctrl+Z 撤销`, `Added “${nodeLabel(source.node, '')}” to the rules · Ctrl+Z undoes it`));
                setSelected(node.id);
                return;
            }

            const targetIsSelf = target.parentId === source.parentId && (target.index === source.index || target.index === source.index + 1);
            if (targetIsSelf) return;
            const moved = moveNode(profile.nodes, source.node.id, target.parentId, target.index);
            if (moved === profile.nodes || orderKey(moved) === orderKey(profile.nodes)) return;
            mutate(moved, t(`已移动「${nodeLabel(source.node, '')}」 · Ctrl+Z 撤销`, `Moved “${nodeLabel(source.node, '')}” · Ctrl+Z undoes it`));
            setSelected(source.node.id);
        },
        [mutate, profile.nodes, rows]
    );

    const finishDrag = useCallback(() => {
        const state = armRef.current;
        const target = dropRef.current;
        const active = dragActiveRef.current;
        const dropped = state !== null && active && target !== null;
        if (dropped && state && target) applyDrop(target, state.sourceKey);
        endDrag();
        if (active && !dropped) setStatus(IDLE_HINT);
    }, [applyDrop, endDrag]);

    const addNodes = useCallback(
        (build: () => Node, note: string) => {
            const parentId = selectedRow && selectedRow.node.kind === 'group' ? selectedRow.node.id : null;
            const list = nodesOf(profile.nodes, parentId);
            const node = build();
            mutate(insertNode(profile.nodes, node, parentId, list.length), note);
            setSelected(node.id);
            if (parentId) setExpanded(prev => (prev.includes(parentId) ? prev : [...prev, parentId]));
        },
        [mutate, profile.nodes, selectedRow]
    );

    const stopEditing = useCallback(() => {
        renamingRef.current = false;
        setEditing(null);
    }, []);

    const commitRename = useCallback(() => {
        const state = editing;
        const open = renamingRef.current;
        stopEditing();
        if (!state || !open) return;
        const row = rows.find(entry => entry.key === state.key);
        if (!row) return;
        const value = state.value.trim();
        if (row.node.kind === 'group') {
            editRow(row, node => (node.kind === 'group' ? { ...node, label: value || t('分组', 'Group') } : node), t('已重命名分组', 'Group renamed'));
            return;
        }
        if (row.node.kind === 'item' && !row.node.ref) {
            editRow(row, node => (node.kind === 'item' ? { ...node, label: value || t('新命令', 'New command') } : node), t('已重命名', 'Renamed'));
            return;
        }
        editRow(row, node => (node.kind === 'item' ? { ...node, label: value.length > 0 && value !== node.ref?.name ? value : null } : node), t('已重命名', 'Renamed'));
    }, [editRow, editing, rows, stopEditing]);

    const importAll = useCallback(() => {
        if (!snapshot) return;
        const { nodes, added } = adoptUnmanaged(profile, snapshot);
        if (added === 0) return;
        mutate(nodes, t(`已把 ${added} 项未纳入的原生项收进规则 · Ctrl+Z 撤销`, `Added ${added} native items to the rules · Ctrl+Z undoes it`));
    }, [mutate, profile, snapshot]);

    const travel = useCallback(
        (step: typeof undoHistory, note: string) => {
            const moved = step(history, settings.profiles);
            if (!moved) return;
            setHistory(moved.history);
            if (moved.restore.kind !== kind) {
                suppressResetRef.current = true;
                setKind(moved.restore.kind);
            }
            commit(moved.restore.kind, moved.restore.profile, note);
        },
        [commit, history, kind, settings]
    );

    const undo = useCallback(() => travel(undoHistory, t('已撤销', 'Undone')), [travel]);
    const redo = useCallback(() => travel(redoHistory, t('已重做', 'Redone')), [travel]);

    const toggleExpand = useCallback((id: string) => {
        setExpanded(prev => (prev.includes(id) ? prev.filter(entry => entry !== id) : [...prev, id]));
    }, []);

    const selectRow = useCallback(
        (row: CanvasRow) => {
            setSelected(row.key);
            let parent = row.parentId;
            const opened: string[] = [];
            while (parent) {
                opened.push(parent);
                const found = locate(profile.nodes, parent);
                parent = found && found.parent ? found.parent.id : null;
            }
            const outside = opened.filter(id => !expanded.includes(id));
            if (outside.length > 0) setExpanded(prev => [...prev, ...outside]);
        },
        [expanded, profile.nodes]
    );

    const removeSelected = useCallback(() => {
        if (!selectedRow) return;
        stopEditing();
        const name = nodeLabel(selectedRow.node, t('未命名', 'Unnamed'));
        const base = asRule(selectedRow);
        if (selectedRow.virtual) {
            mutate(updateNode(base.nodes, base.id, toggledHidden), t(`已隐藏「${name}」· Ctrl+Z 撤销`, `Hid “${name}” · Ctrl+Z undoes it`), false);
            setSelected(base.id);
            return;
        }
        mutate(removeNode(base.nodes, base.id).nodes, t(`已删除「${name}」· Ctrl+Z 撤销`, `Deleted “${name}” · Ctrl+Z undoes it`), false);
    }, [asRule, mutate, selectedRow, stopEditing]);

    const duplicateSelected = useCallback(() => {
        if (!selectedRow) return;
        const name = nodeLabel(selectedRow.node, t('未命名', 'Unnamed'));
        const base = asRule(selectedRow);
        const result = duplicateNode(base.nodes, base.id);
        mutate(result.nodes, t(`已复制「${name}」并纳入规则 · Ctrl+Z 撤销`, `Duplicated “${name}” into the rules · Ctrl+Z undoes it`));
        if (result.id) setSelected(result.id);
    }, [asRule, mutate, selectedRow]);

    const moveSelected = useCallback(
        (delta: number) => {
            if (!selectedRow) return;
            const name = nodeLabel(selectedRow.node, t('未命名', 'Unnamed'));
            const base = asRule(selectedRow);
            const found = locate(base.nodes, base.id);
            if (!found) return;
            const parentId = found.parent ? found.parent.id : null;
            // moveNode 的 index 是"摘除之前"的槽位: 往下挪一格要传 index+2
            const slot = delta > 0 ? found.index + delta + 1 : found.index + delta;
            const moved = moveNode(base.nodes, base.id, parentId, clampIndex(slot, found.list.length));
            if (moved === base.nodes || (orderKey(moved) === orderKey(profile.nodes) && !base.fresh)) return;
            mutate(moved, t(`已${delta > 0 ? '下' : '上'}移「${name}」 · Ctrl+Z 撤销`, `Moved “${name}” ${delta > 0 ? 'down' : 'up'} · Ctrl+Z undoes it`));
            setSelected(base.id);
        },
        [asRule, mutate, profile.nodes, selectedRow]
    );

    const moveSelectedTo = useCallback(
        (edge: 'start' | 'end') => {
            if (!selectedRow) return;
            const name = nodeLabel(selectedRow.node, t('未命名', 'Unnamed'));
            const base = asRule(selectedRow);
            const moved = moveNode(base.nodes, base.id, null, edge === 'start' ? 0 : base.nodes.length);
            if (moved === base.nodes || (orderKey(moved) === orderKey(profile.nodes) && !base.fresh)) return;
            const to = edge === 'start' ? t('菜单开头', 'the top of the menu') : t('菜单末尾', 'the end of the menu');
            mutate(moved, t(`已把「${name}」移到${to} · Ctrl+Z 撤销`, `Moved “${name}” to ${to} · Ctrl+Z undoes it`));
            setSelected(base.id);
        },
        [asRule, mutate, profile.nodes, selectedRow]
    );

    const stepSelection = useCallback(
        (delta: number) => {
            if (rows.length === 0) return;
            const at = selected ? rows.findIndex(row => row.key === selected) : -1;
            setSelected(rows[stepIndex(at, delta, rows.length)].key);
        },
        [rows, selected]
    );

    const onKey = useCallback(
        (key: number, shift: boolean, ctrl: boolean, alt: boolean, meta: boolean): boolean => {
            if (isTyping()) return false;
            const action: ShortcutAction | null = shortcutFor(
                key,
                { shift, ctrl, alt, super: meta },
                {
                    hasSelection: selected !== null,
                    editing: editing !== null,
                    canUndo: history.past.length > 0,
                    canRedo: history.future.length > 0,
                    canRemove: selectedRow !== null
                }
            );
            if (!action) return false;
            if (action === 'undo') undo();
            else if (action === 'redo') redo();
            else if (action === 'duplicate') duplicateSelected();
            else if (action === 'remove') removeSelected();
            else if (action === 'moveUp') moveSelected(-1);
            else if (action === 'moveDown') moveSelected(1);
            else if (action === 'selectPrev') stepSelection(-1);
            else if (action === 'selectNext') stepSelection(1);
            else if (action === 'rename' && selectedRow) startRename(selectedRow);
            else if (action === 'deselect') {
                const wasEditing = editing !== null;
                stopEditing();
                if (!wasEditing) setSelected(null);
            }
            return true;
        },
        [duplicateSelected, editing, history, moveSelected, redo, removeSelected, selected, selectedRow, startRename, stepSelection, stopEditing, undo]
    );

    const renderRows = (parentId: string | null, keyPrefix: string): ReactNode[] => {
        const level = rows.filter(row => row.parentId === parentId);
        const out: ReactNode[] = [];
        const lineAt = (slot: number) => drop !== null && drop.mode !== 'inside' && drop.parentId === parentId && drop.slot === slot;
        let realBefore = 0;
        level.forEach((row, position) => {
            const insertBefore = row.virtual ? realBefore : row.index;
            const insertAfter = row.virtual ? realBefore : row.index + 1;
            if (!row.virtual) realBefore = row.index + 1;
            if (lineAt(position)) out.push(<DropLine key={`${keyPrefix}-line-${row.key}`} c={c} />);
            const warningKind = row.virtual ? null : warnings.get(row.node.id) ?? null;
            out.push(
                <RowView
                    key={row.key}
                    c={c}
                    row={row}
                    position={position}
                    insertBefore={insertBefore}
                    insertAfter={insertAfter}
                    selected={selected === row.key}
                    dragging={drag?.sourceKey === row.key}
                    insideHint={drop?.mode === 'inside' && drop.parentId === row.node.id && row.node.kind === 'group'}
                    expanded={row.node.kind === 'group' && expanded.includes(row.node.id)}
                    active={drag !== null}
                    editing={editing && editing.key === row.key ? editing.value : null}
                    warning={warningKind ? WARNING_TEXT[warningKind] : null}
                    onEditValue={value => setEditing(prev => (prev ? { ...prev, value } : prev))}
                    onCommitEdit={commitRename}
                    onCancelEdit={stopEditing}
                    onSelect={row => selectRow(row)}
                    onRowDown={onRowDown}
                    onArm={arm}
                    onMove={noteArmMove}
                    onUp={finishDrag}
                    offer={offer}
                    claim={claim}
                    isClaimed={() => claimRef.current !== null}
                    onToggleExpand={toggleExpand}
                    onToggleHidden={target => {
                        const name = nodeLabel(target.node, t('未命名', 'Unnamed'));
                        const wasHidden = target.node.kind !== 'sep' && target.node.hidden;
                        return editRow(
                            target,
                            toggledHidden,
                            wasHidden
                                ? t(`已取消隐藏「${name}」· Ctrl+Z 撤销`, `Showed “${name}” again · Ctrl+Z undoes it`)
                                : t(`已隐藏「${name}」· Ctrl+Z 撤销`, `Hid “${name}” · Ctrl+Z undoes it`)
                        );
                    }}
                    onRename={startRename}
                />
            );
            if (row.node.kind === 'group' && expanded.includes(row.node.id)) {
                out.push(
                    <flex key={`${row.key}-body`} horizontal={false} alignItems="stretch" paddingLeft={22} gap={2}>
                        <flex horizontal={false} alignItems="stretch" padding={5} gap={2} borderRadius={6} borderColor={c.divider} borderWidth={1} backgroundColor={c.subtle}>
                            {renderRows(row.node.id, `${keyPrefix}-${row.key}`)}
                            <GroupTail c={c} groupId={row.node.id} index={row.node.children.length} offer={offer} active={drag !== null} />
                        </flex>
                    </flex>
                );
            }
        });
        if (level.length > 0 && lineAt(level.length)) out.push(<DropLine key={`${keyPrefix}-line-end`} c={c} />);
        return out;
    };

    return (
        <flex horizontal={false} width={WINDOW_WIDTH} height={WINDOW_HEIGHT} backgroundColor={c.windowBg} alignItems="stretch" onKeyDown={onKey}>
            <Header
                c={c}
                kind={kind}
                profile={profile}
                stats={stats}
                onToggleEnabled={() => patchProfile({ enabled: !profile.enabled }, profile.enabled ? t('已停用该类型', 'Rules disabled') : t('已启用该类型', 'Rules enabled'))}
                onClose={props.onClose}
            />

            <flex horizontal={true} flexGrow={1} alignItems="stretch">
                <Rail c={c} kind={kind} settings={settings} onSelect={setKind} />

                <flex width={CANVAS_WIDTH} horizontal={false} alignItems="stretch" padding={12} gap={8} backgroundColor={c.canvasBg}>
                    <CanvasToolbar
                        c={c}
                        canUndo={history.past.length > 0}
                        canRedo={history.future.length > 0}
                        onUndo={undo}
                        onRedo={redo}
                        onAddGroup={layout => addNodes(() => groupNode(layout, layout === 'row' ? t('横排', 'Row') : t('分组', 'Group')), t('已新建分组', 'Group created'))}
                        onAddSep={() => addNodes(() => sepNode(), t('已添加分隔线', 'Separator added'))}
                        onAddCommand={() => addNodes(() => itemNode(null, t('新命令', 'New command'), { type: 'open', path: '', args: '' }), t('已添加命令', 'Command added'))}
                        onImport={importAll}
                        hasSnapshot={snapshot !== null}
                        virtualCount={stats.virtual}
                    />

                    {!profile.enabled && profile.nodes.length > 0 ? (
                        <InfoBar
                            c={c}
                            severity="warning"
                            title={t('这条规则还没启用，真实菜单不会有变化', 'These rules are off, the real menu stays unchanged')}
                            message={t('点右上角的「规则已停用」开关把它打开。', 'Turn on the switch in the top-right corner.')}
                        />
                    ) : null}

                    {snapshot === null ? (
                        <Card c={c} flexGrow={1}>
                            <EmptyState
                                c={c}
                                icon={Icons.info}
                                title={t('还没有这个类型的菜单数据', 'Nothing captured for this type yet')}
                                message={t(
                                    '右键菜单只能在弹出的瞬间被读到。先右键打开一次这种菜单，再回来编辑。',
                                    'Menus can only be read while they are open. Open one of this type first, then come back.'
                                )}
                            />
                        </Card>
                    ) : (
                        <flex horizontal={false} flexGrow={1} alignItems="stretch" gap={8} enableScrolling={true} cropOverflow={true} maxHeight={WINDOW_HEIGHT - 168}>
                            <Card c={c} padding={8} gap={5}>
                                <flex horizontal={true} alignItems="center" gap={6}>
                                    <SectionLabel c={c} text={t('菜单内容', 'Menu content')} />
                                    <flex flexGrow={1} />
                                    <Text
                                        c={c}
                                        text={
                                            profile.unmanaged === 'hide'
                                                ? t('没改过的原生项会隐藏', 'Untouched items are hidden')
                                                : profile.unmanaged === 'keep-end'
                                                  ? t('没改过的原生项挪到末尾', 'Untouched items move to the end')
                                                  : t('没改过的原生项留在原位', 'Untouched items stay in place')
                                        }
                                        fontSize={10}
                                        color={c.textTertiary}
                                    />
                                </flex>
                                <flex horizontal={false} alignItems="stretch" gap={0} padding={4} borderRadius={7} borderColor={c.border} borderWidth={1} backgroundColor={c.menuBg}>
                                    {rows.length === 0 ? (
                                        <flex padding={18} justifyContent="center" alignItems="center">
                                            <Text c={c} text={t('这个菜单现在没有内容', 'This menu has no items')} fontSize={12} color={c.textSecondary} />
                                        </flex>
                                    ) : (
                                        renderRows(null, 'root')
                                    )}
                                    <MenuTail c={c} offer={offer} active={drag !== null} index={profile.nodes.length} slot={rows.filter(row => row.parentId === null).length} />
                                </flex>
                            </Card>

                            <Card c={c} padding={8} gap={5}>
                                <TrashZone c={c} offer={offer} active={drag !== null} virtualCount={stats.virtual} />
                            </Card>

                            <Card c={c} padding={9} gap={6}>
                                <SectionLabel c={c} text={t('快捷键与手势', 'Shortcuts and gestures')} />
                                <ShortcutHints c={c} />
                            </Card>
                        </flex>
                    )}
                </flex>

                <Inspector
                    c={c}
                    profile={profile}
                    kind={kind}
                    snapshot={snapshot}
                    row={selectedRow}
                    stats={stats}
                    customSvg={customSvg}
                    onCustomSvg={setCustomSvg}
                    onEdit={editRow}
                    onPatchProfile={patchProfile}
                    onImport={importAll}
                    onClear={() => mutate([], t('已清空规则 · Ctrl+Z 撤销', 'Rules cleared · Ctrl+Z undoes it'), false)}
                    onDuplicate={duplicateSelected}
                    onRemove={removeSelected}
                    onUnwrap={() => {
                        if (!selectedRow || selectedRow.virtual) return;
                        mutate(unwrapGroup(profile.nodes, selectedRow.node.id), t(`已解散「${nodeLabel(selectedRow.node, '')}」· Ctrl+Z 撤销`, `Dissolved “${nodeLabel(selectedRow.node, '')}” · Ctrl+Z undoes it`));
                    }}
                    onWrap={layout => {
                        if (!selectedRow) return;
                        const name = nodeLabel(selectedRow.node, t('未命名', 'Unnamed'));
                        const base = asRule(selectedRow);
                        const wrapped = wrapInGroup(base.nodes, [base.id], layout, layout === 'row' ? t('横排', 'Row') : t('分组', 'Group'));
                        if (!wrapped.groupId) return;
                        mutate(wrapped.nodes, t(`已把「${name}」收纳进新分组 · Ctrl+Z 撤销`, `Wrapped “${name}” in a new group · Ctrl+Z undoes it`));
                        setSelected(wrapped.groupId);
                        setExpanded(prev => [...prev, wrapped.groupId]);
                    }}
                    onMove={moveSelected}
                    onMoveTo={moveSelectedTo}
                    onMoveOut={() => {
                        if (!selectedRow || selectedRow.virtual) return;
                        const found = locate(profile.nodes, selectedRow.node.id);
                        if (!found || !found.parent) return;
                        const outer = locate(profile.nodes, found.parent.id);
                        if (!outer) return;
                        const parent = found.parent;
                        mutate(moveNode(profile.nodes, selectedRow.node.id, outer.parent ? outer.parent.id : null, outer.index + 1), t(`已把「${nodeLabel(selectedRow.node, '')}」移出「${nodeLabel(parent, '')}」· Ctrl+Z 撤销`, `Moved “${nodeLabel(selectedRow.node, '')}” out of “${nodeLabel(parent, '')}” · Ctrl+Z undoes it`));
                    }}
                />
            </flex>

            <StatusBar c={c} status={status} tone={toneColor('info', c)} />
        </flex>
    );
});

const ShortcutHints = ({ c }: { c: ReturnType<typeof fluent> }) => {
    const rows = [
        { keys: 'Ctrl+Z / Ctrl+Y', text: t('撤销 / 重做（改过的开关和过滤也能撤销）', 'Undo / redo, toggles and filters included') },
        { keys: 'Ctrl+D / Ctrl+Del', text: t('复制 / 删除选中的项；原生行会先纳入规则', 'Duplicate / delete the selection; native rows join the rules first') },
        { keys: 'Ctrl+↑ ↓', text: t('把选中的项上下移动', 'Move the selection up or down') },
        { keys: 'Alt+↑ ↓', text: t('上下选择行', 'Select the row above or below') },
        { keys: 'Enter / Esc', text: t('改名 / 取消选中', 'Rename / clear the selection') },
        { keys: t('双击', 'Double click'), text: t('就地改名：点一下输入框就能打字，Ctrl+A 全选', 'Rename in place: click the field to type, Ctrl+A selects all') },
        {
            keys: t('拖拽', 'Drag'),
            text: t('拖动排序；拖到分组标题中间放进分组；拖到底部横条移出规则', 'Reorder; onto a group title to nest; onto the bottom bar to remove the rule')
        }
    ];
    return (
        <flex horizontal={false} alignItems="stretch" gap={3}>
            {rows.map(row => (
                <flex key={row.keys} horizontal={true} alignItems="center" gap={8}>
                    <flex width={136} justifyContent="end">
                        <Chip c={c} label={row.keys} fg={c.textSecondary} bg={c.subtle} />
                    </flex>
                    <Text c={c} text={row.text} fontSize={11} color={c.textTertiary} maxWidth={400} truncate={64} />
                </flex>
            ))}
        </flex>
    );
};

const TrashZone = ({ c, offer, active, virtualCount }: { c: ReturnType<typeof fluent>; offer: (t: DropTarget) => void; active: boolean; virtualCount: number }) => {
    const hover = useHoverActive();
    const hovered = active && hover.isHovered;
    return (
        <flex
            horizontal={true}
            height={30}
            alignItems="center"
            gap={8}
            paddingLeft={8}
            paddingRight={8}
            borderRadius={5}
            borderColor={hovered ? c.dangerText : c.divider}
            borderWidth={1}
            backgroundColor={hovered ? c.dangerSoft : undefined}
            onMouseEnter={hover.onMouseEnter}
            onMouseLeave={hover.onMouseLeave}
            onMouseMove={() => {
                if (active) offer({ parentId: '__trash', index: 0, slot: -1, mode: 'inside' });
            }}
        >
            {iconElement(Icons.trash, 12, hovered ? c.dangerText : c.textSecondary)}
            <Text c={c} text={t('拖到这里 = 移出规则（还原成原生项）', 'Drop here to remove the rule')} fontSize={11} color={hovered ? c.dangerText : c.textSecondary} />
            <flex flexGrow={1} />
            <Text
                c={c}
                text={virtualCount > 0 ? t(`${virtualCount} 项未纳入的原生项`, `${virtualCount} native items unmanaged`) : t('原生项都已在规则里', 'Every native item is managed')}
                fontSize={10}
                color={c.textTertiary}
            />
        </flex>
    );
};

const DropLine = ({ c }: { c: ReturnType<typeof fluent> }) => (
    <flex horizontal={true} height={3} alignItems="center" paddingLeft={4} paddingRight={4}>
        <flex flexGrow={1} height={2} borderRadius={1} backgroundColor={c.accent} />
    </flex>
);

const GroupTail = ({ c, groupId, index, offer, active }: { c: ReturnType<typeof fluent>; groupId: string; index: number; offer: (t: DropTarget) => void; active: boolean }) => {
    const hover = useHoverActive();
    const hovered = active && hover.isHovered;
    return (
        <flex
            horizontal={true}
            height={22}
            alignItems="center"
            justifyContent="center"
            borderRadius={4}
            backgroundColor={hovered ? c.accentSoft : undefined}
            onMouseEnter={hover.onMouseEnter}
            onMouseLeave={hover.onMouseLeave}
            onMouseMove={() => {
                if (active) offer({ parentId: groupId, index, slot: -1, mode: 'inside' });
            }}
        >
            <Text c={c} text={hovered ? t('放进这个分组', 'Drop into this group') : t('拖到这里 = 放进分组', 'Drop here to add into the group')} fontSize={10} color={hovered ? c.accent : c.textTertiary} />
        </flex>
    );
};

const MenuTail = ({ c, offer, active, index, slot }: { c: ReturnType<typeof fluent>; offer: (t: DropTarget) => void; active: boolean; index: number; slot: number }) => {
    const hover = useHoverActive();
    const hovered = active && hover.isHovered;
    return (
        <flex
            horizontal={true}
            height={22}
            alignItems="center"
            justifyContent="center"
            borderRadius={4}
            backgroundColor={hovered ? c.accentSoft : undefined}
            onMouseEnter={hover.onMouseEnter}
            onMouseLeave={hover.onMouseLeave}
            onMouseMove={() => {
                if (active) offer({ parentId: null, index, slot, mode: 'after' });
            }}
        >
            <Text c={c} text={!active ? '' : hovered ? t('放到菜单末尾', 'Move to the end') : t('菜单末尾', 'End of menu')} fontSize={11} color={hovered ? c.accent : c.textTertiary} />
        </flex>
    );
};

const TinyButton = ({ c, icon, onClick, tone, size = 22, disabled }: { c: ReturnType<typeof fluent>; icon: string; onClick: () => void; tone?: string; size?: number; disabled?: boolean }) => {
    const hover = useHoverActive();
    return (
        <flex
            horizontal={true}
            width={size}
            height={size}
            alignItems="center"
            justifyContent="center"
            borderRadius={4}
            backgroundColor={hover.isHovered && !disabled ? c.hoverStrong : undefined}
            cursor={disabled ? 'arrow' : 'hand'}
            opacity={disabled ? 100 : 255}
            animatedVars={COLOR_VARS}
            animationCurve={{ ...FAST, vars: COLOR_VARS }}
            onMouseEnter={hover.onMouseEnter}
            onMouseLeave={hover.onMouseLeave}
            onMouseDown={() => {
                if (!disabled) onClick();
            }}
        >
            {iconElement(icon, 12, hover.isHovered && !disabled ? tone ?? c.text : c.textSecondary)}
        </flex>
    );
};

type RowProps = {
    c: ReturnType<typeof fluent>;
    row: CanvasRow;
    position: number;
    insertBefore: number;
    insertAfter: number;
    selected: boolean;
    dragging: boolean;
    insideHint: boolean;
    expanded: boolean;
    active: boolean;
    editing: string | null;
    warning: string | null;
    onEditValue: (value: string) => void;
    onCommitEdit: () => void;
    onCancelEdit: () => void;
    onSelect: (row: CanvasRow) => void;
    onRowDown: (row: CanvasRow) => boolean;
    onArm: (key: string, label: string) => void;
    onMove: (overRow: string) => void;
    onUp: () => void;
    offer: (t: DropTarget) => void;
    claim: (key: string) => void;
    isClaimed: () => boolean;
    onToggleExpand: (id: string) => void;
    onToggleHidden: (row: CanvasRow) => void;
    onRename: (row: CanvasRow) => void;
};

const RowView = memo((props: RowProps) => {
    const { c, row } = props;
    const node = row.node;
    const hover = useHoverActive();
    const hidden = node.kind !== 'sep' && node.hidden;
    const label = nodeLabel(node, t('未命名', 'Unnamed'));
    const isGroup = node.kind === 'group';
    const isSep = node.kind === 'sep';

    if (props.editing !== null) {
        return (
            <flex horizontal={true} height={ROW_HEIGHT} alignItems="center" gap={6} paddingLeft={6} paddingRight={6} borderRadius={5} backgroundColor={c.selection}>
                {nodeGlyph(row, c.text, 15)}
                <TextField
                    c={c}
                    width={556}
                    value={props.editing}
                    onChange={props.onEditValue}
                    onBlur={props.onCommitEdit}
                    onKeyDown={key => {
                        if (key === 257) {
                            props.onCommitEdit();
                            return true;
                        }
                        if (key === 256) {
                            props.onCancelEdit();
                            return true;
                        }
                        return false;
                    }}
                />
                <TinyButton c={c} icon={Icons.check} onClick={props.onCommitEdit} tone={c.accent} />
            </flex>
        );
    }

    const background = props.selected ? c.selection : hover.isHovered ? c.hoverStrong : undefined;

    return (
        <flex
            horizontal={true}
            height={ROW_HEIGHT}
            alignItems="center"
            gap={6}
            paddingLeft={6}
            paddingRight={4}
            borderRadius={5}
            backgroundColor={background}
            borderColor={props.insideHint || props.dragging ? c.accent : c.transparent}
            borderWidth={1}
            opacity={props.dragging || hidden || row.hiddenByPolicy ? 150 : 255}
            cursor="grab"
            animatedVars={COLOR_VARS}
            animationCurve={{ ...FAST, vars: COLOR_VARS }}
            onMouseEnter={hover.onMouseEnter}
            onMouseLeave={hover.onMouseLeave}
            onMouseDown={() => {
                if (props.isClaimed()) return;
                if (props.onRowDown(row)) return;
                props.onSelect(row);
                props.onArm(row.key, label);
            }}
            onMouseUp={props.onUp}
            onMouseMove={(_x, y) => {
                props.onMove(row.key);
                if (!props.active || props.dragging) return;
                if (isGroup && y > ROW_HEIGHT * 0.28 && y < ROW_HEIGHT * 0.72) {
                    props.offer({ parentId: node.id, index: 0, slot: -1, mode: 'inside' });
                    return;
                }
                const below = y >= ROW_HEIGHT / 2;
                props.offer({
                    parentId: row.parentId,
                    index: below ? props.insertAfter : props.insertBefore,
                    slot: below ? props.position + 1 : props.position,
                    mode: below ? 'after' : 'before'
                });
            }}
        >
            <flex width={2} height={ROW_HEIGHT - 10} borderRadius={1} backgroundColor={props.selected ? c.accent : c.transparent} />
            {isSep ? <flex width={12} /> : <flex width={12} alignItems="center" justifyContent="center">{iconElement(Icons.grip, 11, hidden ? c.textTertiary : c.textSecondary)}</flex>}
            {isGroup ? <TinyButton c={c} icon={props.expanded ? Icons.chevronDown : Icons.chevronRight} size={18} onClick={() => { props.claim(row.key); props.onToggleExpand(node.id); }} /> : null}
            {nodeGlyph(row, hidden ? c.textTertiary : c.text, 15)}

            <flex flexGrow={1} horizontal={true} alignItems="center" gap={6}>
                <Text c={c} text={label} fontSize={13} color={hidden ? c.textSecondary : c.text} maxWidth={isSep ? 300 : 250} truncate={26} />
                {node.kind === 'item' && node.ref?.hotkey ? <Text c={c} text={node.ref.hotkey} fontSize={10} color={c.textTertiary} /> : null}
            </flex>

            {row.virtual ? <Chip c={c} label={t('原生', 'native')} fg={c.textTertiary} bg={c.subtle} /> : null}
            {isGroup ? <Chip c={c} label={props.expanded ? (node.layout === 'row' ? t('横排', 'row') : t('分组', 'group')) : t(`${countItems(node.children)} 项规则项`, `${countItems(node.children)} rules`)} fg={props.expanded ? c.accent : c.textSecondary} bg={props.expanded ? c.accentSoft : c.subtle} icon={props.expanded ? (node.layout === 'row' ? Icons.rowStack : Icons.folder) : Icons.folder} /> : null}
            {node.kind === 'item' && !row.virtual && node.ref === null ? <Chip c={c} label={t('命令', 'command')} fg={c.successText} bg={c.successSoft} icon={Icons.command} /> : null}
            {node.kind === 'item' && node.ref?.hasSubmenu ? <Chip c={c} label={t('子菜单', 'submenu')} fg={c.textSecondary} bg={c.subtle} icon={Icons.layers} /> : null}
            {hidden ? <Chip c={c} label={t('隐藏', 'hidden')} fg={c.warningText} bg={c.warningSoft} icon={Icons.eyeOff} /> : null}
            {props.warning ? <Chip c={c} label={props.warning} fg={c.warningText} bg={c.warningSoft} icon={Icons.warning} /> : null}

            {isSep ? null : (
                <TinyButton
                    c={c}
                    icon={Icons.pencil}
                    onClick={() => {
                        props.claim(row.key);
                        props.onRename(row);
                    }}
                />
            )}
            {isSep ? null : (
                <TinyButton
                    c={c}
                    icon={hidden ? Icons.eyeOff : Icons.eye}
                    onClick={() => {
                        props.claim(row.key);
                        props.onToggleHidden(row);
                    }}
                />
            )}
        </flex>
    );
});

const Header = ({
    kind,
    c,
    profile,
    stats,
    onToggleEnabled,
    onClose
}: {
    c: ReturnType<typeof fluent>;
    kind: MenuKind;
    profile: Profile;
    stats: { native: number; managed: number; virtual: number };
    onToggleEnabled: () => void;
    onClose: () => void;
}) => {
    const hover = useHoverActive();
    return (
        <flex horizontal={true} height={54} alignItems="center" gap={10} paddingLeft={14} paddingRight={10} backgroundColor={c.headerBg} borderColor={c.divider} borderWidth={1}>
            <flex width={28} height={28} alignItems="center" justifyContent="center" borderRadius={6} backgroundColor={c.accentSoft}>
                {iconElement(Icons.list, 15, c.accent)}
            </flex>
            <flex horizontal={false} alignItems="start" gap={0}>
                <Text c={c} text={KIND_META[kind].label} fontSize={14} fontWeight={600} />
                <Text c={c} text={t(`${stats.managed} 项规则项 · ${stats.virtual} 项未纳入的原生项`, `${stats.managed} rules · ${stats.virtual} native items unmanaged`)} fontSize={10} color={c.textTertiary} />
            </flex>
            <flex flexGrow={1} />
            <flex
                horizontal={true}
                alignItems="center"
                gap={7}
                height={28}
                paddingLeft={9}
                paddingRight={9}
                borderRadius={5}
                backgroundColor={hover.isHovered ? c.hover : undefined}
                cursor="hand"
                animatedVars={COLOR_VARS}
                animationCurve={{ ...FAST, vars: COLOR_VARS }}
                onMouseEnter={hover.onMouseEnter}
                onMouseLeave={hover.onMouseLeave}
                onMouseDown={onToggleEnabled}
            >
                {iconElement(profile.enabled ? Icons.check : Icons.ban, 12, profile.enabled ? c.successText : c.textTertiary)}
                <Text c={c} text={profile.enabled ? t('规则已启用', 'Rules on') : t('规则已停用', 'Rules off')} fontSize={11} color={profile.enabled ? c.successText : c.textSecondary} />
            </flex>
            <TinyButton c={c} icon={Icons.close} onClick={onClose} size={26} />
        </flex>
    );
};

const Rail = ({ c, kind, settings, onSelect }: { c: ReturnType<typeof fluent>; kind: MenuKind; settings: Settings; onSelect: (k: MenuKind) => void }) => (
    <flex horizontal={false} width={RAIL_WIDTH} flexShrink={0} alignItems="stretch" padding={8} gap={4} backgroundColor={c.railBg} borderColor={c.divider} borderWidth={1}>
        <flex padding={6}>
            <Text c={c} text={t('菜单类型', 'Menu types')} fontSize={11} color={c.textTertiary} />
        </flex>
        {MENU_KINDS.map(entry => (
            <RailItem key={entry} c={c} kind={entry} selected={kind === entry} profile={settings.profiles[entry]} captured={settings.snapshots[entry] !== undefined} onSelect={onSelect} />
        ))}
        <flex flexGrow={1} />
        <flex horizontal={false} alignItems="stretch" padding={6}>
            <Text c={c} text={t('规则按类型保存，每次菜单弹出时套用；原生菜单项本身不会被改动。', 'Rules are stored per type and applied on every popup. Native items are never changed.')} fontSize={10} color={c.textTertiary} maxWidth={200} />
        </flex>
    </flex>
);

const RailItem = ({ c, kind, selected, profile, captured, onSelect }: { c: ReturnType<typeof fluent>; kind: MenuKind; selected: boolean; profile: Profile; captured: boolean; onSelect: (k: MenuKind) => void }) => {
    const hover = useHoverActive();
    const meta = KIND_META[kind];
    const managed = countItems(profile.nodes);
    return (
        <flex
            horizontal={true}
            height={46}
            alignItems="center"
            gap={8}
            paddingLeft={8}
            paddingRight={8}
            borderRadius={6}
            backgroundColor={selected ? c.selection : hover.isHovered ? c.hover : undefined}
            cursor="hand"
            animatedVars={COLOR_VARS}
            animationCurve={{ ...FAST, vars: COLOR_VARS }}
            onMouseEnter={hover.onMouseEnter}
            onMouseLeave={hover.onMouseLeave}
            onMouseDown={() => onSelect(kind)}
        >
            {iconElement(meta.icon, 15, profile.enabled ? c.accent : c.textSecondary)}
            <flex horizontal={false} flexGrow={1} alignItems="start" gap={0}>
                <Text c={c} text={meta.label} fontSize={12} fontWeight={selected ? 600 : 400} maxWidth={120} />
                <Text c={c} text={captured ? t(`${managed} 项规则项`, `${managed} rules`) : t('未采集', 'not captured')} fontSize={10} color={c.textTertiary} />
            </flex>
            {profile.enabled ? <Badge c={c} text="ON" fg={c.successText} bg={c.successSoft} /> : null}
        </flex>
    );
};

const CanvasToolbar = ({
    c,
    canUndo,
    canRedo,
    onUndo,
    onRedo,
    onAddGroup,
    onAddSep,
    onAddCommand,
    onImport,
    hasSnapshot,
    virtualCount
}: {
    c: ReturnType<typeof fluent>;
    canUndo: boolean;
    canRedo: boolean;
    onUndo: () => void;
    onRedo: () => void;
    onAddGroup: (layout: 'fold' | 'row') => void;
    onAddSep: () => void;
    onAddCommand: () => void;
    onImport: () => void;
    hasSnapshot: boolean;
    virtualCount: number;
}) => (
    <flex horizontal={true} alignItems="center" gap={6}>
        <Button c={c} icon={Icons.undo} label={t('撤销', 'Undo')} variant="subtle" onClick={onUndo} disabled={!canUndo} />
        <Button c={c} icon={Icons.redo} label={t('重做', 'Redo')} variant="subtle" onClick={onRedo} disabled={!canRedo} />
        <Divider c={c} vertical={true} />
        <Button c={c} icon={Icons.folder} label={t('新分组', 'New group')} variant="standard" onClick={() => onAddGroup('fold')} />
        <Button c={c} icon={Icons.rowStack} label={t('新横排', 'New row')} variant="standard" onClick={() => onAddGroup('row')} />
        <Button c={c} icon={Icons.separator} label={t('分隔线', 'Separator')} variant="standard" onClick={onAddSep} />
        <Button c={c} icon={Icons.command} label={t('新命令', 'New command')} variant="standard" onClick={onAddCommand} />
        <Text c={c} text={t('新项加到菜单末尾，选中的是分组时加进那个分组', 'New items go to the end of the menu, or into the selected group')} fontSize={10} color={c.textTertiary} maxWidth={220} />
        <flex flexGrow={1} />
        <Button
            c={c}
            icon={Icons.importFile}
            label={virtualCount > 0 ? t(`全部纳入规则 (${virtualCount} 项)`, `Add all (${virtualCount})`) : t('已全部纳入', 'All covered')}
            variant="standard"
            onClick={onImport}
            disabled={!hasSnapshot || virtualCount === 0}
        />
    </flex>
);

const StatusBar = ({ c, status, tone }: { c: ReturnType<typeof fluent>; status: string; tone: { fg: string; bg: string } }) => (
    <flex horizontal={true} height={28} alignItems="center" gap={8} paddingLeft={14} paddingRight={14} backgroundColor={c.headerBg} borderColor={c.divider} borderWidth={1}>
        {iconElement(Icons.info, 11, tone.fg)}
        <flex flexGrow={1}>
            <Text c={c} text={status} fontSize={11} color={c.textSecondary} maxWidth={1120} truncate={160} />
        </flex>
    </flex>
);

const Inspector = ({
    c,
    profile,
    kind,
    snapshot,
    row,
    stats,
    customSvg,
    onCustomSvg,
    onEdit,
    onPatchProfile,
    onImport,
    onClear,
    onDuplicate,
    onRemove,
    onUnwrap,
    onWrap,
    onMove,
    onMoveTo,
    onMoveOut
}: {
    c: ReturnType<typeof fluent>;
    profile: Profile;
    kind: MenuKind;
    snapshot: Snapshot | null;
    row: CanvasRow | null;
    stats: { native: number; managed: number; virtual: number };
    customSvg: string;
    onCustomSvg: (svg: string) => void;
    onEdit: (row: CanvasRow, patch: (node: Node) => Node, note: string, mergeKey?: string) => void;
    onPatchProfile: (patch: Partial<Profile>, note?: string, mergeKey?: string) => void;
    onImport: () => void;
    onClear: () => void;
    onDuplicate: () => void;
    onRemove: () => void;
    onUnwrap: () => void;
    onWrap: (layout: 'fold' | 'row') => void;
    onMove: (delta: number) => void;
    onMoveTo: (edge: 'start' | 'end') => void;
    onMoveOut: () => void;
}) => {
    const node = row === null ? null : row.node;
    const ref = node !== null && node.kind === 'item' ? node.ref : null;
    const match = ref === null ? null : [ref.wID === undefined ? undefined : String(ref.wID), ref.nameResid, ref.originName, ref.hotkey];
    const matched = match !== null && match.some(value => value !== undefined && value !== '');
    const footerRows = row === null ? 2 : 4;
    return (
        <flex horizontal={false} width={INSPECTOR_WIDTH} flexShrink={0} alignItems="stretch" justifyContent="end" cropOverflow={true} backgroundColor={c.railBg} borderColor={c.divider} borderWidth={1}>
            <flex horizontal={false} flexGrow={1} alignItems="stretch" padding={10} gap={6} enableScrolling={true} cropOverflow={true} maxHeight={formMaxHeight(footerRows)}>
                {row === null ? (
                    <KindPanel c={c} profile={profile} kind={kind} snapshot={snapshot} stats={stats} onPatch={onPatchProfile} />
                ) : (
                    <Fragment>
                        <flex horizontal={true} alignItems="center" gap={8} paddingTop={2} paddingBottom={2}>
                            {nodeGlyph(row, c.text, 17)}
                            <flex horizontal={false} alignItems="start" gap={0} flexGrow={1}>
                                <Text c={c} text={nodeLabel(row.node, t('未命名', 'Unnamed'))} fontSize={13} fontWeight={600} maxWidth={210} truncate={24} />
                                <Text
                                    c={c}
                                    text={
                                        row.virtual
                                            ? t('原生项 · 还没纳入规则', 'Native item, not in the rules')
                                            : row.node.kind === 'group'
                                              ? t('分组', 'Group')
                                              : row.node.kind === 'sep'
                                                ? t('分隔线', 'Separator')
                                                : row.node.ref === null
                                                  ? t('自定义命令', 'Custom command')
                                                  : t('规则里的原生项', 'Native item in the rules')
                                    }
                                    fontSize={10}
                                    color={c.textTertiary}
                                />
                            </flex>
                        </flex>

                        {row.node.kind === 'sep' ? (
                            <Text
                                c={c}
                                text={t(
                                    '分隔线没有名字和图标。开头、连续出现或者落在最后的分隔线不会出现在真实菜单里。',
                                    'A separator has no name or icon. Leading, repeated or trailing ones never show up in the real menu.'
                                )}
                                fontSize={10}
                                color={c.textTertiary}
                                maxWidth={268}
                            />
                        ) : (
                            <Fragment>
                                <SectionLabel c={c} text={t('基本', 'Basics')} />

                                {row.node.kind === 'group' ? (
                                    <FieldRow c={c} stacked={true} label={t('分组名称', 'Group name')}>
                                        <TextField
                                            c={c}
                                            width={256}
                                            value={row.node.label}
                                            onChange={value => onEdit(row, node => (node.kind === 'group' ? { ...node, label: value } : node), t('已重命名分组', 'Group renamed'), `${row.key}:label`)}
                                            placeholder={t('分组', 'Group')}
                                        />
                                    </FieldRow>
                                ) : (
                                    <FieldRow c={c} stacked={true} label={t('显示名称', 'Display name')} hint={row.node.ref ? t(`原生名称：${row.node.ref.name}`, `native: ${row.node.ref.name}`) : undefined}>
                                        <TextField
                                            c={c}
                                            width={256}
                                            value={row.node.label ?? row.node.ref?.name ?? ''}
                                            onChange={value => onEdit(row, node => (node.kind === 'item' ? { ...node, label: value.length > 0 && value !== node.ref?.name ? value : null } : node), t('已重命名', 'Renamed'), `${row.key}:label`)}
                                            placeholder={t('留空使用原生名称', 'Empty keeps the native name')}
                                        />
                                    </FieldRow>
                                )}

                                {row.node.kind === 'group' ? (
                                    <FieldRow
                                        c={c}
                                        stacked={true}
                                        label={t('布局', 'Layout')}
                                        hint={
                                            row.node.layout === 'row'
                                                ? t('横排是一排按钮的容器，名称只在编辑器里用', 'A row is a container for one line of buttons; the name is editor-only')
                                                : t('分组收进子菜单，名称就是子菜单标题', 'A group folds into a submenu; the name is the submenu title')
                                        }
                                    >
                                        <SegmentedControl
                                            c={c}
                                            flexGrow={1}
                                            value={row.node.layout}
                                            onChange={layout => onEdit(row, node => (node.kind === 'group' ? { ...node, layout } : node), t('已切换布局', 'Layout changed'))}
                                            options={[
                                                { value: 'fold' as const, label: t('分组', 'Group'), icon: Icons.folder },
                                                { value: 'row' as const, label: t('横排', 'Row'), icon: Icons.rowStack }
                                            ]}
                                        />
                                    </FieldRow>
                                ) : null}

                                <ToggleSwitch
                                    c={c}
                                    value={row.node.hidden}
                                    onChange={() => onEdit(row, toggledHidden, t(`已${row.node.kind !== 'sep' && row.node.hidden ? '取消隐藏' : '隐藏'}该行 · Ctrl+Z 撤销`, 'Visibility toggled · Ctrl+Z undoes it'))}
                                    label={t('隐藏这一项', 'Hide this item')}
                                    description={t('隐藏后 breeze 不再显示它', 'Hidden items are not rendered by breeze')}
                                />
                                {row.node.kind === 'item' ? (
                                    <ToggleSwitch
                                        c={c}
                                        value={row.node.disabled}
                                        onChange={() => onEdit(row, node => (node.kind === 'item' ? { ...node, disabled: !node.disabled } : node), t('已切换禁用', 'Disabled toggled'))}
                                        label={t('禁用', 'Disabled')}
                                        description={t('置灰且不可点；原生已禁用的项始终禁用', 'Greyed out and unclickable; natively disabled items stay disabled')}
                                    />
                                ) : null}

                                {row.node.kind === 'item' && row.node.ref === null && row.node.command ? (
                                    <Fragment>
                                        <SegmentedControl
                                            c={c}
                                            flexGrow={1}
                                            value={row.node.command.type}
                                            onChange={type =>
                                                onEdit(
                                                    row,
                                                    node => (node.kind === 'item' ? { ...node, command: type === 'open' ? { type: 'open', path: '', args: '' } : { type: 'copy', text: '' } } : node),
                                                    t('已切换命令类型', 'Command type changed')
                                                )
                                            }
                                            options={[
                                                { value: 'open' as const, label: t('运行 / 打开', 'Open') },
                                                { value: 'copy' as const, label: t('复制文本', 'Copy text') }
                                            ]}
                                        />
                                        {row.node.command.type === 'copy' ? (
                                            <FieldRow c={c} stacked={true} label={t('文本', 'Text')}>
                                                <TextArea
                                                    c={c}
                                                    value={row.node.command.text}
                                                    onChange={text => onEdit(row, node => (node.kind === 'item' && node.command?.type === 'copy' ? { ...node, command: { type: 'copy', text } } : node), t('已更新', 'Updated'), `${row.key}:text`)}
                                                    height={54}
                                                />
                                            </FieldRow>
                                        ) : (
                                            <Fragment>
                                                <FieldRow c={c} stacked={true} label={t('路径或命令', 'Path or command')}>
                                                    <TextField
                                                        c={c}
                                                        width={256}
                                                        value={row.node.command.path}
                                                        onChange={path => onEdit(row, node => (node.kind === 'item' && node.command?.type === 'open' ? { ...node, command: { ...node.command, path } } : node), t('已更新', 'Updated'), `${row.key}:path`)}
                                                        placeholder="explorer.exe / cmd.exe / https://…"
                                                    />
                                                </FieldRow>
                                                <FieldRow
                                                    c={c}
                                                    stacked={true}
                                                    label={t('参数', 'Arguments')}
                                                    hint={t(
                                                        '%PATH% 换成选中项（没有选中时是当前文件夹），%FOLDER% 换成当前文件夹；含空格的路径自动加引号',
                                                        '%PATH% becomes the selection (or the current folder), %FOLDER% the current folder; paths with spaces get quoted'
                                                    )}
                                                >
                                                    <TextField
                                                        c={c}
                                                        width={256}
                                                        value={row.node.command.args}
                                                        onChange={args => onEdit(row, node => (node.kind === 'item' && node.command?.type === 'open' ? { ...node, command: { ...node.command, args } } : node), t('已更新', 'Updated'), `${row.key}:args`)}
                                                        placeholder="%PATH%"
                                                    />
                                                </FieldRow>
                                            </Fragment>
                                        )}
                                    </Fragment>
                                ) : null}

                                <Divider c={c} />
                                <IconPicker c={c} row={row} customSvg={customSvg} onCustomSvg={onCustomSvg} onEdit={onEdit} />

                                {row.node.kind === 'item' && row.node.ref ? (
                                    <Fragment>
                                        <Divider c={c} />
                                        <SectionLabel c={c} text={t('匹配信息', 'Matched by')} />
                                        {matched ? (
                                            <Fragment>
                                                <MatchRow c={c} label="wID" value={row.node.ref.wID === undefined ? '-' : String(row.node.ref.wID)} />
                                                <MatchRow c={c} label={t('资源 ID', 'resource')} value={row.node.ref.nameResid ?? '-'} />
                                                <MatchRow c={c} label={t('原始文本', 'raw text')} value={row.node.ref.originName ?? '-'} />
                                                <MatchRow c={c} label={t('快捷键', 'hotkey')} value={row.node.ref.hotkey ?? '-'} />
                                            </Fragment>
                                        ) : (
                                            <Text c={c} text={t('四项都是空的：这项按显示名称匹配', 'All four are empty: this item matches by display name')} fontSize={10} color={c.textTertiary} maxWidth={268} />
                                        )}
                                    </Fragment>
                                ) : null}
                            </Fragment>
                        )}
                    </Fragment>
                )}
            </flex>

            <Divider c={c} />
            <flex horizontal={false} alignItems="stretch" padding={ACTION_PAD} gap={ACTION_GAP}>
                {row === null ? (
                    <Fragment>
                        <Button c={c} icon={Icons.importFile} label={t(`全部纳入规则 (${stats.virtual} 项)`, `Add all (${stats.virtual})`)} variant="standard" height={ACTION_ROW_HEIGHT} onClick={onImport} disabled={snapshot === null || stats.virtual === 0} />
                        <Button c={c} icon={Icons.trash} label={t('清空规则', 'Clear rules')} variant="danger" height={ACTION_ROW_HEIGHT} onClick={onClear} disabled={profile.nodes.length === 0} />
                    </Fragment>
                ) : (
                    <Fragment>
                        <flex horizontal={true} gap={5}>
                            <Button c={c} icon={Icons.arrowUp} label={t('上移', 'Up')} variant="standard" height={ACTION_ROW_HEIGHT} flexGrow={1} onClick={() => onMove(-1)} />
                            <Button c={c} icon={Icons.arrowDown} label={t('下移', 'Down')} variant="standard" height={ACTION_ROW_HEIGHT} flexGrow={1} onClick={() => onMove(1)} />
                        </flex>
                        <flex horizontal={true} gap={5}>
                            <Button c={c} icon={Icons.moveTop} label={t('移到开头', 'To top')} variant="standard" height={ACTION_ROW_HEIGHT} flexGrow={1} onClick={() => onMoveTo('start')} />
                            <Button c={c} icon={Icons.moveBottom} label={t('移到末尾', 'To end')} variant="standard" height={ACTION_ROW_HEIGHT} flexGrow={1} onClick={() => onMoveTo('end')} />
                        </flex>
                        <flex horizontal={true} gap={5}>
                            {row.node.kind === 'item' ? <Button c={c} icon={Icons.folder} label={t('收纳成分组', 'Wrap in group')} variant="standard" height={ACTION_ROW_HEIGHT} flexGrow={1} onClick={() => onWrap('fold')} /> : null}
                            {row.node.kind === 'group' ? <Button c={c} icon={Icons.layers} label={t('解散分组', 'Dissolve')} variant="standard" height={ACTION_ROW_HEIGHT} flexGrow={1} onClick={onUnwrap} /> : null}
                            {row.parentId && !row.virtual ? <Button c={c} icon={Icons.folderOpen} label={t('移出分组', 'Move out')} variant="standard" height={ACTION_ROW_HEIGHT} flexGrow={1} onClick={onMoveOut} /> : null}
                        </flex>
                        <flex horizontal={true} gap={5}>
                            <Button c={c} icon={Icons.copy} label={t('复制', 'Copy')} variant="standard" height={ACTION_ROW_HEIGHT} flexGrow={1} onClick={onDuplicate} />
                            <Button c={c} icon={Icons.trash} label={row.virtual ? t('隐藏', 'Hide') : t('删除', 'Delete')} variant="danger" height={ACTION_ROW_HEIGHT} flexGrow={1} onClick={onRemove} />
                        </flex>
                    </Fragment>
                )}
            </flex>
        </flex>
    );
};

const KindPanel = ({
    c,
    profile,
    kind,
    snapshot,
    stats,
    onPatch
}: {
    c: ReturnType<typeof fluent>;
    profile: Profile;
    kind: MenuKind;
    snapshot: Snapshot | null;
    stats: { native: number; managed: number; virtual: number };
    onPatch: (patch: Partial<Profile>, note?: string, mergeKey?: string) => void;
}) => (
    <flex horizontal={false} alignItems="stretch" gap={6}>
        <flex horizontal={true} alignItems="center" gap={8} paddingTop={2} paddingBottom={2}>
            {iconElement(KIND_META[kind].icon, 17, profile.enabled ? c.accent : c.textSecondary)}
            <flex horizontal={false} alignItems="start" gap={0} flexGrow={1}>
                <Text c={c} text={KIND_META[kind].label} fontSize={13} fontWeight={600} maxWidth={210} truncate={24} />
                <Text c={c} text={t('菜单类型设置', 'Menu type settings')} fontSize={10} color={c.textTertiary} />
            </flex>
        </flex>

        <SectionLabel c={c} text={t('规则', 'Rules')} />
        <ToggleSwitch
            c={c}
            value={profile.enabled}
            onChange={enabled => onPatch({ enabled }, enabled ? t('已启用该类型 · Ctrl+Z 撤销', 'Rules enabled · Ctrl+Z undoes it') : t('已停用该类型 · Ctrl+Z 撤销', 'Rules disabled · Ctrl+Z undoes it'))}
            label={t('启用该类型规则', 'Enable rules')}
            description={KIND_META[kind].hint}
        />
        <FieldRow c={c} stacked={true} label={t('未纳入的原生项', 'Native items not in the rules')} hint={t('建议保持原位：只改你动过的项', 'Keeping them in place is usually what you want')}>
            <SegmentedControl
                c={c}
                flexGrow={1}
                value={profile.unmanaged}
                onChange={unmanaged =>
                    onPatch(
                        { unmanaged },
                        unmanaged === 'hide'
                            ? t('未纳入的原生项：隐藏 · Ctrl+Z 撤销', 'Unmanaged items: hidden · Ctrl+Z undoes it')
                            : unmanaged === 'keep-end'
                              ? t('未纳入的原生项：移到末尾 · Ctrl+Z 撤销', 'Unmanaged items: to the end · Ctrl+Z undoes it')
                              : t('未纳入的原生项：保持原位 · Ctrl+Z 撤销', 'Unmanaged items: in place · Ctrl+Z undoes it')
                    )
                }
                options={[
                    { value: 'keep-original' as Profile['unmanaged'], label: t('保持原位', 'In place') },
                    { value: 'keep-end' as Profile['unmanaged'], label: t('移到末尾', 'To the end') },
                    { value: 'hide' as Profile['unmanaged'], label: t('隐藏', 'Hide') }
                ]}
            />
        </FieldRow>
        {kind === 'other' ? (
            <Fragment>
                <FieldRow c={c} stacked={true} label={t('只对这些进程生效', 'Only for these processes')} hint={t('进程名，逗号分隔；留空表示所有程序', 'Exe names, comma separated; empty means every app')}>
                    <TextField c={c} width={256} value={profile.processFilter} onChange={processFilter => onPatch({ processFilter }, undefined, `${kind}:processFilter`)} placeholder="explorer.exe, code.exe" />
                </FieldRow>
                <FieldRow c={c} stacked={true} label={t('窗口标题包含', 'Window title contains')} hint={t('留空表示不限制', 'Empty means no restriction')}>
                    <TextField c={c} width={256} value={profile.titleFilter} onChange={titleFilter => onPatch({ titleFilter }, undefined, `${kind}:titleFilter`)} />
                </FieldRow>
            </Fragment>
        ) : null}

        <Divider c={c} />
        <SectionLabel c={c} text={t('采集', 'Capture')} />
        <MatchRow c={c} label={t('时间', 'time')} value={clockText(snapshot?.at ?? 0)} />
        <MatchRow c={c} label={t('窗口', 'window')} value={snapshot ? snapshot.windowTitle || snapshot.className || '-' : '-'} />
        <MatchRow c={c} label={t('原生菜单项', 'native')} value={String(stats.native)} />
        <MatchRow c={c} label={t('未纳入的原生项', 'unmanaged')} value={String(stats.virtual)} />

        <Divider c={c} />
        <flex horizontal={false} padding={2}>
            <Text
                c={c}
                text={t(
                    '点中间任意一行开始编辑：改名、换图标、隐藏、拖到别处。灰色的行是未纳入的原生项，动一下它就变成规则。',
                    'Pick any row in the middle to rename, re-icon, hide or drag. Grey rows are native items no rule covers yet - touching one turns it into a rule.'
                )}
                fontSize={10}
                color={c.textTertiary}
                maxWidth={268}
            />
        </flex>
    </flex>
);

const MatchRow = ({ c, label, value }: { c: ReturnType<typeof fluent>; label: string; value: string }) => (
    <flex horizontal={true} gap={6} alignItems="center">
        <flex width={78}>
            <Text c={c} text={label} fontSize={10} color={c.textTertiary} truncate={8} />
        </flex>
        <Text c={c} text={value} fontSize={10} fontFamily="monospace" color={c.textSecondary} maxWidth={180} truncate={24} />
    </flex>
);

const IconPicker = ({
    c,
    row,
    customSvg,
    onCustomSvg,
    onEdit
}: {
    c: ReturnType<typeof fluent>;
    row: CanvasRow;
    customSvg: string;
    onCustomSvg: (svg: string) => void;
    onEdit: (row: CanvasRow, patch: (node: Node) => Node, note: string) => void;
}) => {
    const node = row.node;
    if (node.kind === 'sep') return null;
    return (
        <Fragment>
            <SectionLabel c={c} text={t('外观', 'Look')}>
                <Button c={c} label={t('原生', 'Native')} variant="subtle" onClick={() => onEdit(row, current => withIcon(current, { source: 'original' }), t('已换回原生图标 · Ctrl+Z 撤销', 'Native icon · Ctrl+Z undoes it'))} height={24} />
                <Button c={c} label={t('无', 'None')} variant="subtle" onClick={() => onEdit(row, current => withIcon(current, { source: 'none' }), t('已去掉图标 · Ctrl+Z 撤销', 'Icon removed · Ctrl+Z undoes it'))} height={24} />
            </SectionLabel>
            <flex horizontal={false} alignItems="stretch" gap={3}>
                {Array.from({ length: Math.ceil(ICON_PALETTE.length / 8) }, (_, line) => (
                    <flex key={line} horizontal={true} gap={3} alignItems="center">
                        {ICON_PALETTE.slice(line * 8, line * 8 + 8).map(name => (
                            <IconChoice
                                key={name}
                                c={c}
                                name={name}
                                selected={node.icon.source === 'svg' && node.icon.svg === Icons[name]}
                                onPick={() => onEdit(row, current => withIcon(current, { source: 'svg', svg: Icons[name] }), t('已换图标 · Ctrl+Z 撤销', 'Icon changed · Ctrl+Z undoes it'))}
                            />
                        ))}
                    </flex>
                ))}
            </flex>
            <TextArea c={c} value={customSvg} onChange={onCustomSvg} placeholder={'<svg …><path fill="currentColor" …/></svg>'} height={48} />
            <Button
                c={c}
                icon={Icons.save}
                label={t('用这段 SVG', 'Use this SVG')}
                variant="standard"
                height={26}
                disabled={customSvg.trim().length === 0}
                onClick={() => onEdit(row, current => withIcon(current, { source: 'svg', svg: customSvg.trim() }), t('已应用自定义图标 · Ctrl+Z 撤销', 'Custom icon applied · Ctrl+Z undoes it'))}
            />
        </Fragment>
    );
};

const IconChoice = ({ c, name, selected, onPick }: { c: ReturnType<typeof fluent>; name: string; selected: boolean; onPick: () => void }) => {
    const hover = useHoverActive();
    return (
        <flex
            width={29}
            height={29}
            alignItems="center"
            justifyContent="center"
            borderRadius={5}
            backgroundColor={selected ? c.accentSoft : hover.isHovered ? c.hover : c.subtle}
            borderColor={selected ? c.accent : undefined}
            borderWidth={selected ? 1 : 0}
            cursor="hand"
            animatedVars={COLOR_VARS}
            animationCurve={{ ...FAST, vars: COLOR_VARS }}
            onMouseEnter={hover.onMouseEnter}
            onMouseLeave={hover.onMouseLeave}
            onMouseDown={onPick}
        >
            {iconElement(Icons[name], 15, selected ? c.accent : c.text)}
        </flex>
    );
};
