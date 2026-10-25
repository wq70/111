const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const os = require('node:os');
const { spawn, spawnSync } = require('node:child_process');
const engine = require('../modules/rendering-rule-engine');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const baseRule = { name: '状态栏', isEnabled: true, chatId: ['global'], regex: '状态：(.*)', template: '<b>{{char_remark}}</b><span>$1</span>' };

function fixture() {
  const a = { id: 'a', name: '甲备注', originalName: '甲本名', settings: { aiAvatar: 'https://example.test/a.png', myNickname: '甲称呼' } };
  const b = { id: 'b', name: '乙备注', originalName: '乙本名', settings: { aiAvatar: 'https://example.test/b.png', myNickname: '乙称呼' } };
  const state = { activeChatId: 'b', chats: { a, b }, qzoneSettings: { nickname: '用户本名', avatar: 'https://example.test/user.png' }, globalSettings: {} };
  const posts = [];
  class Worker {
    postMessage(message) {
      posts.push(message);
      setImmediate(() => this.onmessage({ data: { id: message.id, result: engine.run(message.input, message.rules, message.chatId, message.meta, message.stage, message.preview) } }));
    }
    terminate() {}
  }
  const c = vm.createContext({ window: { RenderingRuleEngine: engine }, state, defaultAvatar: 'default.png', Worker, URL, console, setTimeout, clearTimeout,
    location: { href: 'https://example.test/', protocol: 'https:' },
    document: { currentScript: { src: 'https://example.test/modules/rendering-rule-runtime.js' }, getElementById: () => null, addEventListener() {} },
    db: { renderingRules: { toArray: async () => [baseRule] } } });
  vm.runInContext(read('modules/appearance-theme.js'), c);
  vm.runInContext(read('modules/rendering-rule-runtime.js'), c);
  return { c, a, b, state, posts, runtime: c.window.RenderingRuleRuntime };
}

test('实际运行入口按所属角色展开全部变量，不使用当前打开的角色', async () => {
  const { runtime, a } = fixture();
  const rule = { ...baseRule, template: '<p>{{char_name}}|{{ char_remark }}|{{user_name}}|{{user_nickname}}|{{char_avatar}}|{{user_avatar}}|$1</p>' };
  const result = await runtime.run('状态：开心', [rule], a.id, { type: 'thoughts', field: 'randomJottings' });
  assert.equal(result.content, '<p>甲本名|甲备注|用户本名|甲称呼|https://example.test/a.png|https://example.test/user.png|开心</p>');
  assert.equal(rule.template.includes('{{char_name}}'), true);
});

test('同条散记缓存随角色备注、头像、用户昵称改变，历史消息也读取新值', async () => {
  const { runtime, a, state } = fixture();
  const rule = { ...baseRule, template: '<p>{{char_remark}}|{{char_avatar}}|{{user_name}}|{{user_nickname}}|$1</p>' };
  const meta = { type: 'thoughts', field: 'randomJottings', messageId: 10 };
  assert.match((await runtime.run('状态：旧记录', [rule], 'a', meta)).content, /甲备注/);
  a.name = '新备注'; a.settings.aiAvatar = 'https://example.test/new.png'; a.settings.myNickname = '新称呼'; state.qzoneSettings.nickname = '用户新名';
  const result = await runtime.run('状态：旧记录', [rule], 'a', meta);
  assert.equal(result.content, '<p>新备注|https://example.test/new.png|用户新名|新称呼|旧记录</p>');
  assert.match((await runtime.run('状态：旧记录', [rule], 'b', meta)).content, /乙备注/);
});

test('旧版模板的变量和捕获均为一次替换，变量中的 $1、随机宏、HTML 不执行', async () => {
  const { runtime, a } = fixture();
  a.name = '$1 {{random::甲::乙}} <img src=x onerror=bad()> "';
  const result = await runtime.run('状态：{{char_remark}} <原文>', [baseRule], 'a');
  assert.equal(result.content, '<b>$1 {{random::甲::乙}} &lt;img src=x onerror=bad()&gt; &quot;</b><span>{{char_remark}} <原文></span>');
});

test('包含变量的旧版 HTML 仍保留完整原生捕获和 HTML 捕获语义', () => {
  const template = '<div>{{char_remark}}|$$|$&|$1|$2|$12|$<word>|$`|$\'</div>';
  const input = '前a<b>后';
  const regex = /(?<word>a)(<b>)/g;
  const rule = { ...baseRule, regex: regex.source, template };
  const result = engine.run(input, [rule], 'a', { appearanceVariables: { char_remark: '角色' } });
  assert.equal(result.content, input.replace(regex, template.replace('{{char_remark}}', '角色')));
});

