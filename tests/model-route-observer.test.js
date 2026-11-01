const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
function fixture() {
  const state = { globalSettings: {} }, events = [];
  const c = vm.createContext({ window: { state, dispatchEvent: event => events.push(event.type) }, console, Event, TextDecoder, Uint8Array });
  vm.runInContext(read('modules/ai/model-route-observer.js'), c);
  vm.runInContext(read('modules/ai/response-parser.js'), c);
  return { c, state, observer: c.window.ModelRouteObserver, events };
}
test('默认关闭；缺失标识、相同、版本别名和系列差异分别展示，不凭回复内容猜测', () => {
  const { observer } = fixture();
  assert.equal(observer.start('gemini-pro'), null);
  const missing = observer.start('gemini-pro', true); missing.observe({ choices: [{ message: { content: '我是 Flash' } }] });
  assert.equal(missing.result().status, 'unknown');
  const same = observer.start('models/gemini-2.5-pro', true); same.observe({ modelVersion: 'gemini-2.5-pro' });
  assert.equal(same.result().status, 'same');
  const alias = observer.start('gemini-pro-latest', true); alias.observe({ modelVersion: 'gemini-2.5-pro' });
  assert.equal(alias.result().status, 'alias');
  const changed = observer.start('gemini-2.5-pro', true); changed.observe({ model: 'gemini-2.5-flash' });
  assert.equal(changed.result().status, 'different');
});
test('真实 SSE 解析器捕获仅有模型标识的分片、跨块分片及多次模型变化', async () => {
  const { c, observer } = fixture(); const observation = observer.start('gemini-pro', true);
  c.observe = payload => observation.observe(payload);
  const stream = new ReadableStream({ start(controller) {
    const text = 'data: {"model":"gemini-flash","choices":[]}\n\ndata: {"choices":[{"delta":{"content":"你好"}}]}\n\ndata: {"model":"gemini-pro","choices":[]}\n\ndata: [DONE]\n\n';
    const bytes = new TextEncoder().encode(text);
    for (let i = 0; i < bytes.length; i += 7) controller.enqueue(bytes.slice(i,i+7)); controller.close();
  } });
  c.response = { body: stream };
  const output = await vm.runInContext('readOpenAiStreamResponse(response, null, observe)', c);
  assert.equal(output, '你好'); assert.deepEqual([...observation.result().reported], ['gemini-flash', 'gemini-pro']);
  assert.equal(observation.result().status, 'different');
});
test('关闭时不写记录；记录上限20且只存模型摘要，不包含响应正文和密钥', () => {
  const { observer, events } = fixture(); const chat = {};
  observer.record(chat, null); assert.equal(chat.modelRouteObservations, undefined);
  for (let i=0; i<25; i++) {
    const observation = observer.start('requested', true);
    observation.observe({ model: 'returned', apiKey: 'secret', choices: [{ message: { content: 'private' } }] });
    observer.record(chat, observation);
  }
  assert.equal(chat.modelRouteObservations.length, 20); assert.equal(events.length, 25);
  assert.doesNotMatch(JSON.stringify(chat), /secret|private/);
});

test('同一响应优先具体版本，避免把代理返回的请求别名当成另一次路由', () => {
  const { observer } = fixture();
  const item = observer.start('gemini-pro-latest',true);
  item.observe({model:'gemini-pro-latest',modelVersion:'gemini-2.5-pro'});
  assert.deepEqual([...item.result().reported],['gemini-2.5-pro']);
  assert.equal(item.result().status,'alias');
});
