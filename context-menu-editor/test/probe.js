// 沙箱 e2e 探针: 在真实 shell.dll / 真实 QuickJS 里驱动「右键菜单编辑器」。
// 由 test/sandbox-e2e.ps1 拷进沙箱的 scripts 目录; 插件只有在
// config/右键菜单编辑器/.e2e 存在时才暴露 globalThis.__ctx_menu_editor。
//
// 两段用法 (由 BREEZE_E2E_SCENARIO 决定):
//   menu        - 真实 TrackPopupMenuEx 弹出后: 校验采集、校验规则重建
//   js-interact - 打开编辑器窗口, 交给宿主截图
import * as shell from "mshell";

const report = (key, value) => shell.println("[cme-e2e]", key, "=", String(value));

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

const names = menu =>
    menu.items
        .map(item => item.data())
        .map(data => (data.type === "spacer" ? "-----" : data.name === undefined || data.name === null || data.name === "" ? "<横排>" : data.name))
        .filter(name => name !== "右键菜单编辑器");

const ICON = '<svg viewBox="0 0 16 16"><path fill="currentColor" d="M3 3h10v10H3z"/></svg>';

// 与 e2e 宿主菜单同名的合成菜单: 用来在真实运行时里跑一遍规则重建
const buildSyntheticMenu = activated => {
    const menu = shell.menu_controller.create_detached();
    menu.append_item({
        type: "button",
        name: "e2e-lazy-submenu",
        submenu: sub => {
            sub.append_item({ type: "button", name: "lazy-before-0", action: () => activated.push("lazy-before-0") });
        }
    });
    menu.append_item({
        type: "button",
        name: "e2e-item-1",
        wID: 41001,
        name_resid: "41001@0",
        origin_name: "e2e-item-1\tCtrl+Q",
        hotkey: "Ctrl+Q",
        action: () => activated.push("e2e-item-1")
    });
    menu.append_item({
        type: "button",
        name: "e2e-item-2",
        wID: 41002,
        name_resid: "41002@0",
        action: () => activated.push("e2e-item-2")
    });
    return menu;
};

const baseNodes = hook => hook.nodesFromSnapshot(hook.settings().snapshots.other);

const profileWith = (hook, nodes, unmanaged = "keep-end") => ({
    ...hook.settings().profiles.other,
    enabled: true,
    unmanaged,
    nodes
});

const demoProfile = hook => {
    const nodes = baseNodes(hook);
    const pick = name => nodes.find(node => node.ref && node.ref.name === name);
    const first = pick("e2e-item-1");
    const second = pick("e2e-item-2");
    if (!first || !second) return null;

    return profileWith(hook, [
        {
            kind: "group",
            id: "g-demo",
            layout: "fold",
            label: "我的分组",
            icon: { source: "original" },
            hidden: false,
            children: [{ ...first, id: "i-demo-1", label: "一号（改名）", icon: { source: "svg", svg: ICON } }]
        },
        { kind: "sep", id: "s-demo" },
        {
            kind: "group",
            id: "g-row",
            layout: "row",
            label: "横排",
            icon: { source: "original" },
            hidden: false,
            children: [{ ...second, id: "i-demo-2" }]
        }
    ]);
};

const applyRulesOnRealMenu = (hook, ctx, realNodes) => {
    const pick = name => realNodes.find(node => node.ref && node.ref.name === name);
    const first = pick("e2e-item-1");
    const second = pick("e2e-item-2");
    const submenu = pick("e2e-lazy-submenu");
    if (!first || !second || !submenu) {
        report("FAIL 真实菜单应用规则", "采集数据里找不到基础项");
        return;
    }

    hook.setSettings({
        ...hook.settings(),
        showMenuEntry: false,
        profiles: {
            ...hook.settings().profiles,
            other: profileWith(
                hook,
                [
                    { ...second, hidden: true },
                    {
                        kind: "group",
                        id: "rg",
                        layout: "fold",
                        label: "真实分组",
                        icon: { source: "original" },
                        hidden: false,
                        children: [{ ...first, id: "ri", label: "改名的一号" }]
                    },
                    submenu
                ],
                "hide"
            )
        }
    });

    hook.onMenu({ menu: ctx.menu, context: ctx.context, screenside_button: ctx.screenside_button });

    check("真实原生菜单被重排", ["真实分组", "e2e-lazy-submenu"], names(ctx.menu));

    const inner = shell.menu_controller.create_detached();
    ctx.menu.items[0].data().submenu(inner);
    const child = inner.items[0].data();
    check("真实分组里是改过名的原生项", ["改名的一号"], inner.items.map(item => item.data().name));
    check("原生位图图标被保留", true, typeof child.icon_bitmap === "number");
    check("原生命令 id 被保留", true, typeof child.wID === "number");
};

const runRulesPhase = hook => {
    let handled = false;
    shell.menu_controller.add_menu_listener(ctx => {
        if (handled) return;
        handled = true;
        step("在真实原生菜单上应用规则", () => applyRulesOnRealMenu(hook, ctx, hook.nodesFromSnapshot(hook.settings().snapshots.other)));
        report("DONE", "1");
    });
};

