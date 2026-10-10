import * as shell from 'mshell';

const language = (shell.breeze.user_language() || 'en-US').toLowerCase();
export const isChinese = language.startsWith('zh');

// 插件只在加载时确定一次语言: 用户改语言会让 breeze 重载脚本。
export const t = (zhText: string, enText: string) => (isChinese ? zhText : enText);

export const listJoin = (items: string[], max = 3) => {
    const shown = items.slice(0, max);
    const rest = items.length - shown.length;
    const joined = shown.join(isChinese ? '、' : ', ');
    return rest > 0 ? (isChinese ? `${joined} 等 ${items.length} 项` : `${joined} and ${rest} more`) : joined;
};
