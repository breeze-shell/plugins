// 纯逻辑测试: model / plan / settings / i18n, 经 test/run-logic.mjs 打包后在 node 里跑。
import { breeze, subprocCalls } from 'mshell';
import { isChinese, t } from '../src/i18n';
import {
    countItems,
    duplicateNode,
    emptyProfile,
    flatten,
    groupNode,
    insertNode,
    itemNode,
    moveNode,
    removeNode,
    sepNode,
    unwrapGroup,
    wrapInGroup
} from '../src/model';
import { adoptUnmanaged, applyProfile, analysePlan, buildCanvas, captureMenu, classifyMenu, expandArgs, makeSnapshot, matchesProfileContext, nodesFromSnapshot, planMenu, tidyPlan } from '../src/plan';
import { defaultSettings, normalizeSettings } from '../src/settings';
import { HISTORY_LIMIT, emptyHistory, recordHistory, redoHistory, undoHistory } from '../src/history';
import { KEY, shortcutFor, stepIndex } from '../src/shortcuts';
import { createStore } from '../src/store';
import { MENU_KINDS } from '../src/types';
import { activated, asMenu, asParent, createFakeMenu, describeMenu, findItem, namesOf, openSubmenu, parentControllers, resetActivated, runAction, sepIndices } from './fakes';
import type { CanvasRow, PlanNode } from '../src/plan';
import type { ShortcutMods, ShortcutState } from '../src/shortcuts';
import type { FakeEntry, FakeItemSpec } from './fakes';
import type { GroupNode, ItemNode, ItemRef, MenuContextInfo, Node, Profile, SepNode, Settings, Snapshot, SnapshotItem } from '../src/types';

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

    const counted: Node[] = [mkItem('a'), mkGroup('g', [mkItem('b'), mkSep('s'), mkItem('c')]), mkItem('a')];
    checkEq('countItems 统计嵌套项', countItems(counted), 4);
};

/* ------------------------------------------------------------- 上下文 */

const winInfo = (over: Record<string, unknown> = {}) => ({ title: '文档', class_name: 'Notepad', executable_path: 'C:\\Windows\\notepad.exe', ...over });
const ctxOf = (over: Record<string, unknown> = {}) => ({ window_info: winInfo(), ...over }) as unknown as Parameters<typeof classifyMenu>[0];
const folderCtx = (selected: string[], path = 'C:\\Users\\t\\下载') =>
    ctxOf({ window_info: winInfo({ title: '下载', class_name: 'CabinetWClass', executable_path: 'C:\\Windows\\explorer.exe' }), folder_view: { current_path: path, selected_files: selected } });

const infoOf = (over: Partial<MenuContextInfo> = {}): MenuContextInfo => ({
    kind: 'other',
    path: '',
    selected: [],
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
    for (const [name, klass] of [['Progman', 'Progman'], ['WorkerW', 'WorkerW'], ['小写 progman', 'progman']] as const) {
        checkEq(`桌面窗口 ${name}`, classifyMenu(ctxOf({ window_info: winInfo({ class_name: klass }) })).kind, 'desktop');
    }
    const desktopCtx = (klass: string, path: string, selected: string[] = []) =>
        ctxOf({ window_info: winInfo({ title: 'FolderView', class_name: klass, executable_path: 'C:\\Windows\\explorer.exe' }), folder_view: { current_path: path, selected_files: selected } });
    checkEq('桌面列表带 folder_view 仍是桌面', classifyMenu(desktopCtx('SysListView32', 'C:\\Users\\t\\Desktop')).kind, 'desktop');
    checkEq('桌面上选中图标也是桌面', classifyMenu(desktopCtx('SHELLDLL_DefView', 'c:\\users\\t\\desktop\\', ['C:\\Users\\t\\Desktop\\a.txt'])).kind, 'desktop');
    checkEq('桌面路径可由调用方给出', classifyMenu(desktopCtx('SysListView32', 'D:\\桌面'), ['d:\\桌面']).kind, 'desktop');
    checkEq('别的文件夹里的 SHELLDLL_DefView 不是桌面', classifyMenu(desktopCtx('SHELLDLL_DefView', 'C:\\Users\\t\\下载')).kind, 'folder');
    checkEq('资源管理器窗口里打开桌面文件夹不算桌面', classifyMenu(desktopCtx('DirectUIHWND', 'C:\\Users\\t\\Desktop')).kind, 'folder');
    checkEq('没有 folder_view 的 SHELLDLL_DefView 仍按桌面处理', classifyMenu(ctxOf({ window_info: winInfo({ class_name: 'SHELLDLL_DefView' }) })).kind, 'desktop');
    checkEq('选中项路径进 info', classifyMenu(folderCtx(['C:\\a.txt', 'C:\\b c.txt'])).selected, ['C:\\a.txt', 'C:\\b c.txt']);
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

    const inFolder = infoOf({ kind: 'files', path: 'C:\\My Docs', selected: ['C:\\My Docs\\a b.txt', 'C:\\My Docs\\c.txt'] });
    checkEq('%PATH% 展开成选中项并给含空格的加引号', expandArgs('/select %PATH%', inFolder), '/select "C:\\My Docs\\a b.txt" "C:\\My Docs\\c.txt"');
    checkEq('%FOLDER% 展开成当前文件夹', expandArgs('%FOLDER%', inFolder), '"C:\\My Docs"');
    checkEq('没有选中时 %PATH% 用当前文件夹', expandArgs('%path%', infoOf({ kind: 'folder', path: 'C:\\t' })), 'C:\\t');
    checkEq('没有路径时占位符变空', expandArgs('-a %PATH% %FOLDER%', infoOf()), '-a  ');
    checkEq('别的 % 写法原样保留', expandArgs('%USERPROFILE% 50%', inFolder), '%USERPROFILE% 50%');
};

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

    const snapshot = makeSnapshot(captured, infoOf({ kind: 'files', path: 'C:\\t', selection: 2 }));
    checkEq('snapshot 保留分隔符与图标信息', [snapshot.items.length, snapshot.items[1].separator, snapshot.items[2].key, snapshot.kind, snapshot.selection], [6, true, 'r:R100', 'files', 2]);
    checkEq('snapshot 还原节点时丢掉分隔符', nodesFromSnapshot(snapshot).map(node => (node.ref ? node.ref.key : '?')), ['n:粘贴', 'r:R100', 'r:R101', 'r:R7']);
};

