// NovelAI 官网、原生中转及 Images 兼容连接。测试窗口和聊天共用此模块。
(function () {
  'use strict';
  const OFFICIAL = 'https://image.novelai.net';
  const builtinModels = ['nai-diffusion-4-5-full', 'nai-diffusion-4-5-curated', 'nai-diffusion-5-full', 'nai-diffusion-5-curated', 'nai-diffusion-3'];
  const connectionFields = ['endpoint', 'protocol', 'address_mode', 'models_url', 'model_family', 'proxy_scope', 'cors_proxy', 'custom_proxy_url'];
  function httpUrl(value) {
    let u;
    try { u = new URL(String(value).trim()); } catch (_) { throw new Error('请填写完整的 http:// 或 https:// 地址。'); }
    if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password) throw new Error('请使用不含用户名密码的 HTTP 地址，Key 请填写在 API Key 中。');
    u.hash = '';
    return u;
  }
  function resolve(settings = {}) {
    const u = httpUrl(settings.endpoint || OFFICIAL);
    const p = u.pathname.replace(/\/+$/, '');
    const full = settings.address_mode === 'full' || (settings.address_mode !== 'base' && /\/(?:generate-image(?:-stream)?|images\/generations)$/i.test(p));
    const protocol = settings.protocol === 'images' || (settings.protocol !== 'native' && /\/images\/generations$/i.test(p)) ? 'images' : 'native';
    if (!full) {
      let base = p;
      if (protocol === 'native' && !base) {
        if (u.hostname === 'nai.rinko.ai' || u.hostname === 'ynai.rinko.ai') base = '/native';
        else if (u.hostname === 'api.hamubox.com') base = '/v1/novelai';
        else if (u.hostname === 'api.taleapi.asia') base = '/v1';
      }
      u.pathname = protocol === 'native' ? base + '/ai/generate-image' : base + (/\/v1$/i.test(base) ? '' : '/v1') + '/images/generations';
    }
    return { url: u.href, protocol, stream: /\/generate-image-stream$/i.test(u.pathname), official: u.origin === OFFICIAL };
  }
  function modelsUrl(settings = {}) {
    if (String(settings.models_url || '').trim()) return httpUrl(settings.models_url).href;
    const target = resolve(settings), u = httpUrl(target.url);
    let p = u.pathname.replace(/\/(?:ai\/generate-image(?:-stream)?|nai\/generate-image|images\/generations)$/i, '').replace(/\/+$/, '');
    if ((u.hostname === 'nai.rinko.ai' || u.hostname === 'ynai.rinko.ai') && p === '/native') p = '';
    if (u.hostname === 'api.hamubox.com' && p === '/v1/novelai') p = '/v1';
    if (settings.address_mode === 'full' && !/\/(?:generate-image(?:-stream)?|images\/generations)$/i.test(new URL(target.url).pathname)) {
      throw new Error('这个生图地址使用特殊路径，请在高级连接设置中填写“模型列表地址”。');
    }
    u.pathname = p + (/\/v1$/i.test(p) ? '' : '/v1') + '/models';
    return u.href;
  }
  function proxyUrl(target, settings = {}) {
    let prefix = settings.cors_proxy === 'custom' ? settings.custom_proxy_url : settings.cors_proxy;
    if (!prefix) return target;
    // 老配置的公共代理继续只服务官网；自定义站点不继承官网的公共代理。
    if (new URL(resolve(settings).url).origin !== OFFICIAL && settings.proxy_scope !== 'always') return target;
    httpUrl(prefix);
    return prefix + (/[?=]$/.test(prefix) ? encodeURIComponent(target) : target);
  }
  function familyOf(model, requested = 'auto') {
    if (['v3', 'v4', 'v45', 'v5'].includes(requested)) return requested;
    if (/nai-diffusion-5/i.test(model)) return 'v5';
    if (/nai-diffusion-4-5|nai-diffusion-4-curated-preview/i.test(model)) return 'v45';
    if (/nai-diffusion-4/i.test(model)) return 'v4';
    if (/nai-diffusion-3/i.test(model)) return 'v3';
    throw new Error('站点使用了自定义模型名，请在高级连接设置中选择它对应的模型版本。');
  }
  function parameters(settings, model, prompt, negative) {
    if (/inpaint/i.test(model)) throw new Error('这是重绘专用模型，聊天文生图请换成不含 inpainting 的型号。');
    const family = familyOf(model, settings.model_family);
    const [width, height] = String(settings.resolution || '1024x1024').split('x').map(Number);
    if (![width, height].every(n => Number.isInteger(n) && n >= 64 && n <= 2048 && n % 64 === 0) || width * height > 3145728) throw new Error('图片尺寸需为64的倍数，边长64～2048，且总像素不能超过3145728。');
    const steps = Number(settings.steps ?? 28), scale = Number(settings.cfg_scale ?? 5);
    if (!Number.isInteger(steps) || steps < 1 || steps > 50 || !Number.isFinite(scale) || scale < 0 || scale > 10) throw new Error('请将步数设为1～50，引导强度设为0～10。');
    const seed = Number(settings.seed ?? -1);
    if (!Number.isInteger(seed) || seed < -1 || seed > 4294967295) throw new Error('种子需为-1（随机）或0～4294967295的整数。');
    const p = { width, height, scale, steps, sampler: settings.sampler || 'k_euler_ancestral', seed: seed === -1 ? Math.floor(Math.random() * 4294967296) : seed,
      n_samples: 1, ucPreset: Number(settings.uc_preset ?? 1), qualityToggle: settings.quality_toggle !== false,
      negative_prompt: negative || '', dynamic_thresholding: false, controlnet_strength: 1, legacy: false, cfg_rescale: 0,
      noise_schedule: family === 'v3' ? 'native' : 'karras' };
    if (family === 'v3') Object.assign(p, {sm: !!settings.smea, sm_dyn: !!settings.smea_dyn, add_original_image: false});
    else Object.assign(p, {params_version: 3, add_original_image: true, autoSmea: false, legacy_v3_extend: false,
      v4_prompt: {caption: {base_caption: prompt, char_captions: []}, use_coords: false, use_order: true},
      v4_negative_prompt: {caption: {base_caption: negative || '', char_captions: []}, legacy_uc: false},
      skip_cfg_above_sigma: null, use_coords: false, legacy_uc: false, normalize_reference_strength_multiple: true,
      inpaintImg2ImgStrength: 1, characterPrompts: [], deliberate_euler_ancestral_bug: false, prefer_brownian: true});
    return p;
  }
  function request(settings, model, prompt, negative) {
    const target = resolve(settings);
    const parameterSettings = target.protocol === 'images' && (!settings.model_family || settings.model_family === 'auto') && !/nai-diffusion-[345]/i.test(model)
      ? {...settings,model_family:'v45'} : settings;
    const p = parameters(parameterSettings, model, prompt, negative);
    let body = {input: prompt, model, action: 'generate', parameters: p};
    if (target.protocol === 'images') {
      body = {model, prompt, size: `${p.width}x${p.height}`, n: 1, response_format: 'b64_json'};
      const host = new URL(target.url).hostname;
      if (host === 'nai.rinko.ai' || host === 'ynai.rinko.ai') body.nai = {steps:p.steps, scale:p.scale, sampler:p.sampler, seed:p.seed, negative_prompt:negative || '', noise_schedule:p.noise_schedule, ucPreset:p.ucPreset, qualityToggle:p.qualityToggle};
      else if (host === 'api.taleapi.asia' || host === 'api.hamubox.com') Object.assign(body, {steps:p.steps, scale:p.scale, sampler:p.sampler, seed:p.seed, negative_prompt:negative || ''});
      // 未知兼容站只发送标准图片字段；不假装其支持NAI专有参数。
    }
    return {...target, body};
  }
  function imageMime(bytes) {
    if (bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71) return 'image/png';
    if (bytes[0] === 255 && bytes[1] === 216) return 'image/jpeg';
    if (bytes[0] === 82 && bytes[1] === 73 && bytes[8] === 87 && bytes[9] === 69) return 'image/webp';
    return '';
  }
  function dataUrl(bytes, mime) {
    let text = '';
    for (let i = 0; i < bytes.length; i += 32768) text += String.fromCharCode(...bytes.subarray(i, i + 32768));
    return `data:${mime};base64,${btoa(text)}`;
  }
  async function fromBytes(bytes) {
    const mime = imageMime(bytes);
    if (mime) return dataUrl(bytes, mime);
    if (bytes[0] === 80 && bytes[1] === 75) {
      if (typeof JSZip === 'undefined') throw new Error('图片解压组件尚未加载，请稍后再试。');
      const zip = await JSZip.loadAsync(bytes);
      const name = Object.keys(zip.files).find(n => !zip.files[n].dir && /\.(png|jpe?g|webp)$/i.test(n));
      if (!name) throw new Error('返回的ZIP中没有图片。');
      const img = await zip.files[name].async('uint8array');
      const type = imageMime(img);
      if (!type) throw new Error('ZIP内的图片格式无法识别。');
      return dataUrl(img, type);
    }
    throw new Error('站点没有返回可识别的图片，请检查生图地址与连接方式。');
  }
  async function imageValue(value) {
    if (value instanceof Uint8Array) return fromBytes(value);
    if (typeof value !== 'string' || !value.trim()) throw new Error('站点返回的图片内容为空。');
    value = value.trim();
    if (/^https?:\/\//i.test(value)) return httpUrl(value).href;
    if (/^data:/i.test(value)) {
      if (!/^data:image\/(?:png|jpeg|webp);base64,/i.test(value)) throw new Error('站点返回的图片格式不受支持。');
      value = value.slice(value.indexOf(',') + 1);
    }
    try { return await fromBytes(Uint8Array.from(atob(value.replace(/\s/g, '')), c => c.charCodeAt(0))); }
    catch (error) { if (error.name === 'InvalidCharacterError') throw new Error('站点返回的图片编码无效。'); throw error; }
  }
  function jsonImage(data) {
    if (data?.error) throw new Error(typeof data.error === 'string' ? data.error : data.error.message || '站点生图失败。');
    const image = data?.data?.[0] ?? data?.images?.[0] ?? data?.image ?? (Array.isArray(data) ? data[0] : null);
    if (image == null) throw new Error('站点返回的数据中没有图片。');
    return imageValue(typeof image === 'object' ? image.b64_json || image.url || image.image || image.data : image);
  }
  // 严格读取官方长度前缀MessagePack流；不把中间预览当最终图片。
  function unpack(bytes) {
    let pos = 0;
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), decoder = new TextDecoder();
    const need = n => { if (pos + n > bytes.length || n < 0) throw new Error('流式图片数据不完整。'); };
    const num = (n, fn) => { need(n); const v = view[fn](pos); pos += n; return v; };
    const raw = n => { need(n); const v = bytes.subarray(pos, pos + n); pos += n; return v; };
    function read(depth = 0) {
      if (depth > 40) throw new Error('流式数据嵌套过深。');
      need(1); const t = bytes[pos++];
      if (t < 128) return t;
      if (t >= 224) return t - 256;
      const array = n => { if (n > bytes.length) throw new Error('无效流式数据。'); return Array.from({length:n}, () => read(depth + 1)); };
      const map = n => { if (n > bytes.length) throw new Error('无效流式数据。'); const o = Object.create(null); for (let i=0;i<n;i++) o[String(read(depth + 1))] = read(depth + 1); return o; };
      if ((t & 224) === 160) return decoder.decode(raw(t & 31));
      if ((t & 240) === 144) return array(t & 15);
      if ((t & 240) === 128) return map(t & 15);
      switch (t) {
        case 192: return null; case 194: return false; case 195: return true;
        case 196: return raw(num(1,'getUint8')); case 197: return raw(num(2,'getUint16')); case 198: return raw(num(4,'getUint32'));
        case 202: return num(4,'getFloat32'); case 203: return num(8,'getFloat64');
        case 204: return num(1,'getUint8'); case 205: return num(2,'getUint16'); case 206: return num(4,'getUint32');
        case 207: return Number(num(8,'getBigUint64')); case 211: return Number(num(8,'getBigInt64'));
        case 208: return num(1,'getInt8'); case 209: return num(2,'getInt16'); case 210: return num(4,'getInt32');
        case 217: return decoder.decode(raw(num(1,'getUint8'))); case 218: return decoder.decode(raw(num(2,'getUint16'))); case 219: return decoder.decode(raw(num(4,'getUint32')));
        case 220: return array(num(2,'getUint16')); case 221: return array(num(4,'getUint32'));
        case 222: return map(num(2,'getUint16')); case 223: return map(num(4,'getUint32'));
        default: throw new Error('站点返回了不支持的流式数据格式。');
      }
    }
    const result = read(); if (pos !== bytes.length) throw new Error('流式帧中含有多余数据。'); return result;
  }
  async function parseResponse(response, target) {
    const type = (response.headers.get('content-type') || '').toLowerCase();
    if (!response.ok) {
      const hints = {401:'Key无效或未填写',402:'站点额度不足',403:'Key无权使用该模型',404:'生图地址不存在',429:'站点限流或额度达到上限'};
      let message = hints[response.status] || '站点请求失败';
      try { const text = await response.text(), data = JSON.parse(text); message += '：' + (data.error?.message || data.message || (typeof data.error === 'string' ? data.error : '请检查站点使用日志')); } catch (_) {}
      throw new Error(`${message}（${response.status}）`);
    }
    if (type.includes('json')) return jsonImage(await response.json());
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (type.includes('text/event-stream')) {
      let final = null;
      for (const block of new TextDecoder().decode(bytes).replace(/\r\n/g,'\n').split('\n\n')) {
        const raw = block.split('\n').filter(l => l.startsWith('data:')).map(l => l.slice(5).trimStart()).join('\n');
        if (!raw || raw === '[DONE]') continue;
        let event; try { event = JSON.parse(raw); } catch (_) { continue; }
        if (event.error || event.event_type === 'error') throw new Error(event.error?.message || event.message || '站点流式生成失败。');
        if (event.event_type === 'final' || event.type === 'image_generation.completed') final = event.image || event.data || event.b64_json;
      }
      if (!final) throw new Error('流式返回缺少最终图片，生成结果未确认，请先查看站点记录。');
      return imageValue(final);
    }
    if (target.stream && !imageMime(bytes) && !(bytes[0] === 80 && bytes[1] === 75)) {
      let pos = 0, final = null;
      while (pos < bytes.length) {
        if (pos + 4 > bytes.length) throw new Error('流式图片数据不完整。');
        const size = new DataView(bytes.buffer, bytes.byteOffset + pos,4).getUint32(0); pos += 4;
        if (!size || pos + size > bytes.length) throw new Error('流式图片数据不完整。');
        const frame = unpack(bytes.subarray(pos, pos + size)); pos += size;
        if (frame.event_type === 'error') throw new Error(frame.message || '站点流式生成失败。');
        if (frame.event_type === 'final') final = frame.image || frame.data;
      }
      if (!final) throw new Error('流式返回缺少最终图片。');
      return imageValue(final);
    }
    // 某些站点漏写JSON content-type。
    if (bytes[0] === 123 || bytes[0] === 91) return jsonImage(JSON.parse(new TextDecoder().decode(bytes)));
    return fromBytes(bytes);
  }
  async function timedFetch(url, options, consume, timeout = 300000) {
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), timeout);
    try { return await consume(await fetch(url, {...options, signal:controller.signal, credentials:'omit', cache:'no-store', redirect:'error'})); }
    catch (error) {
      if (error.name === 'AbortError') throw new Error('请求超时，结果尚未确认。请先查看站点记录，再决定是否重新生成。');
      if (error instanceof TypeError) throw new Error('连接失败，请检查地址、网络及站点是否允许网页调用。');
      throw error;
    } finally { clearTimeout(timer); }
  }
  async function generate(settings, model, key, prompt, negative) {
    if (!String(key || '').trim()) throw new Error('请先填写这个生图站点的API Key。');
    const target = request(settings, model, prompt, negative);
    const headers = {'Content-Type':'application/json', Authorization:'Bearer ' + key.trim()};
    const imageUrl = await timedFetch(proxyUrl(target.url,settings), {method:'POST',headers,body:JSON.stringify(target.body)}, r => parseResponse(r,target));
    return {imageUrl, fullPrompt:prompt};
  }
  async function listModels(settings, key) {
    if (resolve(settings).official && !settings.models_url) return {models:builtinModels.slice(), builtin:true};
    const url = modelsUrl(settings);
    return timedFetch(proxyUrl(url,settings), {method:'GET',headers:key?.trim() ? {Authorization:'Bearer ' + key.trim()} : {}}, async r => {
      if (!r.ok) throw new Error(r.status === 401 ? '这个站点拉取模型需要有效Key，请检查后再试。' : `拉取模型失败（${r.status}），可以保留当前模型或手动填写。`);
      const data = await r.json(), rows = Array.isArray(data) ? data : data.data || data.models;
      if (!Array.isArray(rows)) throw new Error('站点没有返回模型清单，可在高级连接设置中填写模型列表地址。');
      const models = [...new Set(rows.map(m => typeof m === 'string' ? m : m.id || m.name).filter(m => typeof m === 'string' && m.trim()))];
      if (!models.length) throw new Error('站点返回空模型清单，已保留当前选择。');
      return {models, builtin:false};
    }, 20000);
  }
  window.NovelAIConnection = {OFFICIAL, builtinModels, connectionFields, resolve, modelsUrl, proxyUrl, familyOf, parameters, request, parseResponse, generate, listModels};
})();