const runMenuPhase = hook => {
    let handled = false;
    shell.menu_controller.add_menu_listener(ctx => {
        if (handled) return;
        handled = true;

        step("真实菜单采集", () => {
            const snapshot = hook.settings().snapshots.other;
            check("采集到菜单类型", "other", snapshot ? snapshot.kind : "(none)");
            check("采集到的原生项", ["e2e-lazy-submenu", "e2e-item-1", "e2e-item-2"], snapshot ? snapshot.items.map(item => item.name) : []);
            check("采集到子菜单标记", [true, false, false], snapshot ? snapshot.items.map(item => item.hasSubmenu) : []);
            check(
                "规则未启用时菜单原样保留",
                ["e2e-lazy-submenu", "e2e-item-1", "e2e-item-2", "右键菜单编辑器"],
                [...names(ctx.menu), "右键菜单编辑器"]
            );
        });

        step("规则重建", () => {
            // 规则里的匹配键必须和被测菜单同源, 所以先用合成菜单自己采集一份快照
            const info = hook.classifyMenu(ctx.context);
            hook.recordSnapshot(info, hook.captureMenu(buildSyntheticMenu([])));

            const profile = demoProfile(hook);
            if (!profile) {
                report("FAIL 规则重建", "采集数据里找不到基础项");
                return;
            }

            hook.setSettings({
                ...hook.settings(),
                showMenuEntry: false,
                profiles: { ...hook.settings().profiles, other: profile }
            });

            const activated = [];
            const menu = buildSyntheticMenu(activated);
            hook.onMenu({ menu, context: ctx.context, screenside_button: ctx.screenside_button });

            check("重建后的顶层顺序", ["我的分组", "-----", "<横排>", "e2e-lazy-submenu"], names(menu));

            const groupData = menu.items[0].data();
            check("分组收成了子菜单", "function", typeof groupData.submenu);

            const sub = shell.menu_controller.create_detached();
            groupData.submenu(sub);
            check("分组里的子项", ["一号（改名）"], sub.items.map(item => item.data().name));

            const child = sub.items[0].data();
            check("子项保留原生命令 id", 41001, child.wID);
            check("子项保留资源 id", "41001@0", child.name_resid);
            check("子项保留原始文本", "e2e-item-1\tCtrl+Q", child.origin_name);
            check("子项保留快捷键", "Ctrl+Q", child.hotkey);
            check("子项换成自定义图标", true, typeof child.icon_svg === "string" && child.icon_svg.indexOf("currentColor") < 0);
            child.action({});
            check("重建后的项仍触发原动作", ["e2e-item-1"], activated);

            const rowChildren = menu.items[2].children();
            check("横排分组里的子项", ["e2e-item-2"], rowChildren.map(item => item.data().name));
        });

        step("隐藏规则", () => {
            const nodes = baseNodes(hook);
            const second = nodes.find(node => node.ref && node.ref.name === "e2e-item-2");
            if (!second) {
                report("FAIL 隐藏规则", "采集数据里找不到 e2e-item-2");
                return;
            }

            hook.setSettings({
                ...hook.settings(),
                profiles: { ...hook.settings().profiles, other: profileWith(hook, [{ ...second, hidden: true }]) }
            });

            const activated = [];
            const menu = buildSyntheticMenu(activated);
            hook.onMenu({ menu, context: ctx.context, screenside_button: ctx.screenside_button });

            check("被隐藏的项不再出现", ["e2e-lazy-submenu", "e2e-item-1"], names(menu));
        });

        step("准备截图用的演示配置", () => {
            const profile = demoProfile(hook);
            if (!profile) return;
            hook.setSettings({
                ...hook.settings(),
                showMenuEntry: true,
                profiles: { ...hook.settings().profiles, other: profile }
            });
            hook.flush();
            report("PASS 演示配置已写入", "1");
        });

        report("DONE", "1");
    });
};

const runWindowPhase = () => {
    const open = tries => {
        const hook = globalThis.__ctx_menu_editor;
        if (!hook) {
            if (tries > 0) {
                setTimeout(() => open(tries - 1), 200);
                return;
            }
            report("FAIL hook", "missing");
            report("DONE", "1");
            return;
        }
        step("打开编辑器窗口", () => {
            hook.openEditor("other");
            report("PASS window-opened", "1");
        });
        report("DONE", "1");
    };
    open(40);
};

const run = tries => {
    const hook = globalThis.__ctx_menu_editor;
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
    const scenario = shell.win32.env("BREEZE_E2E_SCENARIO") || "menu";
    const phase = shell.win32.env("CME_E2E_PHASE") || "default";
    report("PASS scenario", `${scenario}/${phase}`);
    if (scenario === "menu" && phase === "rules") runRulesPhase(hook);
    else if (scenario === "menu") runMenuPhase(hook);
    else runWindowPhase();
};

run(20);
