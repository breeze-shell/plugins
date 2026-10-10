// 纯逻辑测试: 预设、冲突检测、两阶段改名、撤销、脚本求值、配置归一化。
// 通过 test/run-logic.mjs 打包 (mshell 换成 test/mshell-stub.mjs) 后在 node 里跑。
import nodeFs from 'node:fs';
import nodeOs from 'node:os';
import nodePath from 'node:path';
import { RenameItem, diffNames, formatDate, joinPath, naturalCompare, padNumber, splitName, splitPath, toLetters, validateName } from '../src/model';
import { Params, defaultParams, findPreset } from '../src/presets';
import { buildPlan, batchFromPlan, executeRenames, invertEntries } from '../src/plan';
import { defaultSettings, normalizeSettings } from '../src/settings';
import { runScript, validateScript } from '../src/scripting';
import { attachRenameMenu, MenuEntry } from '../src/menu';
import { makeActions } from '../src/actions';

let passed = 0;
const failures: string[] = [];

const check = (name: string, actual: unknown, expected: unknown) => {
    const left = JSON.stringify(actual);
    const right = JSON.stringify(expected);
    if (left === right) passed++;
    else failures.push(`${name}\n     期望 ${right}\n     实际 ${left}`);
};

const section = (title: string) => console.log(`\n== ${title}`);

const item = (name: string, over: Partial<RenameItem> = {}): RenameItem => {
    const parsed = splitName(name, false);
    return {
        path: 'C:\\t\\' + name,
        dir: 'C:\\t',
        name,
        base: parsed.base,
        ext: parsed.ext,
        isDir: false,
        size: 10,
        mtime: null,
        pickedIndex: 0,
        ...over
    };
};

const names = (
    items: RenameItem[],
    presetId: string,
    params: Partial<Params> = {},
    keepExt = true,
    extra: { order?: 'name' | 'nameDesc' | 'size' | 'date' | 'picked'; now?: Date } = {}
) => {
    const preset = findPreset(presetId);
    const plan = buildPlan(items, preset, { ...preset.defaults, ...params }, {
        keepExt,
        order: extra.order ?? 'name',
        now: extra.now ?? new Date(2026, 0, 2, 3, 4, 5),
        checkExisting: false
    });
    return plan.rows.map(row => (row.status === 'error' ? `!${row.reason}` : row.status === 'same' ? '=' : row.newName));
};

/* ---------------------------------------------------------------- 模型 */

section('模型');
check('splitName 普通文件', splitName('photo.jpg', false), { base: 'photo', ext: '.jpg' });
check('splitName 多点', splitName('a.b.c.txt', false), { base: 'a.b.c', ext: '.txt' });
check('splitName 点开头', splitName('.gitignore', false), { base: '.gitignore', ext: '' });
check('splitName 无扩展名', splitName('README', false), { base: 'README', ext: '' });
check('splitName 目录不拆扩展名', splitName('my.dir', true), { base: 'my.dir', ext: '' });
check('splitPath', splitPath('C:/a/b/c.txt'), { dir: 'C:\\a\\b', name: 'c.txt' });
check('joinPath', joinPath('C:\\a', 'b.txt'), 'C:\\a\\b.txt');
check('自然序 2 < 10', naturalCompare('photo2.jpg', 'photo10.jpg') < 0, true);
check('补零', padNumber(7, 3), '007');
check('字母序号', toLetters(28, false, 0), 'ab');
check('非法字符', validateName('a<b>c'), 'illegal');
check('保留名', validateName('CON.txt'), 'reserved');
check('结尾空格', validateName('name '), 'trailing');
check('空名称', validateName('   '), 'empty');
check('正常名称', validateName('holiday 1.jpg'), null);
check('差异片段', diffNames('photo_001.jpg', 'IMG_002.jpg').map(part => part.kind).join(','), 'del,add,same');

/* -------------------------------------------------------------- 8 个预设 */

section('预设');
const photos = [item('IMG_1.jpg'), item('IMG_2.jpg'), item('IMG_10.jpg')];

