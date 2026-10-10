import { GroupNode, IconSpec, ItemNode, MenuKind, Node, Profile, Settings, Snapshot, SnapshotItem } from './types';
import { MENU_KINDS } from './types';
import { t } from './i18n';
import {
    clampIndex,
    collectRefKeys,
    countItems,
    duplicateNode,
    findNode,
    groupNode,
    insertNode,
    itemNode,
    locate,
    moveNode,
    nodesOf,
    removeNode,
    sepNode,
    unwrapGroup,
    updateNode
} from './model';
import { COLOR_VARS, FAST, Icons, fluent, toneColor } from './theme';
import { nodeFromSnapshotItem, nodesFromSnapshot } from './plan';
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
    useHoverActive
} from './ui';
import { Fragment, ReactNode, memo, useCallback, useEffect, useMemo, useRef, useState } from './react';

export const WINDOW_WIDTH = 1180;
export const WINDOW_HEIGHT = 760;
const RAIL_WIDTH = 236;
const INSPECTOR_WIDTH = 312;
const CANVAS_WIDTH = WINDOW_WIDTH - RAIL_WIDTH - INSPECTOR_WIDTH;

const ROW_HEIGHT = 30;
const ROW_GAP = 2;
const ICON_PALETTE = [
    'star', 'pin', 'file', 'folder', 'folderOpen', 'link', 'command', 'shield', 'search', 'settings',
    'copy', 'trash', 'eye', 'palette', 'sparkle', 'list', 'layers', 'grid', 'window', 'desktop',
    'taskbar', 'save', 'check', 'info', 'warning', 'ban', 'arrowUp', 'arrowDown', 'importFile',
    'exportFile', 'reset', 'refresh', 'pencil', 'plus', 'close', 'more', 'text', 'sliders'
];

type DropTarget = { parentId: string | null; index: number; mode: 'before' | 'after' | 'inside' };
type DragState = { source: { kind: 'node'; id: string } | { kind: 'unmanaged'; item: SnapshotItem } } | null;

const IDLE_HINT = t(
    '拖动菜单项可以排序, 拖到分组标题的中线上可以放进分组, 拖到「未纳入规则」区域可以移出规则',
    'Drag rows to sort, drop on a group title to move inside, or drop on the unmanaged list to remove a rule'
);

const KIND_META: Record<MenuKind, { icon: string; label: string; hint: string }> = {
    files: { icon: 'file', label: t('选中文件', 'Selected files'), hint: t('资源管理器里选中一个或多个文件时', 'When files are selected in Explorer') },
    folder: { icon: 'folderOpen', label: t('文件夹空白处', 'Folder background'), hint: t('在文件夹空白处右键时', 'Right-click on empty area of a folder') },
    desktop: { icon: 'desktop', label: t('桌面', 'Desktop'), hint: t('桌面图标或桌面空白处', 'Desktop icons or desktop background') },
    taskbar: { icon: 'taskbar', label: t('任务栏', 'Taskbar'), hint: t('任务栏按钮与任务栏空白处', 'Taskbar buttons and empty area') },
    other: { icon: 'window', label: t('其他程序', 'Other apps'), hint: t('不属于上面几类的窗口菜单', 'Menus of windows that match none of the above') }
};

const nodeLabel = (node: Node, fallback: string): string => {
    if (node.kind === 'group') return node.label;
    if (node.kind === 'sep') return t('分隔线', 'Separator');
    return node.label ?? node.ref?.name ?? fallback;
};

const nodeIcon = (node: Node, color: string, size: number, builtinFallback: string) => {
    if (node.kind === 'group') {
        const icon = node.layout === 'row' ? Icons.rowStack : node.icon.source === 'svg' ? node.icon.svg : Icons.folder;
        return iconElement(icon, size, color);
    }
    if (node.kind === 'sep') return iconElement(Icons.separator, size, color);
    if (node.icon.source === 'svg') return iconElement(node.icon.svg, size, color);
    if (node.icon.source === 'none') return <spacer size={0} />;
    if (node.ref?.hasSubmenu) return iconElement(Icons.layers, size, color);
    return iconElement(builtinFallback, size, color);
};

export type EditorProps = {
    settings: Settings;
    initialKind: MenuKind;
    status: string;
    onSettings: (next: Settings) => void;
    onClose: () => void;
};

