// scripts/convert-html-to-tsx.js
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..'); // project root
const newPagesDir = path.join(root, 'new pages');
const targetBase = path.join(root, 'frontend', 'app', 'pages');

if (!fs.existsSync(newPagesDir)) {
  console.error('new pages folder not found');
  process.exit(1);
}

fs.readdirSync(newPagesDir, { withFileTypes: true })
  .filter(dirent => dirent.isDirectory())
  .forEach(dirent => {
    const folder = dirent.name;
    const srcHtml = path.join(newPagesDir, folder, 'code.html');
    const srcImg = path.join(newPagesDir, folder, 'screen.png');
    if (!fs.existsSync(srcHtml)) {
      console.warn(`No HTML for ${folder}`);
      return;
    }
    const targetDir = path.join(targetBase, folder);
    if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });
    const pageTsx = `import html from '../../../new pages/${folder}/code.html?raw';

export default function Page() {
  return (
    <div className="min-h-screen bg-[#001712] text-[#cbe9df] p-8">
      <div dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}`;
    fs.writeFileSync(path.join(targetDir, 'page.tsx'), pageTsx, 'utf8');
    // copy image to public if exists
    if (fs.existsSync(srcImg)) {
      const publicImgDir = path.join(root, 'frontend', 'public', 'images', folder);
      if (!fs.existsSync(publicImgDir)) fs.mkdirSync(publicImgDir, { recursive: true });
      fs.copyFileSync(srcImg, path.join(publicImgDir, 'screen.png'));
    }
  });

console.log('Conversion complete');
