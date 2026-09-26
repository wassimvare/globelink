import fs from 'node:fs';

const required = ['capacitor.config.ts', 'package.json'];
const missing = required.filter((path) => !fs.existsSync(path));

if (missing.length) {
  console.error('Mobile setup incomplete:', missing.join(', '));
  process.exit(1);
}

const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
for (const dependency of ['@capacitor/core', '@capacitor/cli', '@capacitor/ios', '@capacitor/android']) {
  if (!pkg.dependencies?.[dependency] && !pkg.devDependencies?.[dependency]) {
    console.error(`Missing dependency: ${dependency}`);
    process.exit(1);
  }
}

console.log('GlobeLink mobile foundation: OK');