export const ContextMenuEditor = memo((props: EditorProps) => {
    const c = useMemo(() => fluent(), []);
    const [kind, setKind] = useState<MenuKind>(props.initialKind);
    const [settings, setSettings] = useState<Settings>(props.settings);
    const [selected, setSelected] = useState<string | null>(null);
    const [expanded, setExpanded] = useState<string[]>([]);
    const [drag, setDrag] = useState<DragState>(null);
    const [drop, setDrop] = useState<DropTarget | null>(null);
    const [status, setStatus] = useState(props.status || IDLE_HINT);
    const [past, setPast] = useState<{ kind: MenuKind; nodes: Node[] }[]>([]);
    const [future, setFuture] = useState<{ kind: MenuKind; nodes: Node[] }[]>([]);
    const [customSvg, setCustomSvg] = useState('');

    const pendingRef = useRef<{ priority: number; target: DropTarget }[]>([]);
    const dropRef = useRef<DropTarget | null>(null);
    const dragRef = useRef<DragState>(null);
    const dragLabel = useRef('');
    dragRef.current = drag;

    const profile = settings.profiles[kind];
    const snapshot: Snapshot | null = settings.snapshots[kind] ?? null;

    const commit = useCallback(
        (next: Settings, note?: string) => {
            setSettings(next);
            if (note) setStatus(note);
        },
        []
    );

    const mutate = useCallback(
        (nodes: Node[], note?: string) => {
            setPast(history => [...history.slice(-39), { kind, nodes: settings.profiles[kind].nodes }]);
            setFuture([]);
            commit({
                ...settings,
                profiles: { ...settings.profiles, [kind]: { ...settings.profiles[kind], nodes, updatedAt: Date.now() } }
            }, note);
        },
        [commit, kind, settings]
    );

    const patchProfile = useCallback(
        (patch: Partial<Profile>, note?: string) => {
            commit({ ...settings, profiles: { ...settings.profiles, [kind]: { ...settings.profiles[kind], ...patch } } }, note);
        },
        [commit, kind, settings]
    );

    useEffect(() => {
        const timer = setTimeout(() => props.onSettings(settings), 260);
        return () => clearTimeout(timer);
    }, [settings]);

    const managedKeys = useMemo(() => collectRefKeys(profile.nodes), [profile.nodes]);
    const leftovers = useMemo(
        () => (snapshot?.items ?? []).filter(item => !item.separator && !managedKeys.has(item.key)),
        [snapshot, managedKeys]
    );
    const selectedNode = selected ? findNode(profile.nodes, selected) : null;

    const offer = useCallback(
        (priority: number, target: DropTarget) => {
            const pending = pendingRef.current;
            if (pending.length === 0) {
                Promise.resolve().then(() => {
                    const queue = pendingRef.current;
                    queue.sort((a, b) => a.priority - b.priority);
                    const best = queue.shift();
                    queue.length = 0;
                    const current = dropRef.current;
                    const same = current && best && current.parentId === best.target.parentId && current.index === best.target.index && current.mode === best.target.mode;
                    if (same) return;
                    dropRef.current = best ? best.target : null;
                    setDrop(dropRef.current);
                    if (dropRef.current && dragRef.current) {
                        setStatus(
                            t(
                                `拖动「${dragLabel.current}」: 放到行之间排序, 放到分组标题中线上放进分组`,
                                `Dragging "${dragLabel.current}": drop between rows to sort, on a group title to move inside`
                            )
                        );
                    }
                });
            }
            pending.push({ priority, target });
        },
        []
    );

    const beginDrag = useCallback((source: NonNullable<DragState>['source'], label: string) => {
        dragRef.current = { source } as DragState;
        dragLabel.current = label;
        setDrag({ source });
    }, []);

    const endDrag = useCallback(() => {
        dragRef.current = null;
        setDrag(null);
        dropRef.current = null;
        setDrop(null);
        setStatus(IDLE_HINT);
    }, []);

    const applyDrop = useCallback(
        (target: DropTarget, source: NonNullable<DragState>['source']) => {
            if (target.parentId === '__leftovers') {
                if (source.kind !== 'node') return;
                const node = findNode(profile.nodes, source.id);
                if (!node) return;
                mutate(removeNode(profile.nodes, source.id).nodes, t(`已把「${nodeLabel(node, '')}」移出规则`, 'Removed from rules'));
                setSelected(null);
                return;
            }

            if (source.kind === 'node') {
                const moved = moveNode(profile.nodes, source.id, target.parentId, target.index);
                if (moved === profile.nodes) return;
                mutate(moved, t('已移动菜单项', 'Item moved'));
                return;
            }

            const item = source.item;
            const node = nodeFromSnapshotItem(item);
            mutate(insertNode(profile.nodes, node, target.parentId, target.index), t(`已加入「${item.name}」`, `Added "${item.name}"`));
            setSelected(node.id);
        },
        [mutate, profile.nodes]
    );

    const onRowUp = useCallback(() => {
        const source = dragRef.current?.source;
        const target = dropRef.current;
        if (source && target) applyDrop(target, source);
        endDrag();
    }, [applyDrop, endDrag]);

    const importSnapshot = useCallback(() => {
        if (!snapshot) return;
        const nodes = nodesFromSnapshot(snapshot);
        mutate(nodes, t(`已导入 ${nodes.length} 项`, `Imported ${nodes.length} items`));
    }, [mutate, snapshot]);

    const undo = useCallback(() => {
        const last = past[past.length - 1];
        if (!last) return;
        setPast(prev => prev.slice(0, -1));
        setFuture(prev => [...prev, { kind, nodes: settings.profiles[kind].nodes }]);
        setKind(last.kind);
        commit(
            { ...settings, profiles: { ...settings.profiles, [last.kind]: { ...settings.profiles[last.kind], nodes: last.nodes } } },
            t('已撤销', 'Undone')
        );
    }, [commit, kind, past, settings]);

    const redo = useCallback(() => {
        const next = future[future.length - 1];
        if (!next) return;
        setFuture(prev => prev.slice(0, -1));
        setPast(prev => [...prev, { kind, nodes: settings.profiles[kind].nodes }]);
        setKind(next.kind);
        commit(
            { ...settings, profiles: { ...settings.profiles, [next.kind]: { ...settings.profiles[next.kind], nodes: next.nodes } } },
            t('已重做', 'Redone')
        );
    }, [commit, future, kind, settings]);

    const addSeparator = useCallback(() => {
        const parentId = selected && findNode(profile.nodes, selected)?.kind === 'group' && expanded.includes(selected) ? selected : null;
        const list = parentId ? (findNode(profile.nodes, parentId) as GroupNode).children : profile.nodes;
        const anchor = parentId ? null : selected;
        const index = anchor ? (locate(profile.nodes, anchor)?.index ?? list.length) + 1 : list.length;
        mutate(insertNode(profile.nodes, sepNode(), parentId, index), t('已添加分隔线', 'Separator added'));
    }, [expanded, mutate, profile.nodes, selected]);

    const addCustomItem = useCallback(() => {
        const parentId = selected && findNode(profile.nodes, selected)?.kind === 'group' ? selected : null;
        const node = itemNode(null, t('新命令', 'New command'), { type: 'open', path: '', args: '' });
        const index = parentId ? (findNode(profile.nodes, parentId) as GroupNode).children.length : profile.nodes.length;
        mutate(insertNode(profile.nodes, node, parentId, index), t('已添加自定义命令', 'Custom command added'));
        setSelected(node.id);
        if (parentId && !expanded.includes(parentId)) setExpanded(prev => [...prev, parentId]);
    }, [expanded, mutate, profile.nodes, selected]);

    const addGroup = useCallback(
        (layout: 'fold' | 'row') => {
            const parentId = selected && findNode(profile.nodes, selected)?.kind === 'group' ? selected : null;
            const group = groupNode(layout, layout === 'row' ? t('横排', 'Row') : t('分组', 'Group'));
            const index = parentId ? (findNode(profile.nodes, parentId) as GroupNode).children.length : profile.nodes.length;
            mutate(insertNode(profile.nodes, group, parentId, index), t('已新建分组', 'Group created'));
            setSelected(group.id);
            setExpanded(prev => [...prev, group.id]);
        },
        [expanded, mutate, profile.nodes, selected]
    );

    const toggleHidden = useCallback(
        (id: string) => {
            const node = findNode(profile.nodes, id);
            if (!node || node.kind === 'sep') return;
            mutate(updateNode(profile.nodes, id, toggledHidden), t('已切换显示状态', 'Visibility toggled'));
        },
        [mutate, profile.nodes]
    );

    const removeSelected = useCallback(() => {
        if (!selected) return;
        const { nodes } = removeNode(profile.nodes, selected);
        mutate(nodes, t('已删除', 'Deleted'));
        setSelected(null);
    }, [mutate, profile.nodes, selected]);

    const stats = useMemo(
        () => ({
            managed: countItems(profile.nodes),
            total: snapshot?.items.filter(item => !item.separator).length ?? 0,
            leftovers: leftovers.length
        }),
        [leftovers.length, profile.nodes, snapshot]
    );

    const renderLevel = (
        nodes: Node[],
        parentId: string | null,
        depth: number,
        containerLayout: 'fold' | 'row',
        keyPrefix: string
    ): ReactNode[] => {
        const out: ReactNode[] = [];
        nodes.forEach((node, index) => {
            const showBefore = drop && drop.parentId === parentId && drop.index === index && drop.mode === 'before';
            if (showBefore) out.push(<DropLine key={`${keyPrefix}-line-${node.id}`} c={c} />);
            out.push(
                <RowView
                    key={node.id}
                    node={node}
                    parentId={parentId}
                    index={index}
                    depth={depth}
                    compact={containerLayout === 'row'}
                    c={c}
                    selected={selected === node.id}
                    dragging={drag?.source.kind === 'node' && drag.source.id === node.id}
                    insideHint={drop?.parentId === node.id || undefined}
                    expanded={expanded.includes(node.id)}
                    onSelect={setSelected}
                    onToggleExpand={id => setExpanded(prev => (prev.includes(id) ? prev.filter(entry => entry !== id) : [...prev, id]))}
                    onToggleHidden={toggleHidden}
                    onBeginDrag={beginDrag}
                    onDragUp={onRowUp}
                    offer={offer}
                    active={drag !== null}
                />
            );

            if (node.kind === 'group' && expanded.includes(node.id)) {
                out.push(
                    <flex key={`${node.id}-body`} horizontal={false} alignItems="stretch" paddingLeft={depth * 12 + 22} gap={0}>
                        <flex
                            horizontal={false}
                            alignItems="stretch"
                            paddingLeft={10}
                            borderColor={c.divider}
                            borderWidth={1}
                            borderRadius={6}
                            gap={ROW_GAP}
                            padding={6}
                            backgroundColor={c.subtle}
                        >
                            {renderLevel(node.children, node.id, depth + 1, node.layout, `${keyPrefix}-${node.id}`)}
                            <GroupDropZone groupId={node.id} index={node.children.length} c={c} offer={offer} active={drag !== null} />
                        </flex>
                    </flex>
                );
            }
        });

        const showAfter = drop && drop.parentId === parentId && drop.index === nodes.length && drop.mode === 'after';
        if (showAfter && nodes.length > 0) out.push(<DropLine key={`${keyPrefix}-line-end`} c={c} />);
        return out;
    };

    return (
        <flex horizontal={false} width={WINDOW_WIDTH} height={WINDOW_HEIGHT} backgroundColor={c.windowBg} alignItems="stretch">
            <Header
                c={c}
                profile={profile}
                kind={kind}
                stats={stats}
                onToggleEnabled={() => patchProfile({ enabled: !profile.enabled }, profile.enabled ? t('已停用该类型', 'Profile disabled') : t('已启用该类型', 'Profile enabled'))}
                onClose={props.onClose}
            />

            <flex horizontal={true} flexGrow={1} alignItems="stretch" gap={0}>
                <Rail c={c} kind={kind} settings={settings} onSelect={setKind} />
                <flex width={CANVAS_WIDTH} horizontal={false} alignItems="stretch" padding={12} gap={10} backgroundColor={c.canvasBg}>
                    <CanvasToolbar
                        c={c}
                        profile={profile}
                        canUndo={past.length > 0}
                        canRedo={future.length > 0}
                        onUndo={undo}
                        onRedo={redo}
                        onAddGroup={addGroup}
                        onAddSep={addSeparator}
                        onAddCommand={addCustomItem}
                        onImport={importSnapshot}
                        hasSnapshot={snapshot !== null}
                    />

                    {snapshot === null ? (
                        <Card c={c} flexGrow={1}>
                            <EmptyState
                                c={c}
                                icon={Icons.info}
                                title={t('还没有这个类型的菜单数据', 'No captured data for this type yet')}
                                message={t(
                                    '右键菜单只有在真正弹出的瞬间才能被读取。请先右键打开一次这个类型的菜单 (例如在文件上右键), 然后回到这里。',
                                    'Menus can only be read while they are open. Open one of this type first (e.g. right-click a file), then come back.'
                                )}
                            />
                        </Card>
                    ) : (
                        <flex horizontal={false} flexGrow={1} flexShrink={1} alignItems="stretch" gap={10} enableScrolling={true} cropOverflow={true} maxHeight={WINDOW_HEIGHT - 220}>
                            <Card c={c} padding={0}>
                                <flex horizontal={false} alignItems="stretch" padding={10} gap={4}>
                                    <FieldRow c={c} stacked={true} label={t('菜单预览', 'Menu preview')} hint={t('拖拽调整顺序, 拖到分组标题的中线可放进分组', 'Drag to reorder, drop on a group title to move it inside')}>
                                        <flex>
                                            <Text c={c} text={`${stats.managed} ${t('项受规则控制', 'managed')}`} fontSize={11} color={c.textSecondary} />
                                        </flex>
                                    </FieldRow>
                                    <flex
                                        horizontal={false}
                                        alignItems="stretch"
                                        gap={ROW_GAP}
                                        padding={8}
                                        borderRadius={8}
                                        borderColor={c.border}
                                        borderWidth={1}
                                        backgroundColor={c.menuBg}
                                    >
                                        {profile.nodes.length === 0 ? (
                                            <flex padding={16} justifyContent="center" alignItems="center">
                                                <Text c={c} text={t('规则是空的 - 先用上面的「导入当前菜单」开始', 'Rules are empty - start with "Import captured menu"')} fontSize={12} color={c.textSecondary} />
                                            </flex>
                                        ) : (
                                            renderLevel(profile.nodes, null, 0, 'fold', 'root')
                                        )}
                                        <CanvasDropZone c={c} offer={offer} active={drag !== null} count={profile.nodes.length} />
                                    </flex>
                                </flex>
                            </Card>

                            <Leftovers
                                c={c}
                                items={leftovers}
                                policy={profile.unmanaged}
                                onPolicy={policy => patchProfile({ unmanaged: policy })}
                                onAdd={item => {
                                    const node = nodeFromSnapshotItem(item);
                                    mutate(insertNode(profile.nodes, node, null, profile.nodes.length), t(`已加入「${item.name}」`, `Added "${item.name}"`));
                                    setSelected(node.id);
                                }}
                                onAddAll={importSnapshot}
                                onBeginDrag={beginDrag}
                                onDragUp={onRowUp}
                                dropRef={drop}
                                setDrop={setDrop}
                                active={drag !== null}
                            />
                        </flex>
                    )}

                    <StatusBar c={c} status={status} tone={toneColor('info', c)} stats={stats} />
                </flex>

                <Inspector
                    c={c}
                    nodes={profile.nodes}
                    node={selectedNode}
                    selectedId={selected}
                    profile={profile}
                    kind={kind}
                    snapshot={snapshot}
                    stats={stats}
                    onPatchProfile={patchProfile}
                    onImport={importSnapshot}
                    onClear={() => mutate([], t('已清空规则', 'Rules cleared'))}
                    customSvg={customSvg}
                    onCustomSvg={setCustomSvg}
                    onMutate={(patch, note) => {
                        if (!selected) return;
                        mutate(updateNode(profile.nodes, selected, patch), note);
                    }}
                    onRemove={removeSelected}
                    onDuplicate={() => {
                        if (!selected) return;
                        const result = duplicateNode(profile.nodes, selected);
                        mutate(result.nodes, t('已复制', 'Duplicated'));
                        if (result.id) setSelected(result.id);
                    }}
                    onUnwrap={() => {
                        if (!selected) return;
                        mutate(unwrapGroup(profile.nodes, selected), t('已解散分组', 'Group dissolved'));
                    }}
                    onWrap={(layout) => {
                        if (!selected) return;
                        const anchor = locate(profile.nodes, selected);
                        const target = findNode(profile.nodes, selected);
                        if (!anchor || !target) return;
                        const group = groupNode(layout, layout === 'row' ? t('横排', 'Row') : t('分组', 'Group'));
                        group.children = [target];
                        const parentId = anchor.parent ? anchor.parent.id : null;
                        let next = removeNode(profile.nodes, selected).nodes;
                        next = insertNode(next, group, parentId, clampIndex(anchor.index, nodesOf(next, parentId).length));
                        mutate(next, t('已收纳到分组', 'Wrapped in group'));
                        setSelected(group.id);
                        setExpanded(prev => [...prev, group.id]);
                    }}
                    onMove={(delta) => {
                        if (!selected) return;
                        const anchor = locate(profile.nodes, selected);
                        if (!anchor) return;
                        const parentId = anchor.parent ? anchor.parent.id : null;
                        mutate(moveNode(profile.nodes, selected, parentId, clampIndex(anchor.index + delta, anchor.list.length)), t('已调整位置', 'Moved'));
                    }}
                    onMoveOut={() => {
                        if (!selected) return;
                        const anchor = locate(profile.nodes, selected);
                        if (!anchor || !anchor.parent) return;
                        const outer = locate(profile.nodes, anchor.parent.id);
                        if (!outer) return;
                        const parentId = outer.parent ? outer.parent.id : null;
                        mutate(moveNode(profile.nodes, selected, parentId, outer.index + 1), t('已移出分组', 'Moved out of group'));
                    }}
                />
            </flex>
        </flex>
    );
});

