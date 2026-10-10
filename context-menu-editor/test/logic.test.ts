// 纯逻辑测试: model / plan / settings / i18n, 经 test/run-logic.mjs 打包后在 node 里跑。
import { breeze, subprocCalls } from 'mshell';
import { isChinese, t } from '../src/i18n';
import {
    collectRefKeys,
    countItems,
    duplicateNode,
    flatten,
    groupNode,
    insertNode,
    itemNode,
    moveNode,
    normalize,
    refKeysOf,
    removeNode,
    sepNode,
    subtreeSize,
    unwrapGroup,
    wrapInGroup
} from '../src/model';
import { applyProfile, captureMenu, classifyMenu, makeSnapshot, matchesProfileContext, nodesFromSnapshot, planMenu, tidyPlan, toRef } from '../src/plan';
import { SCHEMA_VERSION, defaultSettings, normalizeSettings } from '../src/settings';
import { MENU_KINDS } from '../src/types';
import { activated, asMenu, asParent, createFakeMenu, describeMenu, findItem, namesOf, openSubmenu, parentControllers, resetActivated, runAction, sepIndices } from './fakes';
import type { PlanNode } from '../src/plan';
import type { FakeEntry, FakeItemSpec } from './fakes';
import type { GroupNode, ItemNode, ItemRef, MenuContextInfo, Node, Profile, SepNode } from '../src/types';

let passed = 0;
const failures: string[] = [];

const check = (name: string, ok: boolean, details = '') => {
    if (ok) {
        passed += 1;
        console.log(`PASS ${name}`);
        return;
    }
    failures.push(name);
    console.log(`FAIL ${name}: ${details}`);
};

const deepEqual = (a: unknown, b: unknown): boolean => {
    if (a === b) return true;
    if (typeof a !== typeof b || a === null || b === null || typeof a !== 'object') return false;
    if (Array.isArray(a) !== Array.isArray(b)) return false;
    const left = Object.keys(a as object);
    const right = Object.keys(b as object);
    if (left.length !== right.length) return false;
    return left.every(key => Object.prototype.hasOwnProperty.call(b, key) && deepEqual((a as never)[key], (b as never)[key]));
};

const checkEq = (name: string, actual: unknown, expected: unknown) => {
    check(name, deepEqual(actual, expected), `期望 ${JSON.stringify(expected)} 实际 ${JSON.stringify(actual)}`);
};

const section = (title: string) => console.log(`\n== ${title}`);

/* ------------------------------------------------------------- 模型 */

const mkItem = (id: string, over: Partial<ItemNode> = {}): ItemNode => ({
    kind: 'item',
    id,
    ref: { key: id, name: id, hasSubmenu: false },
    command: undefined,
    label: null,
    icon: { source: 'original' },
    hidden: false,
    disabled: false,
    ...over
});

const mkGroup = (id: string, children: Node[] = [], over: Partial<GroupNode> = {}): GroupNode => ({
    kind: 'group',
    id,
    layout: 'fold',
    label: id,
    icon: { source: 'original' },
    hidden: false,
    children,
    ...over
});

const mkSep = (id: string): SepNode => ({ kind: 'sep', id });

const shape = (nodes: Node[]): string =>
    '[' + nodes.map(node => (node.kind === 'group' ? 'G' + shape(node.children) : node.kind === 'sep' ? '-' : node.ref ? node.ref.key : 'C')).join(' ') + ']';

const ids = (nodes: Node[]): string[] => nodes.map(node => node.id);

