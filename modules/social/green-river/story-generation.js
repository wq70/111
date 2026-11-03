  let grGenerationController = null;

  function extractGreenRiverJson(aiText) {
    const raw = String(aiText || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
    const firstBrace = raw.indexOf('{');
    const lastBrace = raw.lastIndexOf('}');
    if (firstBrace < 0 || lastBrace <= firstBrace) throw new Error('AI未返回有效JSON格式');
    const jsonText = raw.slice(firstBrace, lastBrace + 1);
    try {
      return JSON.parse(jsonText);
    } catch (firstError) {
      const fixed = jsonText.replace(/\x00/g, '').replace(/\\([^"\\\/bfnrtu])/g, '\\\\$1');
      try { return JSON.parse(fixed); } catch (_) { throw new Error(`JSON解析失败：${firstError.message}`); }
    }
  }

  async function callGreenRiverModel(systemPrompt, userPrompt, temperature = 0.75, signal) {
    const { proxyUrl, apiKey, model } = state.apiConfig;
    if (!proxyUrl || !model) throw new Error('请先完成API设置');
    const messages = [{ role: 'user', content: userPrompt }];
    let response;
    if (proxyUrl.includes('generativelanguage')) {
      const geminiConfig = toGeminiRequestData(model, apiKey, systemPrompt, messages);
      response = await fetch(geminiConfig.url, Object.assign({}, geminiConfig.data, { signal }));
    } else {
      response = await fetch(`${proxyUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        signal,
        body: JSON.stringify({
          model,
          messages: [{ role: 'system', content: systemPrompt }, ...messages],
          temperature,
          ...(state.globalSettings.apiTopPEnabled && state.globalSettings.apiTopP !== undefined ? { top_p: state.globalSettings.apiTopP } : {}),
          ...(state.globalSettings.apiMaxTokensEnabled && state.globalSettings.apiMaxTokens !== undefined ? { max_tokens: state.globalSettings.apiMaxTokens } : {}),
          ...(state.globalSettings.apiPresencePenaltyEnabled && state.globalSettings.apiPresencePenalty !== undefined ? { presence_penalty: state.globalSettings.apiPresencePenalty } : {}),
          ...(state.globalSettings.apiFrequencyPenaltyEnabled && state.globalSettings.apiFrequencyPenalty !== undefined ? { frequency_penalty: state.globalSettings.apiFrequencyPenalty } : {})
        })
      });
    }
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`API 请求失败 (${response.status}): ${text}`);
    }
    return getGeminiResponseText(await response.json());
  }

  function selectRelevantWorldBookEntries(book, query) {
    const entries = Array.isArray(book?.content) ? book.content.filter(item => item.enabled !== false) : [];
    const lowerQuery = String(query || '').toLowerCase();
    return entries.sort((a, b) => {
      const score = item => (item.keys || []).reduce((total, key) => total + (lowerQuery.includes(String(key).toLowerCase()) ? 1 : 0), 0);
      return score(b) - score(a);
    });
  }

  async function buildGreenRiverCharacterContext(story, historyLimit) {
    const bible = story.storyBible;
    const blocks = [];
    for (const id of (story.settings.charIds || [])) {
      if (String(id).startsWith('npc_')) {
        const npc = await db.npcs.get(parseInt(String(id).replace('npc_', ''), 10));
        if (!npc) continue;
        if (!bible.storyCharacters[id]) bible.storyCharacters[id] = { name: npc.name, sourceId: id, persona: npc.persona || '', role: '', goal: '', voice: '', relationships: '', knowledge: '' };
        const p = bible.storyCharacters[id];
        blocks.push(`### ${p.name}\n小说内设定：${p.persona}\n当前目标：${p.goal || '未指定'}\n说话特点：${p.voice || '沿用基础人设'}`);
        continue;
      }
      const chat = state.chats[id];
      if (!chat) continue;
      if (!bible.storyCharacters[id]) {
        bible.storyCharacters[id] = { name: chat.name, sourceId: id, persona: chat.settings?.aiPersona || '', role: '', goal: '', voice: '', relationships: '', knowledge: '' };
      }
      const p = bible.storyCharacters[id];
      const toneReferences = (story.settings.useChatReferences === false ? [] : (chat.history || [])).slice(-Math.max(1, historyLimit || 20)).filter(message => {
        return message.role !== 'system' && !message.isHidden && !message.excludeFromContext && !['red_packet', 'waimai_request', 'transfer'].includes(message.type);
      }).slice(-Math.min(30, Math.max(1, historyLimit || 20))).map(message => `${message.senderName || (message.role === 'user' ? 'User' : p.name)}：${String(message.content || '').slice(0, 180)}`).join('\n');
      blocks.push(`### ${p.name}\n小说内设定：${p.persona}\n小说内身份：${p.role || '依据作品设定自然确定'}\n当前目标：${p.goal || '根据当前剧情确定'}\n关系状态：${p.relationships || '依据已发生剧情'}\n掌握信息：${p.knowledge || '不得知道尚未获知的秘密'}\n说话特点：${p.voice || '参考基础人设'}${toneReferences ? `\n少量语气参考（只参考说话习惯，不把聊天事件当小说事实）：\n${toneReferences}` : ''}`);
    }
    return blocks.join('\n\n');
  }

  async function buildGreenRiverWorldContext(story, continuity, userDirection) {
    const query = [story.storyBible.synopsis, story.settings.macroWorldView, continuity.lastChapterTail, userDirection].join('\n');
    const blocks = [];
    for (const id of (story.settings.bookIds || [])) {
      const book = await db.worldBooks.get(id);
      if (!book) continue;
      const text = selectRelevantWorldBookEntries(book, query).map(entry => entry.content).filter(Boolean).join('\n');
      if (text) blocks.push(`《${book.name}》\n${text}`);
    }
    return blocks.join('\n\n').slice(0, 18000);
  }

  async function getGreenRiverUserPersona(story) {
    if (story.settings.userPersonaId) {
      const preset = await db.personaPresets.get(story.settings.userPersonaId);
      if (preset) return preset.persona;
    }
    const active = state.chats[state.activeChatId];
    if (active?.settings?.myPersona) return active.settings.myPersona;
    const fallback = Object.values(state.chats || {}).find(chat => chat?.settings?.myPersona);
    return fallback?.settings?.myPersona || '普通用户';
  }

  function writingModeInstruction(mode, isReroll) {
    if (isReroll) return '改写当前最新章节：保留已经成立的前情事实，但重新组织本章场景、动作和对话。';
    return ({
      continue: '自然续写为新章节，承接上一章最后动作和语气。',
      direction: '按照用户给出的剧情方向续写为新章节。',
      extend: '不要开启新章节；继续并延长当前章节结尾的同一场景。',
      transition: '续写为新章节，重点补足上一章与目标剧情之间自然可信的过渡。',
      dialogue: '续写为新章节，重点增强人物之间有潜台词、有区分度的对话，同时保持必要动作推进。'
    })[mode] || '自然续写为新章节，承接上一章最后动作和语气。';
  }

  function buildGreenRiverWritingPrompt(data) {
    const { story, author, continuity, charsContext, worldContext, userPersona, userDirection, mode, targetMin, targetMax, isReroll } = data;
    const bible = story.storyBible;
    const isolated = GreenRiverStoryEngine.storyMode(story) !== 'serial';
    return `
# 身份与目标
你是负责${isolated ? '创作独立短篇' : '持续创作这部长篇小说'}的中文小说作者。作者风格配置：${author?.name || '自定义作者'}；${author?.style || '自然、清晰、贴合人物'}。
首要目标是连续性、人物真实感、场景推进和自然表达，不以堆砌辞藻或凑字数为目标。

# 本次写作方式
${isolated ? (isReroll ? '重新创作当前短篇，不读取或延续其他短篇。' : mode === 'extend' ? '仅延长下方当前短篇的场景，不引入任何其他章节。' : '根据本次设定写一个有起承转合的完整独立短篇；不要续写、回顾或引用其他章节。') : writingModeInstruction(mode, isReroll)}
用户指示：${userDirection || '没有额外指示，请依据未解决剧情自然发展。'}

# 作品档案
书名：${story.title}
简介/前提：${bible.synopsis || '未单独填写'}
题材：${bible.genre || '依据已有内容'}
基调：${bible.tone || '依据已有内容'}
叙事视角：${bible.pov}
叙事节奏：${bible.tense}
长期方向：${bible.endingDirection || '未指定，不要擅自仓促完结'}
核心世界观/IF线：${story.settings.macroWorldView || '无额外设定'}
禁止内容或表达：${bible.forbiddenContent || '无额外限制'}
全局故事摘要：${bible.globalSummary || '尚未形成'}

# 连续性上下文
最近章节摘要：
${continuity.recentSummaries || '这是故事开篇'}

${isolated ? '当前短篇参考（只有主动选择延长当前短篇时提供）' : '上一章结尾原文（新正文必须直接承接其动作、地点、时间和语气）'}：
${continuity.lastChapterTail || '无前文，请建立独立的初始场景。'}

未解决剧情/伏笔：
${continuity.openThreads || '暂无结构化记录，可从最近正文判断'}

近期时间线：
${continuity.timeline || '暂无结构化记录'}

# 人物
User 小说内设定：${userPersona}
${charsContext}

# 世界书
${worldContext || '没有选中的世界书内容'}

# 写作质量规则
- 正文目标为约 ${targetMin}～${targetMax} 个中文字符；内容完整时自然收束，不得通过重复心理、重复环境或拆慢每个动作凑字数。
- 每个场景必须发生可辨认的状态变化：信息、关系、目标、处境或决定至少有一项推进。
- 对话要符合人物各自身份和说话习惯，允许留白与潜台词，不要替读者反复解释情绪。
- 描写按场景需要出现；不要机械轮流描写目光、指尖、呼吸、心跳、空气凝固。
- 不要复述上一章摘要，不要重新介绍已经认识的人物，不要擅自让角色知道秘密。
- 遵守时代、地点、人物在场状态、物品位置及既有事实。
- 正文按自然段使用双换行分隔。

# 输出
只输出一个合法 JSON 对象，不要代码围栏，不要额外解释：
{"title":"章节标题","content":"正文，段落之间用\\n\\n分隔","summary":"准确记录本章关键事实、关系变化、获得的信息和结尾状态","globalSummary":"在旧全局摘要基础上更新的精炼全局故事摘要，保留长期重要事实","storyDelta":{"timelineEvent":"本章新增的一条时间线事件","openThreadsAdded":["新增未解决问题或伏笔"],"openThreadsResolved":["已经解决的既有问题或伏笔"],"characterChanges":[{"name":"角色名","change":"目标、关系、认知或状态变化"}]}}`;
  }

  function applyStoryDelta(story, chapter) {
    const delta = chapter.storyDelta || {};
    const bible = story.storyBible;
    if (delta.timelineEvent) bible.timeline.push({ id: GreenRiverStoryEngine.makeId('event'), text: String(delta.timelineEvent), chapterId: chapter.id, timestamp: Date.now() });
    const resolved = new Set((delta.openThreadsResolved || []).map(item => String(item).trim()).filter(Boolean));
    bible.openThreads = bible.openThreads.filter(item => !resolved.has(String(typeof item === 'string' ? item : item.text).trim()));
    (delta.openThreadsAdded || []).map(item => String(item).trim()).filter(Boolean).forEach(text => {
      if (!bible.openThreads.some(item => String(typeof item === 'string' ? item : item.text).trim() === text)) bible.openThreads.push({ id: GreenRiverStoryEngine.makeId('thread'), text, chapterId: chapter.id });
    });
  }

  function commentLimits(settings) {
    if (settings.readerCommentDensity === 'sparse') return { paragraphCount: 3, perParagraph: 2 };
    if (settings.readerCommentDensity === 'lively') return { paragraphCount: 8, perParagraph: 4 };
    return { paragraphCount: 5, perParagraph: 3 };
  }

  function getOrCreateReaderProfiles(story) {
    const bible = story.storyBible;
    if (!Array.isArray(bible.readerProfiles) || bible.readerProfiles.length < 6) {
      bible.readerProfiles = [
        { name: '今天也在追更', type: '剧情分析', voice: '注意伏笔和逻辑，表达简洁' },
        { name: '糖分观察员', type: '关系向', voice: '关注人物关系变化，但不过度尖叫' },
        { name: '页边小灯', type: '细节型', voice: '温和，善于发现动作和措辞细节' },
        { name: '不许刀我', type: '情绪型', voice: '情绪直接，偶尔轻松吐槽' },
        { name: '埋伏笔了吗', type: '推理型', voice: '提出有依据的猜测，不提前剧透' },
        { name: '路过但认真看了', type: '普通读者', voice: '自然口语，偶尔表达不同意见' },
        { name: '角色行为研究所', type: '角色分析', voice: '分析动机，不复述正文' }
      ];
    }
    return bible.readerProfiles;
  }

  async function generateReaderCommentsForChapter(story, chapter, signal) {
    if (!story.settings.readerCommentsEnabled) return [];
    const profiles = getOrCreateReaderProfiles(story);
    const limits = commentLimits(story.settings);
    const toneMap = { mixed: '自然混合', gentle: '总体温和', funny: '偏轻松吐槽', serious: '偏认真分析' };
    const paragraphs = chapter.paragraphs.map((item, index) => `[${index}] ${item.text}`).join('\n\n');
    const prompt = `你正在为小说《${story.title}》的《${chapter.title}》生成真实自然的段评。\n读者档案：${profiles.map(p => `${p.name}（${p.type}：${p.voice}）`).join('；')}\n评论气氛：${toneMap[story.settings.readerCommentTone] || toneMap.mixed}。\n只在信息揭露、情绪转折、关系推进、喜剧点、伏笔呼应或章末钩子等值得评论的位置发言。不要机械覆盖每段，不要复述正文，不要让所有人都用“啊啊啊、救命、磕到了”。读者可以观点不同，但不能知道本章尚未揭示的信息。最多选择 ${limits.paragraphCount} 个段落，每段最多 ${limits.perParagraph} 条。\n\n正文：\n${paragraphs}\n\n只输出合法JSON：{"readerComments":[{"segmentIndex":0,"comments":[{"name":"必须来自读者档案","content":"自然评论","likes":0}]}]}`;
    const result = extractGreenRiverJson(await callGreenRiverModel('你负责生成小说读者段评，不修改正文。', prompt, 0.85, signal));
    return GreenRiverStoryEngine.attachCommentAnchors(chapter, result.readerComments || []);
  }

  async function regenerateReaderComments(storyId, chapterIndex) {
    if (grState.isGenerating) return;
    const story = await db.grStories.get(storyId);
    if (!story?.chapters?.[chapterIndex]) return;
    GreenRiverStoryEngine.normalizeStory(story);
    if (!story.settings.readerCommentsEnabled) return showCustomAlert('尚未开启段评', '请先在作品设定中开启“生成时开启读者评论”。');
    const confirmed = await showCustomConfirm('重生成段评', '正文不会改变，当前章节已有段评会先保存在修订记录中。', { confirmText: '生成' });
    if (!confirmed) return;
    grState.isGenerating = true;
    const button = document.getElementById('gr-regenerate-comments-btn');
    if (button) { button.disabled = true; button.textContent = '生成中…'; }
    try {
      const chapter = story.chapters[chapterIndex];
      GreenRiverStoryEngine.snapshotRevision(chapter, '重生成段评前');
      chapter.readerComments = await generateReaderCommentsForChapter(story, chapter);
      story.lastUpdated = Date.now();
      await db.grStories.put(story);
      await openReader(storyId, chapterIndex);
    } catch (error) {
      await showCustomAlert('段评生成失败', error.message);
    } finally {
      grState.isGenerating = false;
      if (button) { button.disabled = false; button.textContent = '重生成段评'; }
    }
  }

  async function handleGenerateStoryContent(isReroll = false) {
    if (grState.isGenerating) { if (grGenerationController) grGenerationController.abort(); return; }
    let story = await db.grStories.get(grState.activeStoryId);
    if (!story) return;
    const engine = GreenRiverStoryEngine;
    engine.normalizeStory(story);
    const oldLatestChapter = isReroll ? story.chapters[story.chapters.length - 1] : null;
    if (isReroll && !oldLatestChapter) return;
    const directionInput = document.getElementById('gr-direction-input');
    const mode = document.getElementById('gr-writing-mode')?.value || 'continue';
    const userDirection = directionInput?.value.trim() || '';
    const author = await db.grAuthors.get(story.authorId);
    const genBtn = document.getElementById('gr-generate-btn');
    const btnText = document.getElementById('gr-gen-text');
    grState.isGenerating = true;
    grGenerationController = new AbortController();
    if (genBtn) {
      genBtn.disabled = false;
      genBtn.classList.add('is-generating');
      genBtn.title = '点击取消生成';
      genBtn.onclick = () => grGenerationController?.abort();
      if (btnText) btnText.textContent = '取消';
    }
    try {
      const sourceStoryId = story.id;
      const contextStory = engine.prepareGenerationStory(story, mode, isReroll);
      const continuity = engine.buildContinuityContext(contextStory);
      const charsContext = await buildGreenRiverCharacterContext(contextStory, Math.max(1, Number(story.settings.contextLimit) || 20));
      const worldContext = await buildGreenRiverWorldContext(contextStory, continuity, userDirection);
      const userPersona = await getGreenRiverUserPersona(contextStory);
      const requested = Math.max(200, Number(story.settings.outputLength) || 500);
      const targetMin = Math.max(150, Math.floor(requested * 0.85));
      const targetMax = Math.max(targetMin + 100, Math.ceil(requested * 1.25));
      const systemPrompt = buildGreenRiverWritingPrompt({ story: contextStory, author, continuity, charsContext, worldContext, userPersona, userDirection, mode, targetMin, targetMax, isReroll });
      const result = extractGreenRiverJson(await callGreenRiverModel(systemPrompt, '请根据全部资料完成本次小说写作。', 0.76, grGenerationController.signal));
      const content = String(result.content || '').trim();
      if (content.length < 80) throw new Error('AI返回的正文过短，未保存本次结果');
      const newChapter = {
        id: engine.makeId('chapter'),
        title: String(result.title || `第 ${isReroll ? story.chapters.length : story.chapters.length + 1} 章`),
        content,
        paragraphs: engine.splitParagraphs(content).map(text => ({ id: engine.makeId('paragraph'), text })),
        summary: String(result.summary || ''),
        prevSummary: continuity.lastChapter?.summary || continuity.recentSummaries || '',
        storyDelta: result.storyDelta && typeof result.storyDelta === 'object' ? result.storyDelta : {},
        readerComments: [], revisions: [], generationInstruction: userDirection, writingMode: mode, timestamp: Date.now()
      };
      if (story.settings.readerCommentsEnabled) {
        try { newChapter.readerComments = await generateReaderCommentsForChapter(contextStory, newChapter, grGenerationController.signal); }
        catch (commentError) { if (commentError.name === 'AbortError') throw commentError; console.warn('正文已完成，但段评生成失败：', commentError); }
      }
      const generatedBibleState = engine.clone(contextStory.storyBible);
      story = await db.grStories.get(sourceStoryId);
      if (!story) throw new Error('原作品已不存在，本次内容未写入其他作品');
      engine.normalizeStory(story);
      if (engine.storyMode(contextStory) === 'standalone' && !isReroll && mode !== 'extend' && story.chapters.length) {
        story = engine.clone(contextStory);
        delete story.id;
        story.title = newChapter.title || story.title;
        story.chapters = [];
      }
      story.storyBible.storyCharacters = generatedBibleState.storyCharacters || story.storyBible.storyCharacters;
      if (generatedBibleState.readerProfiles) story.storyBible.readerProfiles = generatedBibleState.readerProfiles;
      if (result.globalSummary) story.storyBible.globalSummary = String(result.globalSummary).slice(0, 5000);
      if (mode === 'extend' && !isReroll && story.chapters.length) {
        const target = story.chapters[story.chapters.length - 1];
        engine.snapshotRevision(target, '延长场景前');
        const offset = target.paragraphs.length;
        target.paragraphs.push(...newChapter.paragraphs);
        target.content = target.paragraphs.map(item => item.text).join('\n\n');
        target.summary = newChapter.summary || target.summary;
        target.storyDelta = newChapter.storyDelta;
        target.readerComments.push(...newChapter.readerComments.map(group => Object.assign({}, group, { segmentIndex: Number(group.segmentIndex) + offset })));
        target.timestamp = Date.now();
        applyStoryDelta(story, target);
      } else if (isReroll) {
        const current = story.chapters[story.chapters.length - 1];
        story.storyBible.timeline = (story.storyBible.timeline || []).filter(item => item.chapterId !== current.id);
        story.storyBible.openThreads = (story.storyBible.openThreads || []).filter(item => item.chapterId !== current.id);
        const oldSnapshot = { id: engine.makeId('revision'), reason: '重写前原稿', timestamp: Date.now(), title: current.title, content: current.content, summary: current.summary, paragraphs: engine.clone(current.paragraphs), readerComments: engine.clone(current.readerComments), storyDelta: engine.clone(current.storyDelta) };
        newChapter.revisions = [...(current.revisions || []), oldSnapshot].slice(-20);
        story.chapters[story.chapters.length - 1] = newChapter;
        applyStoryDelta(story, newChapter);
      } else {
        story.chapters.push(newChapter);
        applyStoryDelta(story, newChapter);
      }
      story.lastUpdated = Date.now();
      if (story.id == null) story.id = await db.grStories.add(story);
      else await db.grStories.put(story);
      await openReader(story.id, story.chapters.length - 1);
      if (directionInput) directionInput.value = '';
    } catch (error) {
      if (error.name === 'AbortError') await showCustomAlert('已取消', '本次生成已取消，原有章节没有变化。');
      else { console.error('绿江生成失败:', error); await showCustomAlert('生成失败', error.message); }
    } finally {
      grState.isGenerating = false;
      grGenerationController = null;
      const currentBtn = document.getElementById('gr-generate-btn');
      if (currentBtn) { currentBtn.disabled = false; currentBtn.classList.remove('is-generating'); currentBtn.title = ''; }
      const currentText = document.getElementById('gr-gen-text');
      if (currentText) currentText.textContent = grState.storyMode === 'serial' ? '续写' : '创作';
      updateGenButtonBinding();
    }
  }

  window.regenerateReaderComments = regenerateReaderComments;
