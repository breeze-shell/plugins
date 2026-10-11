import { Icons } from './theme';
import { t } from './i18n';
import { RenameItem, formatDate, padNumber, parseDateText, toLetters } from './model';
import { runScript, validateScript } from './scripting';

export type ParamValue = string | number | boolean;
export type Params = Record<string, ParamValue>;

export type FieldOption = { value: string; label: string };

export type Field = {
    kind: 'text' | 'number' | 'toggle' | 'select' | 'textarea' | 'chips';
    key: string;
    label: string;
    hint?: string;
    help?: string;
    placeholder?: string;
    width?: number;
    grow?: boolean;
    group?: string;
    min?: number;
    max?: number;
    step?: number;
    suffix?: string;
    options?: FieldOption[];
    height?: number;
    mono?: boolean;
    showIf?: (params: Params) => boolean;
    onPick?: (params: Params, value: string) => Params;
};

export type ExtMode = 'respect' | 'ignore' | 'own';

export type TransformInput = {
    base: string;
    ext: string;
    item: RenameItem;
    index: number;
    total: number;
    now: Date;
};

export type TransformOutput = { base: string; ext: string } | null;

export type Preset = {
    id: string;
    icon: string;
    title: string;
    description: string;
    extMode: ExtMode;
    advanced?: boolean;
    supportsOrder?: boolean;
    defaults: Params;
    fields: Field[];
    transform: (input: TransformInput, params: Params) => TransformOutput;
};

const str = (value: ParamValue | undefined, fallback = '') =>
    value === undefined || value === null ? fallback : String(value);
const num = (value: ParamValue | undefined, fallback: number) => {
    const parsed = typeof value === 'number' ? value : parseFloat(String(value ?? ''));
    return Number.isFinite(parsed) ? parsed : fallback;
};
const bool = (value: ParamValue | undefined, fallback = false) =>
    typeof value === 'boolean' ? value : String(value) === 'true' ? true : fallback;

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const joinParts = (parts: string[], sep: string) => parts.filter(part => part !== '').join(sep);

const wordsOf = (text: string) => text.split(/[\s_\-]+/).filter(Boolean);

const titleCase = (text: string) =>
    text.replace(/(^|[\s_\-])([^\s_\-]*)/g, (_all, sep: string, word: string) =>
        sep + (word ? word[0].toUpperCase() + word.slice(1).toLowerCase() : '')
    );

const asciiLower = (text: string) => text.toLowerCase();
const asciiUpper = (text: string) => text.toUpperCase();

/* ------------------------------------------------------------------ 1. 序号 */

const SEQ_FORMATS: FieldOption[] = [
    { value: 'decimal', label: t('数字 1 2 3', 'Numbers 1 2 3') },
    { value: 'alpha', label: t('小写字母 a b c', 'Letters a b c') },
    { value: 'ALPHA', label: t('大写字母 A B C', 'Letters A B C') }
];

const sequenceText = (params: Params, index: number) => {
    const start = num(params.start, 1);
    const step = Math.max(1, Math.trunc(num(params.step, 1)));
    const value = start + index * step;
    const digits = num(params.pad, 3);
    const format = str(params.format, 'decimal');
    if (format === 'alpha') return toLetters(value, false, digits);
    if (format === 'ALPHA') return toLetters(value, true, digits);
    return padNumber(value, digits);
};

