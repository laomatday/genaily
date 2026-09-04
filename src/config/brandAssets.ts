import { isSupabaseConfigured, supabase } from '../lib/supabase';

const DEFAULT_BRAND_ASSET_BUCKET = 'brand-assets';
const DEFAULT_BRAND_LOGO_PATH = 'logos/genaily-mark-v1.png';

function configuredValue(value: string | undefined, fallback: string): string {
  return value?.trim() || fallback;
}

export const BRAND_ASSETS = Object.freeze({
  bucket: configuredValue(
    import.meta.env.VITE_BRAND_ASSET_BUCKET,
    DEFAULT_BRAND_ASSET_BUCKET,
  ),
  logoPath: configuredValue(
    import.meta.env.VITE_BRAND_LOGO_PATH,
    DEFAULT_BRAND_LOGO_PATH,
  ),
  localLogoUrl: '/brand/genaily-mark-v1.png',
});

function resolveBrandLogoUrl(): string {
  if (!isSupabaseConfigured) return BRAND_ASSETS.localLogoUrl;

  const { data } = supabase.storage
    .from(BRAND_ASSETS.bucket)
    .getPublicUrl(BRAND_ASSETS.logoPath);

  return data.publicUrl || BRAND_ASSETS.localLogoUrl;
}

export const BRAND_LOGO_URL = resolveBrandLogoUrl();
