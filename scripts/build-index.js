const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const projectRoot = path.resolve(__dirname, '..');
const fragmentDirectory = path.join(projectRoot, 'src', 'html');
const outputPath = path.join(projectRoot, 'index.html');
const assetManifestPath = path.join(projectRoot, 'asset-manifest.json');
const fragmentManifestPath = path.join(projectRoot, 'html-fragments.json');
const scriptManifestPath = path.join(projectRoot, 'modules', 'bootstrap', 'html-fragment-manifest.js');
const generatedFragmentDirectory = path.join(projectRoot, 'generated', 'html-fragments');
const pwaManifestPath = path.join(projectRoot, 'generated', 'pwa-assets.js');
const digest = value => crypto.createHash('sha256').update(value).digest('hex');

const fragments = [
  'document-head.html',
  'intro-and-home.html',
  'health-and-couple.html',
  'cphone.html',
  'myphone.html',
  'worldbook-and-presets.html',
  'api-settings-core.html',
  'api-settings-providers.html',
  'api-settings-data.html',
  'data-and-social-list.html',
  'chat-interface.html',
  'appearance-and-thoughts.html',
  'calls-and-social.html',
  'chat-settings-main.html',
  'chat-settings-extra.html',
  'feature-screens.html',
  'modals-general.html',
  'modals-feature.html',
  'modals-phone-and-finance.html',
  'online-and-myphone-modals.html',
  'games-and-document-tail.html'
];