const modelTests = () => {
    section('model');

    const flat: Node[] = [mkItem('a'), mkItem('b'), mkItem('c'), mkItem('d')];
    checkEq('moveNode 同层上移', ids(moveNode(flat, 'c', null, 0)), ['c', 'a', 'b', 'd']);
    checkEq('moveNode 同层下移(槽位口径)', ids(moveNode(flat, 'a', null, 2)), ['b', 'a', 'c', 'd']);
    checkEq('moveNode 同层下移到末尾', ids(moveNode(flat, 'a', null, 4)), ['b', 'c', 'd', 'a']);
    checkEq('moveNode 不改动入参', ids(flat), ['a', 'b', 'c', 'd']);

    const tree: Node[] = [mkItem('a'), mkGroup('g', [mkItem('x'), mkItem('y')]), mkItem('b')];
    const inside = moveNode(tree, 'a', 'g', 1);
    checkEq('moveNode 移入分组指定下标', shape(inside), '[G[x a y] b]');
    checkEq('moveNode 移出分组到指定下标', shape(moveNode(inside, 'a', null, 1)), '[G[x y] a b]');
    checkEq('moveNode 越界下标追加到组尾', shape(moveNode(tree, 'b', 'g', 99)), '[a G[x y b]]');

    const nest: Node[] = [mkGroup('g1', [mkItem('x'), mkGroup('g2', [mkItem('y')])])];
    check('moveNode 拒绝移入自身', moveNode(nest, 'g1', 'g1', 0) === nest, '应原样返回入参');
    check('moveNode 拒绝移入后代', moveNode(nest, 'g1', 'g2', 0) === nest, '应原样返回入参');

    const three: Node[] = [mkItem('a'), mkItem('b'), mkItem('c')];
    const cut = removeNode(three, 'b');
    checkEq('removeNode 返回被移除节点', cut.removed?.id, 'b');
    checkEq('removeNode 返回去掉后的新树', ids(cut.nodes), ['a', 'c']);
    checkEq('removeNode 不改动入参', ids(three), ['a', 'b', 'c']);
    const missing = removeNode(three, 'zz');
    check('removeNode 缺失 id 原样返回', missing.nodes === three && missing.removed === null);
    checkEq('insertNode 越界下标夹紧到尾部', ids(insertNode([mkItem('a')], mkItem('z'), null, 99)), ['a', 'z']);
    checkEq('insertNode 负下标夹紧到头部', ids(insertNode([mkItem('a')], mkItem('z'), null, -3)), ['z', 'a']);
    checkEq('insertNode 指定分组内插入', shape(insertNode(tree, mkItem('z'), 'g', 1)), '[a G[x z y] b]');

    const deepTree: Node[] = [mkItem('a'), mkGroup('g', [mkItem('x'), mkGroup('h', [mkItem('y')])])];
    const dup = duplicateNode(deepTree, 'g');
    const copy = dup.nodes[2] as GroupNode;
    check('duplicateNode 插在原节点之后并返回新 id', dup.nodes[1].id === 'g' && copy.id === dup.id, `副本 id ${copy.id}`);
    check('duplicateNode 换新 id', copy.id !== 'g' && copy.children[0].id !== 'x' && (copy.children[1] as GroupNode).children[0].id !== 'y');
    checkEq('duplicateNode 结构一致', shape(dup.nodes), '[a G[x G[y]] G[x G[y]]]');
    const inner = copy.children[1] as GroupNode;
    inner.label = '改过';
    inner.children.push(mkItem('z'));
    checkEq('duplicateNode 改副本不影响原树', shape(deepTree), '[a G[x G[y]]]');
    checkEq('duplicateNode 副本自身可独立修改', shape(copy.children), '[x G[y z]]');

    const four: Node[] = [mkItem('a'), mkItem('b'), mkItem('c'), mkItem('d')];
    const wrapped = wrapInGroup(four, ['b', 'c'], 'fold', '组');
    checkEq('wrapInGroup 落点取第一个选中项', shape(wrapped.nodes), '[a G[b c] d]');
    check('wrapInGroup 返回新分组 id', wrapped.groupId.length > 0 && (wrapped.nodes[1] as GroupNode).id === wrapped.groupId);
    checkEq('wrapInGroup 不改动入参', shape(four), '[a b c d]');
    check('wrapInGroup 空选择原样返回', wrapInGroup(four, [], 'fold', '组').nodes === four);
    const noHit = wrapInGroup(four, ['zz'], 'fold', '组');
    check('wrapInGroup 无命中项原样返回', noHit.nodes === four && noHit.groupId === '');
    check('wrapInGroup 不搬动分组本身', wrapInGroup([mkGroup('g', [mkItem('x')])], ['g'], 'fold', '组').nodes.length === 1);
    const lifted = wrapInGroup([mkGroup('g', [mkItem('x'), mkItem('y')])], ['x'], 'fold', '组');
    checkEq('wrapInGroup 从分组内抬升选中项', shape(lifted.nodes), '[G[G[x] y]]');
    checkEq('unwrapGroup 就地展开子项', shape(unwrapGroup(wrapped.nodes, wrapped.groupId)), '[a b c d]');
    check('unwrapGroup 非分组原样返回', unwrapGroup(four, 'a') === four);

    const dirty: Node[] = [mkItem('dup'), mkItem('dup'), mkGroup('g2', [mkItem('dup')], { label: '   ' })];
    const clean = normalize(dirty);
    const allIds = flatten(clean).map(entry => entry.node.id);
    check('normalize 生成唯一 id', new Set(allIds).size === allIds.length);
    checkEq('normalize 空分组标签兜底', (clean[2] as GroupNode).label, '分组');
    checkEq('normalize 保留节点形态', shape(clean), '[dup dup G[dup]]');

    const counted: Node[] = [mkItem('a'), mkGroup('g', [mkItem('b'), mkSep('s'), mkItem('c')]), mkItem('a')];
    checkEq('countItems 统计嵌套项', countItems(counted), 4);
    checkEq('collectRefKeys 去重且含嵌套', [...collectRefKeys(counted)].sort(), ['a', 'b', 'c']);
    checkEq('refKeysOf 只看指定层', refKeysOf(counted, 'g'), ['b', 'c']);
    checkEq('subtreeSize 含自身', subtreeSize(counted[1]), 4);
};

