/**
 * Generate app icons from SVG placeholder
 * Chạy: node scripts/generate-icons.js
 * Yêu cầu: sharp (npm install sharp --save-dev)
 *
 * Nếu không có sharp, copy logo192.png và logo512.png vào public/icons/
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ICONS_DIR = path.join(__dirname, '..', 'public', 'icons');
const PUBLIC_DIR = path.join(__dirname, '..', 'public');

const SIZES = [72, 96, 128, 144, 152, 192, 384, 512];

async function generateIcons() {
  // Đảm bảo thư mục tồn tại
  if (!fs.existsSync(ICONS_DIR)) {
    fs.mkdirSync(ICONS_DIR, { recursive: true });
  }

  try {
    const sharp = (await import('sharp')).default;

    // Ưu tiên dùng logo512.png nếu có
    let sourceFile = path.join(PUBLIC_DIR, 'logo512.png');
    if (!fs.existsSync(sourceFile)) {
      sourceFile = path.join(PUBLIC_DIR, 'logo.png');
    }

    if (!fs.existsSync(sourceFile)) {
      console.error('Không tìm thấy file logo gốc!');
      process.exit(1);
    }

    console.log(`Đang tạo icons từ: ${sourceFile}`);

    for (const size of SIZES) {
      const outputFile = path.join(ICONS_DIR, `icon-${size}x${size}.png`);
      await sharp(sourceFile)
        .resize(size, size, { fit: 'cover' })
        .png()
        .toFile(outputFile);
      console.log(`  ✓ icon-${size}x${size}.png`);
    }

    console.log('Hoàn tất!');
  } catch (err) {
    if (err.code === 'ERR_MODULE_NOT_FOUND') {
      console.log('sharp chưa được cài. Tạo icons bằng cách copy logo...');
      fallbackCopyIcons();
    } else {
      throw err;
    }
  }
}

function fallbackCopyIcons() {
  // Copy logo192 và logo512 vào icons dir
  const sources = [
    { src: 'logo192.png', sizes: [72, 96, 128, 144, 152, 192] },
    { src: 'logo512.png', sizes: [384, 512] }
  ];

  for (const { src, sizes } of sources) {
    const srcPath = path.join(PUBLIC_DIR, src);
    if (!fs.existsSync(srcPath)) {
      console.warn(`  ⚠ ${src} không tồn tại, bỏ qua`);
      continue;
    }
    for (const size of sizes) {
      const dest = path.join(ICONS_DIR, `icon-${size}x${size}.png`);
      fs.copyFileSync(srcPath, dest);
      console.log(`  ✓ icon-${size}x${size}.png (copy từ ${src})`);
    }
  }
  console.log('Hoàn tất! (placeholder - thay bằng icon đúng size sau)');
}

generateIcons();