const planTests = () => {
    section('planMenu');

    const captured = captureMenu(asMenu(createFakeMenu(CAP)));
    checkEq('hide 只留列出的项', planNames(planMenu(captured, pProfile([pItem('r:R100'), pItem('r:R101')]))), ['打开', '复制']);
    checkEq('keep-end 未列项连同原生分隔线追加到末尾', planNames(planMenu(captured, pProfile([pItem('r:R100')], 'keep-end'))), ['打开', '粘贴', '--', '复制', '--', '属性']);
    checkEq('keep-original 未列项与原生分隔线回到原位', planNames(planMenu(captured, pProfile([pItem('r:R100'), pItem('r:R101')], 'keep-original'))), ['粘贴', '--', '打开', '复制', '--', '属性']);
    checkEq('hide 不保留原生分隔线', planNames(planMenu(captured, pProfile([pItem('r:R100'), pItem('r:R7')]))), ['打开', '属性']);
    checkEq('原生分隔线透传后照样整理', planNames(planMenu(captured, pProfile([pItem('r:R100'), pItem('r:R101'), pItem('r:R7', { hidden: true })], 'keep-original'))), ['粘贴', '--', '打开', '复制']);
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
    checkEq('隐藏项在 keep-end 下也不复活', revived, ['打开', '粘贴', '--', '复制']);

    const ignored = pGroup('内', [pItem('r:R100')]);
    const rowWithGroup = pGroup('横排', [ignored, pItem('r:R101')], { layout: 'row' });
    checkEq('横排里被忽略的分组不把原生项放回菜单', planNames(planMenu(captured, pProfile([rowWithGroup], 'keep-end'))), ['[横排]', '粘贴', '--', '属性']);

    const messy = planMenu(captured, pProfile([pGroup('组', [sepNode(), pItem('r:R100'), sepNode(), sepNode(), pItem('r:R101'), sepNode()])]));
    const messyGroup = messy[0] as Extract<PlanNode, { kind: 'group' }>;
    checkEq('分组内的分隔线也被整理', planNames(messyGroup.children), ['打开', '--', '复制']);
    checkEq('只剩分隔线的分组消失', planNames(planMenu(captured, pProfile([pGroup('空', [sepNode(), sepNode()]), pItem('r:R7')]))), ['属性']);
};

/* ------------------------------------------------------------- analysePlan */