const numbering: Preset = {
    id: 'numbering',
    icon: Icons.number,
    title: t('序号重命名', 'Sequential numbering'),
    description: t('按顺序编号，可选插入或替换原名', 'Number files in order, replacing or keeping the old name'),
    extMode: 'respect',
    supportsOrder: true,
    defaults: { mode: 'replace', start: 1, step: 1, pad: 3, format: 'decimal', sep: '_', prefix: '', suffix: '' },
    fields: [
        {
            kind: 'select',
            key: 'mode',
            label: t('命名方式', 'Pattern'),
            group: '编号方式',
            options: [
                { value: 'replace', label: t('只保留序号', 'Number only') },
                { value: 'before', label: t('序号 + 原名称', 'Number then name') },
                { value: 'after', label: t('原名称 + 序号', 'Name then number') }
            ]
        },
        { kind: 'number', key: 'start', label: t('起始序号', 'Start at'), min: -99999, max: 999999, step: 1 },
        { kind: 'number', key: 'step', label: t('步长', 'Step'), min: 1, max: 1000, step: 1 },
        { kind: 'number', key: 'pad', label: t('补零位数', 'Digits'), min: 0, max: 12, step: 1, hint: t('0 表示不补零', '0 means no padding') },
        { kind: 'select', key: 'format', label: t('序号格式', 'Format'), options: SEQ_FORMATS },
        { kind: 'text', key: 'prefix', label: t('前缀', 'Prefix'), group: '组合方式', placeholder: 'IMG' },
        { kind: 'text', key: 'suffix', label: t('后缀', 'Suffix'), placeholder: '' },
        {
            kind: 'text',
            key: 'sep',
            label: t('连接符', 'Separator'),
            width: 90,
            placeholder: '_'
        }
    ],
    transform: ({ base, ext, index }, params) => {
        const sep = str(params.sep, '_');
        const seq = sequenceText(params, index);
        const body = joinParts([str(params.prefix), seq, str(params.suffix)], sep);
        const mode = str(params.mode, 'replace');
        if (mode === 'before') return { base: joinParts([body, base], sep), ext };
        if (mode === 'after') return { base: joinParts([base, body], sep), ext };
        return { base: body, ext };
    }
};

/* -------------------------------------------------------------- 2. 查找替换 */

const replace: Preset = {
    id: 'replace',
    icon: Icons.replace,
    title: t('查找替换', 'Find and replace'),
    description: t('文本或正则替换，支持 $1 捕获组', 'Literal or regex replacement with $1 groups'),
    extMode: 'respect',
    defaults: { find: '', to: '', mode: 'text', caseSensitive: true },
    fields: [
        { kind: 'text', key: 'find', label: t('查找', 'Find'), placeholder: t('要替换的文字', 'Text to find') },
        { kind: 'text', key: 'to', label: t('替换为', 'Replace with'), placeholder: t('留空表示删除', 'Empty removes it') },
        {
            kind: 'select',
            key: 'mode',
            label: t('匹配方式', 'Match'),
            options: [
                { value: 'text', label: t('普通文本', 'Plain text') },
                { value: 'regex', label: t('正则表达式', 'Regular expression') }
            ]
        },
        { kind: 'toggle', key: 'caseSensitive', label: t('区分大小写', 'Match case') }
    ],
    transform: ({ base, ext }, params) => {
        const find = str(params.find);
        if (!find) return null;
        const replacement = str(params.to);
        const flags = bool(params.caseSensitive, true) ? 'g' : 'gi';
        const source = str(params.mode, 'text') === 'regex' ? find : escapeRegExp(find);
        let pattern: RegExp;
        try {
            pattern = new RegExp(source, flags);
        } catch (error) {
            throw new Error(t('正则表达式无效：', 'Invalid regular expression: ') + String(error));
        }
        return { base: base.replace(pattern, replacement), ext };
    }
};

/* -------------------------------------------------------------- 3. 前后缀 */

const affix: Preset = {
    id: 'affix',
    icon: Icons.affix,
    title: t('添加前后缀', 'Add prefix / suffix'),
    description: t('在名称前后插入固定文字', 'Insert fixed text around the name'),
    extMode: 'respect',
    defaults: { prefix: '', suffix: '', sep: '' },
    fields: [
        { kind: 'text', key: 'prefix', label: t('前缀', 'Prefix'), placeholder: t('例如 2024-', 'e.g. 2024-') },
        { kind: 'text', key: 'suffix', label: t('后缀', 'Suffix'), placeholder: t('例如 -备份', 'e.g. -backup') },
        { kind: 'text', key: 'sep', label: t('连接符', 'Separator'), width: 90, placeholder: t('无', 'none') }
    ],
    transform: ({ base, ext }, params) => {
        const sep = str(params.sep);
        const prefix = str(params.prefix);
        const suffix = str(params.suffix);
        if (!prefix && !suffix) return null;
        return { base: (prefix ? prefix + sep : '') + base + (suffix ? sep + suffix : ''), ext };
    }
};

/* -------------------------------------------------------------- 4. 大小写 */

