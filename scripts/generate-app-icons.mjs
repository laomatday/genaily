import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';
import { chromium } from '@playwright/test';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const configPath = join(projectRoot, 'assets/app-icons.config.json');
const glyphPath = join(projectRoot, 'assets/app-icon-glyph.svg');
const generatorPath = fileURLToPath(import.meta.url);
const [configSource, glyphSource, generatorSource] = await Promise.all([
  readFile(configPath, 'utf8'),
  readFile(glyphPath, 'utf8'),
  readFile(generatorPath, 'utf8'),
]);
const config = JSON.parse(configSource);
const artworkScale = config.artworkScale.numerator / config.artworkScale.denominator;
const artworkScaleText = artworkScale.toString();
const glyphMarkup = glyphSource.match(/<g id="app-icon-glyph">([\s\S]*?)<\/g>/)?.[1]?.trim();
if (!glyphMarkup) throw new Error('Không đọc được artwork từ assets/app-icon-glyph.svg.');

function iconSvg({ rounded, includeBackground = true }) {
  const background = includeBackground
    ? `<rect width="${config.canvasSize}" height="${config.canvasSize}"${rounded ? ` rx="${config.cornerRadius}"` : ''} fill="${config.colors.background}"/>`
    : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${config.canvasSize} ${config.canvasSize}" width="${config.canvasSize}" height="${config.canvasSize}" data-artwork-scale="${config.artworkScale.numerator}/${config.artworkScale.denominator}">
  <title>genAi Family</title>
  ${background}
  <g transform="translate(${config.canvasCenter} ${config.canvasCenter}) scale(${artworkScaleText}) translate(-${config.canvasCenter} -${config.canvasCenter})">
    ${glyphMarkup}
  </g>
</svg>
`;
}

async function writeText(relativePath, contents) {
  const destination = join(projectRoot, relativePath);
  await mkdir(dirname(destination), { recursive: true });
  await writeFile(destination, contents);
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

function attribute(markup, name) {
  return markup.match(new RegExp(`${name}="([^"]+)"`))?.[1];
}

const androidColorResources = new Map([
  [config.colors.foregroundPrimary.toLowerCase(), '@color/app_icon_foreground_primary'],
  [config.colors.foregroundSecondary.toLowerCase(), '@color/app_icon_foreground_secondary'],
]);

function androidColorResource(color) {
  const resource = androidColorResources.get(color.toLowerCase());
  if (!resource) {
    throw new Error(`Màu ${color} trong glyph chưa có Android color resource tương ứng.`);
  }
  return resource;
}

function androidPaths(monochrome = false) {
  const elements = [...glyphMarkup.matchAll(/<(circle|path)\s+([^>]+)\/>/g)];
  return elements.map(([, type, attributes]) => {
    const originalFill = attribute(attributes, 'fill') ?? config.colors.foregroundPrimary;
    const fill = monochrome
      ? '@color/app_icon_foreground_primary'
      : androidColorResource(originalFill);
    const opacity = monochrome ? undefined : attribute(attributes, 'opacity');
    let pathData = attribute(attributes, 'd');
    if (type === 'circle') {
      const cx = Number(attribute(attributes, 'cx'));
      const cy = Number(attribute(attributes, 'cy'));
      const radius = Number(attribute(attributes, 'r'));
      pathData = `M${cx + radius},${cy} A${radius},${radius} 0 1,0 ${cx - radius},${cy} A${radius},${radius} 0 1,0 ${cx + radius},${cy} Z`;
    }
    return `        <path android:fillColor="${fill}"${opacity ? ` android:fillAlpha="${opacity}"` : ''} android:pathData="${pathData}" />`;
  }).join('\n');
}

function androidVector(monochrome = false) {
  return `<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="108dp"
    android:height="108dp"
    android:viewportWidth="${config.canvasSize}"
    android:viewportHeight="${config.canvasSize}">
    <group
        android:pivotX="${config.canvasCenter}"
        android:pivotY="${config.canvasCenter}"
        android:scaleX="${artworkScaleText}"
        android:scaleY="${artworkScaleText}">
${androidPaths(monochrome)}
    </group>
</vector>
`;
}

