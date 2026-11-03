// 绿江小说共享引擎：只扩展现有 grStories 数据，不破坏旧作品结构。
(function () {
  const DEFAULT_STORY_BIBLE = {
    synopsis: '',
    genre: '',
    status: '连载中',
    tags: [],
    tone: '',
    pov: '第三人称有限视角',
    tense: '自然叙事',
    endingDirection: '',
    forbiddenContent: '',
    globalSummary: '',
    openThreads: [],
    timeline: [],
    storyCharacters: {}
  };

  function clone(value) {
    if (value === undefined) return undefined;
    return JSON.parse(JSON.stringify(value));
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function normalizeNewlines(value) {
    return String(value || '').replace(/\r\n?/g, '\n').trim();
  }

  function splitParagraphs(content) {
    const text = normalizeNewlines(content);
    if (!text) return [];
    return text.split(/\n\s*\n/).map(item => item.trim()).filter(Boolean);
  }

  function makeId(prefix) {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') {
      return `${prefix}_${window.crypto.randomUUID()}`;
    }
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  }

  function ensureChapter(chapter, index) {
    if (!chapter || typeof chapter !== 'object') chapter = {};
    if (!chapter.id) chapter.id = makeId('chapter');
    if (!Array.isArray(chapter.paragraphs) || chapter.paragraphs.length === 0) {
      chapter.paragraphs = splitParagraphs(chapter.content).map(text => ({ id: makeId('paragraph'), text }));
    } else {
      chapter.paragraphs = chapter.paragraphs.map(item => {
        if (typeof item === 'string') return { id: makeId('paragraph'), text: item };
        return { id: item.id || makeId('paragraph'), text: String(item.text || '') };
      }).filter(item => item.text.trim());
    }
    chapter.content = chapter.paragraphs.map(item => item.text).join('\n\n');
    chapter.title = chapter.title || `第 ${index + 1} 章`;
    chapter.summary = String(chapter.summary || '');
    chapter.prevSummary = String(chapter.prevSummary || '');
    chapter.readerComments = Array.isArray(chapter.readerComments) ? chapter.readerComments : [];
    chapter.revisions = Array.isArray(chapter.revisions) ? chapter.revisions : [];
    chapter.storyDelta = chapter.storyDelta && typeof chapter.storyDelta === 'object' ? chapter.storyDelta : {};
    chapter.timestamp = chapter.timestamp || Date.now();
    return chapter;
  }

  function normalizeStory(story) {
    if (!story || typeof story !== 'object') return story;
    story.settings = story.settings && typeof story.settings === 'object' ? story.settings : {};
    story.storyBible = Object.assign({}, DEFAULT_STORY_BIBLE, story.storyBible || {});
    story.storyBible.openThreads = Array.isArray(story.storyBible.openThreads) ? story.storyBible.openThreads : [];
    story.storyBible.tags = Array.isArray(story.storyBible.tags) ? story.storyBible.tags : [];
    story.storyBible.timeline = Array.isArray(story.storyBible.timeline) ? story.storyBible.timeline : [];
    story.storyBible.storyCharacters = story.storyBible.storyCharacters && typeof story.storyBible.storyCharacters === 'object'
      ? story.storyBible.storyCharacters
      : {};
    story.chapters = Array.isArray(story.chapters) ? story.chapters : [];
    story.chapters = story.chapters.map(ensureChapter);
    story.version = Math.max(Number(story.version) || 1, 2);
    return story;
  }

  function paragraphCommentMap(chapter) {
    const map = new Map();
    const paragraphs = chapter.paragraphs || [];
    (chapter.readerComments || []).forEach(group => {
      let paragraphId = group.paragraphId;
      if (!paragraphId && Number.isFinite(Number(group.segmentIndex))) {
        paragraphId = paragraphs[Number(group.segmentIndex)]?.id;
      }
      if (paragraphId) map.set(paragraphId, Array.isArray(group.comments) ? group.comments : []);
    });
    return map;
  }

  function attachCommentAnchors(chapter, groups) {
    const paragraphs = chapter.paragraphs || [];
    return (Array.isArray(groups) ? groups : []).map(group => {
      const rawIndex = Number(group.segmentIndex);
      const paragraph = group.paragraphId
        ? paragraphs.find(item => item.id === group.paragraphId)
        : paragraphs[Number.isFinite(rawIndex) ? rawIndex : -1];
      if (!paragraph) return null;
      return {
        paragraphId: paragraph.id,
        segmentIndex: paragraphs.indexOf(paragraph),
        comments: (Array.isArray(group.comments) ? group.comments : []).slice(0, 5).map(comment => ({
          id: comment.id || makeId('comment'),
          name: String(comment.name || '读者'),
          content: String(comment.content || ''),
          likes: Math.max(0, Number(comment.likes) || 0),
          replyTo: comment.replyTo ? String(comment.replyTo) : '',
          timestamp: comment.timestamp || Date.now()
        })).filter(comment => comment.content.trim())
      };
    }).filter(Boolean);
  }

  function snapshotRevision(chapter, reason) {
    const revision = {
      id: makeId('revision'),
      reason: reason || '保存修改',
      timestamp: Date.now(),
      title: chapter.title,
      content: chapter.content,
      summary: chapter.summary,
      paragraphs: clone(chapter.paragraphs),
      readerComments: clone(chapter.readerComments),
      storyDelta: clone(chapter.storyDelta)
    };
    chapter.revisions = Array.isArray(chapter.revisions) ? chapter.revisions : [];
    chapter.revisions.push(revision);
    if (chapter.revisions.length > 20) chapter.revisions.splice(0, chapter.revisions.length - 20);
    return revision;
  }

  function restoreRevision(chapter, revision) {
    if (!chapter || !revision) return chapter;
    snapshotRevision(chapter, '恢复前自动存档');
    chapter.title = revision.title || chapter.title;
    chapter.content = String(revision.content || '');
    chapter.summary = String(revision.summary || '');
    chapter.paragraphs = clone(revision.paragraphs) || [];
    chapter.readerComments = clone(revision.readerComments) || [];
    chapter.storyDelta = clone(revision.storyDelta) || {};
    return ensureChapter(chapter, 0);
  }

  function getChapterTail(chapter, maxChars) {
    if (!chapter) return '';
    const content = String(chapter.content || '');
    const limit = Math.max(300, Number(maxChars) || 1800);
    return content.length > limit ? content.slice(-limit) : content;
  }

  function collectRecentSummaries(story, count) {
    return (story.chapters || []).slice(-Math.max(1, count || 4)).map((chapter, offset, list) => {
      const actualIndex = story.chapters.length - list.length + offset;
      return `第${actualIndex + 1}章《${chapter.title}》：${chapter.summary || '暂无摘要'}`;
    }).join('\n');
  }

  function buildContinuityContext(story) {
    normalizeStory(story);
    const bible = story.storyBible;
    const lastChapter = story.chapters[story.chapters.length - 1];
    return {
      bible,
      lastChapter,
      lastChapterTail: getChapterTail(lastChapter, 2200),
      recentSummaries: collectRecentSummaries(story, 5),
      openThreads: bible.openThreads.map(item => typeof item === 'string' ? item : item.text).filter(Boolean).join('\n'),
      timeline: bible.timeline.slice(-12).map(item => typeof item === 'string' ? item : item.text).filter(Boolean).join('\n')
    };
  }

  function storyMode(story) {
    return ['anthology', 'standalone'].includes(story.settings?.storyMode) ? story.settings.storyMode : 'serial';
  }

  // Build the complete request from this copy, so summaries cannot bypass isolation.
  function prepareGenerationStory(original, mode, isReroll) {
    const story = normalizeStory(clone(original));
    if (storyMode(story) === 'serial') {
      if (isReroll) {
        const removed = story.chapters.pop();
        story.storyBible.timeline = story.storyBible.timeline.filter(item => item.chapterId !== removed?.id);
        story.storyBible.openThreads = story.storyBible.openThreads.filter(item => item.chapterId !== removed?.id);
        refreshGlobalSummary(story);
      }
      return story;
    }
    // Extending is an explicit choice to read only the current short story.
    story.chapters = mode === 'extend' && !isReroll ? story.chapters.slice(-1) : [];
    story.storyBible.globalSummary = '';
    story.storyBible.timeline = [];
    story.storyBible.openThreads = [];
    return story;
  }

  function analyseChapter(chapter) {
    const text = String(chapter?.content || '');
    const paragraphs = splitParagraphs(text);
    const dialogueChars = (text.match(/[“”「」『』\"]/g) || []).length;
    const repeatedSignals = [
      ['目光', /目光/g], ['指尖', /指尖/g], ['呼吸', /呼吸/g], ['心脏', /心脏/g],
      ['空气', /空气/g], ['微微', /微微/g], ['仿佛', /仿佛/g], ['不由得', /不由得/g]
    ].map(([label, regex]) => ({ label, count: (text.match(regex) || []).length })).filter(item => item.count >= 4);
    const issues = [];
    if (paragraphs.length < 3 && text.length > 500) issues.push('正文分段偏少，移动端阅读可能显得拥挤。');
    if (text.length > 1000 && dialogueChars < 4) issues.push('本章对话较少，若本章并非独白场景，可检查人物互动是否不足。');
    if (repeatedSignals.length) issues.push(`高频表达：${repeatedSignals.map(item => `${item.label}×${item.count}`).join('、')}。`);
    const starts = paragraphs.map(item => item.slice(0, 8)).filter(Boolean);
    const duplicateStarts = starts.filter((item, index) => starts.indexOf(item) !== index);
    if (duplicateStarts.length) issues.push('部分段落开头重复，可检查句式是否机械。');
    return {
      charCount: text.replace(/\s/g, '').length,
      paragraphCount: paragraphs.length,
      issues,
      message: issues.length ? issues.join('\n') : '未发现明显的机械重复或阅读结构问题。'
    };
  }

  function refreshGlobalSummary(story) {
    normalizeStory(story);
    const text = story.chapters.map((chapter, index) => `第${index + 1}章《${chapter.title}》：${chapter.summary || '暂无摘要'}`).join('\n');
    story.storyBible.globalSummary = text.length <= 5000 ? text : `${text.slice(0, 1800)}\n……\n${text.slice(-3000)}`;
    return story.storyBible.globalSummary;
  }

  window.GreenRiverStoryEngine = {
    DEFAULT_STORY_BIBLE,
    analyseChapter,
    attachCommentAnchors,
    buildContinuityContext,
    storyMode,
    prepareGenerationStory,
    clone,
    ensureChapter,
    escapeHtml,
    makeId,
    normalizeStory,
    paragraphCommentMap,
    restoreRevision,
    refreshGlobalSummary,
    snapshotRevision,
    splitParagraphs
  };
})();
