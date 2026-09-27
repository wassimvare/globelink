import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(path, 'utf8');
const pkg = JSON.parse(read('package.json'));
const lock = JSON.parse(read('package-lock.json'));
const platforms = process.argv[2] ? [process.argv[2]] : ['android', 'ios'];
assert(platforms.every((p) => ['android', 'ios'].includes(p)), 'Expected android or ios');

const versions = ['core', 'cli', 'ios', 'android'].map((name) => {
  assert(pkg.dependencies?.[`@capacitor/${name}`] || pkg.devDependencies?.[`@capacitor/${name}`]);
  return lock.packages[`node_modules/@capacitor/${name}`]?.version;
});
assert(versions[0] && versions.every((v) => v === versions[0]), 'Lock all Capacitor packages to the same version');

for (const platform of platforms) {
  const root = platform === 'android' ? 'android/app/src/main/assets' : 'ios/App/App';
  const config = JSON.parse(read(`${root}/capacitor.config.json`));
  assert.equal(config.appId, 'app.globelink.mobile');
  assert.equal(config.server.url, 'https://globelink-theta.vercel.app');
  assert.equal(config.server.cleartext, false);
  assert.equal(config.server.errorPath, 'offline.html');
  assert.equal(config.android.allowMixedContent, false);
  assert(!config.server.allowNavigation?.length, 'Do not expose the native bridge to other origins');
  for (const asset of ['index.html', 'offline.html', 'mobile.css']) {
    assert.equal(read(`${root}/public/${asset}`), read(`mobile/web/${asset}`), `Stale ${platform} asset: ${asset}; run cap sync`);
  }
  assert(!fs.existsSync(platform === 'android'
    ? 'android/app/src/main/java/app/globelink/mobile/GlobeLinkFirebaseMessagingService.kt'
    : 'ios/App/App/GlobeLinkVoIPPush.swift'), 'Unfinished call foundation must not be shipped');
  console.log(`${platform}: native configuration and packaged assets OK`);
}

console.log(`GlobeLink online test build — Capacitor ${versions[0]}. Native call push is not enabled.`);