/* ------------------------------------------------------------- 上下文 */

const winInfo = (over: Record<string, unknown> = {}) => ({ title: '文档', class_name: 'Notepad', executable_path: 'C:\\Windows\\notepad.exe', ...over });
const ctxOf = (over: Record<string, unknown> = {}) => ({ window_info: winInfo(), ...over }) as unknown as Parameters<typeof classifyMenu>[0];
const folderCtx = (selected: string[], path = 'C:\\Users\\t\\下载') =>
    ctxOf({ window_info: winInfo({ title: '下载', class_name: 'CabinetWClass', executable_path: 'C:\\Windows\\explorer.exe' }), folder_view: { current_path: path, selected_files: selected } });

const infoOf = (over: Partial<MenuContextInfo> = {}): MenuContextInfo => ({
    kind: 'other',
    path: '',
    selection: 0,
    title: '资源管理器',
    className: 'CabinetWClass',
    executable: 'C:\\Windows\\explorer.exe',
    ...over
});

const contextTests = () => {
    section('classifyMenu / matchesProfileContext');

    const picked = classifyMenu(folderCtx(['报告.txt']));
    checkEq('文件夹视图有选中为 files', [picked.kind, picked.selection, picked.path], ['files', 1, 'C:\\Users\\t\\下载']);
    const empty = classifyMenu(folderCtx([]));
    checkEq('文件夹视图无选中为 folder', [empty.kind, empty.selection], ['folder', 0]);
    checkEq('缺 selected_files 视为无选中', classifyMenu(ctxOf({ window_info: winInfo({ class_name: 'CabinetWClass' }), folder_view: { current_path: '' } })).kind, 'folder');
    for (const [name, klass] of [['Progman', 'Progman'], ['WorkerW', 'WorkerW'], ['SHELLDLL_DefView', 'SHELLDLL_DefView'], ['小写 progman', 'progman']] as const) {
        checkEq(`桌面窗口 ${name}`, classifyMenu(ctxOf({ window_info: winInfo({ class_name: klass }) })).kind, 'desktop');
    }
    for (const klass of ['Shell_TrayWnd', 'Shell_SecondaryTrayWnd']) {
        checkEq(`任务栏窗口 ${klass}`, classifyMenu(ctxOf({ window_info: winInfo({ class_name: klass }) })).kind, 'taskbar');
    }
    const other = classifyMenu(ctxOf({ window_info: winInfo({ title: '记事本', class_name: 'Notepad', executable_path: 'C:\\Windows\\notepad.exe' }) }));
    checkEq('其它窗口为 other 且带窗口信息', [other.kind, other.title, other.className, other.executable], ['other', '记事本', 'Notepad', 'C:\\Windows\\notepad.exe']);

    const otherProfile = (over: Partial<Profile> = {}): Profile => ({ ...emptyProfile('other'), ...over });
    check('非 other 类型恒通过', matchesProfileContext({ ...emptyProfile('files'), processFilter: 'nope.exe' }, infoOf({ kind: 'files' })));
    check('other 无过滤恒通过', matchesProfileContext(otherProfile(), infoOf()));
    check('进程名匹配忽略大小写与空格', matchesProfileContext(otherProfile({ processFilter: ' EXPLORER.EXE , notepad.exe ' }), infoOf()));
    check('进程名不匹配则拒绝', !matchesProfileContext(otherProfile({ processFilter: 'explorer.exe' }), infoOf({ executable: 'C:\\Program Files\\Google\\Chrome\\chrome.exe' })));
    check('标题子串匹配', matchesProfileContext(otherProfile({ titleFilter: ' 资源管理 ' }), infoOf()));
    check('标题不匹配则拒绝', !matchesProfileContext(otherProfile({ titleFilter: 'zzz' }), infoOf()));
};