const DropLine = ({ c }: { c: ReturnType<typeof fluent> }) => (
    <flex horizontal={true} height={3} alignItems="center" paddingLeft={6} paddingRight={6}>
        <flex flexGrow={1} height={2} borderRadius={1} backgroundColor={c.accent} />
    </flex>
);

const CanvasDropZone = ({
    c,
    offer,
    active,
    count
}: {
    c: ReturnType<typeof fluent>;
    offer: (p: number, t: DropTarget) => void;
    active: boolean;
    count: number;
}) => {
    const { isHovered, ...events } = useHoverActive();
    const hovered = active && isHovered;
    return (
        <flex
            horizontal={true}
            height={22}
            alignItems="center"
            justifyContent="center"
            borderRadius={5}
            backgroundColor={hovered ? c.accentSoft : undefined}
            onMouseEnter={events.onMouseEnter}
            onMouseLeave={events.onMouseLeave}
            onMouseMove={() => {
                if (active) offer(5, { parentId: null, index: count, mode: 'after' });
            }}
        >
            <Text c={c} text={active ? t('放到这里 (菜单末尾)', 'Drop here (end of menu)') : t('菜单末尾', 'End of menu')} fontSize={11} color={hovered ? c.accent : c.textTertiary} />
        </flex>
    );
};

