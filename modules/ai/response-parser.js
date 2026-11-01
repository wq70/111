  function parseAiResponse(content) {
    if (!content) return [{
      type: 'text',
      content: '(AI返回了空内容)'
    }];

    let trimmedContent = content.trim();
    let prefixResults = [];

    if (typeof ThoughtChainManager !== 'undefined' && typeof ThoughtChainManager.extractReasoning === 'function') {
      const extraction = ThoughtChainManager.extractReasoning(trimmedContent);
      if (extraction.error) console.warn('思考内容提取配置无效，已保留原始回复:', extraction.error);
      if (extraction.reasoning) {
        prefixResults.push({ type: 'thought_chain_block', content: extraction.reasoning });
      }
      trimmedContent = extraction.body;
      if (!trimmedContent && prefixResults.length) return prefixResults;
    } else {
      // 旧环境兼容：保持历史 <thinking> 提取能力。
      const thinkingMatch = trimmedContent.match(/^(?:<thinking>)?([\s\S]*?)<\/thinking>/i);
      if (thinkingMatch && thinkingMatch[1]) {
        prefixResults.push({
          type: 'thought_chain_block',
          content: thinkingMatch[1].trim()
        });
      }
    }

    const markdownRegex = /```json\s*([\s\S]*?)\s*```/;
    const markdownMatch = trimmedContent.match(markdownRegex);

    if (markdownMatch && markdownMatch[1]) {

      trimmedContent = markdownMatch[1].trim();
      console.log("解析器：已启用 Markdown 提取模式。");
    }


    if (trimmedContent.startsWith('[') && trimmedContent.endsWith(']')) {
      try {
        const parsed = JSON.parse(trimmedContent);
        if (Array.isArray(parsed)) {
          console.log("解析成功：标准JSON数组格式。");
          return prefixResults.concat(parsed);
        }
      } catch (e) {
        console.warn("标准JSON数组解析失败，将尝试强力提取...");
      }
    }


    const startIndex = trimmedContent.indexOf('[');


    const lastBraceIndex = trimmedContent.lastIndexOf('}');

    if (startIndex !== -1 && lastBraceIndex !== -1 && lastBraceIndex > startIndex) {


      const endIndex = trimmedContent.indexOf(']', lastBraceIndex);

      if (endIndex !== -1) {
        const arrayString = trimmedContent.substring(startIndex, endIndex + 1);
        try {
          const parsed = JSON.parse(arrayString);
          if (Array.isArray(parsed)) {
            console.log("解析成功：通过强力提取 [ ... } ... ] 模式。");
            return prefixResults.concat(parsed);
          }
        } catch (e) {
          console.warn("强力提取 [ ... } ... ] 失败，将尝试提取单个对象...");
        }
      }
    }


    const jsonMatches = trimmedContent.match(/{[^{}]*}/g);
    if (jsonMatches) {
      const results = [];
      for (const match of jsonMatches) {
        try {
          const parsedObject = JSON.parse(match);
          results.push(parsedObject);
        } catch (e) {
          console.warn("跳过一个无效的JSON片段:", match);
        }
      }

      if (results.length > 0) {
        console.log("解析成功：通过强力提取 {...} 模式。");
        return prefixResults.concat(results);
      }
    }


    console.error("所有解析方案均失败！将返回原始文本。原始回复:", content);
    return prefixResults.concat([{
      type: 'text',
      content: content
    }]);
  }

  function getStreamDeltaText(delta) {
    if (!delta) return '';

    if (typeof delta.content === 'string') {
      return delta.content;
    }

    if (Array.isArray(delta.content)) {
      return delta.content.map(part => {
        if (typeof part === 'string') return part;
        if (typeof part?.text === 'string') return part.text;
        return '';
      }).join('');
    }

    return '';
  }

  async function readOpenAiStreamResponse(response, onChunk, onMetadata) {
    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('当前响应不支持流式读取。');
    }

    const decoder = new TextDecoder('utf-8');
    let buffer = '';
    let fullText = '';

    function processEventBlock(block) {
      const lines = block.split(/\r?\n/);

      for (const line of lines) {
        if (!line.startsWith('data:')) continue;

        const payload = line.slice(5).trim();
        if (!payload) continue;
        if (payload === '[DONE]') return true;

        try {
          const json = JSON.parse(payload);
          if (typeof onMetadata === 'function') onMetadata(json);
          const deltaText = getStreamDeltaText(json.choices?.[0]?.delta);
          if (!deltaText) continue;

          fullText += deltaText;
          if (typeof onChunk === 'function') {
            onChunk(fullText, json);
          }
        } catch (error) {
          console.warn('流式分片解析失败，已跳过:', payload, error);
        }
      }

      return false;
    }

    while (true) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value || new Uint8Array(), { stream: !done });

      const eventBlocks = buffer.split(/\r?\n\r?\n/);
      buffer = eventBlocks.pop() || '';

      for (const block of eventBlocks) {
        if (processEventBlock(block)) {
          return fullText;
        }
      }

      if (done) {
        const remaining = buffer.trim();
        if (remaining) {
          processEventBlock(remaining);
        }
        return fullText;
      }
    }
  }


