import { build, context } from 'esbuild';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(here, 'package.json'), 'utf8'));

// 插件加载器只认单个 *.js, 产物与 rename-plus 一样放在仓库根目录
const outfile = resolve(here, '..', 'context-menu-editor.js');

const header = `// @name: 右键菜单编辑器
// @description: 可视化编辑右键菜单 - 拖拽排序, 分组收纳, 横排, 改名换图标, 隐藏禁用, 按菜单类型分别生效
// @author: breeze-shell
// @version: ${pkg.version}
// 此文件由仓库里的 context-menu-editor/ 构建产生, 请勿直接修改

import * as __mshell from "mshell";
const setTimeout = __mshell.infra.setTimeout;
const clearTimeout = __mshell.infra.clearTimeout;
`;

const options = {
    entryPoints: [join(here, 'src', 'index.tsx')],
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
    outfile,
    external: ['mshell'],
    inject: [join(here, 'src', 'jsx-inject.ts')],
    jsx: 'transform',
    jsxFactory: 'h',
    jsxFragment: 'Fragment',
    tsconfigRaw: JSON.stringify({ compilerOptions: { target: 'ES2022' } }),
    banner: { js: header },
    minify: true,
    legalComments: 'none',
    charset: 'utf8',
    metafile: true,
    logLevel: 'info'
};

const watch = process.argv.includes('--watch');

if (watch) {
    const ctx = await context(options);
    await ctx.watch();
    console.log(`watching -> ${outfile}`);
} else {
    const result = await build(options);
    const bytes = Object.values(result.metafile.outputs)[0].bytes;
    console.log(`built ${outfile} (${(bytes / 1024).toFixed(1)} kB)`);
    if (!existsSync(outfile)) {
        throw new Error('build produced no output file');
    }
}
