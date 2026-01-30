/**
 * QQ主屏幕Undefined过滤器
 * 用于过滤角色输出中的undefined文本
 */

/**
 * 过滤消息内容中的undefined
 * @param {string} content - 原始消息内容
 * @returns {string} - 过滤后的消息内容
 */
function filterUndefined(content) {
  if (!content || typeof content !== 'string') {
    return content;
  }

  // 过滤各种形式的undefined
  let filtered = content
    // 过滤单独的undefined（前后可能有空格、换行等）
    .replace(/^\s*undefined\s*$/gi, '')
    // 过滤句子开头的undefined
    .replace(/^\s*undefined\s+/gi, '')
    // 过滤句子结尾的undefined
    .replace(/\s+undefined\s*$/gi, '')
    // 过滤句子中间的undefined（两边有空格）
    .replace(/\s+undefined\s+/gi, ' ')
    // 过滤连续多个undefined
    .replace(/undefined\s*undefined/gi, '')
    // 过滤undefined后面跟标点符号的情况
    .replace(/undefined([,，.。!！?？;；:：])/gi, '$1')
    // 过滤标点符号后面跟undefined的情况
    .replace(/([,，.。!！?？;；:：])\s*undefined/gi, '$1');

  // 如果过滤后只剩空白字符，返回空字符串
  filtered = filtered.trim();
  
  // 如果整个内容都是undefined，返回空字符串
  if (filtered === '' || filtered.toLowerCase() === 'undefined') {
    return '';
  }

  return filtered;
}

/**
 * 检查内容是否应该被完全过滤（即是否只包含undefined）
 * @param {string} content - 消息内容
 * @returns {boolean} - 是否应该被过滤
 */
function shouldFilterMessage(content) {
  if (!content || typeof content !== 'string') {
    return false;
  }

  const trimmed = content.trim().toLowerCase();
  return trimmed === 'undefined' || trimmed === '';
}

// 导出函数供外部使用
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { filterUndefined, shouldFilterMessage };
}
