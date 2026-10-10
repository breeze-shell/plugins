import { build, context } from 'esbuild';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(here, 'package.json'), 'utf8'));

// breeze-shell 的插件加载器只扫脚本目录里的 *.js 单文件, 所以插件本体是
// plugins/rename-plus.js, 本目录只放源码和构建脚本。
const outfile = resolve(here, '..', 'rename-plus.js');

const header = `// @name: 重命名 Plus
// @description: 批量重命名 - 8 种预设 + JS 脚本自定义, 可视化预览与撤销
// @author: breeze-shell
// @version: ${pkg.version}
// 此文件由 plugins/rename-plus 构建产生, 请勿直接修改

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