const emptyProfile = (kind: MenuContextInfo['kind']): Profile => ({
    kind,
    enabled: false,
    nodes: [],
    unmanaged: 'keep-end',
    processFilter: '',
    titleFilter: '',
    updatedAt: 0
});

/* ------------------------------------------------------------- planMenu */

const refOf = (key: string): ItemRef => ({ key, name: key, hasSubmenu: false });
const pItem = (key: string, over: Partial<ItemNode> = {}): ItemNode => ({ ...itemNode(refOf(key)), ...over });
const pGroup = (label: string, children: Node[], over: Partial<GroupNode> = {}): GroupNode => ({ ...groupNode('fold', label), children, ...over });
const pProfile = (nodes: Node[], unmanaged: Profile['unmanaged'] = 'hide'): Profile => ({ ...emptyProfile('files'), enabled: true, unmanaged, nodes });

const planNames = (plan: PlanNode[]): string[] =>
    plan.map(node => (node.kind === 'sep' ? '--' : node.kind === 'group' ? `[${node.label}]` : node.label ?? node.source?.name ?? '?'));

const CAP: FakeItemSpec[] = [
    { name: '粘贴', wID: 100 },
    { type: 'spacer' },
    { name: '打开', nameResid: 'R100', wID: 102 },
    { name: '复制', nameResid: 'R101', wID: 103 },
    { type: 'spacer' },
    { name: '属性', nameResid: 'R7', wID: 105, submenu: true }
];

