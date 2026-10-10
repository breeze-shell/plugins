import type * as ReactNS from 'react';

// 插件必须复用 breeze-shell 内置脚本里的那一份 React: 它才是
// createRenderer / 宿主组件与 hooks 共用的实例, 自己再打包一份会
// 触发 "Invalid hook call"。
const React: typeof ReactNS = globalThis.React;

export const useState = React.useState;
export const useEffect = React.useEffect;
export const useMemo = React.useMemo;
export const useCallback = React.useCallback;
export const useRef = React.useRef;
export const useReducer = React.useReducer;
export const memo = React.memo;
export const Fragment = React.Fragment;
export const createElement = React.createElement;

export type { ReactNode, ReactElement, CSSProperties } from 'react';
