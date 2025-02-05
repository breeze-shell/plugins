// @name: 链接详情显示
// @description: 显示当前选中文件(夹)的链接详情（支持软链接、硬链接、符号链接）。点击路径可以直接复制。
// @author: NahidaBuer
// @version: 0.0.1
import * as shell from "mshell";

const languages = {
  "en-US": {
    获取失败: "Failed to get",
    可能是权限不足: "It may be due to insufficient permissions",
    或是受保护的系统文件: "Or protected system files",
    "链接目标：": "Link target:",
    复制: "Copy",
    打开: "Open",
  },
  "ja-JP": {
    获取失败: "取得に失敗しました",
    可能是权限不足: "これは権限が不足しているためかもしれません",
    或是受保护的系统文件: "または保護されたシステムファイル",
    "链接目标：": "リンク先：",
    复制: "コピー",
    打开: "開く",
  },
  "zh-CN": {
    "Is NOT a link": "不是链接",
  },
};

const currentLang = Object.keys(languages).includes(
  shell.breeze.user_language()
)
  ? shell.breeze.user_language()
  : "en-US";

const t = (key) => {
  return languages[currentLang][key] || key;
};

shell.menu_controller.add_menu_listener((ctx) => {
  const fv = ctx.context.folder_view;
  if (!fv || fv.selected_files.length !== 1) return;
  ctx.menu.append_menu({
    name: t("链接详情"),
    submenu: (sub) => {
      let link_info = get_link_info(fv.selected_files[0]);
      if (link_info[0] === "Is NOT a link") {
        sub.append_menu({
          name: t(link_info[0]),
        });
      } else if (link_info[0] === "") {
        sub.append_menu({
          name: t("获取失败"),
        });
        sub.append_menu({
          name: t("可能是权限不足"),
        });
        sub.append_menu({
          name: t("或是受保护的系统文件"),
        });
      } else {
        sub.append_menu({
          name: t("链接目标："),
          action: () => {},
        });
        for (let link of link_info) {
          sub.append_menu({
            name: `${link}`,
            submenu: (sub) => {
              sub.append_menu({
                name: t("复制"),
                action: () => {
                  shell.clipboard.set_text(link);
                  ctx.menu.close();
                },
              });
              sub.append_menu({
                name: t("打开"),
                action: () => {
                  shell.subproc.run_async(
                    `PowerShell -Command "Invoke-Item ${link}"`,
                    () => {}
                  );
                  ctx.menu.close();
                },
              });
            },
            action: () => {
              shell.clipboard.set_text(link);
              ctx.menu.close();
            },
          });
        }
      }
    },
  });
});
function get_link_info(path) {
  let cmd = `PowerShell -Command "$p='${path}'; try { if (($i=Get-Item $p -Force -ErrorAction Stop).LinkType) { if ($i.LinkType -match 'SymbolicLink|Junction') { $i.Target } else { fsutil hardlink list $p | ForEach-Object { Join-Path (Split-Path $p -Qualifier) $_ } } } else { 'Is NOT a link' } } catch { '' }"`;
  shell.println(cmd);
  shell.println();
  let result = shell.subproc.run(cmd);
  shell.println(result.code);
  // shell.println(result.err);
  shell.println(result.out);
  return result.out.trim().split("\n");
}
