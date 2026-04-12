/**
 * Resize all 1024x1024 source icons to sm/md/lg/xl sizes
 * Run: node scripts/resize-icons.js
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const SOURCE_DIR = path.join(__dirname, '..', 'client', 'public', 'icons', '3d', 'source');
const OUTPUT_BASE = path.join(__dirname, '..', 'client', 'public', 'icons', '3d');

const SIZES = {
  sm: 24,
  md: 48,
  lg: 96,
  xl: 128,
};

async function main() {
  const files = fs.readdirSync(SOURCE_DIR).filter(f => f.endsWith('.png'));
  console.log('Resizing ' + files.length + ' icons to ' + Object.keys(SIZES).length + ' sizes...');

  // Ensure output directories exist
  for (const size of Object.keys(SIZES)) {
    fs.mkdirSync(path.join(OUTPUT_BASE, size), { recursive: true });
  }

  let processed = 0;
  // Process in batches of 10
  for (let i = 0; i < files.length; i += 10) {
    const batch = files.slice(i, i + 10);
    const promises = [];

    for (const file of batch) {
      const sourcePath = path.join(SOURCE_DIR, file);
      for (const [sizeName, px] of Object.entries(SIZES)) {
        const outPath = path.join(OUTPUT_BASE, sizeName, file);
        promises.push(
          sharp(sourcePath)
            .resize(px, px, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
            .png({ quality: 90, compressionLevel: 9 })
            .toFile(outPath)
            .catch(err => console.error('Error resizing ' + file + ' to ' + sizeName + ': ' + err.message))
        );
      }
    }

    await Promise.all(promises);
    processed += batch.length;
    process.stdout.write('\r  ' + processed + '/' + files.length);
  }

  console.log('\nDone! Check ' + OUTPUT_BASE);

  // Print size summary
  for (const [sizeName, px] of Object.entries(SIZES)) {
    const dir = path.join(OUTPUT_BASE, sizeName);
    const fileCount = fs.readdirSync(dir).length;
    const totalSize = fs.readdirSync(dir).reduce((sum, f) => sum + fs.statSync(path.join(dir, f)).size, 0);
    console.log('  ' + sizeName + ' (' + px + 'px): ' + fileCount + ' files, ' + Math.round(totalSize / 1024) + 'KB total');
  }
}

main().catch(console.error);
