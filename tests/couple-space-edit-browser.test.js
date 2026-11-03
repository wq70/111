const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');

test('情侣空间详情可以编辑角色和用户的记录，并原地保存', t => {
  const browser = [process.env.CHROME_PATH, 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/usr/bin/chromium']
    .find(file => file && fs.existsSync(file));
  if (!browser) return t.skip('需要 Chromium 浏览器');

  const page = fs.readFileSync(path.join(__dirname, '../archive/330--main/index.html'), 'utf8');
  const script = String.raw`
    const check = (ok, message) => { if (!ok) throw new Error(message); };
    const find = selector => {
      const element = document.querySelector(selector);
      check(element, '找不到 ' + selector);
      return element;
    };
    const click = selector => find(selector).click();
    const base = { id: 'existing', title: '旧内容', content: '旧内容', createdAt: 1700000000000,
      timestamp: 1700000000000, hearts: { char: true }, comments: [] };

    function edit({ feature, storage, detail, input, field, save, extra, change }) {
      const key = storage + '_' + currentCharId;
      const original = { ...base, ...extra };
      localStorage.setItem(key, JSON.stringify([original]));
      openFeature(feature);
      window[detail](original.id);
      click('.page.active button[onclick^="editCurrent"]');
      const editor = find(input);
      check(editor.getClientRects().length && editor.value === original[field], feature + ' 编辑器未显示或未填入原值');
      editor.value = '新内容';
      editor.dispatchEvent(new Event('input', { bubbles: true }));
      if (change) change();
      click(save || '.page.active header button[onclick^="save"]');
      const records = JSON.parse(localStorage.getItem(key));
      const updated = records[0];
      check(records.length === 1 && updated.id === original.id && updated.author === original.author,
        feature + ' 保存后改变了记录数量、ID或作者');
      check(updated[field] === '新内容' && updated.createdAt === original.createdAt && updated.hearts.char,
        feature + ' 未保存新内容或改动了原记录的元数据');
      window[detail](original.id);
      check(find('.page.active').textContent.includes('新内容'), feature + ' 重新打开详情未显示修改');
      click('.page.active header button[onclick^="close"]');
      return updated;
    }

    try {
      currentCharId = 'edit-test';
      const items = [
        ['diary', 'coupleDiaries', 'openDiaryDetail', '#diary-write-title', 'title'],
        ['bucketlist', 'coupleChecklist', 'openClDetail', '#cl-write-title', 'title'],
        ['anniversary', 'coupleAnniv', 'openAnnivDetail', '#anniv-title-input', 'title',
          { type: 'love', date: '2024-01-02' }, '#anniv-write-overlay button[onclick="saveAnniv()"]'],
        ['album', 'coupleAlbum', 'openAlbumDetail', '#album-edit-desc', 'description',
          { type: 'text', description: '旧内容' }, '#album-edit-confirm'],
        ['message', 'coupleMessages', 'openMsgDetail', '#msg-write-content', 'content'],
        ['timeline', 'coupleTimeline', 'openTlDetail', '#tl-write-title', 'title', { category: 'moment' }],
        ['mood', 'coupleMoods', 'openMoodDetail', '#mood-write-content', 'content', { moodType: 'happy' }],
        ['futuremail', 'coupleLetters', 'openLetterDetail', '#letter-write-title', 'title', { read: true, envelope: 'none' }],
        ['location', 'coupleLocations', 'openLocDetail', '#loc-write-name', 'name', { name: '旧内容', category: 'date' }],
        ['ledger', 'coupleFinance', 'openFinDetail', '#fin-write-title', 'title',
          { type: 'expense', amount: 20, category: 'food', date: '2024-01-02' }]
      ];
      for (const author of ['char', 'user']) {
        for (const [feature, storage, detail, input, field, extra, save] of items) {
          edit({ feature, storage, detail, input, field, save, extra: { ...extra, author } });
        }
        const extra = { author, status: 'completed', sleepAt: '2024-01-02T23:00:00',
          wakeAt: '2024-01-03T07:00:00', sleepNote: '晚安', wakeNote: '旧内容', duration: 480 };
        const updated = edit({ feature: 'sleep', storage: 'coupleSleep', detail: 'openSleepDetail',
          input: '#sleep-write-note', field: 'wakeNote', extra,
          change() {
            click('#sleep-write-type-row button[onclick*="sleep"]');
            check(find('#sleep-write-note').value === '晚安' && find('#sleep-write-time').value === '23:00',
              '切换到入睡时未填入入睡数据');
            click('#sleep-write-type-row button[onclick*="wake"]');
            find('#sleep-write-note').value = '新内容';
            find('#sleep-write-time').value = '07:30';
          }
        });
        check(updated.sleepAt === extra.sleepAt && updated.sleepNote === extra.sleepNote
          && updated.wakeAt === '2024-01-03T07:30:00' && updated.duration === 510,
          '编辑旧睡眠记录后日期或时长错误');
      }
      document.getElementById('edit-test-result').textContent = 'PASS';
    } catch (error) {
      document.getElementById('edit-test-result').textContent = error.stack;
    }
  `;
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'couple-space-edit-'));
  const file = path.join(folder, 'test.html');
  try {
    fs.writeFileSync(file, page.replace('</body>', () => '<pre id="edit-test-result"></pre><script>' + script + '</script></body>'));
    const result = spawnSync(browser, ['--headless', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
      '--disable-background-networking', '--host-resolver-rules=MAP * ~NOTFOUND', '--user-data-dir=' + path.join(folder, 'profile'),
      '--dump-dom', '--virtual-time-budget=3000', pathToFileURL(file).href],
    { encoding: 'utf8', timeout: 25000, maxBuffer: 4 * 1024 * 1024, windowsHide: true });
    assert.ifError(result.error);
    const actual = result.stdout?.match(/<pre id="edit-test-result">([\s\S]*?)<\/pre>/)?.[1];
    assert.equal(actual, 'PASS', actual || result.stderr?.slice(-1500));
  } finally {
    if (path.dirname(folder) === path.resolve(os.tmpdir()) && path.basename(folder).startsWith('couple-space-edit-')) {
      fs.rmSync(folder, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    }
  }
});