test('新增正则经 Worker 传递调用时快照，随机表达式与命名捕获继续工作', async () => {
  const { runtime, a, posts } = fixture();
  const rule = { ...baseRule, regex: '状态：(?<status>.*)', template: '{{random::{{char_remark}}::{{char_remark}}}}/$<status>/$1/$$', options: { matchMode: 'regex', action: 'replace' } };
  const pending = runtime.run('状态：{{char_name}}', [rule], 'a');
  a.name = '调用后才改名';
  const result = await pending;
  assert.equal(result.content, '甲备注/{{char_name}}/{{char_name}}/$');
  assert.equal(result.warnings.length, 0);
  assert.equal(posts.length, 1);
  assert.equal(posts[0].meta.appearanceVariables.char_remark, '甲备注');
});

test('未知变量保留；没有变量的规则不携带无关头像和名字', async () => {
  const { runtime, posts } = fixture();
  const rule = { ...baseRule, template: '{{unknown}}:$1', options: { matchMode: 'regex' } };
  const result = await runtime.run('状态：开心', [rule], 'a');
  assert.equal(result.content, '{{unknown}}:开心');
  assert.equal(posts[0].meta.appearanceVariables, undefined);
});

test('运行器不可用时的实际兼容入口仍支持 HTML 变量', async () => {
  const { c } = fixture();
  delete c.window.RenderingRuleRuntime;
  vm.runInContext(read('modules/rendering-rules.js'), c);
  const result = await c.window.applyRenderingRules('状态：开心', 'a', { type: 'thoughts', field: 'randomJottings' });
  assert.equal(result, '<b>甲备注</b><span>开心</span>');
});