const captureTests = () => {
    section('captureMenu');

    const captured = captureMenu(asMenu(createFakeMenu(CAP)));
    checkEq('键优先级: resid > origin_name > name', captured.map(item => item.key), ['n:粘贴', 'n:', 'r:R100', 'r:R101', 'n:#1', 'r:R7']);
    const dup = captureMenu(
        asMenu(
            createFakeMenu([
                { name: '粘贴', wID: 1 },
                { name: '粘贴', wID: 2 },
                { name: '粘贴', wID: 6 },
                { name: '打开', wID: 3, nameResid: 'R100' },
                { name: '再打开', wID: 4, nameResid: 'R100' },
                { name: '旧打开', wID: 5, originName: 'opendll' }
            ])
        )
    );
    checkEq('重复项按出现顺序加后缀', dup.map(item => item.key), ['n:粘贴', 'n:粘贴#1', 'n:粘贴#2', 'r:R100', 'r:R100#1', 'o:opendll']);
    checkEq('index 连续递增', captured.map(item => item.index), [0, 1, 2, 3, 4, 5]);
    checkEq('分隔符标记', captured.map(item => item.separator), [false, true, false, false, true, false]);
    checkEq('透传 wID/resid/子菜单', [captured[5].wID, captured[5].nameResid, captured[5].originName, captured[5].hasSubmenu], [105, 'R7', undefined, true]);
    checkEq('toRef 保留字段', toRef(captured[5]), { key: 'r:R7', name: '属性', originName: undefined, nameResid: 'R7', wID: 105, hotkey: undefined, hasSubmenu: true });

    const snapshot = makeSnapshot(captured, infoOf({ kind: 'files', path: 'C:\\t', selection: 2 }));
    checkEq('snapshot 保留分隔符与图标信息', [snapshot.items.length, snapshot.items[1].separator, snapshot.items[2].key, snapshot.kind, snapshot.selection], [6, true, 'r:R100', 'files', 2]);
    checkEq('snapshot 还原节点时丢掉分隔符', nodesFromSnapshot(snapshot).map(node => (node.ref ? node.ref.key : '?')), ['n:粘贴', 'r:R100', 'r:R101', 'r:R7']);
};

const planTests = () => {
    section('planMenu');

    const captured = captureMenu(asMenu(createFakeMenu(CAP)));
    checkEq('hide 只留列出的项', planNames(planMenu(captured, pProfile([pItem('r:R100'), pItem('r:R101')]))), ['打开', '复制']);
    checkEq('keep-end 未列项追加到末尾', planNames(planMenu(captured, pProfile([pItem('r:R100')], 'keep-end'))), ['打开', '粘贴', '复制', '属性']);
    checkEq('keep-original 未列项回到原位', planNames(planMenu(captured, pProfile([pItem('r:R100'), pItem('r:R101')], 'keep-original'))), ['粘贴', '打开', '复制', '属性']);
    checkEq('未采集到的 ref 直接丢弃', planNames(planMenu(captured, pProfile([pItem('r:NOPE'), pItem('r:R7')]))), ['属性']);
    checkEq('子项全落空的分组消失', planNames(planMenu(captured, pProfile([pGroup('空组', [pItem('r:NOPE')]), pItem('r:R7')]))), ['属性']);
    checkEq('分组按原顺序收纳子项', planNames(planMenu(captured, pProfile([pGroup('收纳', [pItem('r:R101'), pItem('r:R7')])]))), ['[收纳]']);
    checkEq('首尾与重复分隔符被清理', planNames(planMenu(captured, pProfile([sepNode(), pItem('r:R100'), sepNode(), sepNode(), pItem('r:R7'), sepNode()]))), ['打开', '--', '属性']);
    checkEq('自定义命令项无需 ref', planNames(planMenu(captured, pProfile([itemNode(null, '记事本', { type: 'open', path: 'C:\\x', args: '' })]))), ['记事本']);
    checkEq('空计划保持为空', planMenu(captured, pProfile([])).length, 0);
    checkEq('tidyPlan 去掉头部与重复分隔符', planNames(tidyPlan([{ kind: 'sep' }, { kind: 'sep' }] as PlanNode[])), []);
    check('未列出的项不会凭空出现', planNames(planMenu(captured, pProfile([pItem('r:R100')]))).includes('粘贴') === false);

    const hiddenItem = planNames(planMenu(captured, pProfile([pItem('r:R100', { hidden: true }), pItem('r:R7')])));
    checkEq('隐藏项被丢弃', hiddenItem, ['属性']);
    const hiddenGroup = planNames(planMenu(captured, pProfile([pGroup('隐藏组', [pItem('r:R100')], { hidden: true }), pItem('r:R7')])));
    checkEq('隐藏分组被丢弃', hiddenGroup, ['属性']);
    // 隐藏是显式意图, 不能被 keep-end/keep-original 当成未列项再捡回来。
    const revived = planNames(planMenu(captured, pProfile([pItem('r:R100'), pItem('r:R7', { hidden: true })], 'keep-end')));
    checkEq('隐藏项在 keep-end 下也不复活', revived, ['打开', '粘贴', '复制']);
};

