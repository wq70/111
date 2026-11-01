const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
function fixture() {
  let value = 0;
  const math = Object.create(Math); math.random = () => (value++ % 2) * 0.99;
  const state = { globalSettings: {}, chats: {} };
  const c = vm.createContext({ window: { state }, state, Math: math, console, setTimeout, clearTimeout });
  vm.runInContext(read('modules/ai/prompt-macros.js'), c);
  return { c, state, macros: c.window.PromptMacros };
}
const config = extra => ({ enabled: true, ...extra });

test('默认关闭不改变任何文本；各来源独立开关', async () => {
  const { macros } = fixture(); const text = '头部 {{random::甲::乙}}';
  assert.equal(macros.settings().enabled, false);
  assert.equal(await macros.session().render(text, 'prompts'), text);
  const session = macros.session(config({ scopes: { worldbooks: false } }));
  assert.equal(await session.render(text, 'worldbooks'), text);
  assert.equal(await session.render(text, 'presets'), '头部 甲');
});

test('random 新旧语法、嵌套和转义；每次重新抽选', async () => {
  const { macros } = fixture(); const s = macros.session(config());
  assert.equal(await s.render('{{random::甲::乙}}', 'prompts'), '甲');
  assert.equal(await s.render('{{random::甲::乙}}', 'prompts'), '乙');
  assert.equal(await s.render('{{random:甲,乙}}', 'presets'), '甲');
  assert.equal(await s.render('{{random::{{random::甲::乙}}::丙}}', 'worldbooks'), '乙');
  assert.equal(await s.render('{{random::甲\\:\\:乙}}', 'prompts'), '甲::乙');
});

test('关闭后可以保留原文或省略整个条目，未知宏不被误删', async () => {
  const { macros } = fixture();
  const s = macros.session({ enabled: false, offMode: 'omit' });
  assert.equal(await s.render('头部\n{{random::甲::乙}}\n尾部', 'worldbooks'), '');
  assert.equal(await s.render('保留 {{unknown::甲}}', 'worldbooks'), '保留 {{unknown::甲}}');
  const a = macros.session(config({ rules: [{ name: 'off', enabled: false, type: 'fixed', value: 'x', offMode: 'omit' }] }));
  assert.equal(await a.render('整条 {{off}}', 'presets'), '');
});

test('自定义固定、随机、参数宏；返回值不重新执行，作用范围和原配置不变', async () => {
  const { macros } = fixture();
  const cfg = config({ rules: [
    { name: 'fixed', type: 'fixed', value: '{{random::不要执行::不要执行}}' },
    { name: 'choose', type: 'random', value: '晴\n雨', scopes: { presets: false } },
    { name: 'join', type: 'template', value: '${1}-${2}' }
  ] });
  const before = JSON.stringify(cfg), s = macros.session(cfg);
  assert.equal(await s.render('{{fixed}}', 'prompts'), cfg.rules[0].value);
  assert.equal(await s.render('{{choose}}', 'presets'), '{{choose}}');
  assert.equal(await s.render('{{join::{{choose}}::乙}}', 'prompts'), '晴-乙');
  assert.equal(JSON.stringify(cfg), before);
  assert.throws(() => macros.session(config({ rules: [{ name: 'random', type: 'fixed' }] })), /重复/);
});

test('条目提示词只移除头部条目，保留其他条目、分隔符和存档', async () => {
  const { macros } = fixture();
  const items = [{ order: 0, content: '{{random::头一::头二}}' }, { order: 1, content: '正文 {{chat.name}}', separatorBefore: '\n---\n' }];
  const collections = { chat: { single: { items } } }, before = JSON.stringify(collections);
  const s = macros.session({ enabled: false, offMode: 'omit' }, collections);
  assert.equal(await s.prompt(items[0].content + '\n---\n' + items[1].content, 'single'), '正文 {{chat.name}}');
  assert.equal(JSON.stringify(collections), before);
});

