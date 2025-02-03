// @name: File Hash
// @description: File Hash
// @author: Il Harper
// @version: 0.0.1

import * as shell from 'mshell'

const languages = {
    'en-US': {
        按下任意键以继续: 'Press any key to continue...',
    },
    'ja-JP': {
        按下任意键以继续: '続行するには何かキーを押してください . . . ',
    },
    'zh-CN': {},
}

const currentLang = Object.keys(languages).includes(
    shell.breeze.user_language(),
)
    ? shell.breeze.user_language()
    : 'en-US'

const t = (key) => languages[currentLang][key] || key

// on_plugin_menu['File Hash'] = (menu) => {}

const algs = [
    'MACTripleDES',
    'MD5',
    'RIPEMD160',
    'SHA1',
    'SHA256',
    'SHA384',
    'SHA512',
]

shell.menu_controller.add_menu_listener((ctx) => {
    const fv = ctx.context.folder_view
    if (!fv || fv.selected_files.length !== 1) return
    ctx.menu.append_menu({
        name: 'File Hash',
        submenu: (sub) => {
            for (const alg of algs)
                sub.append_menu({
                    name: alg,
                    action: () => {
                        runHashV1(fv.selected_files[0], alg)
                    },
                })
        },
    })
})

function runHashV1(filePath, alg) {
    const fileName = filePath.replaceAll('\\', '/').split('/').pop()
    const pressAnyKey = t('按下任意键以继续')
    shell.subproc.run_async(
        // run 参会直接传入 CreateProcessW 的 lpCommandLine
        [
            `wt new-tab --title "[${alg}] ${fileName}" `, // 创建新标签，指定标题
            `PowerShell -Command `, // -Command 是 PowerShell CLI 的参数，指示后文为需要运行的脚本
            `Get-FileHash -Algorithm ${alg} `, // 指定算法
            `'${filePath}' `, // 文件地址使用单引号而非双引号包裹，避免在其他地方意外转义
            '| Format-List', // 计算结果后打印输出
            '\\;', // 反斜杠用来转义 Windows Terminal 的「新建标签页」行为。转义后，单独的一个分号会续在要运行的 PowerShell 命令后
            `'${pressAnyKey}'`, // 单引号包裹按键继续提示，PowerShell 会将单引号包裹的内容视作字串，原样输出
            '\\;',
            '[Console]::Readkey() | Out-Null', // 等待按键
            '\\;',
            'exit', // 退出
        ].join(''),
        () => {},
    )
}

// function runHashV2(filePath, alg) {
//     const fileName = filePath.replaceAll('\\', '/').split('/').pop()
//     const pressAnyKey = t('按下任意键以继续')

//     const script = [
//         `Get-FileHash -Algorithm ${alg} `, // 指定算法
//         `'${filePath}' `, // 文件地址使用单引号而非双引号包裹，避免在其他地方意外转义
//         '| Format-List', // 计算结果后打印输出
//         '\\;', // 反斜杠用来转义 Windows Terminal 的「新建标签页」行为。转义后，单独的一个分号会续在要运行的 PowerShell 命令后
//         `'${pressAnyKey}'`, // 单引号包裹按键继续提示，PowerShell 会将单引号包裹的内容视作字串，原样输出
//         '\\;',
//         '[Console]::Readkey() | Out-Null', // 等待按键
//         '\\;',
//         'exit', // 退出
//     ].join('')
//     const encodedScript = b64Encode(script)

//     shell.subproc.run_async(
//         // run 参会直接传入 CreateProcessW 的 lpCommandLine
//         `wt new-tab --title "[${alg}] ${fileName}" PowerShell -EncodedCommand ${encodedScript}`,
//         () => {},
//     )
// }

// function b64Encode(s) {
//     const bytes = new TextEncoder().encode(s)
//     const binString = Array.from(bytes, (byte) =>
//         String.fromCodePoint(byte),
//     ).join('')
//     return btoa(binString)
// }

// function b64Decode(d) {
//     const binString = atob(base64)
//     new TextDecoder().decode(
//         Uint8Array.from(binString, (m) => m.codePointAt(0)),
//     )
// }
