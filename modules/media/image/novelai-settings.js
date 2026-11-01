(function () {
  'use strict';
  const fields = {endpoint:'novelai-endpoint', protocol:'novelai-protocol', address_mode:'novelai-address-mode', models_url:'novelai-models-url', model_family:'novelai-model-family', proxy_scope:'novelai-proxy-scope'};
  const defaults = {endpoint:window.NovelAIConnection.OFFICIAL, protocol:'auto', address_mode:'auto', models_url:'', model_family:'auto', proxy_scope:'official'};
  let generation = 0;
  const initialized = new WeakSet();
  const el = id => document.getElementById(id);
  function read() {
    const settings = {};
    for (const [key,id] of Object.entries(fields)) settings[key] = el(id)?.value.trim() ?? defaults[key];
    settings.endpoint ||= defaults.endpoint;
    return settings;
  }
  function scope(settings) { return JSON.stringify([settings.endpoint,settings.protocol,settings.address_mode,settings.models_url]); }
  function cache() { try { return JSON.parse(localStorage.getItem('novelai-model-cache') || '{}'); } catch (_) { return {}; } }
  function cached(settings) { return cache()[scope(settings)] || {}; }
  function status(text) { if (el('novelai-status')) el('novelai-status').textContent = text; }
  function modelOptions(settings, rows) {
    const list = el('novelai-model-options');
    if (!list) return;
    list.replaceChildren();
    let models = rows || cached(settings).models;
    if (!Array.isArray(models)) {
      try { models = window.NovelAIConnection.resolve(settings).official ? window.NovelAIConnection.builtinModels : []; }
      catch (_) { models = []; }
    }
    models = models.filter(m => typeof m === 'string').sort((a,b) => Number(/inpaint/i.test(a)) - Number(/inpaint/i.test(b)) || Number(!/nai|novel/i.test(a)) - Number(!/nai|novel/i.test(b)) || a.localeCompare(b));
    for (const id of models) {
      const option = document.createElement('option'); option.value = id;
      option.label = /inpaint/i.test(id) ? '重绘专用 · 聊天文生图请选择其他型号' : id;
      list.appendChild(option);
    }
  }
  function warn(settings) {
    try {
      const target = window.NovelAIConnection.resolve(settings);
      const host = new URL(target.url).hostname;
      if (target.protocol === 'images' && !['nai.rinko.ai','ynai.rinko.ai','api.taleapi.asia','api.hamubox.com'].includes(host)) return '此兼容连接只发送模型、提示词、尺寸和单张图片设置；步数、采样器及负面词需站点另行支持。';
      return '';
    } catch (_) { return ''; }
  }
  function load(settings = getNovelAISettings()) {
    generation++;
    for (const [key,id] of Object.entries(fields)) if (el(id)) el(id).value = settings[key] ?? defaults[key];
    modelOptions(read()); status(warn(read()));
  }
  function changed() {
    generation++;
    const settings = read(), entry = cached(settings);
    modelOptions(settings);
    // 地址切换后不沿用别站的模型；未保存的手填内容不会因拉取而清空。
    if (el('novelai-model')) el('novelai-model').value = entry.selected || '';
    if (el('novelai-model-family')) el('novelai-model-family').value = entry.family || 'auto';
    status(warn(settings) || '已切换站点，请填写对应Key并选择或拉取模型。');
  }
  function validate(settings, model) {
    window.NovelAIConnection.resolve(settings);
    if (settings.models_url) new URL(window.NovelAIConnection.modelsUrl(settings));
    if (!model.trim()) throw new Error('请先选择或填写生图模型。');
  }
  async function mirror(settings, values) {
    if (typeof db === 'undefined' || !db.apiConfig?.get) return;
    const record = await db.apiConfig.get('main') || {id:'main'};
    values ||= {novelaiSettings:settings, novelaiModel:localStorage.getItem('novelai-model'), novelaiApiKey:localStorage.getItem('novelai-api-key'), novelaiEnabled:localStorage.getItem('novelai-enabled') === 'true'};
    await db.apiConfig.put({...record,...values});
    if (typeof state !== 'undefined' && state.apiConfig) Object.assign(state.apiConfig,values);
  }
  async function save(settings = {...getNovelAISettings(),...read()}) {
    const model = el('novelai-model').value.trim(); validate(settings,model);
    const values = {novelaiSettings:settings,novelaiModel:model,novelaiApiKey:el('novelai-api-key').value.trim(),novelaiEnabled:el('novelai-switch').checked};
    // 先验证本地写入，数据库失败时恢复原本的运行配置。
    const writes = {'novelai-settings':JSON.stringify(settings),'novelai-model':model,'novelai-api-key':values.novelaiApiKey,'novelai-enabled':String(values.novelaiEnabled)};
    const previous = Object.fromEntries(Object.keys(writes).map(key => [key,localStorage.getItem(key)]));
    try {
      for (const [key,value] of Object.entries(writes)) localStorage.setItem(key,value);
      await mirror(settings,values);
    } catch (error) {
      for (const [key,value] of Object.entries(previous)) { try { if (value === null) localStorage.removeItem(key); else localStorage.setItem(key,value); } catch (_) {} }
      throw new Error('连接未保存：' + error.message);
    }
    const entries = cache(); entries[scope(read())] = {...cached(read()),selected:model,family:settings.model_family || 'auto'};
    // 最多缓存最近20个站点，失败不影响实际配置保存。
    try { localStorage.setItem('novelai-model-cache',JSON.stringify(Object.fromEntries(Object.entries(entries).slice(-20)))); } catch (_) {}
    status('已保存，测试和聊天将使用相同连接。' + (warn(settings) ? ' ' + warn(settings) : ''));
    return settings;
  }
  async function fetchModels() {
    const settings = {...getNovelAISettings(),...read()}, key = el('novelai-api-key').value.trim();
    const token = ++generation, signature = JSON.stringify([read(),key]);
    const button = el('novelai-fetch-models-btn'); button.disabled = true; button.textContent = '拉取中…';
    status('正在读取模型清单，不会生成图片。');
    try {
      const result = await window.NovelAIConnection.listModels(settings,key);
      if (generation !== token || signature !== JSON.stringify([read(),el('novelai-api-key').value.trim()])) return;
      modelOptions(settings,result.models);
      if (!el('novelai-model').value.trim()) el('novelai-model').value = result.models.find(m => /nai|novel/i.test(m) && !/inpaint/i.test(m)) || result.models.find(m => !/inpaint/i.test(m)) || '';
      const entries = cache(); entries[scope(read())] = {...cached(read()),models:result.models};
      try { localStorage.setItem('novelai-model-cache',JSON.stringify(Object.fromEntries(Object.entries(entries).slice(-20)))); } catch (_) {}
      status(result.builtin ? '官网使用内置模型清单，也可手动填写其他官方型号。' : `已拉取 ${result.models.length} 个型号，可输入关键词查找。重绘型号已标记；拿到清单不代表Key已通过生图验证。`);
    } catch (error) { if (generation === token) status(error.message); }
    finally { button.disabled = false; button.textContent = '拉取模型'; }
  }
  function init() {
    const button = el('novelai-fetch-models-btn');
    if (!button || initialized.has(button)) return;
    initialized.add(button);
    el('novelai-fetch-models-btn')?.addEventListener('click',fetchModels);
    el('novelai-save-connection-btn')?.addEventListener('click',() => save().catch(e => status(e.message)));
    for (const key of ['endpoint','protocol','address_mode','models_url']) el(fields[key])?.addEventListener('change',changed);
    el('novelai-api-key')?.addEventListener('input',() => { generation++; });
    el('novelai-model')?.addEventListener('input',() => { if (/inpaint/i.test(el('novelai-model').value)) status('重绘专用型号不能用于聊天文生图，请选择其他型号。'); });
  }
  window.NovelAISettings = {read,load,save,mirror,fetchModels,modelOptions,init};
})();