const GroupDropZone = ({ groupId, index, c, offer, active }: { groupId: string; index: number; c: ReturnType<typeof fluent>; offer: (p: number, t: DropTarget) => void; active: boolean }) => {
    const { isHovered, ...events } = useHoverActive();
    const hovered = active && isHovered;
    return (
        <flex
            horizontal={true}
            height={20}
            alignItems="center"
            justifyContent="center"
            borderRadius={4}
            backgroundColor={hovered ? c.accentSoft : undefined}
            onMouseEnter={events.onMouseEnter}
            onMouseLeave={events.onMouseLeave}
            onMouseMove={() => {
                if (active) offer(1, { parentId: groupId, index, mode: 'inside' });
            }}
        >
            <Text c={c} text={hovered ? t('放入该分组', 'Drop into group') : t('拖到此处放入分组', 'Drop here to add into group')} fontSize={10} color={hovered ? c.accent : c.textTertiary} />
        </flex>
    );
};

type RowProps = {
    node: Node;
    parentId: string | null;
    index: number;
    depth: number;
    compact: boolean;
    c: ReturnType<typeof fluent>;
    selected: boolean;
    dragging: boolean;
    insideHint?: boolean;
    expanded: boolean;
    onSelect: (id: string) => void;
    onToggleExpand: (id: string) => void;
    onToggleHidden: (id: string) => void;
    onBeginDrag: (source: NonNullable<DragState>['source'], label: string) => void;
    onDragUp: () => void;
    offer: (p: number, t: DropTarget) => void;
    active: boolean;
};

const RowView = memo((props: RowProps) => {
    const { node, c } = props;
    const { isHovered, ...events } = useHoverActive();
    const size = props.compact ? 24 : ROW_HEIGHT;
    const isGroup = node.kind === 'group';
    const isSep = node.kind === 'sep';
    const hidden = !isSep && node.hidden;
    const label = nodeLabel(node, t('未命名', 'Unnamed'));

    const background = props.dragging ? c.accentSoft : props.selected ? c.selection : isHovered ? c.hover : undefined;

    return (
        <flex
            horizontal={true}
            height={size}
            alignItems="center"
            gap={6}
            paddingLeft={6}
            paddingRight={6}
            borderRadius={5}
            backgroundColor={background}
            borderColor={props.insideHint ? c.accent : undefined}
            borderWidth={props.insideHint ? 1 : 0}
            opacity={hidden ? 130 : 255}
            cursor={props.active ? 'grabbing' : 'grab'}
            animatedVars={COLOR_VARS}
            animationCurve={{ ...FAST, vars: COLOR_VARS }}
            onMouseEnter={events.onMouseEnter}
            onMouseLeave={events.onMouseLeave}
            onMouseDown={() => {
                props.onSelect(node.id);
                props.onBeginDrag({ kind: 'node', id: node.id }, label);
            }}
            onMouseUp={props.onDragUp}
            onMouseMove={(_x, y) => {
                if (!props.active || props.dragging) return;
                if (isGroup && y > size * 0.3 && y < size * 0.7) {
                    props.offer(0, { parentId: node.id, index: 0, mode: 'inside' });
                    return;
                }
                props.offer(0, {
                    parentId: props.parentId,
                    index: y < size / 2 ? props.index : props.index + 1,
                    mode: y < size / 2 ? 'before' : 'after'
                });
            }}
        >
            {iconElement(Icons.grip, 11, hidden ? c.textTertiary : c.textSecondary)}
            {isSep ? (
                <flex flexGrow={1} height={2} borderRadius={1} backgroundColor={c.divider} />
            ) : (
                <Fragment>
                    {nodeIcon(node, hidden ? c.textTertiary : c.text, 15, isGroup ? Icons.folder : Icons.file)}
                    <flex flexGrow={1} horizontal={true} alignItems="center" gap={6}>
                        <Text c={c} text={label} fontSize={13} color={hidden ? c.textTertiary : c.text} maxWidth={props.compact ? 90 : 320} truncate={props.compact ? 8 : 34} />
                        {!props.compact && node.kind === 'item' && node.ref?.hotkey ? <Text c={c} text={node.ref.hotkey} fontSize={11} color={c.textTertiary} /> : null}
                    </flex>
                </Fragment>
            )}

            {isGroup ? <Chip c={c} label={(node as GroupNode).layout === 'row' ? t('横排', 'Row') : t('分组', 'Group')} fg={c.accent} bg={c.accentSoft} icon={(node as GroupNode).layout === 'row' ? Icons.rowStack : Icons.folder} /> : null}
            {isSep ? null : node.kind === 'item' && node.ref === null ? <Chip c={c} label={t('自定义', 'Custom')} fg={c.successText} bg={c.successSoft} icon={Icons.command} /> : null}
            {node.kind === 'item' && node.disabled ? <Chip c={c} label={t('禁用', 'Disabled')} fg={c.warningText} bg={c.warningSoft} icon={Icons.ban} /> : null}
            {hidden ? <Chip c={c} label={t('已隐藏', 'Hidden')} fg={c.textSecondary} bg={c.subtle} icon={Icons.eyeOff} /> : null}
            {node.kind === 'item' && node.ref?.hasSubmenu ? <Chip c={c} label={t('子菜单', 'Submenu')} fg={c.textSecondary} bg={c.subtle} icon={Icons.layers} /> : null}

            {isGroup ? (
                <IconAction c={c} icon={props.expanded ? Icons.chevronDown : Icons.chevronRight} onClick={() => props.onToggleExpand(node.id)} />
            ) : null}
            {isSep ? null : <IconAction c={c} icon={hidden ? Icons.eyeOff : Icons.eye} onClick={() => props.onToggleHidden(node.id)} />}
        </flex>
    );
});

const IconAction = ({ c, icon, onClick }: { c: ReturnType<typeof fluent>; icon: string; onClick: () => void }) => {
    const { isHovered, ...events } = useHoverActive();
    return (
        <flex
            horizontal={true}
            width={22}
            height={22}
            alignItems="center"
            justifyContent="center"
            borderRadius={4}
            backgroundColor={isHovered ? c.hoverStrong : undefined}
            cursor="hand"
            animatedVars={COLOR_VARS}
            animationCurve={{ ...FAST, vars: COLOR_VARS }}
            onMouseEnter={events.onMouseEnter}
            onMouseLeave={events.onMouseLeave}
            onMouseDown={onClick}
        >
            {iconElement(icon, 12, isHovered ? c.text : c.textSecondary)}
        </flex>
    );
};

