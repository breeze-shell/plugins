// esbuild 的 inject 目标: JSX 编译成 h(...) / Fragment 时从这里的导出取值。
// 运行时由 breeze-shell 的内置脚本把 React 挂到 globalThis 上。
import type * as ReactNS from 'react';

declare const globalThis: {
    React: typeof ReactNS;
};

export const h = globalThis.React.createElement;
export const Fragment = globalThis.React.Fragment;
