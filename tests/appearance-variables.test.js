const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const vm = require('node:vm');
const { spawnSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

function fixture() {
  const styles = Object.fromEntries(['global-custom-style', 'custom-bubble-style', 'preview-bubble-style'].map(id => [id, { textContent: '' }]));
  const a = { id: 'a', originalName: '角色甲', name: '甲的备注', settings: { myNickname: '对甲的昵称', aiAvatar: 'https://example.test/a.png', customCss: '.message-bubble.ai::after { content: "{{char_name}}"; }' }, history: [] };
  const b = { id: 'b', originalName: '角色乙', name: '乙的备注', settings: { myNickname: '对乙的昵称', aiAvatar: 'https://example.test/b.png' }, history: [] };
  const state = { activeChatId: 'a', chats: { a, b }, qzoneSettings: { nickname: '全局用户', avatar: 'https://example.test/user.png' }, globalSettings: { globalCss: '.title::after { content: "{{char_remark}} / {{user_name}}"; }' } };
  const c = vm.createContext({ state, defaultAvatar: 'default.png', window: {}, document: { getElementById: id => styles[id] || null }, console });
  vm.runInContext(read('modules/appearance-theme.js'), c);
  return { c, state, a, b, styles };
}

test('六个变量读取各自来源，显式指定角色、群聊和无当前聊天均可使用', () => {
  const { c, state, a, b } = fixture();
  assert.equal(c.replaceAppearanceVariables('{{char_name}}|{{char_remark}}|{{user_name}}|{{user_nickname}}|{{char_avatar}}|{{user_avatar}}'), '角色甲|甲的备注|全局用户|对甲的昵称|https://example.test/a.png|https://example.test/user.png');
  assert.equal(c.replaceAppearanceVariables('{{ char_name }}|{{user_nickname}}', b), '角色乙|对乙的昵称');
  a.settings.myAvatar = 'private.png';
  assert.equal(c.replaceAppearanceVariables('{{user_avatar}}'), 'private.png');
  b.isGroup = true; b.settings.groupAvatar = 'group.png'; delete b.originalName;
  assert.equal(c.replaceAppearanceVariables('{{char_name}}|{{char_avatar}}', b), '乙的备注|group.png');
  state.activeChatId = null;
  assert.equal(c.replaceAppearanceVariables('{{char_name}}|{{user_name}}|{{user_avatar}}'), '|全局用户|https://example.test/user.png');
});

test('未知变量和插入值中的变量原样保留，不读取原型字段', () => {
  const { c, a } = fixture();
  a.originalName = '{{user_name}}';
  assert.equal(c.replaceAppearanceVariables('{{char_name}} {{unknown}} {{constructor}} {{__proto__}}'), '{{user_name}} {{unknown}} {{constructor}} {{__proto__}}');
});

test('全局与气泡切换角色及改名换头像时更新，预设仍保存变量原文', () => {
  const { c, state, a, b, styles } = fixture();
  const saved = JSON.stringify(state.globalSettings);
  c.refreshAppearanceVariables();
  assert.match(styles['global-custom-style'].textContent, /甲的备注/);
  c.applyScopedCss(a.settings.customCss, '#settings-preview-area', 'preview-bubble-style', b);
  assert.match(styles['preview-bubble-style'].textContent, /角色乙/);
  state.activeChatId = 'b'; b.settings.customCss = a.settings.customCss;
  c.refreshAppearanceVariables();
  assert.match(styles['custom-bubble-style'].textContent, /角色乙/);
  assert.doesNotMatch(styles['global-custom-style'].textContent, /甲的备注/);
  b.name = '新备注'; b.originalName = '新本名'; b.settings.aiAvatar = 'new.png';
  c.refreshAppearanceVariables();
  assert.match(styles['global-custom-style'].textContent, /新备注/);
  assert.match(styles['custom-bubble-style'].textContent, /新本名/);
  assert.equal(c.replaceAppearanceVariables('{{char_avatar}}'), 'new.png');
  assert.equal(JSON.stringify(state.globalSettings), saved);
  assert.match(a.settings.customCss, /\{\{char_name\}\}/);
  state.activeChatId = null; c.refreshAppearanceVariables();
  assert.equal(styles['custom-bubble-style'].textContent, '');
  assert.doesNotMatch(styles['global-custom-style'].textContent, /新备注/);
});

test('角色主动改名的实际消息入口刷新变量，后台角色不覆盖当前美化', async () => {
  const { c, a, b, styles } = fixture();
  c.chatRenderVersion = 1;
  c.createMessageElement = async () => null;
  const source = read('modules/chat/message-lifecycle.js');
  vm.runInContext(source.slice(source.indexOf('  async function appendMessage('), source.indexOf('  // 【新增】暴露 appendMessage')), c);
  a.name = '主动新备注';
  await c.appendMessage({ timestamp: 1 }, a);
  assert.match(styles['global-custom-style'].textContent, /主动新备注/);
  await c.appendMessage({ timestamp: 2 }, b);
  assert.match(styles['global-custom-style'].textContent, /主动新备注/);
});

const browser = [process.env.APPEARANCE_TEST_BROWSER, 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe'].find(file => file && fs.existsSync(file));

test('真实浏览器：HTML、内联样式、CSS URL、特殊名字、心声缓存和切换角色', { skip: !browser }, () => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'appearance-variables-'));
  const script = value => {
    new vm.Script(value);
    return `<script>${value.replace(/<\/script/gi, '<\\/script')}</script>`;
  };
  const html = `<!doctype html><meta charset="utf-8"><style id="global-custom-style"></style><style id="custom-bubble-style"></style><div id="character-profile-modal"><div class="character-profile-content"></div></div><div class="name"></div><div class="avatar"></div><pre id="result">pending</pre>` + script(`
    const state = { activeChatId: 'a', chats: {}, qzoneSettings: { nickname: '全局用户' }, globalSettings: { customThoughtsUIEnabled: true } };
    const defaultAvatar = 'default.png';
    async function applyRenderingRules(value) { return value; }
    const a = state.chats.a = { id: 'a', originalName: '甲', name: '甲备注', settings: { enableThoughts: true }, heartfeltVoice: '甲心声', randomJottings: '甲散记' };
    const b = state.chats.b = { id: 'b', originalName: '乙', name: '乙备注', settings: { enableThoughts: true }, heartfeltVoice: '乙心声', randomJottings: '乙散记' };
  `) + script(read('modules/appearance-theme.js')) + script(read('modules/character/profile-and-thoughts.js')) + script(`
    (async () => {
      const check = (value, label) => { if (!value) throw Error(label); };
      const original = '<strong title="{{char_remark}}">{{char_name}}</strong><img src="{{char_avatar}}"><span id="profile-heartfelt-voice"></span><span id="profile-random-jottings"></span>';
      state.globalSettings.customThoughtsHTML = original;
      state.globalSettings.customThoughtsCSS = '.name::after { content: "{{char_name}}"; } .avatar { background-image: url("{{char_avatar}}"); }';
      a.originalName = ${JSON.stringify('名字"\'\\\n<em>不是标签</em> {{user_name}} 😊')};
      a.name = ${JSON.stringify('" onmouseover="bad()')};
      a.settings.aiAvatar = 'https://example.test/a(1).png?x=1&y=2';
      await showCharacterProfileModal('a');
      const strong = document.querySelector('strong');
      check(strong.textContent === a.originalName, 'HTML text');
      check(!strong.querySelector('em') && !strong.hasAttribute('onmouseover'), 'no markup injection');
      check(strong.title === a.name, 'HTML attribute');
      check(document.querySelector('img').getAttribute('src') === a.settings.aiAvatar, 'avatar attribute');
      const style = document.getElementById('custom-thoughts-style');
      check(style.sheet.cssRules.length === 2, 'CSS remains valid');
      check(style.sheet.cssRules[0].style.content.includes('不是标签'), 'CSS content');
      check(style.sheet.cssRules[1].style.backgroundImage.includes('a(1).png?x=1&y=2'), 'CSS URL');
      const holder = document.createElement('div');
      holder.innerHTML = renderAppearanceHtml(${JSON.stringify('<style>.inline::after { content: "{{char_name}}"; }</style><div style=\'background-image: url("{{char_avatar}}")\'>{{char_name}}</div>')}, a);
      check(holder.querySelector('div').style.backgroundImage.includes('a(1).png'), 'inline style');
      document.body.append(holder);
      check(holder.querySelector('style').sheet.cssRules.length === 1, 'embedded style');
      check(document.getElementById('profile-heartfelt-voice').textContent === '甲心声', 'heartfelt voice');
      applyCustomThoughtsUI(); check(document.querySelector('strong') === strong, 'unchanged DOM reused');
      state.activeChatId = 'b'; await showCharacterProfileModal('b');
      check(document.querySelector('strong').textContent === '乙', 'switch chat HTML');
      check(style.textContent.includes('乙'), 'switch chat CSS');
      check(document.getElementById('profile-heartfelt-voice').textContent === '乙心声', 'switch chat content');
      check(state.globalSettings.customThoughtsHTML === original, 'template preserved');
      state.globalSettings.globalCss = '.name::after { content: "{{char_remark}}"; }';
      refreshAppearanceVariables();
      b.name = '乙新备注'; refreshAppearanceVariables();
      check(document.getElementById('global-custom-style').textContent.includes('乙新备注'), 'refresh name');
      document.getElementById('result').textContent = 'PASS';
    })().catch(error => { document.getElementById('result').textContent = 'FAIL: ' + error.stack; });
  `);
  const file = path.join(folder, 'test.html');
  fs.writeFileSync(file, html);
  try {
    const run = spawnSync(browser, ['--headless', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--disable-background-networking', `--user-data-dir=${path.join(folder, 'profile')}`, '--dump-dom', '--virtual-time-budget=3000', pathToFileURL(file).href], { encoding: 'utf8', timeout: 25000, maxBuffer: 4 * 1024 * 1024, windowsHide: true });
    assert.ifError(run.error);
    const result = (run.stdout || '').match(/<pre id="result">([\s\S]*?)<\/pre>/)?.[1];
    assert.equal(result, 'PASS', result || (run.stderr || '').slice(-2000));
  } finally {
    // 仅删除本测试在系统临时目录下创建的独立文件夹。
    if (path.dirname(folder) === path.resolve(os.tmpdir()) && path.basename(folder).startsWith('appearance-variables-')) fs.rmSync(folder, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
});