const rawFragments = fragments.map(fragment => fs.readFileSync(path.join(fragmentDirectory, fragment), 'utf8').replace(/\r\n/g, '\n'));
const embeddedAssets = ['update-log.html', 'modules/rendering-rule-worker.js', 'modules/rendering-rule-engine.js', 'archive/330--main/index.html', 'tutorial.html'];
const localAssets = Array.from(rawFragments.join('').matchAll(/<(?:script|link)\b[^>]*(?:src|href)="([^"]+)"/gi), match => match[1])
  .filter(asset => !/^(?:https?:)?\/\//i.test(asset))
  .map(asset => asset.replace(/^\.\//, '').split(/[?#]/, 1)[0]).filter(Boolean);
const resourcePaths = Array.from(new Set(['manifest.json', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/messages.svg',
  'modules/bootstrap/register-service-worker.js', 'modules/bootstrap/document-loader.js', ...embeddedAssets, ...localAssets]));
const resourceData = new Map(resourcePaths.map(asset => {
  const bytes = fs.readFileSync(path.join(projectRoot, asset));
  return [asset, /\.(?:js|css|html|json)$/.test(asset) ? Buffer.from(bytes.toString('utf8').replace(/\r\n/g, '\n')) : bytes];
}));
// 所有入口和资源属于同一次构建，避免 PWA 更新后拼接新旧脚本。
const releaseVersion = digest(Buffer.concat([Buffer.from(rawFragments.join('')), Buffer.from(fs.readFileSync(path.join(projectRoot, 'sw.js'), 'utf8').replace(/\r\n/g, '\n')),
  ...resourcePaths.map(asset => Buffer.concat([Buffer.from(asset), resourceData.get(asset)]))])).slice(0, 20);
const versioned = asset => `${asset.split(/[?#]/, 1)[0]}?v=${releaseVersion}`;
function versionSource(source) {
  return source.replace(/<(?:script|link)\b[^>]*(?:src|href)="([^"]+)"[^>]*>/gi, (tag, asset) =>
    /^(?:https?:)?\/\//i.test(asset) ? tag : tag.replace(`"${asset}"`, `"${versioned(asset)}"`));
}
const fragmentScripts = fragments.map((fragment, index) => ({ outputName: fragment.replace(/\.html$/, '.js'), source: versionSource(rawFragments[index]) }));
const fragmentScriptPaths = fragmentScripts.map(fragment => versioned(`generated/html-fragments/${fragment.outputName}`));

const generatedFragmentScripts = fragmentScripts.map((fragment, index) => ({
  ...fragment,
  contents: `window.__EPHONE_HTML_PARTS[${index}] = ${JSON.stringify(fragment.source)
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029')};\n`
}));

const generatedScriptManifest = `window.__EPHONE_HTML_FRAGMENT_SCRIPTS = ${JSON.stringify(
  fragmentScriptPaths,
  null,
  2
)};\n`;

const generatedShell = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
  <meta name="theme-color" content="#000000">
  <meta name="mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
  <meta name="apple-mobile-web-app-title" content="EPhone">
  <title>EPhone</title>
  <link rel="manifest" href="${versioned('manifest.json')}">
  <link rel="icon" type="image/png" sizes="192x192" href="icons/icon-192.png">
  <link rel="apple-touch-icon" href="icons/icon-192.png">
  <script src="${versioned('modules/bootstrap/register-service-worker.js')}"></script>
</head>
<body>
  <noscript>此应用需要启用 JavaScript。</noscript>
  <script src="${versioned('modules/bootstrap/html-fragment-manifest.js')}"></script>
  <script src="${versioned('modules/bootstrap/document-loader.js')}"></script>
</body>
</html>
`;

const generatedFragmentManifest = `${JSON.stringify(fragments, null, 2)}\n`;

const generatedData = new Map([
  ['index.html', generatedShell], ['html-fragments.json', generatedFragmentManifest],
  ['modules/bootstrap/html-fragment-manifest.js', generatedScriptManifest],
  ...generatedFragmentScripts.map(fragment => [`generated/html-fragments/${fragment.outputName}`, fragment.contents])
]);
const releaseAssets = Array.from(new Set([...generatedData.keys(), ...resourcePaths])).map(asset => ({
  path: asset, url: versioned(asset), sha256: digest(generatedData.has(asset) ? generatedData.get(asset) : resourceData.get(asset))
}));
const generatedPwaManifest = `self.__EPHONE_RELEASE = ${JSON.stringify({ version: releaseVersion, assets: releaseAssets }, null, 2)};\n`;
const generatedAssetManifest = `${JSON.stringify(Array.from(new Set(['index.html', 'sw.js', 'generated/pwa-assets.js',
  ...releaseAssets.map(asset => asset.url)])), null, 2)}\n`;

if (process.argv.includes('--check')) {
  const currentHtml = fs.readFileSync(outputPath, 'utf8');
  if (currentHtml !== generatedShell) {
    console.error('index.html is out of sync with the generated document shell.');
    process.exit(1);
  }
  if (fs.readFileSync(fragmentManifestPath, 'utf8') !== generatedFragmentManifest) {
    console.error('html-fragments.json is out of sync with the fragment order.');
    process.exit(1);
  }
  if (fs.readFileSync(scriptManifestPath, 'utf8') !== generatedScriptManifest) {
    console.error('HTML fragment script manifest is out of sync with the fragment order.');
    process.exit(1);
  }
  for (const fragment of generatedFragmentScripts) {
    const output = path.join(generatedFragmentDirectory, fragment.outputName);
    if (!fs.existsSync(output) || fs.readFileSync(output, 'utf8') !== fragment.contents) {
      console.error(`${fragment.outputName} is out of sync with its HTML source fragment.`);
      process.exit(1);
    }
  }
  const currentAssetManifest = fs.readFileSync(assetManifestPath, 'utf8');
  if (currentAssetManifest !== generatedAssetManifest) {
    console.error('asset-manifest.json is out of sync with index.html.');
    process.exit(1);
  }
  if (!fs.existsSync(pwaManifestPath) || fs.readFileSync(pwaManifestPath, 'utf8') !== generatedPwaManifest) {
    console.error('PWA release assets are out of sync.'); process.exit(1);
  }
  console.log(`Document shell and ${fragments.length} HTML fragments verified.`);
} else {
  fs.mkdirSync(generatedFragmentDirectory, { recursive: true });
  fs.writeFileSync(outputPath, generatedShell);
  fs.writeFileSync(fragmentManifestPath, generatedFragmentManifest);
  fs.writeFileSync(scriptManifestPath, generatedScriptManifest);
  for (const fragment of generatedFragmentScripts) {
    fs.writeFileSync(
      path.join(generatedFragmentDirectory, fragment.outputName),
      fragment.contents
    );
  }
  fs.writeFileSync(assetManifestPath, generatedAssetManifest);
  fs.writeFileSync(pwaManifestPath, generatedPwaManifest);
  console.log(`Document shell and local scripts generated for ${fragments.length} HTML fragments.`);
}