check('序号: 替换原名', names(photos, 'numbering', { start: 1, pad: 3, prefix: 'P', sep: '-' }), ['P-001.jpg', 'P-002.jpg', 'P-003.jpg']);
check('序号: 加到原名后', names(photos, 'numbering', { mode: 'after', sep: '_' }), ['IMG_1_001.jpg', 'IMG_2_002.jpg', 'IMG_10_003.jpg']);
check('序号: 字母', names(photos, 'numbering', { format: 'alpha', pad: 0 }), ['a.jpg', 'b.jpg', 'c.jpg']);
check('序号: 不保留扩展名', names(photos, 'numbering', { prefix: 'x', sep: '' }, false), ['x001', 'x002', 'x003']);
check('序号: 按大小排序', names([item('c.txt', { size: 30 }), item('a.txt', { size: 10 }), item('b.txt', { size: 20 })], 'numbering', {}, true, { order: 'size' }), ['001.txt', '002.txt', '003.txt']);

check('查找替换: 字面', names(photos, 'replace', { find: 'IMG', to: 'PHOTO' }), ['PHOTO_1.jpg', 'PHOTO_2.jpg', 'PHOTO_10.jpg']);
check('查找替换: 正则捕获组', names(photos, 'replace', { find: '(\\d+)', to: '[$1]', mode: 'regex' }), ['IMG_[1].jpg', 'IMG_[2].jpg', 'IMG_[10].jpg']);
check('查找替换: 区分大小写', names([item('Photo.jpg')], 'replace', { find: 'photo', to: 'x' }), ['=']);
check('查找替换: 忽略大小写', names([item('Photo.jpg')], 'replace', { find: 'photo', to: 'x', caseSensitive: false }), ['x.jpg']);
check('查找替换: 无查找词不改名', names(photos, 'replace', {}), ['=', '=', '=']);

check('前后缀', names(photos, 'affix', { prefix: '2024', suffix: 'done', sep: '-' }), ['2024-IMG_1-done.jpg', '2024-IMG_2-done.jpg', '2024-IMG_10-done.jpg']);
check('前后缀: 只有前缀无连接符', names(photos, 'affix', { prefix: 'x' }), ['xIMG_1.jpg', 'xIMG_2.jpg', 'xIMG_10.jpg']);

check('大小写: 小写', names([item('Holiday Photo.JPG')], 'case', { mode: 'lower' }), ['holiday photo.JPG']);
check('大小写: 标题', names([item('holiday photo.jpg')], 'case', { mode: 'title' }), ['Holiday Photo.jpg']);
check('大小写: 驼峰', names([item('holiday photo trip.jpg')], 'case', { mode: 'camel' }), ['holidayPhotoTrip.jpg']);
check('大小写: 下划线', names([item('Holiday Photo.jpg')], 'case', { mode: 'snake' }), ['holiday_photo.jpg']);

check('截取: 删开头', names([item('IMG_0001.jpg')], 'trim', { mode: 'head', count1: 4 }), ['0001.jpg']);
check('截取: 删结尾', names([item('IMG_0001.jpg')], 'trim', { mode: 'tail', count1: 4 }), ['IMG_.jpg']);
check('截取: 保留区间', names([item('IMG_0001.jpg')], 'trim', { mode: 'range', count1: 5, count2: 8 }), ['0001.jpg']);

check('清理: 非法字符', names([item('a<b>c:d.txt')], 'cleanup', {}), ['abcd.txt']);
check('清理: 空格转下划线', names([item('a  b c.txt')], 'cleanup', { spaces: 'underscore', collapse: true }), ['a_b_c.txt']);
check('清理: 全角转半角', names([item('ＡＢ１２.txt')], 'cleanup', { unicode: true }), ['AB12.txt']);

check('扩展名: 改', names(photos, 'extension', { mode: 'set', value: 'jpeg' }), ['IMG_1.jpeg', 'IMG_2.jpeg', 'IMG_10.jpeg']);
check('扩展名: 小写', names([item('IMG_1.JPG'), item('IMG_2.JPG')], 'extension', { mode: 'lower' }), ['IMG_1.jpg', 'IMG_2.jpg']);
check('扩展名: 删除', names(photos, 'extension', { mode: 'remove' }), ['IMG_1', 'IMG_2', 'IMG_10']);
check('扩展名: 补上', names([item('README')], 'extension', { mode: 'add', value: '.md' }), ['README.md']);
check('目录不处理扩展名', names([item('folder.name', { isDir: true })], 'extension', { mode: 'set', value: 'x' }), ['=']);

