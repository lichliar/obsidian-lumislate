const fs = require('fs');
const path = require('path');

// 配置
const targetDir = 'E:/荔枝-知识中枢/.obsidian/plugins/obsidian-lumislate';
const filesToCopy = [
  ['dist/main.js', 'main.js'],
  ['dist/styles.css', 'styles.css'],
  ['manifest.json', 'manifest.json'],
];

/** 递归复制目录 */
function copyDirSync(src, dest) {
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

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

// 复制 skills 目录
const skillsSrc = path.resolve('dist/skills');
const skillsDest = path.join(targetDir, 'skills');
if (fs.existsSync(skillsSrc)) {
  copyDirSync(skillsSrc, skillsDest);
  const skillCount = fs.readdirSync(skillsDest, { withFileTypes: true }).filter(e => e.isDirectory()).length;
  console.log(`  ✅ skills/ (${skillCount} 个 skill)`);
  copied++;
} else {
  console.warn('  ⚠️ dist/skills/ 不存在，跳过复制');
}

// 确保 css 目录存在
const cssDir = path.join(targetDir, 'css');
if (!fs.existsSync(cssDir)) {
  fs.mkdirSync(cssDir, { recursive: true });
  console.log('  📁 css/');
}

console.log(`\n🚀 已部署 ${copied} 项到 ${targetDir}`);
