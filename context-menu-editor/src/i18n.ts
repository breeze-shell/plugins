import * as shell from 'mshell';

const language = (shell.breeze.user_language() || 'en-US').toLowerCase();
export const isChinese = language.startsWith('zh');

// 插件只在加载时确定一次语言: 用户改语言会让 breeze 重载脚本。
export const t = (zhText: string, enText: string) => (isChinese ? zhText : enText);
