import { createHash } from 'node:crypto';
import { access, readFile } from 'node:fs/promises';
import { dirname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateSync } from 'node:zlib';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (relativePath, encoding) => readFile(join(projectRoot, relativePath), encoding);
const configSource = await read('assets/app-icons.config.json', 'utf8');
const config = JSON.parse(configSource);
const [sourcePng, generatorSource, generatedSource] = await Promise.all([
  read(config.source.file),
  read('scripts/generate-app-icons.mjs', 'utf8'),
  read('assets/app-icons.generated.json', 'utf8'),
]);
const generated = JSON.parse(generatedSource);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

function pngMetadata(buffer) {
  assert(buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])), 'PNG signature không hợp lệ.');
  assert(buffer.toString('ascii', 12, 16) === 'IHDR', 'PNG thiếu IHDR.');
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20), colorType: buffer[25] };
}

function decodedGeneratedPng(buffer) {
  const metadata = pngMetadata(buffer);
  const channels = metadata.colorType === 6 ? 4 : 3;
  assert(metadata.colorType === 2 || metadata.colorType === 6, 'PNG icon phải dùng RGB hoặc RGBA.');
  const idatChunks = [];
  let offset = 8;
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    if (type === 'IDAT') idatChunks.push(buffer.subarray(offset + 8, offset + 8 + length));
    offset += length + 12;
  }
  const raw = inflateSync(Buffer.concat(idatChunks));
  const rowLength = 1 + metadata.width * channels;
  for (let y = 0; y < metadata.height; y += 1) {
    assert(raw[y * rowLength] === 0, 'PNG generated phải dùng scanline filter 0 để kiểm tra deterministic.');
  }
  return { ...metadata, channels, raw, rowLength };
}

