const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, '../../core-engine/dist');
const destDir = path.join(__dirname, '../src/core-engine');

function copyFolderRecursiveSync(source, target) {
  if (!fs.existsSync(target)) {
    fs.mkdirSync(target, { recursive: true });
  }

  if (fs.existsSync(source)) {
    const files = fs.readdirSync(source);
    files.forEach((file) => {
      const curSource = path.join(source, file);
      const curTarget = path.join(target, file);
      if (fs.lstatSync(curSource).isDirectory()) {
        copyFolderRecursiveSync(curSource, curTarget);
      } else {
        fs.copyFileSync(curSource, curTarget);
      }
    });
  }
}

console.log('📦 Copying core-engine dist → desktop src/core-engine...');
copyFolderRecursiveSync(srcDir, destDir);
console.log('✅ Core engine bundled successfully!');
