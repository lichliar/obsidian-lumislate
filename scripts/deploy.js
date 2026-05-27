const fs = require('fs');
const path = require('path');

// 配置
const targetDir = 'E:/荔枝-知识中枢/.obsidian/plugins/obsidian-lumislate';
const filesToCopy = [
  ['dist/main.js', 'main.js'],
  ['dist/styles.css', 'styles.css'],
  ['manifest.json', 'manifest.json'],
];

// 确保目标目录存在
if (!fs.existsSync(targetDir)) {
  console.error('❌ 目标目录不存在:', targetDir);
  process.exit(1);
}

// 复制文件
let copied = 0;
for (const [src, dest] of filesToCopy) {
  const srcPath = path.resolve(src);
  const destPath = path.join(targetDir, dest);

  if (!fs.existsSync(srcPath)) {
    console.error('❌ 源文件不存在:', srcPath);
    continue;
  }

  fs.copyFileSync(srcPath, destPath);
  copied++;
  const size = (fs.statSync(destPath).size / 1024).toFixed(1);
  console.log(`  ✅ ${dest} (${size} KB)`);
}

// 确保 css 目录存在
const cssDir = path.join(targetDir, 'css');
if (!fs.existsSync(cssDir)) {
  fs.mkdirSync(cssDir, { recursive: true });
  console.log('  📁 css/');
}

console.log(`\n🚀 已部署 ${copied} 个文件到 ${targetDir}`);