check(
    '日期: 当前时间',
    names(photos, 'dateTime', { source: 'now', pattern: 'YYYYMMDD-HHmm', position: 'prefix', sep: '-' }),
    ['20260102-0304-IMG_1.jpg', '20260102-0304-IMG_2.jpg', '20260102-0304-IMG_10.jpg']
);
check(
    '日期: 递增',
    names(photos.slice(0, 2), 'dateTime', { source: 'fixed', base: '2026-01-01', pattern: 'YYYYMMDD', step: 1, unit: 'day' }),
    ['20260101_IMG_1.jpg', '20260102_IMG_2.jpg']
);
check(
    '日期: 文件修改时间',
    names(
        [item('a.txt', { mtime: new Date(2025, 4, 6, 7, 8, 9) })],
        'dateTime',
        { source: 'file', pattern: 'YYYY-MM-DD' }
    ),
    ['2025-05-06_a.txt']
);

check('脚本: 序号 + 原名', names(photos, 'script', { code: 'return i + ". " + name;' }), ['1. IMG_1.jpg', '2. IMG_2.jpg', '3. IMG_10.jpg']);
check('脚本: 表达式简写', names([item('A B.txt')], 'script', { code: 'slug(base) + ext' }), ['a-b.txt']);
check('脚本: 跳过', names(photos, 'script', { code: 'return index === 1 ? null : name;' }), ['=', '=', '=']);
check('脚本: 变量 sizeflag', names([item('a.txt', { size: 2 * 1024 * 1024 })], 'script', { code: 'return humanSize(size) + "-" + base + ext;' }), ['2.0MB-a.txt']);
check('脚本: 返回路径报错', names([item('a.txt')], 'script', { code: 'return "sub/dir.txt";' }), ['!新名称不能包含路径分隔符']);
check('脚本: 语法错误', validateScript('return (') !== null, true);
check('脚本: 运行期错误', (() => {
    try {
        runScript('return missingThing.value;', {
            name: 'a.txt', base: 'a', ext: '.txt', path: 'C:\\a.txt', dir: 'C:\\', isDir: false,
            size: 0, mtime: '', index: 0, i: 1, total: 1, now: new Date(), stamp: new Date()
        });
        return 'no-throw';
    } catch (error) {
        return 'threw';
    }
})(), 'threw');

check('格式化日期', formatDate(new Date(2026, 8, 7, 6, 5, 4), 'YYYY-MM-DD HH:mm:ss'), '2026-09-07 06:05:04');

/* ------------------------------------------------------- 冲突与两阶段改名 */

section('冲突与执行');
const target = nodePath.join(nodeOs.tmpdir(), `rename-plus-logic-${Date.now()}`);
nodeFs.mkdirSync(target, { recursive: true });
const write = (name: string, body: string) => nodeFs.writeFileSync(nodePath.join(target, name), body);
const read = (name: string) => nodeFs.readFileSync(nodePath.join(target, name), 'utf8');
const exists = (name: string) => nodeFs.existsSync(nodePath.join(target, name));

write('a.txt', 'A');
write('b.txt', 'B');
write('keep.txt', 'K');

const fsItem = (name: string): RenameItem => item(name, { path: nodePath.join(target, name), dir: target });

const dupPlan = buildPlan(
    [fsItem('a.txt'), fsItem('b.txt')],
    findPreset('replace'),
    { ...findPreset('replace').defaults, find: '[ab]', to: 'x', mode: 'regex' },
    { keepExt: true, order: 'name', now: new Date(), checkExisting: true }
);
check('批量内重名被拦住', dupPlan.rows.map(row => row.status), ['error', 'error']);
check('重名原因', dupPlan.rows[0].reason, '与「x.txt」重名');

