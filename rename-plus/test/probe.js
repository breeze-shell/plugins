// 沙箱 e2e 探针: 在真实的 shell.dll / QuickJS 运行时里驱动「重命名 Plus」。
// 由 test/sandbox-e2e.ps1 拷进沙箱的 scripts 目录; 插件只有在
// config/Rename+/.e2e 存在时才会暴露 globalThis.__rename_plus。
import * as shell from "mshell";

const report = (key, value) => shell.println("[rp-e2e]", key, "=", String(value));
const dataDir = shell.breeze.data_directory();
const workDir = dataDir.replace(/[\\/]\.breeze-shell$/, "") + "\\rp-data";

const SEED = [
    "holiday photo 1.JPG",
    "holiday photo 2.JPG",
    "holiday photo 10.JPG",
    "note.txt",
    "report (draft).txt"
];

const basenames = () =>
    shell.fs
        .readdir(workDir)
        .map(path => path.split(/[\\/]/).pop())
        .sort();

const fullPaths = () => basenames().map(name => workDir + "\\" + name);

const check = (label, expected, actual) => {
    const expectedText = JSON.stringify(expected);
    const actualText = JSON.stringify(actual);
    const ok = expectedText === actualText;
    report((ok ? "PASS " : "FAIL ") + label, ok ? "ok" : `${expectedText} != ${actualText}`);
};

const step = (name, run) => {
    report("STEP begin " + name, "1");
    try {
        run();
    } catch (error) {
        report("FAIL " + name, (error && error.stack) || error);
    }
    report("STEP end " + name, "1");
};

const seed = () => {
    shell.fs.mkdir(workDir);
    for (const path of shell.fs.readdir(workDir)) {
        try {
            shell.fs.remove(path);
        } catch (error) {
            report("warn remove " + path, error);
        }
    }
    for (const name of SEED) shell.fs.write(workDir + "\\" + name, "rename-plus e2e\n");
};

const main = (hook) => {
    step("seed", () => {
        seed();
        check("seed", SEED.slice().sort(), basenames());
    });

    const items = hook.collectItems(fullPaths());
    check("items", SEED.length, items.length);
    report("isdir flags", items.filter(entry => entry.isDir).map(entry => entry.name).join("|") || "(none)");
    report("isdir direct", fullPaths().map(path => `${path.split("\\").pop()}=${shell.fs.isdir(path)}`).join(" "));
    report("sizes", items.map(entry => entry.size).join(","));

    step("quickApply", () => {
        hook.quickApply(items, "numbering");
        check("numbering", ["001.JPG", "002.JPG", "003.JPG", "004.txt", "005.txt"], basenames());
    });

    step("undo", () => {
        hook.undoLast();
        check("undo", SEED.slice().sort(), basenames());
        check("lastBatch cleared", null, hook.settings().lastBatch);
    });

    step("window", () => {
        const paths = __SINGLE__ ? fullPaths().slice(0, 1) : fullPaths();
        hook.openWindow(hook.collectItems(paths), "__PRESET_ID__");
        report("PASS window-opened", "1");
    });

    report("DONE", "1");
};

const run = (tries) => {
    const hook = globalThis.__rename_plus;
    if (!hook) {
        if (tries > 0) {
            setTimeout(() => run(tries - 1), 200);
            return;
        }
        report("FAIL hook", "missing");
        report("DONE", "1");
        return;
    }
    report("PASS hook", "present");
    try {
        main(hook);
    } catch (error) {
        report("FAIL main", (error && error.stack) || error);
        report("DONE", "1");
    }
};

run(40);
