import { createHash } from 'node:crypto';
import { access, readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateSync } from 'node:zlib';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (relativePath, encoding) => readFile(join(projectRoot, relativePath), encoding);
const [configSource, glyphSource, generatorSource, generatedSource] = await Promise.all([
  read('assets/app-icons.config.json', 'utf8'),
  read('assets/app-icon-glyph.svg', 'utf8'),
  read('scripts/generate-app-icons.mjs', 'utf8'),
  read('assets/app-icons.generated.json', 'utf8'),
]);
const config = JSON.parse(configSource);
const generated = JSON.parse(generatedSource);
const expectedHash = createHash('sha256')
  .update(configSource)
  .update(glyphSource)
  .update(generatorSource)
  .digest('hex');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function pngMetadata(buffer) {
  assert(buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])), 'PNG signature không hợp lệ.');
  assert(buffer.toString('ascii', 12, 16) === 'IHDR', 'PNG thiếu IHDR.');
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20), colorType: buffer[25] };
}

function pngHasVisibleArtwork(buffer) {
  const { width, height, colorType } = pngMetadata(buffer);
  const channels = colorType === 6 ? 4 : 3;
  assert(colorType === 2 || colorType === 6, 'PNG icon phải dùng RGB hoặc RGBA.');
  const idatChunks = [];
  let offset = 8;
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    if (type === 'IDAT') idatChunks.push(buffer.subarray(offset + 8, offset + 8 + length));
    offset += length + 12;
  }
  const raw = inflateSync(Buffer.concat(idatChunks));
  const rowLength = 1 + width * channels;
  const backgroundOffset = 1;
  const background = raw.subarray(backgroundOffset, backgroundOffset + channels);
  let differentPixels = 0;
  for (let y = 0; y < height; y += 1) {
    const rowOffset = y * rowLength;
    assert(raw[rowOffset] === 0, 'PNG generated phải dùng scanline filter 0 để kiểm tra deterministic.');
    for (let x = 0; x < width; x += 1) {
      const pixelOffset = rowOffset + 1 + x * channels;
      if (background.some((value, channel) => raw[pixelOffset + channel] !== value)) {
        differentPixels += 1;
      }
    }
  }
  return differentPixels > width * height * 0.01;
}

assert(config.artworkScale.numerator === 2 && config.artworkScale.denominator === 3, 'Artwork scale phải đúng 2/3.');
assert(generated.inputHash === expectedHash, 'Icon assets không đồng bộ với source/generator. Chạy npm run generate:icons.');
assert(generated.artworkScale === '2/3', 'Generated metadata không ghi đúng scale 2/3.');

for (const icon of config.pwaManifestIcons) {
  await access(join(projectRoot, 'public', icon.src.replace(/^\//, '')));
}
for (const expected of generated.pngs) {
  const png = await read(expected.path);
  const actual = pngMetadata(png);
  assert(actual.width === expected.width && actual.height === expected.height, `${expected.path} sai kích thước.`);
  assert(actual.colorType === expected.colorType, `${expected.path} sai color type; icon iOS/native phải không có alpha.`);
  assert(pngHasVisibleArtwork(png), `${expected.path} không có artwork nhìn thấy được.`);
}

const [anySvg, maskableSvg, manifest, viteConfig, indexHtml, androidV26, androidV33, androidColors, androidForeground, androidMonochrome, iosProject, iosContentsSource] = await Promise.all([
  read(`${config.outputs.pwaDirectory}/app-icon-any.svg`, 'utf8'),
  read(`${config.outputs.pwaDirectory}/app-icon-maskable.svg`, 'utf8'),
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
const scaleTransform = `scale(${config.artworkScale.numerator / config.artworkScale.denominator})`;
assert(anySvg.includes('data-artwork-scale="2/3"') && anySvg.includes(scaleTransform), 'PWA any SVG chưa scale artwork đúng 2/3.');
assert(maskableSvg.includes('data-artwork-scale="2/3"') && maskableSvg.includes(scaleTransform), 'PWA maskable SVG chưa scale artwork đúng 2/3.');
assert(anySvg.includes(`rx="${config.cornerRadius}"`), 'PWA any icon phải giữ rounded canvas riêng.');
assert(!maskableSvg.includes(' rx='), 'Maskable icon phải dùng canvas vuông full-bleed.');
assert(viteConfig.includes('iconConfig.pwaManifestIcons'), 'Vite PWA chưa dùng icon manifest trung tâm.');
assert(indexHtml.includes('/icons/app-icon-any.svg') && indexHtml.includes('/icons/apple-touch-icon-180.png'), 'HTML chưa tham chiếu favicon/apple touch icon mới.');
assert(manifest.includes('android:icon="@mipmap/ic_launcher"') && manifest.includes('android:roundIcon="@mipmap/ic_launcher_round"'), 'Android manifest thiếu launcher icon references.');
assert(androidV26.includes('@drawable/ic_launcher_foreground'), 'Android adaptive icon v26 thiếu foreground.');
assert(androidV33.includes('@drawable/ic_launcher_monochrome'), 'Android 13 adaptive icon thiếu monochrome layer.');
assert(androidForeground.includes('android:scaleX="0.6666666666666666"') && androidForeground.includes('android:scaleY="0.6666666666666666"'), 'Android foreground chưa scale đúng 2/3.');
assert(androidColors.includes(`<color name="app_icon_foreground_primary">${config.colors.foregroundPrimary}</color>`) && androidColors.includes(`<color name="app_icon_foreground_secondary">${config.colors.foregroundSecondary}</color>`), 'Android color resources chưa đồng bộ với cấu hình icon.');
assert(androidForeground.includes('@color/app_icon_foreground_primary') && androidForeground.includes('@color/app_icon_foreground_secondary'), 'Android foreground chưa dùng color resources dùng chung.');
assert(androidMonochrome.includes('@color/app_icon_foreground_primary'), 'Android monochrome chưa dùng color resource dùng chung.');
assert(!androidForeground.includes('android:fillColor="#') && !androidMonochrome.includes('android:fillColor="#'), 'Android vector không được lặp color literal.');
assert(iosProject.includes('ASSETCATALOG_COMPILER_APPICON_NAME: AppIcon'), 'iOS target chưa chọn AppIcon catalog.');

const iosContents = JSON.parse(iosContentsSource);
assert(iosContents.images.some((image) => image.idiom === 'ios-marketing' && image.filename === 'AppIcon-1024.png'), 'iOS catalog thiếu icon App Store 1024px.');
for (const image of iosContents.images) {
  await access(join(projectRoot, config.outputs.iosAppIconSet, image.filename));
}

console.log(`Verified ${generated.pngs.length} PNGs, PWA maskable/any icons, Android adaptive icons and iOS AppIcon catalog at artwork scale 2/3.`);