function adaptiveIcon(includeMonochrome = false) {
  return `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/app_icon_background" />
    <foreground android:drawable="@drawable/ic_launcher_foreground" />${includeMonochrome ? '\n    <monochrome android:drawable="@drawable/ic_launcher_monochrome" />' : ''}
</adaptive-icon>
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

const pwaDirectory = config.outputs.pwaDirectory;
const iosDirectory = config.outputs.iosAppIconSet;
const androidDirectory = config.outputs.androidResources;
const roundedSvg = iconSvg({ rounded: true });
const squareSvg = iconSvg({ rounded: false });
await Promise.all([
  writeText(`${pwaDirectory}/app-icon-any.svg`, roundedSvg),
  writeText(`${pwaDirectory}/app-icon-maskable.svg`, squareSvg),
  writeText(`${androidDirectory}/values/app_icon_colors.xml`, `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="app_icon_background">${config.colors.background}</color>\n    <color name="app_icon_foreground_primary">${config.colors.foregroundPrimary}</color>\n    <color name="app_icon_foreground_secondary">${config.colors.foregroundSecondary}</color>\n</resources>\n`),
  writeText(`${androidDirectory}/drawable/ic_launcher_foreground.xml`, androidVector()),
  writeText(`${androidDirectory}/drawable/ic_launcher_monochrome.xml`, androidVector(true)),
  writeText(`${androidDirectory}/mipmap-anydpi-v26/ic_launcher.xml`, adaptiveIcon()),
  writeText(`${androidDirectory}/mipmap-anydpi-v26/ic_launcher_round.xml`, adaptiveIcon()),
  writeText(`${androidDirectory}/mipmap-anydpi-v33/ic_launcher.xml`, adaptiveIcon(true)),
  writeText(`${androidDirectory}/mipmap-anydpi-v33/ic_launcher_round.xml`, adaptiveIcon(true)),
]);

const browser = await chromium.launch({ headless: true });
const generatedPngs = [];
try {
  const page = await browser.newPage();
  const roundedSizes = [192, 512];
  for (const size of roundedSizes) {
    const rgba = await renderRgba(page, roundedSvg, size);
    const relativePath = `${pwaDirectory}/app-icon-any-${size}.png`;
    await writeFile(join(projectRoot, relativePath), encodePng(rgba, size, true));
    generatedPngs.push({ path: relativePath, width: size, height: size, colorType: 6 });
  }

  const squareSizes = new Set([192, 512, 180, ...iosSlots.map((slot) => slot[3])]);
  const squarePngBySize = new Map();
  for (const size of squareSizes) {
    const rgba = await renderRgba(page, squareSvg, size);
    squarePngBySize.set(size, encodePng(rgba, size, false));
  }

  for (const size of [192, 512]) {
    const relativePath = `${pwaDirectory}/app-icon-maskable-${size}.png`;
    await writeFile(join(projectRoot, relativePath), squarePngBySize.get(size));
    generatedPngs.push({ path: relativePath, width: size, height: size, colorType: 2 });
  }
  const appleTouchPath = `${pwaDirectory}/apple-touch-icon-180.png`;
  await writeFile(join(projectRoot, appleTouchPath), squarePngBySize.get(180));
  generatedPngs.push({ path: appleTouchPath, width: 180, height: 180, colorType: 2 });

  for (const size of squareSizes) {
    if (!iosSlots.some((slot) => slot[3] === size)) continue;
    const relativePath = `${iosDirectory}/AppIcon-${size}.png`;
    await mkdir(dirname(join(projectRoot, relativePath)), { recursive: true });
    await writeFile(join(projectRoot, relativePath), squarePngBySize.get(size));
    generatedPngs.push({ path: relativePath, width: size, height: size, colorType: 2 });
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
  .update(glyphSource)
  .update(generatorSource)
  .digest('hex');
await writeText('assets/app-icons.generated.json', `${JSON.stringify({
  inputHash,
  artworkScale: `${config.artworkScale.numerator}/${config.artworkScale.denominator}`,
  pngs: generatedPngs.sort((left, right) => left.path.localeCompare(right.path)),
}, null, 2)}\n`);

console.log(`Generated ${generatedPngs.length} PNG app-icon assets at artwork scale ${config.artworkScale.numerator}/${config.artworkScale.denominator}.`);
