// 逻辑测试用的 mshell 替身: 只用 node 的文件系统实现插件真正依赖的那部分 API。
import nodeFs from 'node:fs';
import nodePath from 'node:path';

const toNode = (path) => path.replace(/\//g, nodePath.sep);

export const println = (...args) => console.log('[mshell]', ...args);

export const fs = {
    cwd: () => process.cwd().replace(/\\/g, '/'),
    chdir: path => process.chdir(toNode(path)),
    exists: path => nodeFs.existsSync(toNode(path)),
    isdir: path => {
        try {
            return nodeFs.statSync(toNode(path)).isDirectory();
        } catch {
            return false;
        }
    },
    mkdir: path => nodeFs.mkdirSync(toNode(path), { recursive: true }),
    rmdir: path => nodeFs.rmSync(toNode(path), { recursive: true, force: true }),
    // node 的 renameSync 在 Windows 上同样会覆盖已存在的目标, 和 breeze 的
    // std::filesystem::rename 行为一致。
    rename: (from, to) => nodeFs.renameSync(toNode(from), toNode(to)),
    remove: path => nodeFs.rmSync(toNode(path), { force: true }),
    copy: (from, to) => nodeFs.copyFileSync(toNode(from), toNode(to)),
    move: (from, to) => nodeFs.renameSync(toNode(from), toNode(to)),
    read: path => nodeFs.readFileSync(toNode(path), 'utf8'),
    write: (path, data) => {
        nodeFs.mkdirSync(nodePath.dirname(toNode(path)), { recursive: true });
        nodeFs.writeFileSync(toNode(path), data);
    },
    readdir: path =>
        nodeFs.readdirSync(toNode(path)).map(name => path.replace(/\\/g, '/') + '/' + name),
    watch: () => () => {}
};

export const breeze = {
    version: () => 'test',
    data_directory: () => '/tmp/breeze-shell',
    is_light_theme: () => true,
    user_language: () => 'zh-CN',
    can_reload_js: () => true,
    allow_js_reload: () => {},
    should_show_settings_button: () => true,
    current_process_name: () => 'explorer.exe',
    file_size: path => {
        try {
            return nodeFs.statSync(toNode(path)).size;
        } catch {
            return 0;
        }
    }
};

export const infra = {
    setTimeout: (callback, delay) => setTimeout(callback, delay),
    clearTimeout: id => clearTimeout(id),
    setInterval: (callback, delay) => setInterval(callback, delay),
    clearInterval: id => clearInterval(id),
    btoa: text => Buffer.from(text, 'binary').toString('base64'),
    atob: text => Buffer.from(text, 'base64').toString('binary')
};

export const win32 = {
    env: name => process.env[name]
};

export const notification = {
    send_basic: () => {},
    send_with_buttons: () => {}
};

export const subproc = {
    run: () => ({ out: '', err: '', code: 0 }),
    run_async: () => {},
    open: () => {}
};

export const clipboard = { read_text: () => '', write_text: () => {} };

export class menu_controller {
    static create_detached() {
        return new menu_controller();
    }
    append_menu() {}
    append_spacer() {}
    close() {}
}