/* ------------------------------------------------------------- applyProfile */

const NATIVE: FakeItemSpec[] = [
    { name: '打开', nameResid: 'R1', wID: 1 },
    { name: '打开方式', nameResid: 'R2', wID: 2, submenu: true },
    { name: '复制', nameResid: 'R3', wID: 3 },
    { name: '粘贴', nameResid: 'R4', wID: 4 },
    { name: '删除', nameResid: 'R5', wID: 5 },
    { type: 'spacer' },
    { name: '属性', nameResid: 'R6', wID: 6 },
    { name: '压缩到 zip', originName: 'compress', wID: 7, hotkey: 'Z', iconBitmap: 9, iconSvg: '<svg id="zip"/>' }
];

const NATIVE_NAMES = ['打开', '打开方式', '复制', '粘贴', '删除', '', '属性', '压缩到 zip'];

const applyProfileFixture = (): Profile => ({
    ...emptyProfile('files'),
    enabled: true,
    unmanaged: 'hide',
    processFilter: 'explorer.exe',
    nodes: [
        pItem('r:R3', { label: '复制 (改名)' }),
        pGroup('整理', [pItem('r:R2'), sepNode(), pItem('r:R5')], { layout: 'fold' }),
        pGroup('快捷', [pItem('r:R1'), pItem('o:compress')], { layout: 'row' }),
        sepNode(),
        itemNode(null, '记事本', { type: 'open', path: 'C:\\Windows\\notepad.exe', args: '' }),
        pItem('r:R6', { hidden: true })
    ]
});

const scenario = () => {
    resetActivated();
    subprocCalls.length = 0;
    const menu = createFakeMenu(NATIVE);
    const result = applyProfile(asMenu(menu), applyProfileFixture(), classifyMenu(folderCtx(['报告.txt'])));
    return { menu, result };
};

const sketch = (entries: FakeEntry[]): string[] =>
    entries.map(entry => (entry.row ? `row:${(entry.children ?? []).map(child => child.name).join('+')}` : entry.separator ? '--' : entry.name ?? ''));

const applyTests = () => {
    section('applyProfile');

    const off = createFakeMenu(NATIVE);
    const offResult = applyProfile(asMenu(off), { ...applyProfileFixture(), enabled: false }, classifyMenu(folderCtx(['报告.txt'])));
    checkEq('未启用时原因与结果', [offResult.applied, offResult.reason, offResult.captured, offResult.planned], [false, 'profile-disabled', 0, 0]);
    check('未启用时菜单不变', deepEqual(namesOf(describeMenu(off)), NATIVE_NAMES) && off.closeCount === 0);

    const mismatch = createFakeMenu(NATIVE);
    const mismatchResult = applyProfile(asMenu(mismatch), applyProfileFixture(), infoOf({ executable: 'C:\\Program Files\\Google\\Chrome\\chrome.exe' }));
    checkEq('上下文不匹配时原因', [mismatchResult.applied, mismatchResult.reason], [false, 'context-mismatch']);
    check('上下文不匹配时菜单不变', deepEqual(namesOf(describeMenu(mismatch)), NATIVE_NAMES));

    const { menu, result } = scenario();
    checkEq('应用成功并统计数量', [result.applied, result.reason, result.captured], [true, 'ok', 8]);
    const entries = describeMenu(menu);
    checkEq('顺序/改名/横排/自定义项', sketch(entries.filter(entry => entry.name !== '属性')), ['复制 (改名)', '整理', 'row:打开+压缩到 zip', '--', '记事本']);
    checkEq('隐藏项不进计划也不进菜单', [result.planned, entries.some(entry => entry.name === '属性')], [5, false]);
    checkEq('分隔符落在计划位置', sepIndices(entries), [3]);
    checkEq('改名后原名字不残留', findItem(menu.items, '复制') === undefined && findItem(menu.items, '复制 (改名)')?.data().name, '复制 (改名)');
    checkEq('未列出的原生项被清掉', ['粘贴', '删除'].filter(name => findItem(menu.items, name) !== undefined), []);

    const foldEntry = entries.find(entry => entry.name === '整理');
    checkEq('折叠组重建为可展开项', [foldEntry?.type, foldEntry?.hasSubmenu, foldEntry?.renamed], ['button', true, false]);
    const foldMenu = openSubmenu(findItem(menu.items, '整理')!);
    checkEq('折叠组子项与内部分隔符', sketch(describeMenu(foldMenu)), ['打开方式', '--', '删除']);
    checkEq('折叠组内分隔符位置', sepIndices(describeMenu(foldMenu)), [1]);

    const rowCtrl = parentControllers(menu)[0];
    check('横排组子项同属一个父项', parentControllers(menu).length === 1 && asParent(rowCtrl).children().length === 2);
    const rowEntry = entries.find(entry => entry.row);
    checkEq('横排组内没有分隔符', sepIndices(rowEntry?.children ?? []), []);

    const custom = findItem(menu.items, '记事本')!;
    runAction(custom);
    checkEq('自定义命令调用 subproc.open', subprocCalls, [['C:\\Windows\\notepad.exe', '']]);
    checkEq('自定义命令执行后关闭菜单', menu.closeCount, 1);
};