write('x7.txt', 'X');
const existsPlan = buildPlan([fsItem('a.txt')], findPreset('numbering'), { ...findPreset('numbering').defaults, start: 7, pad: 0, prefix: 'x', sep: '' }, {
    keepExt: true, order: 'name', now: new Date(), checkExisting: true
});
check('目标已存在被拦住', existsPlan.rows[0].status, 'error');
check('目标已存在原因', existsPlan.rows[0].reason, '目标名称已存在');

const swap = executeRenames([
    { from: nodePath.join(target, 'a.txt'), to: nodePath.join(target, 'b.txt'), fromName: 'a.txt', toName: 'b.txt' },
    { from: nodePath.join(target, 'b.txt'), to: nodePath.join(target, 'a.txt'), fromName: 'b.txt', toName: 'a.txt' }
]);
check('互相占位时两阶段改名成功', swap.done.length, 2);
check('交换后 a.txt 内容', read('a.txt'), 'B');
check('交换后 b.txt 内容', read('b.txt'), 'A');

const clobber = executeRenames([
    { from: nodePath.join(target, 'a.txt'), to: nodePath.join(target, 'keep.txt'), fromName: 'a.txt', toName: 'keep.txt' }
]);
check('目标被占用时拒绝改名', clobber.failed.length, 1);
check('拒绝后原文件还在', exists('a.txt'), true);
check('拒绝后目标内容没被覆盖', read('keep.txt'), 'K');

const plan = (() => {
    const items = [fsItem('a.txt'), fsItem('b.txt'), fsItem('keep.txt')];
    return buildPlan(items, findPreset('affix'), { prefix: 'new-', suffix: '', sep: '' }, {
        keepExt: true, order: 'name', now: new Date(), checkExisting: true
    });
})();
check('计划里 3 项待改名', plan.changed.length, 3);
const batch = batchFromPlan(plan);
check('执行改名', executeRenames(batch.entries).done.length, 3);
check('改名结果', nodeFs.readdirSync(target).sort(), ['new-a.txt', 'new-b.txt', 'new-keep.txt', 'x7.txt']);
check('撤销', executeRenames(invertEntries(batch.entries)).done.length, 3);
check('撤销结果', nodeFs.readdirSync(target).sort(), ['a.txt', 'b.txt', 'keep.txt', 'x7.txt']);

/* ------------------------------------------------------------ 配置 */

section('配置');
const normalized = normalizeSettings({
    keepExt: false,
    order: 'size',
    lastPreset: 'unknown-preset',
    params: { numbering: { pad: 5 }, ghost: { x: 1 } },
    lastBatch: { time: 1, dir: 'C:\\', entries: Array.from({ length: 250 }, (_v, i) => ({ from: `a${i}`, to: `b${i}`, fromName: `a${i}`, toName: `b${i}` })) }
});
check('保留扩展名开关', normalized.keepExt, false);
check('排序', normalized.order, 'size');
check('未知预设回退', normalized.lastPreset, 'numbering');
check('参数合并默认值', normalized.params.numbering.pad, 5);
check('参数合并默认值 2', normalized.params.numbering.start, 1);
check('丢弃未知预设参数', 'ghost' in normalized.params, false);
check('撤销记录截断', normalized.lastBatch?.entries.length, 200);
check('空配置', normalizeSettings(null).keepExt, true);

nodeFs.rmSync(target, { recursive: true, force: true });

/* ------------------------------------------------------- 上下文菜单 */

section('上下文菜单');
const menuDir = nodePath.join(nodeOs.tmpdir(), `rename-plus-menu-${Date.now()}`);
nodeFs.mkdirSync(menuDir, { recursive: true });
for (const name of ['a.txt', 'b.txt', 'c.txt']) nodeFs.writeFileSync(nodePath.join(menuDir, name), name);

const menuItems = ['a.txt', 'b.txt', 'c.txt'].map(name =>
    item(name, { path: nodePath.join(menuDir, name), dir: menuDir })
);

type Recorded = MenuEntry & { spacer?: boolean; after?: number };
type FakeMenu = {
    entries: Recorded[];
    append_menu: (entry: MenuEntry) => unknown;
    append_menu_after: (entry: MenuEntry, after: number) => unknown;
    append_spacer: () => void;
    close: () => void;
    items: { data(): { name?: string } }[];
};

