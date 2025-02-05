// @name: 桌面右键配置 Breeze
// @description: 在桌面右键菜单添加“配置 Breeze”选项，点击后打开 Breeze 数据目录
// @author: leafmoes
// @version: 0.0.2

import * as shell from "mshell";

const ICON_CHECKED = `<svg xmlns="http://www.w3.org/2000/svg"  viewBox="0 0 48 48" width="32px" height="32px"><linearGradient id="L4rKfs~Qrm~k0Pk8MRsoza" x1="32.012" x2="15.881" y1="32.012" y2="15.881" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#fff"/><stop offset=".242" stop-color="#f2f2f2"/><stop offset="1" stop-color="#ccc"/></linearGradient><circle cx="24" cy="24" r="11.5" fill="url(#L4rKfs~Qrm~k0Pk8MRsoza)"/><linearGradient id="L4rKfs~Qrm~k0Pk8MRsozb" x1="17.45" x2="28.94" y1="17.45" y2="28.94" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#0d61a9"/><stop offset=".363" stop-color="#0e5fa4"/><stop offset=".78" stop-color="#135796"/><stop offset="1" stop-color="#16528c"/></linearGradient><circle cx="24" cy="24" r="7" fill="url(#L4rKfs~Qrm~k0Pk8MRsozb)"/><linearGradient id="L4rKfs~Qrm~k0Pk8MRsozc" x1="5.326" x2="38.082" y1="5.344" y2="38.099" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#889097"/><stop offset=".331" stop-color="#848c94"/><stop offset=".669" stop-color="#78828b"/><stop offset="1" stop-color="#64717c"/></linearGradient><path fill="url(#L4rKfs~Qrm~k0Pk8MRsozc)" d="M43.407,19.243c-2.389-0.029-4.702-1.274-5.983-3.493c-1.233-2.136-1.208-4.649-0.162-6.693 c-2.125-1.887-4.642-3.339-7.43-4.188C28.577,6.756,26.435,8,24,8s-4.577-1.244-5.831-3.131c-2.788,0.849-5.305,2.301-7.43,4.188 c1.046,2.044,1.071,4.557-0.162,6.693c-1.281,2.219-3.594,3.464-5.983,3.493C4.22,20.77,4,22.358,4,24 c0,1.284,0.133,2.535,0.364,3.752c2.469-0.051,4.891,1.208,6.213,3.498c1.368,2.37,1.187,5.204-0.22,7.345 c2.082,1.947,4.573,3.456,7.34,4.375C18.827,40.624,21.221,39,24,39s5.173,1.624,6.303,3.971c2.767-0.919,5.258-2.428,7.34-4.375 c-1.407-2.141-1.588-4.975-0.22-7.345c1.322-2.29,3.743-3.549,6.213-3.498C43.867,26.535,44,25.284,44,24 C44,22.358,43.78,20.77,43.407,19.243z M24,34.5c-5.799,0-10.5-4.701-10.5-10.5c0-5.799,4.701-10.5,10.5-10.5S34.5,18.201,34.5,24 C34.5,29.799,29.799,34.5,24,34.5z"/></svg>`
const MENU_NAME = "配置 Breeze";

const languages = {
    'en-US': {
        '配置 Breeze': 'Config Breeze',
    }, 'zh-CN': {
    }
}

const currentLang = shell.breeze.user_language() === 'zh-CN' ? 'zh-CN' : 'en-US'
const t = (key) => {
    return languages[currentLang][key] || key
}

shell.menu_controller.add_menu_listener((ctx) => {
    const keywords = ["个性化","Personalize"]
    const isDesktopMenu = ctx.menu.get_items().some(menu => {
        const data = menu.data();
        return keywords.some(name => name === data.name);
    });

    if (isDesktopMenu) {
        ctx.menu.append_menu({
            type: "button",
            name: t(MENU_NAME),
            icon_svg:ICON_CHECKED,
            action:() => {
                let dir = `${shell.breeze.data_directory().replaceAll("/", "\\")}`;
                // 之前是这样的
                // shell.subproc.run_async(`explorer.exe "${dir}"`,()=>{})
                // 改成 open_async
                // 这里有很大概率崩溃，没崩溃的话原地多试几次就崩了…
                // shell.subproc.open_async(dir, null, ()=>{});
                // 后面 加 sleep(100) 就没问题
                // 同步调用没问题
                shell.subproc.open(dir, null);
                ctx.menu.close();
            },
        },0);
    }
});
