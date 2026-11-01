const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = file => fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8');

function fixture() {
  const elements = new Map();
  for (const id of ['language-output-mode-select', 'language-output-input', 'language-output-custom-row',
    'language-output-force-hint', 'language-translation-mode-select', 'language-translation-input',
    'language-translation-custom-row', 'language-switch-policy-select', 'language-policy-settings',
    'language-narration-mode-select', 'language-narration-custom-row']) {
    elements.set(id, { value: '', style: {}, dataset: {}, addEventListener() {} });
  }
  const context = vm.createContext({ window: {}, localStorage: { getItem: () => 'zh-CN' },
    document: { getElementById: id => elements.get(id), querySelectorAll: () => [] } });
  vm.runInContext(source('modules/chat/language-policy.js'), context);
  return { policy: context.window.languagePolicy, elements, context };
}

function chat(policy = {}) {
  return { settings: { enableBilingualMode: true, languagePolicy: {
    outputMode: 'forced', outputLanguage: 'ja-JP', ...policy
  } } };
}

test('强制语言可保存、重新打开并修改，退出强制模式恢复语言切换设置', () => {
  const { policy, elements } = fixture();
  const current = chat({ switchPolicy: 'explicit' });
  policy.loadSettingsUi(current);
  assert.equal(elements.get('language-output-mode-select').value, 'forced');
  assert.equal(elements.get('language-output-input').value, '日语（日本）');
  assert.equal(elements.get('language-output-custom-row').style.display, 'flex');
  assert.equal(elements.get('language-output-force-hint').style.display, 'block');
  assert.equal(elements.get('language-switch-policy-select').disabled, true);
  elements.get('language-output-input').value = 'ko-KR';
  assert.equal(policy.validateSettingsUi(true), '');
  policy.saveSettingsUi(current);
  const reopened = JSON.parse(JSON.stringify(current));
  policy.loadSettingsUi(reopened);
  assert.equal(elements.get('language-output-input').value, '韩语（韩国）');
  assert.equal(reopened.settings.languagePolicy.outputMode, 'forced');
  elements.get('language-output-mode-select').value = 'auto';
  policy.updateConditionalUi();
  assert.equal(elements.get('language-switch-policy-select').disabled, false);
  assert.equal(elements.get('language-switch-policy-select').value, 'explicit');
  assert.equal(elements.get('language-output-custom-row').style.display, 'none');
  assert.equal(elements.get('language-output-force-hint').style.display, 'none');
});

test('开启强制指定但语言为空时阻止保存，关闭语言功能不阻止保存', () => {
  const { policy, elements } = fixture();
  policy.loadSettingsUi(chat({ outputLanguage: '   ' }));
  assert.match(policy.validateSettingsUi(true), /强制指定语言.*填写角色输出语言/);
  assert.equal(policy.validateSettingsUi(false), '');
  elements.get('language-output-input').value = '四川话';
  assert.equal(policy.validateSettingsUi(true), '');
});

test('强制模式覆盖动态切换及明确切换要求，翻译和旁白仍使用独立设置', () => {
  const { policy } = fixture();
  for (const switchPolicy of ['dynamic', 'explicit', 'natural', 'strict']) {
    const current = chat({ switchPolicy, translationLanguage: 'en-US', narrationMode: 'fixed', narrationLanguage: 'zh-Hans-CN' });
    const prompt = policy.buildPrompt(current);
    assert.match(prompt, /强制输出语言.*日语（日本）/);
    assert.match(prompt, /即使用户在对话中要求改用其他语言/);
    assert.match(prompt, /语言保持策略：强制锁定指定语言/);
    assert.doesNotMatch(prompt, /可根据情境自然切换|只有用户明确要求切换语言时才切换/);
    assert.match(prompt, /目标为“英语（美国）.*的译文/);
    assert.match(prompt, /旁白与动作描写使用：简体中文/);
  }
});

test('不生成翻译时仍强制原文语言；关闭功能和旧模式不附加强制指令', () => {
  const { policy } = fixture();
  assert.match(policy.buildEnforcementPrompt(chat({ translationMode: 'none' })), /不生成翻译，只输出角色对白原文/);
  for (const outputMode of ['auto', 'persona', 'user', 'fixed']) {
    assert.equal(policy.buildEnforcementPrompt(chat({ outputMode })), '');
  }
  const disabled = chat();
  disabled.settings.enableBilingualMode = false;
  assert.equal(policy.buildPrompt(disabled), '');
  assert.equal(policy.buildEnforcementPrompt(disabled), '');
});

test('群聊只锁定选中成员，各成员可指定不同语言且旧覆盖不会取消强制模式', () => {
  const { policy } = fixture();
  const current = chat({ memberOverrides: { b: { outputMode: 'fixed', outputLanguage: 'ko-KR' } } });
  current.isGroup = true;
  current.members = [{ id: 'a', originalName: '甲' }, { id: 'b', originalName: '乙' }, { id: 'c', originalName: '丙' }];
  current.settings.bilingualCharacters = ['甲', '乙'];
  const prompt = policy.buildEnforcementPrompt(current);
  assert.match(prompt, /甲：.*日语（日本）/);
  assert.match(prompt, /乙：.*韩语（韩国）/);
  assert.doesNotMatch(prompt, /丙/);
  assert.equal(policy.resolvePolicyForSender(current, '乙').outputMode, 'forced');
  assert.equal(policy.resolvePolicyForSender(current, '乙').outputLanguage, 'ko-KR');
  assert.match(policy.buildPrompt(current, { isGroup: true }), /禁止强制添加译文：丙/);
});

test('自定义模板缺少语言占位符时，在共用请求出口追加强制规则', () => {
  const { context } = fixture();
  const requestSource = source('src/js-bundles/trigger-response/todo-diary-and-album-context.jsfrag');
  const start = requestSource.indexOf('      if (window.languagePolicy?.buildEnforcementPrompt)');
  const end = requestSource.indexOf('      let isGemini', start);
  assert.ok(start > requestSource.indexOf('systemPrompt += generationGuidance.block'));
  assert.ok(end > start);
  context.chat = chat();
  context.systemPrompt = '自定义模板：按照人设自由切换语言';
  vm.runInContext(requestSource.slice(start, end), context);
  assert.match(context.systemPrompt, /^自定义模板：[\s\S]*回复前必须核对：强制输出语言/);
  assert.match(context.systemPrompt, /日语（日本）/);
});