const warningTests = () => {
    section('analysePlan');

    const captured = captureMenu(asMenu(createFakeMenu(CAP)));
    const snapshot = makeSnapshot(captured, infoOf({ kind: 'files', path: 'C:\\t', selection: 1 }));
    const kinds = (nodes: Node[], unmanaged: Profile['unmanaged'] = 'hide'): string[] =>
        analysePlan(pProfile(nodes, unmanaged), snapshot).map(warning => `${warning.kind}:${warning.id}`);

    checkEq('干净的规则没有警告', kinds([pItem('r:R100'), pItem('r:R7')]), []);

    const withRef = pItem('r:R100');
    checkEq('没有快照时规则项都算匹配不到', analysePlan(pProfile([withRef]), null).map(warning => warning.kind), ['unknown-ref']);

    const lonely = pItem('r:NOPE');
    checkEq('匹配不到原生项的规则项被标出', kinds([lonely]), [`unknown-ref:${lonely.id}`]);
    const hollow = pGroup('空', [pItem('r:NOPE')]);
    checkEq('子项全落空的分组同时报两项', kinds([hollow]), [`unknown-ref:${hollow.children[0].id}`, `empty-group:${hollow.id}`]);
    const blank = pGroup('空组', []);
    checkEq('什么都不含的分组被标成空分组', kinds([blank, pItem('r:R7')]), [`empty-group:${blank.id}`]);

    const hiddenChild = pGroup('全隐藏', [pItem('r:R100', { hidden: true })]);
    checkEq('子项全被隐藏的分组也是空分组', kinds([hiddenChild]), [`empty-group:${hiddenChild.id}`]);
    const hiddenGroup = pGroup('整组隐藏', [pItem('r:R100')], { hidden: true });
    checkEq('整组隐藏是显式意图, 不报警告', kinds([hiddenGroup]), []);

    const lead = sepNode();
    const first = sepNode();
    const second = sepNode();
    const tail = sepNode();
    checkEq('开头/连续/结尾的分隔线被标出', kinds([lead, pItem('r:R100'), first, second, pItem('r:R7'), tail]), [
        `dead-separator:${lead.id}`,
        `dead-separator:${second.id}`,
        `dead-separator:${tail.id}`
    ]);

    // 未纳入的原生项会补在规则后面, 所以末尾的分隔线是不是"结尾"取决于策略
    const endSep = sepNode();
    checkEq('keep-end 下末尾分隔线后面还有未纳入项, 不该报警', analysePlan(pProfile([pItem('r:R100'), endSep], 'keep-end'), snapshot).map(w => w.kind), []);
    checkEq('keep-end 下开头的分隔线照样被省略', analysePlan(pProfile([sepNode(), pItem('r:R100')], 'keep-end'), snapshot).map(w => w.kind), ['dead-separator']);
    const cutSep = sepNode();
    checkEq('hide 下末尾的分隔线确实会被丢掉', analysePlan(pProfile([pItem('r:R100'), cutSep], 'hide'), snapshot).map(w => `${w.kind}:${w.id}`), [`dead-separator:${cutSep.id}`]);
    const [g1, g2, g3, g4] = [sepNode(), sepNode(), sepNode(), sepNode()];
    checkEq('分组内开头/连续/结尾的分隔线也被标出', kinds([pGroup('组', [g1, pItem('r:R100'), g2, g3, pItem('r:R101'), g4])]), [
        `dead-separator:${g1.id}`,
        `dead-separator:${g3.id}`,
        `dead-separator:${g4.id}`
    ]);
    const inner = pGroup('内', [pItem('r:R100')]);
    const row = pGroup('横排', [inner, pItem('r:R101')], { layout: 'row' });
    checkEq('横排里的分组被标出', kinds([row]), [`ignored-in-row:${inner.id}`]);
    checkEq('横排里的分组确实不进计划', planNames(planMenu(captured, pProfile([row]))), ['[横排]']);
    const hiddenInRow = pGroup('隐', [pItem('r:R100')], { hidden: true });
    checkEq('横排里整组隐藏的不重复报警', kinds([pGroup('横排', [hiddenInRow, pItem('r:R101')], { layout: 'row' })]), []);
    checkEq('自定义命令不需要 ref', kinds([itemNode(null, '记事本', { type: 'open', path: 'C:\\x', args: '' })]), []);

    // 演示配置那种形状 (分组 + 分隔线 + 横排) 不该出现任何警告
    checkEq(
        '真实形状的规则没有误报',
        kinds([pGroup('我的分组', [pItem('r:R100')]), sepNode(), pGroup('横排', [pItem('r:R7')], { layout: 'row' })]),
        []
    );
};

/* ------------------------------------------------------------- buildCanvas */

const snapItem = (key: string, over: Partial<SnapshotItem> = {}): SnapshotItem => ({
    key,
    name: key,
    disabled: false,
    hasSubmenu: false,
    separator: false,
    hasIconBitmap: false,
    ...over
});

