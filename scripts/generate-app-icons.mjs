import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';
import { chromium } from '@playwright/test';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const configPath = join(projectRoot, 'assets/app-icons.config.json');
const generatorPath = fileURLToPath(import.meta.url);
const configSource = await readFile(configPath, 'utf8');
const config = JSON.parse(configSource);
const sourcePath = join(projectRoot, config.source.file);
const [sourcePng, generatorSource] = await Promise.all([
  readFile(sourcePath),
  readFile(generatorPath, 'utf8'),
]);

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

const sourceSha256 = sha256(sourcePng);
if (sourceSha256 !== config.source.sha256) {
  throw new Error(`Logo nguồn sai SHA-256: ${sourceSha256}. Không sinh derivative từ file đã bị thay đổi.`);
}
if (config.artworkScale.numerator !== 2 || config.artworkScale.denominator !== 3) {
  throw new Error('Artwork app icon phải được scale đúng 2/3 theo yêu cầu thiết kế.');
}

const artworkScale = config.artworkScale.numerator / config.artworkScale.denominator;
const sourceDataUrl = `data:image/png;base64,${sourcePng.toString('base64')}`;

function iconSvg({ rounded, includeBackground }) {
  const background = includeBackground
    ? `<rect width="${config.canvasSize}" height="${config.canvasSize}"${rounded ? ` rx="${config.cornerRadius}"` : ''} fill="${config.colors.background}"/>`
    : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${config.canvasSize} ${config.canvasSize}" width="${config.canvasSize}" height="${config.canvasSize}" data-artwork-scale="${config.artworkScale.numerator}/${config.artworkScale.denominator}">
  <title>genAi Family</title>
  ${background}
  <g transform="translate(${config.canvasCenter} ${config.canvasCenter}) scale(${artworkScale}) translate(-${config.canvasCenter} -${config.canvasCenter})">
    <image x="0" y="0" width="${config.canvasSize}" height="${config.canvasSize}" preserveAspectRatio="xMidYMid meet" href="${sourceDataUrl}"/>
  </g>
</svg>
`;
}

async function writeBinary(relativePath, contents) {
  const destination = join(projectRoot, relativePath);
  await mkdir(dirname(destination), { recursive: true });
  await writeFile(destination, contents);
}

async function writeText(relativePath, contents) {
  await writeBinary(relativePath, Buffer.from(contents));
}

function crcTable() {
  return Array.from({ length: 256 }, (_, index) => {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value & 1) ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1);
    }
    return value >>> 0;
  });
}

const pngCrcTable = crcTable();

function pngChunk(type, data) {
  const typeBuffer = Buffer.from(type, 'ascii');
  const payload = Buffer.concat([typeBuffer, data]);
  let crc = 0xffffffff;
  for (const byte of payload) crc = pngCrcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  const result = Buffer.alloc(data.length + 12);
  result.writeUInt32BE(data.length, 0);
  typeBuffer.copy(result, 4);
  data.copy(result, 8);
  result.writeUInt32BE((crc ^ 0xffffffff) >>> 0, data.length + 8);
  return result;
}

function encodePng(rgba, size, includeAlpha) {
  const channels = includeAlpha ? 4 : 3;
  const rowLength = 1 + size * channels;
  const raw = Buffer.alloc(rowLength * size);
  for (let y = 0; y < size; y += 1) {
    const rowOffset = y * rowLength;
    raw[rowOffset] = 0;
    for (let x = 0; x < size; x += 1) {
      const sourceOffset = (y * size + x) * 4;
      const targetOffset = rowOffset + 1 + x * channels;
      raw[targetOffset] = rgba[sourceOffset];
      raw[targetOffset + 1] = rgba[sourceOffset + 1];
      raw[targetOffset + 2] = rgba[sourceOffset + 2];
      if (includeAlpha) raw[targetOffset + 3] = rgba[sourceOffset + 3];
    }
  }

  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = includeAlpha ? 6 : 2;
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([
    signature,
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

async function renderRgba(page, svg, size) {
  const source = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
  const encoded = await page.evaluate(async ({ imageSource, imageSize }) => {
    const image = new globalThis.Image();
    image.src = imageSource;
    await image.decode();
    const canvas = globalThis.document.createElement('canvas');
    canvas.width = imageSize;
    canvas.height = imageSize;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('Canvas 2D không khả dụng.');
    context.clearRect(0, 0, imageSize, imageSize);
    context.drawImage(image, 0, 0, imageSize, imageSize);
    const bytes = context.getImageData(0, 0, imageSize, imageSize).data;
    let binary = '';
    for (let offset = 0; offset < bytes.length; offset += 32768) {
      binary += String.fromCharCode(...bytes.subarray(offset, offset + 32768));
    }
    return btoa(binary);
  }, { imageSource: source, imageSize: size });
  return Buffer.from(encoded, 'base64');
}

function monochromeRgba(rgba, color) {
  const match = /^#([0-9a-f]{6})$/i.exec(color);
  if (!match) throw new Error(`Màu monochrome không hợp lệ: ${color}`);
  const rgb = [0, 2, 4].map((offset) => Number.parseInt(match[1].slice(offset, offset + 2), 16));
  const result = Buffer.alloc(rgba.length);
  for (let offset = 0; offset < rgba.length; offset += 4) {
    result[offset] = rgb[0];
    result[offset + 1] = rgb[1];
    result[offset + 2] = rgb[2];
    result[offset + 3] = rgba[offset + 3];
  }
  return result;
}

function adaptiveIcon(includeMonochrome = false) {
  return `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/app_icon_background" />
    <foreground android:drawable="@drawable/ic_launcher_foreground" />${includeMonochrome ? '\n    <monochrome android:drawable="@drawable/ic_launcher_monochrome" />' : ''}
</adaptive-icon>
`;
}

function bitmapDrawable(drawableName) {
  return `<?xml version="1.0" encoding="utf-8"?>
<bitmap xmlns:android="http://schemas.android.com/apk/res/android"
    android:src="@drawable/${drawableName}"
    android:antialias="true"
    android:filter="true"
    android:gravity="fill" />
`;
}

const iosSlots = [
  ['iphone', '20x20', '2x', 40], ['iphone', '20x20', '3x', 60],
  ['iphone', '29x29', '2x', 58], ['iphone', '29x29', '3x', 87],
  ['iphone', '40x40', '2x', 80], ['iphone', '40x40', '3x', 120],
  ['iphone', '60x60', '2x', 120], ['iphone', '60x60', '3x', 180],
  ['ipad', '20x20', '1x', 20], ['ipad', '20x20', '2x', 40],
  ['ipad', '29x29', '1x', 29], ['ipad', '29x29', '2x', 58],
  ['ipad', '40x40', '1x', 40], ['ipad', '40x40', '2x', 80],
  ['ipad', '76x76', '1x', 76], ['ipad', '76x76', '2x', 152],
  ['ipad', '83.5x83.5', '2x', 167], ['ios-marketing', '1024x1024', '1x', 1024],
];

const androidDirectory = config.outputs.androidResources;
const iosDirectory = config.outputs.iosAppIconSet;
const roundedSvg = iconSvg({ rounded: true, includeBackground: true });
const squareSvg = iconSvg({ rounded: false, includeBackground: true });
const transparentSvg = iconSvg({ rounded: false, includeBackground: false });

await Promise.all([
  writeBinary(config.source.publicFile, sourcePng),
  writeText(`${androidDirectory}/values/app_icon_colors.xml`, `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="app_icon_background">${config.colors.background}</color>\n</resources>\n`),
  writeText(`${androidDirectory}/drawable/ic_launcher_foreground.xml`, bitmapDrawable('app_icon_foreground_artwork')),
  writeText(`${androidDirectory}/drawable/ic_launcher_monochrome.xml`, bitmapDrawable('app_icon_monochrome_mask')),
  writeText(`${androidDirectory}/mipmap-anydpi-v26/ic_launcher.xml`, adaptiveIcon()),
  writeText(`${androidDirectory}/mipmap-anydpi-v26/ic_launcher_round.xml`, adaptiveIcon()),
  writeText(`${androidDirectory}/mipmap-anydpi-v33/ic_launcher.xml`, adaptiveIcon(true)),
  writeText(`${androidDirectory}/mipmap-anydpi-v33/ic_launcher_round.xml`, adaptiveIcon(true)),
]);

const browser = await chromium.launch({ headless: true });
const generatedPngs = [];

async function writeGeneratedPng(relativePath, png, size, colorType, role) {
  await writeBinary(relativePath, png);
  generatedPngs.push({
    path: relativePath,
    width: size,
    height: size,
    colorType,
    role,
    sha256: sha256(png),
  });
}

try {
  const page = await browser.newPage();

  for (const icon of config.pwaManifestIcons) {
    if (icon.type !== 'image/png' || !/^\d+x\d+$/.test(icon.sizes)) {
      throw new Error(`PWA icon không được hỗ trợ: ${JSON.stringify(icon)}`);
    }
    const [width, height] = icon.sizes.split('x').map(Number);
    if (width !== height) throw new Error(`PWA icon phải vuông: ${icon.src}`);
    const isMaskable = icon.purpose.split(/\s+/).includes('maskable');
    const rgba = await renderRgba(page, isMaskable ? squareSvg : roundedSvg, width);
    const png = encodePng(rgba, width, !isMaskable);
    await writeGeneratedPng(
      join('public', icon.src.replace(/^\//, '')),
      png,
      width,
      isMaskable ? 2 : 6,
      isMaskable ? 'pwa-maskable' : 'pwa-any',
    );
  }

  const faviconRgba = await renderRgba(page, roundedSvg, config.web.faviconSize);
  await writeGeneratedPng(
    join('public', config.web.favicon.replace(/^\//, '')),
    encodePng(faviconRgba, config.web.faviconSize, true),
    config.web.faviconSize,
    6,
    'favicon',
  );

  const appleTouchRgba = await renderRgba(page, squareSvg, config.web.appleTouchIconSize);
  await writeGeneratedPng(
    join('public', config.web.appleTouchIcon.replace(/^\//, '')),
    encodePng(appleTouchRgba, config.web.appleTouchIconSize, false),
    config.web.appleTouchIconSize,
    2,
    'apple-touch-icon',
  );

  const foregroundRgba = await renderRgba(page, transparentSvg, config.canvasSize);
  await writeGeneratedPng(
    `${androidDirectory}/drawable-nodpi/app_icon_foreground_artwork.png`,
    encodePng(foregroundRgba, config.canvasSize, true),
    config.canvasSize,
    6,
    'android-adaptive-foreground',
  );
  await writeGeneratedPng(
    `${androidDirectory}/drawable-nodpi/app_icon_monochrome_mask.png`,
    encodePng(monochromeRgba(foregroundRgba, config.colors.monochrome), config.canvasSize, true),
    config.canvasSize,
    6,
    'android-monochrome-mask',
  );

  for (const size of new Set(iosSlots.map((slot) => slot[3]))) {
    const rgba = await renderRgba(page, squareSvg, size);
    const relativePath = `${iosDirectory}/AppIcon-${size}.png`;
    await writeGeneratedPng(relativePath, encodePng(rgba, size, false), size, 2, 'ios-app-icon');
  }
} finally {
  await browser.close();
}

const iosContents = {
  images: iosSlots.map(([idiom, size, scale, pixels]) => ({
    filename: `AppIcon-${pixels}.png`, idiom, scale, size,
  })),
  info: { author: 'xcode', version: 1 },
};
await writeText(`${iosDirectory}/Contents.json`, `${JSON.stringify(iosContents, null, 2)}\n`);

const inputHash = createHash('sha256')
  .update(configSource)
  .update(sourcePng)
  .update(generatorSource)
  .digest('hex');
await writeText('assets/app-icons.generated.json', `${JSON.stringify({
  inputHash,
  source: {
    file: config.source.file,
    publicFile: config.source.publicFile,
    sha256: sourceSha256,
  },
  artworkScale: `${config.artworkScale.numerator}/${config.artworkScale.denominator}`,
  pngs: generatedPngs.sort((left, right) => left.path.localeCompare(right.path)),
}, null, 2)}\n`);

console.log(`Generated ${generatedPngs.length} PNG app-icon assets from the exact source at artwork scale ${config.artworkScale.numerator}/${config.artworkScale.denominator}.`);