const browser = [process.env.APPEARANCE_TEST_BROWSER, 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe'].find(file => file && fs.existsSync(file));

test('浏览器完整流程：散记状态经正则和 HTML 模板进入当前、历史心声及预览', { skip: !browser }, async () => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'rendering-variables-'));
  const script = value => { new vm.Script(value); return `<script>${value.replace(/<\/script/gi, '<\\/script')}</script>`; };
  const markup = '<div id="profile-main-content"><div id="profile-heartfelt-voice"></div><div id="profile-random-jottings"></div></div><div id="profile-thoughts-history-view" style="display:none"><div id="thoughts-history-list"></div></div>';
  const html = '<!doctype html><meta charset="utf-8"><div id="character-profile-modal"><div class="character-profile-content">' + markup + '</div></div><pre id="result">pending</pre>' + script(`
    const state = { activeChatId: 'b', chats: {}, qzoneSettings: { nickname: '用户' }, globalSettings: { enableThoughts: true } };
    const defaultAvatar = 'https://example.test/default.png';
    const rule = ${JSON.stringify({ ...baseRule, template: '<div class="status"><h2 title="{{char_remark}}">from:{{char_remark}}</h2><img src="{{char_avatar}}"><style>.status::after {content:"{{char_remark}}"}</style><p>$1</p></div>' })};
    const db = { renderingRules: { toArray: async () => [rule] } };
    const getDefaultThoughtsHTML = () => ${JSON.stringify(markup)};
    let isLoadingMoreThoughts = false;
    const a = state.chats.a = { id:'a', name:'甲备注', originalName:'甲', settings:{enableThoughts:true, aiAvatar:'https://example.test/a.png'}, randomJottings:'状态：今天开心', heartfeltVoice:'心声内容' };
    const b = state.chats.b = { id:'b', name:'乙备注', originalName:'乙', settings:{enableThoughts:true}, randomJottings:'状态：另一角色', heartfeltVoice:'乙心声' };
  `) + script(read('modules/appearance-theme.js')) + script(read('modules/rendering-rule-engine.js')) + script(read('modules/rendering-rule-runtime.js')) + script(read('modules/rendering-rules.js')) + script(read('modules/character/profile-and-thoughts.js')) + script(`
    (async () => {
      const check = (ok, label) => { if (!ok) throw Error(label); };
      await showCharacterProfileModal('a');
      check(document.querySelector('#profile-random-jottings h2').textContent === 'from:甲备注', 'current thought uses owning chat');
      check(document.querySelector('#profile-random-jottings p').textContent === '今天开心', 'capture preserved');
      const card = await createThoughtCard({ randomJottings:'状态：旧日状态', heartfeltVoice:'旧心声', timestamp:1 }, 'a');
      check(card.querySelector('h2').textContent === 'from:甲备注', 'history thought');
      a.name = ${JSON.stringify('新备注"\'\\\n<em>标签</em> $1 {{user_name}}')};
      await showCharacterProfileModal('a');
      const heading = document.querySelector('#profile-random-jottings h2');
      check(heading.textContent === 'from:' + a.name && heading.title === a.name && !heading.querySelector('em'), 'rename cache and safe HTML');
      const style = document.querySelector('#profile-random-jottings style');
      check(style.sheet.cssRules.length === 1, 'style variable remains valid CSS');
      const preview = await RenderingRuleRuntime.run('状态：预览状态', [rule], 'a', { type:'thoughts', field:'randomJottings' }, 'display', true);
      check(preview.content.includes('from:新备注') && preview.trace[0].after.includes('from:新备注'), 'preview and trace');
      const modern = { ...rule, template:'<strong>{{char_remark}}</strong><img src="{{char_avatar}}"><span>$1</span>', options:{matchMode:'regex'} };
      const output = await RenderingRuleRuntime.run('状态：Worker状态', [modern], 'a', { type:'thoughts' });
      const holder = document.createElement('div'); holder.innerHTML = output.content;
      check(holder.querySelector('strong')?.textContent === a.name, 'real Worker variable: ' + JSON.stringify(output));
      check(holder.querySelector('img').getAttribute('src') === a.settings.aiAvatar, 'avatar survives sanitizer');
      check(holder.querySelector('span').textContent === 'Worker状态', 'real Worker capture');
      state.activeChatId = 'b'; await showCharacterProfileModal('b');
      check(document.querySelector('#profile-random-jottings h2').textContent === 'from:乙备注', 'switch character');
      check(rule.template.includes('{{char_remark}}'), 'saved template preserved');
      document.getElementById('result').textContent = 'PASS';
    })().catch(error => { document.getElementById('result').textContent = 'FAIL: ' + error.stack; });
  `);
  let server;
  try {
    const file = path.join(folder, 'test.html'); fs.writeFileSync(file, html);
    for (const name of ['rendering-rule-engine.js', 'rendering-rule-worker.js']) fs.writeFileSync(path.join(folder, name), read('modules/' + name));
    server = spawn(process.execPath, ['-e', `const http=require('node:http'),fs=require('node:fs'),path=require('node:path');const folder=process.argv[1];const server=http.createServer((req,res)=>{const name=new URL(req.url,'http://localhost').pathname.slice(1);if(!['test.html','rendering-rule-engine.js','rendering-rule-worker.js'].includes(name)){res.writeHead(404);return res.end();}res.setHeader('Content-Type',name.endsWith('.html')?'text/html;charset=utf-8':'text/javascript;charset=utf-8');res.end(fs.readFileSync(path.join(folder,name)));});server.listen(0,'127.0.0.1',()=>process.stdout.write(String(server.address().port)));`, folder], { windowsHide:true, stdio:['ignore','pipe','pipe'] });
    const port = await new Promise((resolve, reject) => { server.stdout.once('data', data => resolve(Number(data.toString()))); server.once('error', reject); server.once('exit', code => reject(Error('Test server exited: ' + code))); });
    const run = spawnSync(browser, ['--headless', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--disable-background-networking', `--user-data-dir=${path.join(folder, 'profile')}`, '--dump-dom', '--virtual-time-budget=5000', 'http://127.0.0.1:' + port + '/test.html'], { encoding:'utf8', timeout:25000, maxBuffer:4*1024*1024, windowsHide:true });
    assert.ifError(run.error);
    const result = (run.stdout || '').match(/<pre id="result">([\s\S]*?)<\/pre>/)?.[1];
    const line = Number(result?.match(/test.html:(\d+)/)?.[1]);
    const detail = line ? html.split('\n').slice(line - 2, line + 1).join('\n') : '';
    assert.equal(result, 'PASS', (result || (run.stderr || '').slice(-2000)) + '\n' + detail);
  } finally {
    server?.kill();
    if (path.dirname(folder) === path.resolve(os.tmpdir()) && path.basename(folder).startsWith('rendering-variables-')) fs.rmSync(folder, {recursive:true,force:true,maxRetries:5,retryDelay:200});
  }
});