const casePreset: Preset = {
    id: 'case',
    icon: Icons.textCase,
    title: t('大小写转换', 'Change case'),
    description: t('大写、小写、驼峰、下划线等', 'Upper, lower, camel, snake case'),
    extMode: 'respect',
    defaults: { mode: 'lower' },
    fields: [
        {
            kind: 'select',
            key: 'mode',
            label: t('转换方式', 'Convert to'),
            width: 220,
            options: [
                { value: 'lower', label: t('全小写 photo-name', 'lower case') },
                { value: 'upper', label: t('全大写 PHOTO-NAME', 'UPPER CASE') },
                { value: 'title', label: t('每词首字母大写 Photo Name', 'Title Case') },
                { value: 'sentence', label: t('仅首字母大写 Photo name', 'Sentence case') },
                { value: 'camel', label: t('小驼峰 photoName', 'camelCase') },
                { value: 'pascal', label: t('大驼峰 PhotoName', 'PascalCase') },
                { value: 'snake', label: t('下划线 photo_name', 'snake_case') },
                { value: 'kebab', label: t('连字符 photo-name', 'kebab-case') },
                { value: 'invert', label: t('反转大小写 pHOTO nAME', 'iNVERT cASE') }
            ]
        }
    ],
    transform: ({ base, ext }, params) => {
        const mode = str(params.mode, 'lower');
        const words = wordsOf(base);
        switch (mode) {
            case 'upper':
                return { base: asciiUpper(base), ext };
            case 'title':
                return { base: titleCase(base), ext };
            case 'sentence':
                return { base: base ? base[0].toUpperCase() + asciiLower(base.slice(1)) : base, ext };
            case 'camel':
                return {
                    base: words.map((word, index) => (index === 0 ? asciiLower(word) : word[0].toUpperCase() + asciiLower(word.slice(1)))).join(''),
                    ext
                };
            case 'pascal':
                return { base: words.map(word => word[0].toUpperCase() + asciiLower(word.slice(1))).join(''), ext };
            case 'snake':
                return { base: words.map(asciiLower).join('_'), ext };
            case 'kebab':
                return { base: words.map(asciiLower).join('-'), ext };
            case 'invert':
                return {
                    base: base
                        .split('')
                        .map(char => (char === asciiUpper(char) ? asciiLower(char) : asciiUpper(char)))
                        .join(''),
                    ext
                };
            default:
                return { base: asciiLower(base), ext };
        }
    }
};

/* ---------------------------------------------------------- 5. 截取与删除 */

const trim: Preset = {
    id: 'trim',
    icon: Icons.trim,
    title: t('截取与删除', 'Trim characters'),
    description: t('按位置删除开头 / 结尾的字符', 'Remove characters by position'),
    extMode: 'respect',
    defaults: { mode: 'head', count1: 3, count2: 5 },
    fields: [
        {
            kind: 'select',
            key: 'mode',
            label: t('处理方式', 'Mode'),
            width: 220,
            options: [
                { value: 'head', label: t('删除开头 N 个字符', 'Drop first N characters') },
                { value: 'tail', label: t('删除结尾 N 个字符', 'Drop last N characters') },
                { value: 'both', label: t('同时删除首尾', 'Drop both ends') },
                { value: 'range', label: t('只保留第 A 到第 B 个', 'Keep characters A to B') }
            ]
        },
        {
            kind: 'number',
            key: 'count1',
            label: t('数量 / 起始', 'Count / from'),
            min: 1,
            max: 9999,
            step: 1,
            suffix: t('个字符', 'chars')
        },
        {
            kind: 'number',
            key: 'count2',
            label: t('第二个数量 / 结束', 'Second count / to'),
            min: 1,
            max: 9999,
            step: 1,
            suffix: t('个字符', 'chars'),
            showIf: params => str(params.mode) === 'both' || str(params.mode) === 'range'
        }
    ],
    transform: ({ base, ext }, params) => {
        const mode = str(params.mode, 'head');
        const first = Math.max(0, Math.trunc(num(params.count1, 0)));
        const second = Math.max(0, Math.trunc(num(params.count2, 0)));
        let next = base;
        if (mode === 'head') next = base.slice(Math.min(first, base.length));
        else if (mode === 'tail') next = base.slice(0, Math.max(0, base.length - first));
        else if (mode === 'both') next = base.slice(Math.min(first, base.length), Math.max(0, base.length - second));
        else next = base.slice(Math.max(0, first - 1), second > 0 ? second : base.length);
        if (next === base) return null;
        return { base: next, ext };
    }
};