const canvasSnap = (items: (string | SnapshotItem)[]): Snapshot => ({
    at: 0,
    kind: 'files',
    windowTitle: '下载',
    className: 'CabinetWClass',
    executable: 'C:\\Windows\\explorer.exe',
    path: 'C:\\Users\\t\\下载',
    selection: 0,
    items: items.map(item => (typeof item === 'string' ? snapItem(item) : item))
});

const rowShape = (rows: CanvasRow[]): string[] =>
    rows.map(row => {
        const name = row.virtual ? `虚拟 ${row.key.slice('virtual:'.length)}` : `规则 ${row.node.id}`;
        return `${name} 父=${row.parentId ?? '-'} 序=${row.index} 深=${row.depth}${row.hiddenByPolicy ? ' 隐藏' : ''}`;
    });

const rowKeys = (rows: CanvasRow[]): string[] => rows.map(row => row.key);

const canvasTests = () => {
    section('buildCanvas');

    const blank = emptyProfile('files');
    checkEq('无快照时画布为空', buildCanvas(blank, null, []).length, 0);

    const withSep = canvasSnap([snapItem('r:A'), snapItem('分隔档', { separator: true }), snapItem('r:B')]);
    const virtualOnly = buildCanvas(blank, withSep, []);
    checkEq('空档案时快照项全成虚拟行', rowShape(virtualOnly), ['虚拟 r:A 父=- 序=-1 深=0', '虚拟 r:B 父=- 序=-1 深=0']);
    checkEq('虚拟行 key 带前缀', rowKeys(virtualOnly), ['virtual:r:A', 'virtual:r:B']);
    checkEq('虚拟行内容取自快照项', [virtualOnly[0].virtual, virtualOnly[0].node.kind, virtualOnly[0].node.ref?.key], [true, 'item', 'r:A']);
    checkEq('hide 下快照分隔符仍不成行', rowKeys(buildCanvas({ ...blank, unmanaged: 'hide' }, withSep, [])), ['virtual:r:A', 'virtual:r:B']);

    const a = pItem('r:A');
    const b = pItem('r:B');
    const c = pItem('r:C');
    const d = pItem('r:D');
    const inner = pGroup('收纳', [b, c]);
    const tree = pProfile([a, inner, d], 'keep-end');
    const rootShape = [`规则 ${a.id} 父=- 序=0 深=0`, `规则 ${inner.id} 父=- 序=1 深=0`, `规则 ${d.id} 父=- 序=2 深=0`];

    checkEq('分组未展开时子项不成行', rowShape(buildCanvas(tree, null, [])), rootShape);
    checkEq('分组展开后子项带父与深度', rowShape(buildCanvas(tree, null, [inner.id])), [
        ...rootShape.slice(0, 2),
        `规则 ${b.id} 父=${inner.id} 序=0 深=1`,
        `规则 ${c.id} 父=${inner.id} 序=1 深=1`,
        rootShape[2]
    ]);
    check('未知 id 不展开任何分组', deepEqual(rowShape(buildCanvas(tree, null, ['没用'])), rootShape));
    check('规则行直接引用档案节点', buildCanvas(tree, null, [])[1].node === inner);
    check('规则行不标记虚拟与策略隐藏', buildCanvas(tree, null, []).every(row => !row.virtual && !row.hiddenByPolicy));

    const four = canvasSnap(['r:A', 'r:B', 'r:C', 'r:D']);
    checkEq('分组子项不重复成虚拟行', rowKeys(buildCanvas(tree, four, [])), [a.id, inner.id, d.id]);
    checkEq('全部覆盖时无虚拟行', rowKeys(buildCanvas(tree, four, [inner.id])), [a.id, inner.id, b.id, c.id, d.id]);
    checkEq('未覆盖项按快照顺序补在末尾', rowKeys(buildCanvas(pProfile([a, b], 'keep-end'), four, [])), [a.id, b.id, 'virtual:r:C', 'virtual:r:D']);

    const gap = canvasSnap(['r:A', 'r:X', 'r:D']);
    checkEq('keep-original 未覆盖项回到原位', rowShape(buildCanvas(pProfile([a, d], 'keep-original'), gap, [])), [
        `规则 ${a.id} 父=- 序=0 深=0`,
        '虚拟 r:X 父=- 序=-1 深=0',
        `规则 ${d.id} 父=- 序=1 深=0`
    ]);
    checkEq('keep-end 未覆盖项排到最末', rowKeys(buildCanvas(pProfile([a, d], 'keep-end'), gap, [])), [a.id, d.id, 'virtual:r:X']);
    checkEq('keep-original 最前的未覆盖项排到最前', rowKeys(buildCanvas(pProfile([a], 'keep-original'), canvasSnap(['r:X', 'r:A']), [])), ['virtual:r:X', a.id]);
    checkEq('keep-original 末尾的未覆盖项留在最末', rowKeys(buildCanvas(pProfile([a], 'keep-original'), canvasSnap(['r:A', 'r:X']), [])), [a.id, 'virtual:r:X']);
    checkEq(
        'keep-original 连续未覆盖项保持快照顺序',
        rowKeys(buildCanvas(pProfile([a, d], 'keep-original'), canvasSnap(['r:A', 'r:X', 'r:Y', 'r:D']), [])),
        [a.id, 'virtual:r:X', 'virtual:r:Y', d.id]
    );
    checkEq(
        'keep-original 每个锚点各刷自己前面的未覆盖项',
        rowKeys(buildCanvas(pProfile([a, d], 'keep-original'), canvasSnap(['r:X', 'r:A', 'r:Y', 'r:D', 'r:Z']), [])),
        ['virtual:r:X', a.id, 'virtual:r:Y', d.id, 'virtual:r:Z']
    );

    const folded = pGroup('收纳', [pItem('r:B')]);
    const anchored = pProfile([folded, pItem('r:A')], 'keep-original');
    const anchorSnap = canvasSnap(['r:X', 'r:A', 'r:Y', 'r:B', 'r:Z']);
    checkEq('keep-original 分组按子项的最早位置当锚点', rowKeys(buildCanvas(anchored, anchorSnap, [])), [
        'virtual:r:X',
        'virtual:r:Y',
        folded.id,
        anchored.nodes[1].id,
        'virtual:r:Z'
    ]);
    const sameMenu = captureMenu(asMenu(createFakeMenu(['X', 'A', 'Y', 'B', 'Z'].map(name => ({ name, nameResid: name })))));
    const realOrder = planMenu(sameMenu, { ...anchored, nodes: [pGroup('收纳', [pItem('r:B')]), pItem('r:A')] }).map(node =>
        node.kind === 'group' ? 'G' : node.kind === 'item' ? node.source?.name ?? '?' : '-'
    );
    checkEq('画布顺序与真实菜单一致', realOrder, ['X', 'Y', 'G', 'A', 'Z']);
    const hiddenAnchor = pItem('r:A', { hidden: true });
    checkEq('隐藏的规则项不当锚点', rowKeys(buildCanvas(pProfile([hiddenAnchor], 'keep-original'), canvasSnap(['r:X', 'r:A']), [])), [hiddenAnchor.id, 'virtual:r:X']);

    const keepA = pItem('r:A', { label: '改过的 A' });
    const keepG = pGroup('组', [pItem('r:B')]);
    const adopted = adoptUnmanaged(pProfile([keepA, keepG], 'keep-original'), canvasSnap(['r:X', 'r:A', 'r:Y', 'r:B', 'r:Z']));
    checkEq('收进规则只补未覆盖项, 落在原位', [adopted.added, shape(adopted.nodes)], [3, '[r:X r:A r:Y G[r:B] r:Z]']);
    check('收进规则不动已有规则', adopted.nodes[1] === keepA && adopted.nodes[3] === keepG);
    checkEq('全都覆盖时什么也不加', adoptUnmanaged(pProfile([keepA], 'keep-original'), canvasSnap(['r:A'])).added, 0);
    const adoptedHidden = adoptUnmanaged(pProfile([keepA], 'hide'), canvasSnap(['r:A', 'r:X']));
    checkEq('hide 下收进来的项保持隐藏', adoptedHidden.nodes.map(node => node.kind !== 'sep' && node.hidden), [false, true]);

    checkEq('hide 把未覆盖项标成策略隐藏', rowShape(buildCanvas(pProfile([a], 'hide'), canvasSnap(['r:A', 'r:B']), [])), [
        `规则 ${a.id} 父=- 序=0 深=0`,
        '虚拟 r:B 父=- 序=-1 深=0 隐藏'
    ]);
    checkEq('keep-end 不标记策略隐藏', buildCanvas(pProfile([a], 'keep-end'), canvasSnap(['r:A', 'r:B']), []).map(row => row.hiddenByPolicy), [false, false]);
    checkEq('keep-original 不标记策略隐藏', buildCanvas(pProfile([a], 'keep-original'), canvasSnap(['r:A', 'r:B']), []).map(row => row.hiddenByPolicy), [false, false]);
};