const Header = ({
    c,
    profile,
    kind,
    stats,
    onToggleEnabled,
    onClose
}: {
    c: ReturnType<typeof fluent>;
    profile: Profile;
    kind: MenuKind;
    stats: { managed: number; total: number; leftovers: number };
    onToggleEnabled: () => void;
    onClose: () => void;
}) => (
    <flex horizontal={true} height={58} alignItems="center" gap={12} paddingLeft={16} paddingRight={16} backgroundColor={c.headerBg} borderColor={c.divider} borderWidth={1}>
        <flex width={30} height={30} alignItems="center" justifyContent="center" borderRadius={7} backgroundColor={c.accentSoft}>
            {iconElement(Icons.list, 17, c.accent)}
        </flex>
        <flex horizontal={false} alignItems="start" gap={1}>
            <Text c={c} text={t('右键菜单编辑器', 'Context Menu Editor')} fontSize={15} fontWeight={600} />
            <Text c={c} text={`${KIND_META[kind].label} · ${stats.managed}/${stats.total} ${t('项受控', 'managed')}`} fontSize={11} color={c.textSecondary} />
        </flex>
        <flex flexGrow={1} />
        <ToggleSwitch c={c} value={profile.enabled} onChange={onToggleEnabled} label={t('启用该类型规则', 'Enable rules for this type')} />
        <IconAction c={c} icon={Icons.close} onClick={onClose} />
    </flex>
);

const Rail = ({ c, kind, settings, onSelect }: { c: ReturnType<typeof fluent>; kind: MenuKind; settings: Settings; onSelect: (k: MenuKind) => void }) => (
    <flex horizontal={false} width={RAIL_WIDTH} flexShrink={0} alignItems="stretch" padding={10} gap={6} backgroundColor={c.railBg} borderColor={c.divider} borderWidth={1}>
        <SectionLabel c={c} text={t('菜单类型', 'Menu types')} />
        {MENU_KINDS.map(entry => {
            const profile = settings.profiles[entry];
            const snapshot = settings.snapshots[entry];
            return <RailItem key={entry} c={c} kind={entry} selected={kind === entry} profile={profile} captured={snapshot !== null} onSelect={onSelect} />;
        })}
        <flex flexGrow={1} />
        <InfoBar
            c={c}
            severity="info"
            title={t('规则如何生效', 'How rules apply')}
            message={t('按菜单类型保存, 每次弹出时套用。原始菜单项不会被修改。', 'Stored per menu type, applied on every popup. Native items are never modified.')}
            maxTextWidth={196}
        />
    </flex>
);

const RailItem = ({ c, kind, selected, profile, captured, onSelect }: { c: ReturnType<typeof fluent>; kind: MenuKind; selected: boolean; profile: Profile; captured: boolean; onSelect: (k: MenuKind) => void }) => {
    const { isHovered, ...events } = useHoverActive();
    const meta = KIND_META[kind];
    return (
        <flex
            horizontal={true}
            height={50}
            alignItems="center"
            gap={9}
            paddingLeft={9}
            paddingRight={9}
            borderRadius={6}
            backgroundColor={selected ? c.selection : isHovered ? c.hover : undefined}
            borderColor={selected ? c.accent : undefined}
            borderWidth={selected ? 1 : 0}
            cursor="hand"
            animatedVars={COLOR_VARS}
            animationCurve={{ ...FAST, vars: COLOR_VARS }}
            onMouseEnter={events.onMouseEnter}
            onMouseLeave={events.onMouseLeave}
            onMouseDown={() => onSelect(kind)}
        >
            {iconElement(meta.icon, 16, profile.enabled ? c.accent : c.textSecondary)}
            <flex horizontal={false} flexGrow={1} alignItems="start" gap={1}>
                <Text c={c} text={meta.label} fontSize={13} fontWeight={selected ? 600 : 400} maxWidth={140} />
                <Text c={c} text={captured ? `${countItems(profile.nodes)} ${t('项规则', 'rules')}` : t('未采集', 'not captured')} fontSize={10} color={profile.enabled ? c.successText : c.textTertiary} />
            </flex>
            {profile.enabled ? <Badge c={c} text="ON" fg={c.successText} bg={c.successSoft} /> : <Badge c={c} text="—" fg={c.textTertiary} bg={c.subtle} />}
        </flex>
    );
};

const CanvasToolbar = ({
    c,
    profile,
    canUndo,
    canRedo,
    onUndo,
    onRedo,
    onAddGroup,
    onAddSep,
    onAddCommand,
    onImport,
    hasSnapshot
}: {
    c: ReturnType<typeof fluent>;
    profile: Profile;
    canUndo: boolean;
    canRedo: boolean;
    onUndo: () => void;
    onRedo: () => void;
    onAddGroup: (layout: 'fold' | 'row') => void;
    onAddSep: () => void;
    onAddCommand: () => void;
    onImport: () => void;
    hasSnapshot: boolean;
}) => (
    <flex horizontal={false} alignItems="stretch" gap={6}>
        <flex horizontal={true} alignItems="center" gap={6}>
            <Button c={c} icon={Icons.undo} label={t('撤销', 'Undo')} variant="subtle" onClick={onUndo} disabled={!canUndo} />
            <Button c={c} icon={Icons.redo} label={t('重做', 'Redo')} variant="subtle" onClick={onRedo} disabled={!canRedo} />
            <Divider c={c} vertical={true} />
            <Button c={c} icon={Icons.folder} label={t('分组', 'Group')} variant="standard" onClick={() => onAddGroup('fold')} />
            <Button c={c} icon={Icons.rowStack} label={t('横排', 'Row')} variant="standard" onClick={() => onAddGroup('row')} />
            <Button c={c} icon={Icons.separator} label={t('分隔线', 'Separator')} variant="standard" onClick={onAddSep} />
            <Button c={c} icon={Icons.command} label={t('新命令', 'Command')} variant="standard" onClick={onAddCommand} />
            <flex flexGrow={1} />
        </flex>
        <flex horizontal={true} alignItems="center" gap={6}>
            {iconElement(Icons.info, 11, c.textTertiary)}
            <Text c={c} text={profile.unmanaged === 'hide' ? t('未列项: 隐藏', 'Unlisted: hidden') : profile.unmanaged === 'keep-end' ? t('未列项: 保留在末尾', 'Unlisted: kept at end') : t('未列项: 保持原位置', 'Unlisted: keep position')} fontSize={10} color={c.textTertiary} />
            <flex flexGrow={1} />
            <Button c={c} icon={Icons.importFile} label={t('导入当前菜单', 'Import captured')} variant="standard" onClick={onImport} disabled={!hasSnapshot} />
        </flex>
    </flex>
);

const Leftovers = ({
    c,
    items,
    policy,
    onPolicy,
    onAdd,
    onAddAll,
    onBeginDrag,
    onDragUp,
    dropRef,
    setDrop,
    active
}: {
    c: ReturnType<typeof fluent>;
    items: SnapshotItem[];
    policy: Profile['unmanaged'];
    onPolicy: (p: Profile['unmanaged']) => void;
    onAdd: (item: SnapshotItem) => void;
    onAddAll: () => void;
    onBeginDrag: (source: NonNullable<DragState>['source'], label: string) => void;
    onDragUp: () => void;
    dropRef: DropTarget | null;
    setDrop: (t: DropTarget | null) => void;
    active: boolean;
}) => (
    <Card c={c} padding={10}>
        <flex horizontal={false} alignItems="stretch" gap={7}>
            <FieldRow c={c} label={t('未纳入规则的原生项', 'Native items not in the rules')} hint={t('拖到上面的菜单里即可纳入规则', 'Drag one into the menu above to manage it')}>
                <Button c={c} icon={Icons.plus} label={t('全部放入规则', 'Add all')} variant="subtle" onClick={onAddAll} disabled={items.length === 0} />
            </FieldRow>
            <SegmentedControl
                c={c}
                value={policy}
                onChange={onPolicy}
                options={[
                    { value: 'keep-end' as Profile['unmanaged'], label: t('保留在末尾', 'Keep at end') },
                    { value: 'keep-original' as Profile['unmanaged'], label: t('保持原位置', 'Keep position') },
                    { value: 'hide' as Profile['unmanaged'], label: t('隐藏', 'Hide') }
                ]}
            />
            {items.length === 0 ? (
                <Text c={c} text={t('没有未纳入的原生项', 'Nothing left over')} fontSize={11} color={c.textTertiary} />
            ) : (
                <flex horizontal={false} alignItems="stretch" gap={2} maxHeight={190} enableScrolling={true} cropOverflow={true}>
                    {items.map(item => (
                        <LeftoverRow
                            key={item.key}
                            c={c}
                            item={item}
                            active={active}
                            highlight={dropRef?.parentId === '__leftovers' && dropRef.index === 0}
                            onBeginDrag={onBeginDrag}
                            onDragUp={onDragUp}
                            onAdd={() => onAdd(item)}
                            onMouseMove={() => {
                                if (active) setDrop({ parentId: '__leftovers', index: 0, mode: 'inside' });
                            }}
                        />
                    ))}
                </flex>
            )}
        </flex>
    </Card>
);