const fakeMenu = (siblings: string[] = []): FakeMenu => {
    const entries: Recorded[] = [];
    return {
        entries,
        items: siblings.map(name => ({ data: () => ({ name }) })),
        append_menu: entry => (entries.push({ ...entry }), {}),
        append_menu_after: (entry, after) => (entries.push({ ...entry, after }), {}),
        append_spacer: () => entries.push({ name: '-----', spacer: true }),
        close: () => {}
    };
};

let menuSettings = { ...defaultSettings(), params: defaultParams() };
const menuLogs: string[] = [];
const realActions = makeActions({
    settings: () => menuSettings,
    save: patch => {
        menuSettings = { ...menuSettings, ...patch };
    },
    log: message => menuLogs.push(message)
});

const opened: string[] = [];
const menuActions = {
    openWindow: (items: RenameItem[], presetId: string) => opened.push(`${presetId}:${items.length}`),
    quickApply: realActions.quickApply,
    undo: realActions.undoLast,
    canUndo: realActions.canUndo,
    lastBatchSize: realActions.lastBatchSize
};

const root = fakeMenu(['剪切', '复制', '重命名', '属性']);
attachRenameMenu(root, menuItems, menuSettings, menuActions);
check('插到原生重命名后面', root.entries[0].after, 2);
check('多选标题带数量', root.entries[0].name, '重命名 Plus（3 项）');

const sub = fakeMenu();
root.entries[0].submenu?.(sub);
check(
    '一级子菜单结构',
    sub.entries.map(entry => entry.name),
    ['批量重命名…（3 项）', '-----', '常用预设', '-----', '撤销上次重命名']
);
check('没有记录时撤销禁用', sub.entries[4].disabled, true);

sub.entries[0].action?.();
check('打开窗口用多选参数', opened, ['numbering:3']);

const presets = fakeMenu();
sub.entries[2].submenu?.(presets);
check('8 个预设 + 分隔 + 细调', presets.entries.length, 10);
check('序号预设带名字预览', presets.entries[0].name, '序号重命名  → 001.txt');
check('查找替换无关键词时禁用', presets.entries[1].disabled, true);
check('序号预设可用', presets.entries[0].disabled, false);
check(
    '细调项在最后',
    presets.entries[9].name,
    '在窗口中细调…'
);

presets.entries[0].action?.();
check('菜单里直接应用序号', nodeFs.readdirSync(menuDir).sort(), ['001.txt', '002.txt', '003.txt']);
check('应用后有日志', menuLogs.length > 0, true);

const renamed = nodeFs.readdirSync(menuDir).sort().map(name => item(name, { path: nodePath.join(menuDir, name), dir: menuDir }));
const root2 = fakeMenu(['重命名']);
attachRenameMenu(root2, renamed, menuSettings, menuActions);
const sub2 = fakeMenu();
root2.entries[0].submenu?.(sub2);
const undoEntry = sub2.entries[sub2.entries.length - 1];
check('撤销项可用', undoEntry.disabled, false);
check('撤销项带数量', undoEntry.name, '撤销上次重命名（3 项）');
undoEntry.action?.();
check('撤销回到原名', nodeFs.readdirSync(menuDir).sort(), ['a.txt', 'b.txt', 'c.txt']);

const single = fakeMenu();
attachRenameMenu(single, [menuItems[0]], menuSettings, menuActions);
check('单选标题', single.entries[0].name, '重命名 Plus');
const singleSub = fakeMenu();
single.entries[0].submenu?.(singleSub);
check('单选第一项', singleSub.entries[0].name, '重命名…（打开窗口）');
singleSub.entries[0].action?.();
check('单选进窗口走手动改名', opened[opened.length - 1], 'manual:1');

nodeFs.rmSync(menuDir, { recursive: true, force: true });

/* ------------------------------------------------------------ 结果 */

console.log('');
if (failures.length > 0) {
    console.log(`✗ ${failures.length} 个断言失败 / ${passed + failures.length}`);
    for (const failure of failures) console.log(`  - ${failure}`);
    process.exit(1);
}
console.log(`✓ 全部 ${passed} 个断言通过`);