/* ------------------------------------------------------------- history */

const historyTests = () => {
    section('history');

    const profiles = defaultSettings().profiles;
    const filesV1 = { ...profiles.files, enabled: true };
    const desktopV1 = { ...profiles.desktop, enabled: true };

    let history = recordHistory(emptyHistory(), { kind: 'desktop', profile: profiles.desktop });
    history = recordHistory(history, { kind: 'files', profile: profiles.files });
    const now = { ...profiles, files: filesV1, desktop: desktopV1 };

    const first = undoHistory(history, now);
    checkEq('撤销恢复最后一条', [first?.restore.kind, first?.restore.profile === profiles.files], ['files', true]);
    const second = undoHistory(first!.history, { ...now, files: profiles.files });
    checkEq('跨类型撤销恢复那条记录的类型', [second?.restore.kind, second?.restore.profile === profiles.desktop], ['desktop', true]);
    const redoEntry = second!.history.future[second!.history.future.length - 1];
    check('跨类型撤销时重做栈存的是那个类型的当前值', redoEntry.kind === 'desktop' && redoEntry.profile === desktopV1);
    const again = redoHistory(second!.history, { ...now, files: profiles.files, desktop: profiles.desktop });
    check('重做回到撤销前的值', again !== null && again.restore.kind === 'desktop' && again.restore.profile === desktopV1);
    const undoEntry = again!.history.past[again!.history.past.length - 1];
    check('跨类型重做时撤销栈存的是那个类型的当前值', undoEntry.kind === 'desktop' && undoEntry.profile === profiles.desktop);
    check('空栈撤销/重做返回 null', undoHistory(emptyHistory(), now) === null && redoHistory(emptyHistory(), now) === null);

    const typed = ['a', 'ab', 'abc'].reduce((acc, title) => recordHistory(acc, { kind: 'other', profile: { ...profiles.other, titleFilter: title } }, 'other:titleFilter'), emptyHistory());
    checkEq('同一字段的连续输入只记一条', typed.past.map(entry => entry.profile.titleFilter), ['a']);
    const other = recordHistory(typed, { kind: 'other', profile: profiles.other }, 'other:processFilter');
    checkEq('换一个字段就另起一条', other.past.length, 2);
    const back = recordHistory(recordHistory(typed, { kind: 'files', profile: profiles.files }), { kind: 'other', profile: profiles.other }, 'other:titleFilter');
    checkEq('中间夹了别的操作后同一字段重新记', back.past.length, 3);
    const afterUndo = recordHistory(undoHistory(typed, profiles)!.history, { kind: 'other', profile: profiles.other }, 'other:titleFilter');
    checkEq('撤销后再输入重新记', afterUndo.past.length, 1);
    check('新记录清空重做栈', recordHistory(second!.history, { kind: 'files', profile: profiles.files }).future.length === 0);

    let long = emptyHistory();
    for (let i = 0; i < HISTORY_LIMIT + 5; i += 1) long = recordHistory(long, { kind: 'files', profile: { ...profiles.files, updatedAt: i } });
    checkEq('历史最多保留上限条', [long.past.length, long.past[0].profile.updatedAt], [HISTORY_LIMIT, 5]);
};