const LeftoverRow = ({
    c,
    item,
    active,
    highlight,
    onBeginDrag,
    onDragUp,
    onAdd,
    onMouseMove
}: {
    c: ReturnType<typeof fluent>;
    item: SnapshotItem;
    active: boolean;
    highlight: boolean;
    onBeginDrag: (source: NonNullable<DragState>['source'], label: string) => void;
    onDragUp: () => void;
    onAdd: () => void;
    onMouseMove: () => void;
}) => {
    const { isHovered, ...events } = useHoverActive();
    return (
        <flex
            horizontal={true}
            height={26}
            alignItems="center"
            gap={7}
            paddingLeft={6}
            paddingRight={4}
            borderRadius={4}
            backgroundColor={highlight ? c.accentSoft : isHovered ? c.hover : undefined}
            opacity={item.disabled ? 150 : 255}
            cursor={active ? 'grabbing' : 'grab'}
            animatedVars={COLOR_VARS}
            animationCurve={{ ...FAST, vars: COLOR_VARS }}
            onMouseEnter={events.onMouseEnter}
            onMouseLeave={events.onMouseLeave}
            onMouseMove={onMouseMove}
            onMouseDown={() => onBeginDrag({ kind: 'unmanaged', item }, item.name)}
            onMouseUp={onDragUp}
        >
            {iconElement(item.hasSubmenu ? Icons.layers : item.separator ? Icons.separator : Icons.file, 13, c.textSecondary)}
            <flex flexGrow={1}>
                <Text c={c} text={item.name} fontSize={12} maxWidth={260} truncate={30} />
            </flex>
            {item.hotkey ? <Text c={c} text={item.hotkey} fontSize={10} color={c.textTertiary} /> : null}
            <IconAction c={c} icon={Icons.plus} onClick={onAdd} />
        </flex>
    );
};

const StatusBar = ({ c, status, tone, stats }: { c: ReturnType<typeof fluent>; status: string; tone: { fg: string; bg: string }; stats: { managed: number; total: number; leftovers: number } }) => (
    <flex horizontal={true} height={30} alignItems="center" gap={8} paddingLeft={4} paddingRight={4}>
        {iconElement(Icons.info, 12, tone.fg)}
        <flex flexGrow={1}>
            <Text c={c} text={status} fontSize={11} color={tone.fg} maxWidth={620} truncate={96} />
        </flex>
        <Text c={c} text={`${stats.total} ${t('项原生', 'native')} · ${stats.managed} ${t('项受控', 'managed')} · ${stats.leftovers} ${t('项未纳入', 'unmanaged')}`} fontSize={11} color={c.textTertiary} />
    </flex>
);

const clockText = (at: number): string => {
    if (!at) return '-';
    const date = new Date(at);
    const pad = (value: number) => String(value).padStart(2, '0');
    return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
};

const ProfilePanel = ({
    c,
    profile,
    kind,
    snapshot,
    stats,
    onPatch,
    onImport,
    onClear
}: {
    c: ReturnType<typeof fluent>;
    profile: Profile;
    kind: MenuKind;
    snapshot: Snapshot | null;
    stats: { managed: number; total: number; leftovers: number };
    onPatch: (patch: Partial<Profile>, note?: string) => void;
    onImport: () => void;
    onClear: () => void;
}) => (
    <flex horizontal={false} alignItems="stretch" gap={10}>
        <flex horizontal={true} alignItems="center" gap={9} paddingTop={4} paddingBottom={4}>
            {iconElement(KIND_META[kind].icon, 18, profile.enabled ? c.accent : c.textSecondary)}
            <flex horizontal={false} alignItems="start" gap={1} flexGrow={1}>
                <Text c={c} text={KIND_META[kind].label} fontSize={14} fontWeight={600} maxWidth={220} truncate={24} />
                <Text c={c} text={t('菜单类型设置', 'Menu type settings')} fontSize={11} color={c.textSecondary} />
            </flex>
        </flex>

        <Card c={c} padding={10}>
            <flex horizontal={false} alignItems="stretch" gap={9}>
                <ToggleSwitch
                    c={c}
                    value={profile.enabled}
                    onChange={enabled => onPatch({ enabled }, enabled ? t('已启用该类型', 'Profile enabled') : t('已停用该类型', 'Profile disabled'))}
                    label={t('启用该类型规则', 'Enable rules')}
                    description={KIND_META[kind].hint}
                />
                <FieldRow c={c} stacked={true} label={t('未纳入规则的原生项', 'Native items not in the rules')} hint={t('规则里没列到的原生项怎么处理', 'What happens to native items the rules do not mention')}>
                    <SegmentedControl
                        c={c}
                        value={profile.unmanaged}
                        onChange={unmanaged => onPatch({ unmanaged })}
                        options={[
                            { value: 'keep-end' as Profile['unmanaged'], label: t('保留在末尾', 'Keep at end') },
                            { value: 'keep-original' as Profile['unmanaged'], label: t('保持原位置', 'Keep position') },
                            { value: 'hide' as Profile['unmanaged'], label: t('隐藏', 'Hide') }
                        ]}
                    />
                </FieldRow>
                {kind === 'other' ? (
                    <Fragment>
                        <FieldRow c={c} stacked={true} label={t('适用进程', 'Processes')} hint={t('进程名, 逗号分隔; 留空表示所有程序', 'Exe names, comma separated; empty means every app')}>
                            <TextField c={c} value={profile.processFilter} onChange={processFilter => onPatch({ processFilter })} placeholder="explorer.exe, code.exe" />
                        </FieldRow>
                        <FieldRow c={c} stacked={true} label={t('窗口标题包含', 'Window title contains')} hint={t('留空表示不限制', 'Empty means no restriction')}>
                            <TextField c={c} value={profile.titleFilter} onChange={titleFilter => onPatch({ titleFilter })} />
                        </FieldRow>
                    </Fragment>
                ) : null}
            </flex>
        </Card>

        <Card c={c} padding={10}>
            <flex horizontal={false} alignItems="stretch" gap={6}>
                <SectionLabel c={c} text={t('采集与统计', 'Capture and stats')} />
                <MatchRow c={c} label={t('采集时间', 'captured')} value={clockText(snapshot?.at ?? 0)} />
                <MatchRow c={c} label={t('窗口', 'window')} value={snapshot ? snapshot.windowTitle || snapshot.className || '-' : '-'} />
                <MatchRow c={c} label={t('原生项', 'native')} value={String(stats.total)} />
                <MatchRow c={c} label={t('受规则控制', 'managed')} value={String(stats.managed)} />
                <MatchRow c={c} label={t('未纳入', 'unmanaged')} value={String(stats.leftovers)} />
                <flex horizontal={true} gap={6}>
                    <Button c={c} icon={Icons.importFile} label={t('导入当前菜单', 'Import')} variant="standard" onClick={onImport} disabled={!snapshot} flexGrow={1} />
                    <Button c={c} icon={Icons.trash} label={t('清空规则', 'Clear')} variant="danger" onClick={onClear} disabled={profile.nodes.length === 0} flexGrow={1} />
                </flex>
            </flex>
        </Card>

        <InfoBar
            c={c}
            severity="info"
            title={t('选中一行就能编辑', 'Select a row to edit')}
            message={t('点一行改名字/图标/隐藏; 拖动可排序或放进分组。', 'Click a row to rename, re-icon or hide it; drag to sort or group.')}
            maxTextWidth={272}
        />
    </flex>
);

