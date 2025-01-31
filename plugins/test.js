// @name: 测试插件
// @description: 测试插件市场用插件，会添加一个 “Test Menu”
// @lang: zh
// @version: 0.0.1
// @author: MicroBlock

import * as shell from "mshell"
shell.menu_controller.add_menu_listener(e => {
   const menu = e.menu.prepend_menu({
        name: "测试插件",
        action() {
            menu.set_data({
              name: '好耶'
            })
        }
    })
})