/* ------------------------------------------------------------- shortcutFor */

const noMods: ShortcutMods = { shift: false, ctrl: false, alt: false, super: false };
const modsOf = (over: Partial<ShortcutMods> = {}): ShortcutMods => ({ ...noMods, ...over });
const ctrlMod: ShortcutMods = modsOf({ ctrl: true });
const stateOf = (over: Partial<ShortcutState> = {}): ShortcutState => ({
    hasSelection: true,
    editing: false,
    canUndo: true,
    canRedo: true,
    canRemove: true,
    ...over
});

const shortcutTests = () => {
    section('shortcutFor');

    checkEq('键码与 GLFW 一致', [KEY.escape, KEY.enter, KEY.delete, KEY.up, KEY.down, KEY.y, KEY.z, KEY.d], [256, 257, 261, 265, 264, 89, 90, 68]);

    checkEq('ctrl+z 撤销', shortcutFor(KEY.z, ctrlMod, stateOf()), 'undo');
    checkEq('meta+z 等同 ctrl+z', shortcutFor(KEY.z, modsOf({ super: true }), stateOf()), 'undo');
    checkEq('ctrl+shift+z 重做', shortcutFor(KEY.z, modsOf({ ctrl: true, shift: true }), stateOf()), 'redo');
    checkEq('ctrl+y 重做', shortcutFor(KEY.y, ctrlMod, stateOf()), 'redo');
    checkEq('ctrl+d 复制选中项', shortcutFor(KEY.d, ctrlMod, stateOf()), 'duplicate');
    checkEq('ctrl+delete 删除', shortcutFor(KEY.delete, ctrlMod, stateOf()), 'remove');
    checkEq('alt+up 选上一项', shortcutFor(KEY.up, modsOf({ alt: true }), stateOf()), 'selectPrev');
    checkEq('alt+down 选下一项', shortcutFor(KEY.down, modsOf({ alt: true }), stateOf()), 'selectNext');
    checkEq('ctrl+up 上移', shortcutFor(KEY.up, ctrlMod, stateOf()), 'moveUp');
    checkEq('ctrl+down 下移', shortcutFor(KEY.down, ctrlMod, stateOf()), 'moveDown');
    checkEq('enter 重命名选中项', shortcutFor(KEY.enter, noMods, stateOf()), 'rename');
    checkEq('escape 取消选中', shortcutFor(KEY.escape, noMods, stateOf()), 'deselect');
    checkEq('meta 方向键也能上下移动', [shortcutFor(KEY.up, modsOf({ super: true }), stateOf()), shortcutFor(KEY.down, modsOf({ super: true }), stateOf())], ['moveUp', 'moveDown']);

    checkEq('无可撤销时 ctrl+z 无效', shortcutFor(KEY.z, ctrlMod, stateOf({ canUndo: false })), null);
    checkEq('无可重做时 ctrl+shift+z 无效', shortcutFor(KEY.z, modsOf({ ctrl: true, shift: true }), stateOf({ canRedo: false })), null);
    checkEq('无可重做时 ctrl+y 无效', shortcutFor(KEY.y, ctrlMod, stateOf({ canRedo: false })), null);
    checkEq('无选中时 ctrl+d 无效', shortcutFor(KEY.d, ctrlMod, stateOf({ hasSelection: false })), null);
    checkEq('不可删时 ctrl+delete 无效', shortcutFor(KEY.delete, ctrlMod, stateOf({ canRemove: false })), null);
    checkEq('不可删时 ctrl+up 无效', shortcutFor(KEY.up, ctrlMod, stateOf({ canRemove: false })), null);
    checkEq('不可删时 ctrl+down 无效', shortcutFor(KEY.down, ctrlMod, stateOf({ canRemove: false })), null);
    checkEq('无选中时 enter 无效', shortcutFor(KEY.enter, noMods, stateOf({ hasSelection: false })), null);
    checkEq('无选中时 escape 无效', shortcutFor(KEY.escape, noMods, stateOf({ hasSelection: false })), null);
    checkEq('无选中时 alt+up 仍可切换选中', shortcutFor(KEY.up, modsOf({ alt: true }), stateOf({ hasSelection: false })), 'selectPrev');

    checkEq(
        '无修饰键的 delete 与方向键不响应',
        [shortcutFor(KEY.delete, noMods, stateOf()), shortcutFor(KEY.up, noMods, stateOf()), shortcutFor(KEY.down, noMods, stateOf())],
        [null, null, null]
    );
    checkEq('裸字母键不响应', [KEY.z, KEY.y, KEY.d].map(key => shortcutFor(key, noMods, stateOf())), [null, null, null]);
    checkEq('无关按键不响应', shortcutFor(65, ctrlMod, stateOf()), null);

    checkEq(
        '编辑中只认 escape',
        [KEY.escape, KEY.enter, KEY.delete, KEY.z].map(key => shortcutFor(key, ctrlMod, stateOf({ editing: true }))),
        ['deselect', null, null, null]
    );
    checkEq('编辑中无选中也能退出', shortcutFor(KEY.escape, noMods, stateOf({ editing: true, hasSelection: false })), 'deselect');
    checkEq('最后一行再往下停在最后一行', stepIndex(4, 1, 5), 4);
    checkEq('第一行再往上停在第一行', stepIndex(0, -1, 5), 0);
    checkEq('没有选中时往下选第一行、往上选最后一行', [stepIndex(-1, 1, 5), stepIndex(-1, -1, 5)], [0, 4]);
    checkEq('编辑中 alt+up 不响应', shortcutFor(KEY.up, modsOf({ alt: true }), stateOf({ editing: true })), null);
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
        itemNode(null, '记事本', { type: 'open', path: 'C:\\Windows\\notepad.exe', args: '%PATH%' }),
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
    checkEq('自定义命令调用 subproc.open 并展开 %PATH%', subprocCalls, [['C:\\Windows\\notepad.exe', '报告.txt']]);
    checkEq('自定义命令执行后关闭菜单', menu.closeCount, 1);

    const iconMenu = createFakeMenu(NATIVE);
    applyProfile(
        asMenu(iconMenu),
        pProfile([
            pItem('r:R1', { icon: { source: 'svg', svg: '<svg viewBox="0 0 16 16"><path d="M0 0H1"/></svg>' } }),
            pItem('r:R3', { icon: { source: 'svg', svg: '<svg fill="currentColor"><path/></svg>' } })
        ]),
        infoOf({ kind: 'files' })
    );
    checkEq('没写 fill 的图标按菜单主题补上填充色', findItem(iconMenu.items, '打开')?.data().icon_svg, '<svg fill="#f2f2f2" viewBox="0 0 16 16"><path d="M0 0H1"/></svg>');
    checkEq('自带 fill 的图标只替换 currentColor', findItem(iconMenu.items, '复制')?.data().icon_svg, '<svg fill="#f2f2f2"><path/></svg>');

    const nested = createFakeMenu(NATIVE);
    applyProfile(asMenu(nested), pProfile([pGroup('工具', [itemNode(null, '复制路径', { type: 'copy', text: 'x' })])]), infoOf({ kind: 'files' }));
    const nestedSub = openSubmenu(findItem(nested.items, '工具')!);
    runAction(findItem(nestedSub.items, '复制路径')!);
    checkEq('分组里的自定义命令关掉整个菜单', [nested.closeCount, nestedSub.closeCount], [1, 0]);

    const blank = createFakeMenu(NATIVE);
    const blankResult = applyProfile(asMenu(blank), pProfile([pItem('r:R1', { hidden: true })]), infoOf({ kind: 'files' }));
    checkEq('规则把所有项都隐藏时菜单确实清空', [blankResult.applied, blankResult.reason, namesOf(describeMenu(blank))], [true, 'empty-plan', []]);
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
    check('非法 unmanaged 回退到默认的 keep-original', fixed.profiles.files.unmanaged === emptyProfile('files').unmanaged && fixed.profiles.files.unmanaged === 'keep-original');
    check('分组标签非空', MENU_KINDS.every(kind => flatten(fixed.profiles[kind].nodes).every(entry => entry.node.kind !== 'group' || entry.node.label.trim().length > 0)));
    const nodeIds = flatten(fixed.profiles.files.nodes).map(entry => entry.node.id);
    check('自动补出的节点 id 非空且唯一', nodeIds.every(id => typeof id === 'string' && id.length > 0) && new Set(nodeIds).size === nodeIds.length);
    checkEq('布尔与枚举兜底', [fixed.showMenuEntry, fixed.logLevel], [true, 'basic']);
    check('不再写出无人读取的 version 字段', !('version' in fixed));
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

/* ------------------------------------------------------------- store */

const storeTests = () => {
    section('createStore');

    const writes: Settings[] = [];
    const store = createStore(defaultSettings(), next => writes.push(next), 60_000);
    const seen: Settings[] = [];
    const stop = store.subscribe(next => seen.push(next));
    check('订阅时先推一次当前设置', seen.length === 1 && seen[0] === store.get());

    const snap = canvasSnap(['r:A']);
    store.replace({ ...store.get(), snapshots: { files: snap } });
    store.updateProfile('files', { ...store.get().profiles.files, enabled: true });
    check('编辑器上报的 profile 不会冲掉模块侧的新快照', store.get().snapshots.files === snap && store.get().profiles.files.enabled);
    check('每次变化都推给订阅者', seen.length === 3 && seen[2] === store.get());
    checkEq('防抖期间不写盘', writes.length, 0);
    store.flush();
    check('flush 立刻写出最后一次修改', writes.length === 1 && writes[0] === store.get());
    store.flush();
    checkEq('没有待写内容时 flush 不重复写', writes.length, 1);

    stop();
    store.updateProfile('desktop', { ...store.get().profiles.desktop, enabled: true });
    checkEq('退订后不再推送', seen.length, 3);
    store.flush();
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
warningTests();
canvasTests();
historyTests();
shortcutTests();
applyTests();
losslessTests();
settingsTests();
storeTests();
i18nTests();

console.log(`\n=== 通过 ${passed} / 失败 ${failures.length} ===`);
if (failures.length > 0) {
    console.log(`失败清单: ${failures.join(' | ')}`);
    process.exitCode = 1;
}