const Inspector = ({
    c,
    nodes,
    node,
    selectedId,
    profile,
    kind,
    snapshot,
    stats,
    customSvg,
    onCustomSvg,
    onMutate,
    onRemove,
    onDuplicate,
    onUnwrap,
    onWrap,
    onMove,
    onMoveOut,
    onPatchProfile,
    onImport,
    onClear
}: {
    c: ReturnType<typeof fluent>;
    nodes: Node[];
    node: Node | null;
    selectedId: string | null;
    profile: Profile;
    kind: MenuKind;
    snapshot: Snapshot | null;
    stats: { managed: number; total: number; leftovers: number };
    customSvg: string;
    onCustomSvg: (svg: string) => void;
    onMutate: (patch: (node: Node) => Node, note?: string) => void;
    onRemove: () => void;
    onDuplicate: () => void;
    onUnwrap: () => void;
    onWrap: (layout: 'fold' | 'row') => void;
    onMove: (delta: number) => void;
    onMoveOut: () => void;
    onPatchProfile: (patch: Partial<Profile>, note?: string) => void;
    onImport: () => void;
    onClear: () => void;
}) => (
    <flex horizontal={false} width={INSPECTOR_WIDTH} flexShrink={0} alignItems="stretch" padding={12} gap={10} backgroundColor={c.railBg} borderColor={c.divider} borderWidth={1} enableScrolling={true} cropOverflow={true}>
        {node === null || selectedId === null ? (
            <ProfilePanel c={c} profile={profile} kind={kind} snapshot={snapshot} stats={stats} onPatch={onPatchProfile} onImport={onImport} onClear={onClear} />
        ) : (
            <Fragment>
                <InspectorHead c={c} node={node} />
                <Card c={c} padding={10}>
                    <flex horizontal={false} alignItems="stretch" gap={9}>
                        <SectionLabel c={c} text={t('显示', 'Appearance')} />
                        {node.kind === 'group' ? (
                            <FieldRow c={c} stacked={true} label={t('分组名称', 'Group name')}>
                                <TextField c={c} value={node.label} onChange={value => onMutate(current => (current.kind === 'group' ? { ...current, label: value } : current))} placeholder={t('分组', 'Group')} />
                            </FieldRow>
                        ) : node.kind === 'item' ? (
                            <FieldRow c={c} stacked={true} label={t('显示名称', 'Display name')} hint={node.ref ? t(`原生: ${node.ref.name}`, `native: ${node.ref.name}`) : t('自定义命令必须填写名称', 'A custom command needs a name')}>
                                <TextField
                                    c={c}
                                    value={node.label ?? (node.ref?.name ?? '')}
                                    onChange={value => onMutate(current => (current.kind === 'item' ? { ...current, label: value.length > 0 ? value : null } : current))}
                                    placeholder={t('留空则使用原生名称', 'Empty keeps the native name')}
                                />
                            </FieldRow>
                        ) : null}

                        {node.kind === 'group' ? (
                            <FieldRow c={c} stacked={true} label={t('布局', 'Layout')} hint={node.layout === 'row' ? t('横排组在菜单里是一排按钮的容器, 名称只用于编辑器', 'A row group is just a container for one line of buttons; its name is editor-only') : t('分组会收进子菜单, 名称就是子菜单标题', 'A group folds into a submenu and its name becomes the submenu title')}>
                                <SegmentedControl
                                    c={c}
                                    value={node.layout}
                                    onChange={layout => onMutate(current => (current.kind === 'group' ? { ...current, layout } : current))}
                                    options={[
                                        { value: 'fold' as const, label: t('分组 (子菜单)', 'Group (submenu)'), icon: Icons.folder },
                                        { value: 'row' as const, label: t('横排', 'Row'), icon: Icons.rowStack }
                                    ]}
                                />
                            </FieldRow>
                        ) : null}

                        {node.kind !== 'sep' ? (
                            <ToggleSwitch c={c} value={node.hidden} onChange={() => onMutate(toggledHidden)} label={t('隐藏', 'Hidden')} description={t('隐藏后 breeze 不再显示这一项', 'Hidden items are not rendered by breeze')} />
                        ) : null}
                        {node.kind === 'item' ? (
                            <ToggleSwitch c={c} value={node.disabled} onChange={() => onMutate(current => (current.kind === 'item' ? { ...current, disabled: !current.disabled } : current))} label={t('禁用', 'Disabled')} description={t('置灰且不可点击, 原生已禁用的项始终禁用', 'Grayed out and unclickable; natively disabled items stay disabled')} />
                        ) : null}
                    </flex>
                </Card>

                {node.kind !== 'sep' ? (
                    <IconPicker c={c} node={node} customSvg={customSvg} onCustomSvg={onCustomSvg} onMutate={onMutate} />
                ) : null}

                {node.kind === 'item' && node.ref === null ? (
                    <Card c={c} padding={10}>
                        <flex horizontal={false} alignItems="stretch" gap={9}>
                            <SectionLabel c={c} text={t('自定义命令', 'Custom command')} />
                            <SegmentedControl
                                c={c}
                                value={node.command?.type ?? 'open'}
                                onChange={type => onMutate(current => (current.kind === 'item' ? { ...current, command: type === 'open' ? { type: 'open', path: '', args: '' } : { type: 'copy', text: '' } } : current))}
                                options={[
                                    { value: 'open' as const, label: t('运行 / 打开', 'Open') },
                                    { value: 'copy' as const, label: t('复制文本', 'Copy text') }
                                ]}
                            />
                            {node.command?.type === 'copy' ? (
                                <FieldRow c={c} stacked={true} label={t('文本', 'Text')}>
                                    <TextArea c={c} value={node.command.text} onChange={text => onMutate(current => (current.kind === 'item' && current.command?.type === 'copy' ? { ...current, command: { type: 'copy', text } } : current))} height={60} />
                                </FieldRow>
                            ) : (
                                <Fragment>
                                    <FieldRow c={c} stacked={true} label={t('路径或命令', 'Path or command')}>
                                        <TextField c={c} value={node.command?.type === 'open' ? node.command.path : ''} onChange={path => onMutate(current => (current.kind === 'item' && current.command?.type === 'open' ? { ...current, command: { ...current.command, path } } : current))} placeholder="explorer.exe / cmd.exe / https://..." />
                                    </FieldRow>
                                    <FieldRow c={c} stacked={true} label={t('参数', 'Arguments')}>
                                        <TextField c={c} value={node.command?.type === 'open' ? node.command.args : ''} onChange={args => onMutate(current => (current.kind === 'item' && current.command?.type === 'open' ? { ...current, command: { ...current.command, args } } : current))} placeholder="%PATH%" />
                                    </FieldRow>
                                    <Text c={c} text={t('支持 %PATH% / %FOLDER% 占位符, 由 breeze 的菜单项展开', 'Placeholders %PATH% / %FOLDER% are expanded by breeze')} fontSize={10} color={c.textTertiary} />
                                </Fragment>
                            )}
                        </flex>
                    </Card>
                ) : null}

                {node.kind === 'item' && node.ref ? (
                    <Card c={c} padding={10}>
                        <flex horizontal={false} alignItems="stretch" gap={6}>
                            <SectionLabel c={c} text={t('原生匹配信息', 'Native identity')} />
                            <MatchRow c={c} label="wID" value={node.ref.wID === undefined ? '-' : String(node.ref.wID)} />
                            <MatchRow c={c} label={t('资源 ID', 'resource id')} value={node.ref.nameResid ?? '-'} />
                            <MatchRow c={c} label={t('原始文本', 'raw text')} value={node.ref.originName ?? '-'} />
                            <MatchRow c={c} label={t('快捷键', 'hotkey')} value={node.ref.hotkey ?? '-'} />
                            <Text c={c} text={t('规则按这些信息匹配到真实的菜单项, 换语言后仍能对上。', 'Rules match real items by these values, so they survive language changes.')} fontSize={10} color={c.textTertiary} />
                        </flex>
                    </Card>
                ) : null}

                <Card c={c} padding={10}>
                    <flex horizontal={false} alignItems="stretch" gap={7}>
                        <SectionLabel c={c} text={t('操作', 'Actions')} />
                        <flex horizontal={true} gap={6}>
                            <Button c={c} icon={Icons.arrowUp} label={t('上移', 'Up')} variant="standard" onClick={() => onMove(-1)} flexGrow={1} />
                            <Button c={c} icon={Icons.arrowDown} label={t('下移', 'Down')} variant="standard" onClick={() => onMove(1)} flexGrow={1} />
                        </flex>
                        <flex horizontal={true} gap={6}>
                            {nodes.length > 0 && locate(nodes, selectedId)?.parent ? <Button c={c} icon={Icons.folderOpen} label={t('移出分组', 'Move out')} variant="standard" onClick={onMoveOut} flexGrow={1} /> : null}
                            {node.kind !== 'group' ? <Button c={c} icon={Icons.folder} label={t('收纳到分组', 'Wrap in group')} variant="standard" onClick={() => onWrap('fold')} flexGrow={1} /> : null}
                            {node.kind === 'group' ? <Button c={c} icon={Icons.layers} label={t('解散分组', 'Dissolve group')} variant="standard" onClick={onUnwrap} flexGrow={1} /> : null}
                        </flex>
                        <flex horizontal={true} gap={6}>
                            <Button c={c} icon={Icons.copy} label={t('复制', 'Duplicate')} variant="standard" onClick={onDuplicate} flexGrow={1} />
                            <Button c={c} icon={Icons.trash} label={t('删除', 'Delete')} variant="danger" onClick={onRemove} flexGrow={1} />
                        </flex>
                    </flex>
                </Card>
            </Fragment>
        )}
    </flex>
);