test('实际世界书组装先展开来源，随后代入模板，插入的历史或人设不再被当作宏', async () => {
  const { c, state, macros } = fixture();
  state.worldBooks = [{ id: 1, name: '示例', content: [{ content: '{{random::设定甲::设定乙}}' }, { enabled: false, content: '关闭条目' }] }];
  c.allWorldBookIds = [1]; c.state = state;
  c.renderMacroEntry = macros.session(config()).render;
  let block = read('src/js-bundles/trigger-response/request-setup.jsfrag');
  block = block.slice(block.indexOf('      if (allWorldBookIds.length > 0)'), block.indexOf("      let musicContext = '';"));
  const result = await vm.runInContext('(async () => { let worldBookContent=""; ' + block + '; return worldBookContent; })()', c);
  assert.match(result, /设定甲/); assert.doesNotMatch(result, /random|关闭条目/);
  const helpers = read('modules/ai/context-and-uploads.js');
  vm.runInContext(helpers.slice(helpers.indexOf('  function replaceTemplateVars(')), c);
  c.content = result; c.persona = '{{random::人设原文::不执行}}';
  const prompt = vm.runInContext('replaceTemplateVars("{{worldBookContent}} / {{aiPersona}}", {worldBookContent:content, aiPersona:persona})', c);
  assert.match(prompt, /设定甲/); assert.match(prompt, /\{\{random::人设原文::不执行\}\}/);
});

test('高级脚本超时被终止，框架删除且消息通道关闭', async () => {
  const { c, macros } = fixture(); let frame, callback, removed = false, closed = false;
  c.document = { createElement() { frame = { setAttribute() {}, remove() { removed = true; } }; return frame; }, body: { appendChild() {} } };
  c.MessageChannel = class { constructor() { this.port1 = { close() { closed = true; } }; this.port2 = {}; } };
  c.setTimeout = fn => { callback = fn; return 1; }; c.clearTimeout = () => {};
  const pending = macros.runScript('while(true){}', [], '{{hang}}');
  assert.match(frame.srcdoc, /connect-src 'none'/); assert.equal(frame.hidden, true);
  callback(); await assert.rejects(pending, /超时/); assert.ok(removed && closed);
});

test('高级脚本经过实际 iframe 和 Worker 代码两层解析，正常返回及语法错误均能清理', async () => {
  const { c, macros } = fixture(); let frame, removed = 0;
  c.MessageChannel = class {
    constructor() {
      const first = this.port1 = { close() {} };
      this.port2 = { postMessage(data) { first.onmessage({ data }); } };
    }
  };
  c.document = {
    createElement() { frame = { setAttribute() {}, remove() { removed++; } }; return frame; },
    body: { appendChild(node) {
      const parent = {}, blobs = new Map(); let onMessage;
      const frameContext = { parent, Blob, Object,
        addEventListener(name, callback) { onMessage = callback; },
        URL: { createObjectURL(blob) { blobs.set('blob:test',blob); return 'blob:test'; }, revokeObjectURL() {} },
        Worker: class {
          constructor(url) { this.url = url; }
          terminate() {}
          postMessage(data) {
            blobs.get(this.url).text().then(async source => {
              const worker = { postMessage: value => this.onmessage({ data: value }) };
              try { vm.runInNewContext(source, worker); await worker.onmessage({ data }); }
              catch (error) { this.onerror(error); }
            });
          }
        }
      };
      const inner = node.srcdoc.slice(node.srcdoc.indexOf('<script>')+8,node.srcdoc.lastIndexOf('</script>'));
      vm.runInNewContext(inner,frameContext);
      node.contentWindow = { postMessage(data, target, ports) { onMessage({ source: parent, data, ports }); } };
      node.onload();
    } }
  };
  assert.equal(await macros.runScript('return args.join("-");', ['甲','乙'], '{{join::甲::乙}}'), '甲-乙');
  await assert.rejects(macros.runScript('return {', [], '{{bad}}'), /失败/);
  assert.equal(removed, 2);
});

test('结构化总结在代入聊天历史前处理提示词和总结世界书，默认关闭输出与旧方法一致', async () => {
  const { c, state } = fixture();
  vm.runInContext(read('modules/memory/structured-memory.js'), c);
  const manager = c.window.structuredMemoryManager;
  const chat = { originalName:'角色', settings: {aiPersona:'人设',myNickname:'用户'} };
  manager.serializeForPrompt = () => '已有记忆';
  state.worldBooks = [{name:'总结设定',content:[{content:'{{random::规则甲::规则乙}}'}]}];
  state.globalSettings.customSummaryPromptEnabled = true;
  state.globalSettings.customSummaryPrompt = '{{random::头甲::头乙}} {{角色名}} {{总结设定}} {{对话记录}}';
  const history = '{{random::历史原文::不执行}}';
  const old = manager.buildSummaryPrompt(chat,history,'范围');
  assert.equal(await manager.buildSummaryPromptForRequest(chat,history,'范围'),old);
  state.globalSettings.promptMacros = {enabled:true};
  const output = await manager.buildSummaryPromptForRequest(chat,history,'范围');
  assert.match(output,/规则甲/); assert.match(output,/头乙/); assert.match(output,/角色/);
  assert.match(output,/\{\{random::历史原文::不执行\}\}/);
});