const losslessTests = () => {
    section('重建无损');

    const { menu } = scenario();
    const renamed = findItem(menu.items, '复制 (改名)')!;
    checkEq('重建项保留 wID/name_resid', [renamed.data().wID, renamed.data().name_resid, renamed.data().origin_name], [3, 'R3', undefined]);

    const rowCtrl = parentControllers(menu)[0];
    const rowItems = asParent(rowCtrl).children();
    const zipped = findItem(rowItems, '压缩到 zip')!;
    checkEq('重建项保留 icon_bitmap/icon_svg', [zipped.data().icon_bitmap, zipped.data().icon_svg], [9, '<svg id="zip"/>']);
    checkEq('重建项保留 hotkey/origin_name/wID', [zipped.data().hotkey, zipped.data().origin_name, zipped.data().wID], ['Z', 'compress', 7]);

    runAction(renamed);
    runAction(zipped);
    checkEq('重建项仍触发原生动作', activated, ['activated:3', 'activated:7']);

    const foldMenu = openSubmenu(findItem(menu.items, '整理')!);
    const submenuItem = findItem(foldMenu.items, '打开方式')!;
    checkEq('折叠组内子项仍是原生项', [submenuItem.data().wID, submenuItem.data().name_resid, typeof submenuItem.data().submenu], [2, 'R2', 'function']);
    const deepMenu = openSubmenu(submenuItem);
    checkEq('重建项仍能展开原生子菜单', namesOf(describeMenu(deepMenu)), ['打开方式 > 打开']);
    runAction(deepMenu.items[0]);
    checkEq('子菜单里的原生动作可执行', activated, ['activated:3', 'activated:7', 'activated:2:submenu']);
};

/* ------------------------------------------------------------- settings */