/* ------------------------------------------------------------ 6. 名称清理 */

const cleanup: Preset = {
    id: 'cleanup',
    icon: Icons.cleanup,
    title: t('文件名清理', 'Clean up name'),
    description: t('去空格、去非法字符、全角转半角', 'Trim spaces, strip illegal characters, normalize width'),
    extMode: 'respect',
    defaults: { trim: true, collapse: true, unicode: false, illegal: 'remove', spaces: 'keep', dedupe: true },
    fields: [
        { kind: 'toggle', key: 'trim', label: t('去掉首尾空格', 'Trim leading and trailing spaces'), group: '空白与重复' },
        { kind: 'toggle', key: 'collapse', label: t('连续空格合并为一个', 'Collapse repeated spaces') },
        { kind: 'toggle', key: 'dedupe', label: t('合并重复的 - _ 与空格', 'Collapse repeated - _ and spaces') },
        { kind: 'toggle', key: 'unicode', label: t('全角转半角 (ＮＦＣ)', 'Convert full-width to half-width'), group: '字符处理' },
        {
            kind: 'select',
            key: 'illegal',
            label: t('非法字符 <>:"/\\|?*', 'Illegal characters'),
            options: [
                { value: 'keep', label: t('保留', 'Keep') },
                { value: 'remove', label: t('删除', 'Remove') },
                { value: 'underscore', label: t('替换为下划线', 'Replace with underscore') }
            ]
        },
        {
            kind: 'select',
            key: 'spaces',
            label: t('空格处理', 'Spaces'),
            options: [
                { value: 'keep', label: t('保持', 'Keep') },
                { value: 'underscore', label: t('替换为下划线', 'Use underscore') },
                { value: 'hyphen', label: t('替换为连字符', 'Use hyphen') },
                { value: 'remove', label: t('删除', 'Remove') }
            ]
        }
    ],
    transform: ({ base, ext }, params) => {
        let next = base;
        if (bool(params.unicode)) next = next.normalize('NFKC');
        const illegal = str(params.illegal, 'remove');
        if (illegal === 'remove') next = next.replace(/[<>:"/\\|?*\u0000-\u001F]/g, '');
        else if (illegal === 'underscore') next = next.replace(/[<>:"/\\|?*\u0000-\u001F]/g, '_');
        const spaces = str(params.spaces, 'keep');
        if (spaces === 'underscore') next = next.replace(/ /g, '_');
        else if (spaces === 'hyphen') next = next.replace(/ /g, '-');
        else if (spaces === 'remove') next = next.replace(/ /g, '');
        if (bool(params.collapse)) next = next.replace(/ {2,}/g, ' ');
        if (bool(params.dedupe)) next = next.replace(/([_\- ])\1+/g, '$1');
        if (bool(params.trim)) next = next.replace(/^[\s_\-]+|[\s_\-]+$/g, '');
        next = next.replace(/[ .]+$/, '');
        if (!next || next === base) return null;
        return { base: next, ext };
    }
};

/* ------------------------------------------------------------- 7. 扩展名 */

const extension: Preset = {
    id: 'extension',
    icon: Icons.extension,
    title: t('扩展名处理', 'File extension'),
    description: t('改扩展名、统一大小写或去掉扩展名', 'Replace, normalize or strip the extension'),
    extMode: 'own',
    defaults: { mode: 'set', value: '' },
    fields: [
        {
            kind: 'select',
            key: 'mode',
            label: t('处理方式', 'Mode'),
            width: 220,
            options: [
                { value: 'set', label: t('改为新扩展名', 'Set new extension') },
                { value: 'add', label: t('没有扩展名时补上', 'Add when missing') },
                { value: 'lower', label: t('扩展名转小写', 'Lowercase extension') },
                { value: 'upper', label: t('扩展名转大写', 'Uppercase extension') },
                { value: 'remove', label: t('删除扩展名', 'Remove extension') }
            ]
        },
        {
            kind: 'text',
            key: 'value',
            label: t('新扩展名', 'New extension'),
            width: 140,
            placeholder: 'txt',
            hint: t('不需要输入点号', 'Dot is optional'),
            showIf: params => str(params.mode) === 'set' || str(params.mode) === 'add'
        }
    ],
    transform: ({ base, ext, item }, params) => {
        if (item.isDir) return null;
        const mode = str(params.mode, 'set');
        const raw = str(params.value).trim().replace(/^\.+/, '');
        const wanted = raw ? '.' + raw : '';
        if (mode === 'remove') return ext ? { base, ext: '' } : null;
        if (mode === 'lower') return ext && ext !== asciiLower(ext) ? { base, ext: asciiLower(ext) } : null;
        if (mode === 'upper') return ext && ext !== asciiUpper(ext) ? { base, ext: asciiUpper(ext) } : null;
        if (mode === 'add') return ext || !wanted ? null : { base, ext: wanted };
        if (!wanted || wanted === ext) return null;
        return { base, ext: wanted };
    }
};

/* ----------------------------------------------------------- 8. 日期时间 */

const DATE_PATTERN_CHIPS: FieldOption[] = [
    { value: 'YYYY-MM-DD', label: 'YYYY-MM-DD' },
    { value: 'YYYYMMDD', label: 'YYYYMMDD' },
    { value: 'YYYY-MM-DD_HH-mm-ss', label: 'YYYY-MM-DD_HH-mm-ss' },
    { value: 'YYYY年MM月DD日', label: t('YYYY年MM月DD日', 'YYYY-MM-DD (CJK)') }
];

const dateTime: Preset = {
    id: 'dateTime',
    icon: Icons.dateTime,
    title: t('日期时间', 'Date and time'),
    description: t('按时间给名称加时间戳', 'Stamp names with a date or time'),
    extMode: 'respect',
    supportsOrder: true,
    defaults: {
        source: 'now',
        pattern: 'YYYY-MM-DD',
        position: 'prefix',
        sep: '_',
        base: '',
        step: 1,
        unit: 'minute'
    },
    fields: [
        {
            kind: 'select',
            key: 'source',
            label: t('时间来源', 'Time source'),
            group: '时间来源',
            width: 220,
            options: [
                { value: 'now', label: t('重命名时的当前时间', 'Current time') },
                { value: 'file', label: t('文件修改日期', 'File modified date') },
                { value: 'fixed', label: t('指定起始时间并递增', 'Fixed start time, increasing') }
            ]
        },
        {
            kind: 'text',
            key: 'base',
            label: t('起始时间', 'Start time'),
            width: 220,
            placeholder: '2026-01-01 09:30:00',
            showIf: params => str(params.source) === 'fixed'
        },
        {
            kind: 'number',
            key: 'step',
            label: t('每项递增', 'Increment by'),
            min: 1,
            max: 9999,
            step: 1,
            showIf: params => str(params.source) === 'fixed'
        },
        {
            kind: 'select',
            key: 'unit',
            label: t('递增单位', 'Unit'),
            showIf: params => str(params.source) === 'fixed',
            options: [
                { value: 'second', label: t('秒', 'Seconds') },
                { value: 'minute', label: t('分钟', 'Minutes') },
                { value: 'hour', label: t('小时', 'Hours') },
                { value: 'day', label: t('天', 'Days') }
            ]
        },
        { kind: 'chips', key: 'pattern', label: t('常用格式', 'Presets'), group: '时间格式', options: DATE_PATTERN_CHIPS },
        { kind: 'text', key: 'pattern', label: t('时间格式', 'Format'), width: 220, mono: true, help: t('可用 YYYY MM DD HH mm ss', 'Tokens: YYYY MM DD HH mm ss') },
        {
            kind: 'select',
            key: 'position',
            label: t('放置位置', 'Position'),
            group: '放置方式',
            options: [
                { value: 'prefix', label: t('名称前', 'Before name') },
                { value: 'suffix', label: t('名称后', 'After name') },
                { value: 'replace', label: t('替换整个名称', 'Replace the name') }
            ]
        },
        { kind: 'text', key: 'sep', label: t('连接符', 'Separator'), width: 90, placeholder: '_' }
    ],
    transform: ({ base, ext, item, index, now }, params) => {
        const source = str(params.source, 'now');
        let stamp = now;
        if (source === 'file') {
            stamp = item.mtime ?? now;
        } else if (source === 'fixed') {
            const step = num(params.step, 1);
            const unit = str(params.unit, 'minute');
            const scale = unit === 'second' ? 1000 : unit === 'hour' ? 3600000 : unit === 'day' ? 86400000 : 60000;
            stamp = new Date(parseDateText(str(params.base), now).getTime() + step * index * scale);
        }
        const text = formatDate(stamp, str(params.pattern, 'YYYY-MM-DD'));
        if (!text) return null;
        const sep = str(params.sep, '_');
        const position = str(params.position, 'prefix');
        if (position === 'replace') return { base: text, ext };
        if (position === 'suffix') return { base: base ? base + sep + text : text, ext };
        return { base: base ? text + sep + base : text, ext };
    }
};

/* ------------------------------------------------------------- 9. 脚本 */

const SCRIPT_EXAMPLES: { label: string; code: string }[] = [
    {
        label: t('序号 + 原名', 'Index + name'),
        code: 'return i + ". " + name;'
    },
    {
        label: t('转拼音风格', 'Slug'),
        code: 'return base.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") + ext;'
    },
    {
        label: t('按大小写风格', 'By size'),
        code: 'const tag = size > 1024 * 1024 ? "large" : "small";\nreturn tag + "-" + base + ext;'
    },
    {
        label: t('按修改日期', 'By date'),
        code: 'return date("YYYY-MM-DD") + "_" + name;'
    }
];

const script: Preset = {
    id: 'script',
    icon: Icons.script,
    title: t('JS 脚本', 'JavaScript'),
    description: t('用 JavaScript 决定每个新名字', 'Decide every new name with JavaScript'),
    extMode: 'ignore',
    advanced: true,
    supportsOrder: true,
    defaults: { code: 'return i + ". " + name;', onError: 'skip' },
    fields: [
        {
            kind: 'chips',
            key: 'code',
            label: t('插入示例', 'Insert example'),
            group: '脚本',
            options: SCRIPT_EXAMPLES.map(example => ({ value: example.code, label: example.label })),
            onPick: (params, code) => ({ ...params, code })
        },
        {
            kind: 'textarea',
            key: 'code',
            label: t('脚本', 'Script'),
            height: 168,
            mono: true,
            placeholder: 'return i + ". " + name;'
        },
        {
            kind: 'select',
            key: 'onError',
            label: t('脚本报错时', 'On script error'),
            group: '出错时',
            options: [
                { value: 'skip', label: t('跳过该项', 'Skip this item') },
                { value: 'block', label: t('阻止应用', 'Block applying') }
            ]
        }
    ],
    transform: ({ base, ext, item, index, total, now }, params) => {
        const source = str(params.code);
        if (!source.trim()) return null;
        const result = runScript(source, {
            name: item.name,
            base,
            ext,
            path: item.path,
            dir: item.dir,
            isDir: item.isDir,
            size: item.size,
            mtime: item.mtime ? formatDate(item.mtime, 'YYYY-MM-DD HH:mm:ss') : '',
            index,
            i: index + 1,
            total,
            now,
            stamp: item.mtime ?? now
        });
        if (result === null || result === undefined || result === false) return null;
        const text = String(result).trim();
        if (!text) throw new Error(t('脚本返回了空名称', 'Script returned an empty name'));
        if (text.includes('\\') || text.includes('/')) throw new Error(t('新名称不能包含路径分隔符', 'New name must not contain path separators'));
        const dot = text.lastIndexOf('.');
        if (dot <= 0) return { base: text, ext: '' };
        return { base: text.slice(0, dot), ext: text.slice(dot) };
    }
};

export const PRESETS: Preset[] = [numbering, replace, affix, casePreset, trim, cleanup, dateTime, extension];
export const SCRIPT_PRESET = script;
export const ALL_PRESETS: Preset[] = [...PRESETS, script];

export const findPreset = (id: string): Preset => ALL_PRESETS.find(preset => preset.id === id) ?? numbering;

export const defaultParams = (): Record<string, Params> => {
    const out: Record<string, Params> = {};
    for (const preset of ALL_PRESETS) out[preset.id] = { ...preset.defaults };
    return out;
};

export const scriptErrors = (code: string): string | null => validateScript(code);
