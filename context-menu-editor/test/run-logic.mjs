// 把 test/logic.test.ts 打包成 node 能跑的脚本: mshell 换成 test/mshell-stub.mjs。
import { build } from 'esbuild';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const outfile = join(here, '.build', 'logic.mjs');
mkdirSync(dirname(outfile), { recursive: true });

await build({
    entryPoints: [join(here, 'logic.test.ts')],
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node20',
    outfile,
    alias: { mshell: join(here, 'mshell-stub.mjs') },
    external: ['node:fs', 'node:os', 'node:path', 'node:buffer', 'node:url'],
    logLevel: 'warning'
});

try {
    await import(pathToFileURL(outfile).href);
} catch (error) {
    console.error(error);
    process.exitCode = 1;
}
