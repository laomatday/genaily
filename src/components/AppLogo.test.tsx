// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppLogo } from './AppLogo';

vi.mock('../config/brandAssets', () => ({
  BRAND_ASSETS: {
    bucket: 'brand-assets',
    logoPath: 'logos/genaily-mark-v1.png',
    localLogoUrl: '/brand/genaily-mark-v1.png',
  },
  BRAND_LOGO_URL:
    'https://project-ref.supabase.co/storage/v1/object/public/brand-assets/logos/genaily-mark-v1.png',
}));

afterEach(cleanup);

describe('AppLogo', () => {
  it('loads the public Supabase asset and keeps the artwork at the shared 2/3 scale', () => {
    render(<AppLogo className="test-frame" />);

    const frame = screen.getByRole('img', { name: 'Logo genAi Family' }).parentElement;
    const logo = screen.getByRole('img', { name: 'Logo genAi Family' });

    expect(frame?.classList.contains('app-logo-frame')).toBe(true);
    expect(frame?.classList.contains('test-frame')).toBe(true);
    expect(logo.classList.contains('app-logo-image')).toBe(true);
    expect(logo.getAttribute('src')).toBe(
      'https://project-ref.supabase.co/storage/v1/object/public/brand-assets/logos/genaily-mark-v1.png',
    );
  });

  it('falls back to the bundled logo when the public asset cannot load', () => {
    render(<AppLogo />);
    const logo = screen.getByRole('img', { name: 'Logo genAi Family' });

    fireEvent.error(logo);

    expect(logo.getAttribute('src')).toBe('/brand/genaily-mark-v1.png');
  });
});
