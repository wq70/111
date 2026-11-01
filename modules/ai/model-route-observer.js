// 只观察接口报告的模型标识，不向模型发身份问题，不额外调用 API。
(function () {
  'use strict';
  const clean = value => typeof value === 'string' ? value.trim().slice(0, 200) : '';
  const normalize = value => clean(value).toLowerCase().replace(/^.*\/models\//, '').replace(/^models\//, '');
  function family(value) {
    const model = normalize(value);
    if (!model.includes('gemini')) return '';
    if (/flash[-_ ]?lite/.test(model)) return 'flash-lite';
    if (model.includes('flash')) return 'flash';
    if (model.includes('pro')) return 'pro';
    return '';
  }
  function describe(requested, reported) {
    if (!reported.length) return { status: 'unknown', label: '无法判断', detail: '接口未报告模型标识。' };
    if (reported.every(model => normalize(model) === normalize(requested))) return { status: 'same', label: '接口报告一致', detail: '请求与返回的模型标识相同。' };
    if (reported.some(model => family(model) && family(requested) && family(model) !== family(requested))) {
      return { status: 'different', label: '可能切换模型', detail: '接口报告的模型系列与请求不同，请结合服务端记录核实。' };
    }
    return { status: 'alias', label: '模型标识不同', detail: '可能是具体版本、别名或路由差异，仅凭名称无法确认。' };
  }
  function start(requested, enabled = window.state?.globalSettings?.modelRouteObservation === true) {
    if (!enabled) return null;
    const reported = new Set();
    let truncated = false;
    return {
      observe(payload) {
        // 同一响应优先使用具体版本，避免把请求别名误当成另一轮路由。
        for (const value of clean(payload?.modelVersion) ? [payload.modelVersion] : [payload?.model]) {
          const model = clean(value);
          if (model && reported.size < 12) reported.add(model);
          else if (model && !reported.has(model)) truncated = true;
        }
      },
      result() {
        const models = [...reported];
        return { requested: clean(requested), reported: models, ...describe(requested, models), timestamp: Date.now(), truncated };
      }
    };
  }
  function record(chat, observation) {
    if (!observation) return;
    const result = observation.result();
    chat.modelRouteObservations = [...(chat.modelRouteObservations || []), result].slice(-20);
    window.dispatchEvent(new Event('model-route-observed'));
    return result;
  }
  window.ModelRouteObserver = { start, record, describe };
})();