const InspectorHead = ({ c, node }: { c: ReturnType<typeof fluent>; node: Node }) => (
    <flex horizontal={true} alignItems="center" gap={9} paddingTop={4} paddingBottom={4}>
        {nodeIcon(node, c.text, 18, node.kind === 'group' ? Icons.folder : Icons.file)}
        <flex horizontal={false} alignItems="start" gap={1} flexGrow={1}>
            <Text c={c} text={nodeLabel(node, t('未命名', 'Unnamed'))} fontSize={14} fontWeight={600} maxWidth={230} truncate={26} />
            <Text c={c} text={node.kind === 'group' ? t('分组', 'Group') : node.kind === 'sep' ? t('分隔线', 'Separator') : node.ref === null ? t('自定义命令', 'Custom command') : node.ref.hasSubmenu ? t('原生子菜单', 'Native submenu') : t('原生菜单项', 'Native item')} fontSize={11} color={c.textSecondary} />
        </flex>
    </flex>
);

const MatchRow = ({ c, label, value }: { c: ReturnType<typeof fluent>; label: string; value: string }) => (
    <flex horizontal={true} gap={6} alignItems="center">
        <flex width={76}>
            <Text c={c} text={label} fontSize={11} color={c.textSecondary} />
        </flex>
        <Text c={c} text={value} fontSize={11} fontFamily="monospace" color={c.text} maxWidth={210} truncate={26} />
    </flex>
);

const withIcon = (node: Node, icon: IconSpec): Node => (node.kind === 'sep' ? node : { ...node, icon });

const toggledHidden = (node: Node): Node => (node.kind === 'sep' ? node : { ...node, hidden: !node.hidden });

const IconPicker = ({
    c,
    node,
    customSvg,
    onCustomSvg,
    onMutate
}: {
    c: ReturnType<typeof fluent>;
    node: ItemNode | GroupNode;
    customSvg: string;
    onCustomSvg: (svg: string) => void;
    onMutate: (patch: (node: Node) => Node, note?: string) => void;
}) => (
    <Card c={c} padding={10}>
        <flex horizontal={false} alignItems="stretch" gap={8}>
            <SectionLabel c={c} text={t('图标', 'Icon')} />
            <flex horizontal={true} gap={6}>
                <Button c={c} icon={Icons.refresh} label={t('原生', 'Native')} variant={node.icon.source === 'original' ? 'accent' : 'standard'} onClick={() => onMutate(current => withIcon(current, { source: 'original' }))} flexGrow={1} />
                <Button c={c} icon={Icons.ban} label={t('无', 'None')} variant={node.icon.source === 'none' ? 'accent' : 'standard'} onClick={() => onMutate(current => withIcon(current, { source: 'none' }))} flexGrow={1} />
            </flex>
            <flex horizontal={false} alignItems="stretch" gap={3}>
                {[0, 1, 2, 3, 4].map(row => (
                    <flex key={row} horizontal={true} gap={3} alignItems="center">
                        {ICON_PALETTE.slice(row * 8, row * 8 + 8).map(name => (
                            <IconChoice
                                key={name}
                                c={c}
                                name={name}
                                selected={node.icon.source === 'svg' && node.icon.svg === Icons[name]}
                                onPick={() => onMutate(current => withIcon(current, { source: 'svg', svg: Icons[name] }))}
                            />
                        ))}
                    </flex>
                ))}
            </flex>
            <FieldRow c={c} stacked={true} label={t('自定义 SVG', 'Custom SVG')}>
                <TextArea c={c} value={customSvg} onChange={onCustomSvg} placeholder={'<svg ...><path fill="currentColor" .../></svg>'} height={64} />
            </FieldRow>
            <Button
                c={c}
                icon={Icons.save}
                label={t('应用 SVG', 'Apply SVG')}
                variant="standard"
                disabled={customSvg.trim().length === 0}
                onClick={() => onMutate(current => withIcon(current, { source: 'svg', svg: customSvg.trim() }), t('已应用自定义图标', 'Custom icon applied'))}
            />
        </flex>
    </Card>
);

const IconChoice = ({ c, name, selected, onPick }: { c: ReturnType<typeof fluent>; name: string; selected: boolean; onPick: () => void }) => {
    const { isHovered, ...events } = useHoverActive();
    return (
        <flex
            width={30}
            height={30}
            alignItems="center"
            justifyContent="center"
            borderRadius={5}
            backgroundColor={selected ? c.accentSoft : isHovered ? c.hover : c.subtle}
            borderColor={selected ? c.accent : undefined}
            borderWidth={selected ? 1 : 0}
            cursor="hand"
            animatedVars={COLOR_VARS}
            animationCurve={{ ...FAST, vars: COLOR_VARS }}
            onMouseEnter={events.onMouseEnter}
            onMouseLeave={events.onMouseLeave}
            onMouseDown={onPick}
        >
            {iconElement(Icons[name], 15, selected ? c.accent : c.text)}
        </flex>
    );
};
