// 全局向量接口只供 Embedding 使用，独立于聊天 API 预设。
(function () {
  const bindings = new WeakSet();
  const element = id => document.getElementById(`global-embedding-${id}`);
  const defaults = { enabled: false, endpoint: '', apiKey: '', model: 'text-embedding-3-small' };

  function read() {
    const saved = window.state?.apiConfig?.embeddingConfig || defaults;
    return {
      enabled: element('enabled')?.checked ?? saved.enabled,
      endpoint: (element('endpoint')?.value ?? saved.endpoint ?? '').trim(),
      apiKey: (element('apikey')?.value ?? saved.apiKey ?? '').trim(),
      model: (element('model')?.value ?? saved.model ?? '').trim()
    };
  }

  function validate(config, requireEnabled = false) {
    if (!config.enabled && !requireEnabled) return;
    let url;
    try { url = new URL(config.endpoint); } catch (_) { /* 在下方统一显示地址错误。 */ }
    if (!url || !['https:', 'http:'].includes(url.protocol)) throw new Error('全局向量 API：请填写有效的 http(s) 地址');
    if (!config.apiKey) throw new Error('全局向量 API：请填写 API Key');
    if (!config.model) throw new Error('全局向量 API：请填写向量模型');
  }

  function bind(id, type, listener) {
    const node = element(id);
    if (!node || bindings.has(node)) return;
    bindings.add(node);
    node.addEventListener(type, listener);
  }

  function render() {
    if (!element('enabled')) return;
    const config = { ...defaults, ...window.state?.apiConfig?.embeddingConfig };
    element('enabled').checked = config.enabled === true;
    element('endpoint').value = config.endpoint;
    element('apikey').value = config.apiKey;
    element('model').value = config.model;
    element('models').replaceChildren();
    const refresh = () => {
      element('fields').hidden = !element('enabled').checked;
      element('status').textContent = element('enabled').checked
        ? '供“跟随全局设置”的角色使用。点击右上角“完成”保存；更换接口或模型时可选择沿用已有向量，或保留旧套后手动重建。'
        : '未启用全局向量接口，现有角色继续按原设置使用。';
    };
    refresh();
    bind('enabled', 'change', refresh);
    bind('models', 'change', () => {
      if (element('models').value) element('model').value = element('models').value;
    });
    for (const id of ['endpoint', 'apikey', 'model']) bind(id, 'input', () => {
      element('status').textContent = '表单已修改，请重新测试并点击“完成”保存。';
      if (id !== 'model') element('models').replaceChildren();
    });
    bind('fetch', 'click', async () => {
      const button = element('fetch');
      button.disabled = true;
      element('status').textContent = '正在拉取模型…';
      try {
        const config = read();
        // 拉取列表不要求提前知道模型名。
        validate({ ...config, model: config.model || defaults.model }, true);
        const models = await window.vectorMemoryManager.fetchEmbeddingModels(config);
        if (JSON.stringify(read()) !== JSON.stringify(config)) throw new Error('表单已变化，请重新拉取');
        element('models').replaceChildren();
        const placeholder = document.createElement('option');
        placeholder.value = '';
        placeholder.textContent = '选择模型（也可手写）';
        element('models').appendChild(placeholder);
        models.forEach(model => {
          const option = document.createElement('option');
          option.value = model;
          option.textContent = model;
          element('models').appendChild(option);
        });
        element('status').textContent = models.length ? '已拉取模型，请选择支持 Embedding 的模型。' : '接口未返回可用模型，可手动填写。';
      } catch (error) {
        element('status').textContent = `拉取失败：${error.message}`;
      } finally {
        button.disabled = false;
      }
    });
    bind('test', 'click', async () => {
      const button = element('test');
      button.disabled = true;
      element('status').textContent = '正在测试向量接口…';
      try {
        const config = read();
        validate(config, true);
        const vector = await window.vectorMemoryManager._requestEmbedding('记忆向量接口连通性测试', config);
        element('status').textContent = JSON.stringify(read()) === JSON.stringify(config)
          ? `接口正常，返回 ${vector.length} 维向量。点击“完成”保存。`
          : '表单已变化，请重新测试。';
      } catch (error) {
        element('status').textContent = `测试失败：${error.message}`;
      } finally {
        button.disabled = false;
      }
    });
  }

  window.EmbeddingApiSettings = { read, validate, render };
})();