const settingsTests = () => {
    section('normalizeSettings');

    check('未配置时返回默认', deepEqual(normalizeSettings(undefined), defaultSettings()));
    check('非对象入参返回默认', deepEqual(normalizeSettings(null), defaultSettings()) && deepEqual(normalizeSettings(42), defaultSettings()));

    const broken = {
        version: 'x',
        profiles: {
            files: {
                enabled: 'yes',
                unmanaged: 'nonsense',
                processFilter: 7,
                nodes: [
                    { kind: 'unknown', id: 'u1' },
                    { kind: 'item', id: 'i1', icon: { source: 'svg', svg: '   ' }, ref: { key: '' } },
                    { kind: 'item', id: 'i2', ref: { key: 'r:R1' }, icon: { source: 'svg', svg: '' }, label: '' },
                    { kind: 'item', id: 'i3', command: { type: 'copy', text: '' } },
                    { kind: 'group', id: 'g1', label: '   ', children: [{ kind: 'sep' }] },
                    { kind: 'sep' }
                ]
            },
            desktop: 'nope',
            taskbar: { nodes: 'nope' }
        },
        snapshots: { files: { items: [{ key: 'a' }, 'junk', { name: 'x' }, null] }, other: 'nope' },
        showMenuEntry: 'maybe',
        logLevel: 'loud'
    };
    const fixed = normalizeSettings(broken);

    checkEq('五个类型齐全', Object.keys(fixed.profiles).sort(), [...MENU_KINDS].sort());
    check('每个类型都有完整 Profile', MENU_KINDS.every(kind => deepEqual(Object.keys(fixed.profiles[kind]).sort(), ['enabled', 'kind', 'nodes', 'processFilter', 'titleFilter', 'unmanaged', 'updatedAt'])));
    check('坏节点被丢弃', deepEqual(fixed.profiles.files.nodes.map(node => node.kind), ['item', 'item', 'group', 'sep']));
    checkEq('坏 icon.source 回退为 original', (fixed.profiles.files.nodes[0] as ItemNode).icon, { source: 'original' });
    checkEq('空 label 归一为 null', (fixed.profiles.files.nodes[0] as ItemNode).label, null);
    checkEq('空分组标签兜底', (fixed.profiles.files.nodes[2] as GroupNode).label, '分组');
    check('unmanaged 在合法取值内', MENU_KINDS.every(kind => (['keep-end', 'keep-original', 'hide'] as string[]).includes(fixed.profiles[kind].unmanaged)));
    check('非法 unmanaged 回退 keep-end', fixed.profiles.files.unmanaged === 'keep-end');
    check('分组标签非空', MENU_KINDS.every(kind => flatten(fixed.profiles[kind].nodes).every(entry => entry.node.kind !== 'group' || entry.node.label.trim().length > 0)));
    const nodeIds = flatten(fixed.profiles.files.nodes).map(entry => entry.node.id);
    check('自动补出的节点 id 非空且唯一', nodeIds.every(id => typeof id === 'string' && id.length > 0) && new Set(nodeIds).size === nodeIds.length);
    checkEq('布尔与枚举兜底', [fixed.showMenuEntry, fixed.logLevel, fixed.version], [true, 'basic', SCHEMA_VERSION]);
    checkEq('坏快照被过滤', Object.keys(fixed.snapshots), ['files']);
    checkEq('快照条目被清洗', fixed.snapshots.files?.items.map(item => item.key), ['a']);
    checkEq('快照字段完整', Object.keys(fixed.snapshots.files ?? {}).sort(), ['at', 'className', 'executable', 'items', 'kind', 'path', 'selection', 'windowTitle']);
    checkEq('快照默认值', [(fixed.snapshots.files?.at ?? -1) === 0, fixed.snapshots.files?.selection ?? -1, fixed.snapshots.files?.windowTitle ?? null], [true, 0, '']);

    const once = normalizeSettings(broken);
    check('归一化幂等', deepEqual(normalizeSettings(once), once));
    const roundTrip = normalizeSettings(JSON.parse(JSON.stringify(once)));
    check('JSON 往返后仍然一致', deepEqual(roundTrip, normalizeSettings(once)));
    check('二次往返稳定', deepEqual(normalizeSettings(JSON.parse(JSON.stringify(roundTrip))), roundTrip));
};

/* ------------------------------------------------------------- i18n */

const i18nTests = () => {
    section('i18n');

    checkEq('breeze.user_language', breeze.user_language(), 'zh-CN');
    checkEq('中文语言判定', isChinese, true);
    checkEq('t 取中文', t('中文', 'English'), '中文');
};

modelTests();
contextTests();
captureTests();
planTests();
applyTests();
losslessTests();
settingsTests();
i18nTests();

console.log(`\n=== 通过 ${passed} / 失败 ${failures.length} ===`);
if (failures.length > 0) {
    console.log(`失败清单: ${failures.join(' | ')}`);
    process.exitCode = 1;
}
