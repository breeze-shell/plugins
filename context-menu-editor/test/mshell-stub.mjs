// 逻辑测试用的 mshell 替身: 只用 node 实现插件真正依赖的那部分运行时 API。
import nodeFs from 'node:fs';
import nodePath from 'node:path';
import { fileURLToPath } from 'node:url';

const here = nodePath.dirname(fileURLToPath(import.meta.url));
const toNode = path => String(path).replace(/\//g, nodePath.sep);

// data_directory 第一次调用时才建目录, 导入期不落盘。
let dataRoot = null;
export const data_directory = () => {
    if (dataRoot === null) {
        dataRoot = nodePath.join(here, '.build', 'data');
        nodeFs.mkdirSync(dataRoot, { recursive: true });
    }
    return dataRoot.replace(/\\/g, '/');
};

export const println = (...args) => console.log('[mshell]', ...args);

export class value_reset {}
export class rgba_prop {}

export const fs = {
    cwd: () => process.cwd().replace(/\\/g, '/'),
    exists: path => nodeFs.existsSync(toNode(path)),
    read: path => nodeFs.readFileSync(toNode(path), 'utf8'),
    write: (path, data) => {
        nodeFs.mkdirSync(nodePath.dirname(toNode(path)), { recursive: true });
        nodeFs.writeFileSync(toNode(path), data);
    },
    mkdir: path => nodeFs.mkdirSync(toNode(path), { recursive: true }),
    readdir: path => nodeFs.readdirSync(toNode(path)).map(name => `${String(path).replace(/\\/g, '/')}/${name}`),
    remove: path => nodeFs.rmSync(toNode(path), { recursive: true, force: true }),
    rename: (from, to) => nodeFs.renameSync(toNode(from), toNode(to)),
    copy: (from, to) => nodeFs.copyFileSync(toNode(from), toNode(to))
};

export const breeze = {
    is_light_theme: () => false,
    user_language: () => 'zh-CN',
    data_directory,
    allow_js_reload: () => {},
    can_reload_js: () => true,
    version: () => '0.0.0-test'
};

export const win32 = {
    env: name => (name === 'USERPROFILE' ? 'C:\\Users\\t' : undefined)
};

export const infra = {
    setTimeout: (callback, delay) => setTimeout(callback, delay),
    clearTimeout: id => clearTimeout(id),
    setInterval: (callback, delay) => setInterval(callback, delay),
    clearInterval: id => clearInterval(id)
};

// open 调用按顺序记下来, 测试用来验证自定义命令。
export const subprocCalls = [];
export const subproc = {
    open: (path, args) => {
        subprocCalls.push([path, args]);
    },
    run: () => ({ out: '', err: '', code: 0 }),
    run_async: () => {}
};

let clipboardText = '';
export const clipboard = {
    read_text: () => clipboardText,
    write_text: text => {
        clipboardText = String(text);
    }
};

export class js_widget {}
export class js_flex_layout_widget extends js_widget {}
export class widgets_factory {}
export class menu_item_controller {}
export class menu_item_parent_item_controller {}
export class menu_controller {}

// UI/菜单宿主类型的占位: 逻辑测试碰不到, 但运行期引用不能炸。
export const breeze_ui = {
    js_widget,
    js_flex_layout_widget,
    widgets_factory,
    js_text_widget: js_widget,
    js_image_widget: js_widget,
    js_spacer_widget: js_widget
};
