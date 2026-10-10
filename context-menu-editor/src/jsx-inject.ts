// esbuild inject 目标: JSX 的 h / Fragment 取自 breeze-shell 挂在 globalThis 上的 React
import type * as ReactNS from 'react';

declare const globalThis: {
    React: typeof ReactNS;
};

export const h = globalThis.React.createElement;
export const Fragment = globalThis.React.Fragment;