function pixelBounds(decoded, differs) {
  let minX = decoded.width;
  let minY = decoded.height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < decoded.height; y += 1) {
    for (let x = 0; x < decoded.width; x += 1) {
      const offset = y * decoded.rowLength + 1 + x * decoded.channels;
      if (!differs(decoded.raw, offset)) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  assert(maxX >= minX && maxY >= minY, 'PNG không có artwork nhìn thấy được.');
  return { minX, minY, maxX, maxY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

function artworkBoundsOnSolidCanvas(buffer) {
  const decoded = decodedGeneratedPng(buffer);
  const background = decoded.raw.subarray(1, 1 + decoded.channels);
  return pixelBounds(decoded, (raw, offset) => background.some((value, channel) => raw[offset + channel] !== value));
}

function alphaBounds(buffer) {
  const decoded = decodedGeneratedPng(buffer);
  assert(decoded.colorType === 6, 'Foreground Android phải là RGBA trong suốt.');
  return pixelBounds(decoded, (raw, offset) => raw[offset + 3] > 0);
}

function assertTwoThirdsBounds(bounds, canvasSize, label) {
  const heightRatio = bounds.height / canvasSize;
  assert(heightRatio >= 0.64 && heightRatio <= 0.69, `${label} không còn ở tỷ lệ 2/3 (height ratio ${heightRatio.toFixed(3)}).`);
}

async function assertMissing(relativePath) {
  try {
    await access(join(projectRoot, relativePath));
  } catch (error) {
    if (error?.code === 'ENOENT') return;
    throw error;
  }
  throw new Error(`${relativePath} là artifact cũ và phải được xóa.`);
}

const sourceSha256 = sha256(sourcePng);
assert(config.artworkScale.numerator === 2 && config.artworkScale.denominator === 3, 'Artwork scale phải đúng 2/3.');
assert(sourceSha256 === config.source.sha256, 'Logo canonical không khớp SHA-256 đã khóa trong cấu hình.');
assert(generated.source.sha256 === sourceSha256, 'Metadata không trỏ tới đúng logo canonical.');
assert(generated.source.file === config.source.file && generated.source.publicFile === config.source.publicFile, 'Metadata source path không đồng bộ cấu hình.');
assert(generated.artworkScale === '2/3', 'Generated metadata không ghi đúng scale 2/3.');

const expectedHash = createHash('sha256')
  .update(configSource)
  .update(sourcePng)
  .update(generatorSource)
  .digest('hex');
assert(generated.inputHash === expectedHash, 'Icon assets không đồng bộ với source/generator. Chạy npm run generate:icons.');

const publicSource = await read(config.source.publicFile);
assert(publicSource.equals(sourcePng), 'Logo fallback public phải là bản sao byte-for-byte của logo canonical, chưa được scale hoặc recompress.');
assert(normalize(join('public', config.source.publicUrl.replace(/^\//, ''))) === normalize(config.source.publicFile), 'publicUrl và publicFile của logo không trỏ cùng asset.');

for (const icon of config.pwaManifestIcons) {
  assert(icon.type === 'image/png', `Manifest chỉ được trỏ tới PNG đã rasterize: ${icon.src}`);
  await access(join(projectRoot, 'public', icon.src.replace(/^\//, '')));
}

let androidForeground;
let androidMonochrome;
for (const expected of generated.pngs) {
  const png = await read(expected.path);
  const actual = pngMetadata(png);
  assert(actual.width === expected.width && actual.height === expected.height, `${expected.path} sai kích thước.`);
  assert(actual.colorType === expected.colorType, `${expected.path} sai color type; icon iOS/Apple Touch phải là RGB không alpha.`);
  assert(sha256(png) === expected.sha256, `${expected.path} đã bị sửa sau khi generate.`);
  const decoded = decodedGeneratedPng(png);
  const visibleBounds = expected.role === 'android-adaptive-foreground' || expected.role === 'android-monochrome-mask'
    ? alphaBounds(png)
    : pixelBounds(decoded, (raw, offset) => {
      const background = raw.subarray(1, 1 + decoded.channels);
      return background.some((value, channel) => raw[offset + channel] !== value);
    });
  assert(visibleBounds.width * visibleBounds.height > expected.width * expected.height * 0.01, `${expected.path} không có artwork nhìn thấy được.`);
  if (expected.role === 'android-adaptive-foreground') androidForeground = png;
  if (expected.role === 'android-monochrome-mask') androidMonochrome = png;
}

assert(androidForeground && androidMonochrome, 'Thiếu raster foreground hoặc monochrome mask cho Android.');
assertTwoThirdsBounds(alphaBounds(androidForeground), config.canvasSize, 'Android adaptive foreground');

const foregroundDecoded = decodedGeneratedPng(androidForeground);
const monochromeDecoded = decodedGeneratedPng(androidMonochrome);
for (let y = 0; y < foregroundDecoded.height; y += 1) {
  for (let x = 0; x < foregroundDecoded.width; x += 1) {
    const foregroundOffset = y * foregroundDecoded.rowLength + 1 + x * 4;
    const monochromeOffset = y * monochromeDecoded.rowLength + 1 + x * 4;
    assert(foregroundDecoded.raw[foregroundOffset + 3] === monochromeDecoded.raw[monochromeOffset + 3], 'Android monochrome mask phải giữ nguyên alpha của logo foreground.');
  }
}

const maskable512 = generated.pngs.find((asset) => asset.role === 'pwa-maskable' && asset.width === 512);
assert(maskable512, 'Thiếu PWA maskable icon 512px.');
assertTwoThirdsBounds(artworkBoundsOnSolidCanvas(await read(maskable512.path)), maskable512.width, 'PWA maskable icon');

const [manifest, viteConfig, indexHtml, androidV26, androidV33, androidColors, androidForegroundXml, androidMonochromeXml, iosProject, iosContentsSource] = await Promise.all([
  read('mobile/android/app/src/main/AndroidManifest.xml', 'utf8'),
  read('vite.config.ts', 'utf8'),
  read('index.html', 'utf8'),
  read(`${config.outputs.androidResources}/mipmap-anydpi-v26/ic_launcher.xml`, 'utf8'),
  read(`${config.outputs.androidResources}/mipmap-anydpi-v33/ic_launcher.xml`, 'utf8'),
  read(`${config.outputs.androidResources}/values/app_icon_colors.xml`, 'utf8'),
  read(`${config.outputs.androidResources}/drawable/ic_launcher_foreground.xml`, 'utf8'),
  read(`${config.outputs.androidResources}/drawable/ic_launcher_monochrome.xml`, 'utf8'),
  read('mobile/ios/project.yml', 'utf8'),
  read(`${config.outputs.iosAppIconSet}/Contents.json`, 'utf8'),
]);

assert(viteConfig.includes('iconConfig.pwaManifestIcons'), 'Vite PWA chưa dùng icon manifest trung tâm.');
assert(viteConfig.includes('iconConfig.web.includeAssets'), 'PWA chưa precache logo fallback và favicon từ cấu hình trung tâm.');
assert(indexHtml.includes(config.web.favicon) && indexHtml.includes(config.web.appleTouchIcon), 'HTML chưa tham chiếu favicon/apple touch icon mới.');
assert(manifest.includes('android:icon="@mipmap/ic_launcher"') && manifest.includes('android:roundIcon="@mipmap/ic_launcher_round"'), 'Android manifest thiếu launcher icon references.');
assert(androidV26.includes('@drawable/ic_launcher_foreground'), 'Android adaptive icon v26 thiếu foreground.');
assert(androidV33.includes('@drawable/ic_launcher_monochrome'), 'Android 13 adaptive icon thiếu monochrome layer.');
assert(androidForegroundXml.includes('@drawable/app_icon_foreground_artwork'), 'Android foreground wrapper chưa dùng raster artwork.');
assert(androidMonochromeXml.includes('@drawable/app_icon_monochrome_mask'), 'Android monochrome wrapper chưa dùng raster alpha mask.');
assert(!androidForegroundXml.includes('scale') && !androidForegroundXml.includes('inset'), 'Android foreground đã bake 2/3 nên không được scale lần hai trong drawable XML.');
assert(androidColors.includes(`<color name="app_icon_background">${config.colors.background}</color>`), 'Android icon background chưa đồng bộ cấu hình.');
assert(!androidColors.includes('app_icon_foreground_'), 'Android color resources còn màu foreground vector cũ.');
assert(iosProject.includes('ASSETCATALOG_COMPILER_APPICON_NAME: AppIcon'), 'iOS target chưa chọn AppIcon catalog.');

const iosContents = JSON.parse(iosContentsSource);
assert(iosContents.images.some((image) => image.idiom === 'ios-marketing' && image.filename === 'AppIcon-1024.png'), 'iOS catalog thiếu icon App Store 1024px.');
for (const image of iosContents.images) {
  await access(join(projectRoot, config.outputs.iosAppIconSet, image.filename));
  const generatedEntry = generated.pngs.find((asset) => asset.path === join(config.outputs.iosAppIconSet, image.filename));
  assert(generatedEntry?.colorType === 2, `${image.filename} phải là RGB không alpha cho iOS.`);
}

await Promise.all([
  assertMissing('assets/app-icon-glyph.svg'),
  assertMissing('public/app-logo.svg'),
  assertMissing(`${config.outputs.pwaDirectory}/app-icon-any.svg`),
  assertMissing(`${config.outputs.pwaDirectory}/app-icon-maskable.svg`),
]);

console.log(`Verified exact canonical logo, ${generated.pngs.length} deterministic PNGs, PWA, Android adaptive/monochrome and iOS AppIcon assets at artwork scale 2/3.`);
