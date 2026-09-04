// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getChildAvatarSignedUrl } from '../lib/familyRepository.mutations';
import { ChildAvatar } from './ChildAvatar';

vi.mock('../lib/familyRepository.mutations', () => ({
  getChildAvatarSignedUrl: vi.fn(),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('ChildAvatar', () => {
  it('loads a private Supabase object path through a signed URL', async () => {
    vi.mocked(getChildAvatarSignedUrl).mockResolvedValueOnce(
      'https://example.test/signed-child-avatar.webp',
    );

    render(
      <ChildAvatar
        avatarPath="account-space/child-profile/avatar.webp"
        name="Khôi"
      />,
    );

    expect(screen.queryByRole('img')).toBeNull();
    await waitFor(() => {
      expect(screen.getByRole('img', { name: 'Ảnh đại diện của Khôi' }).getAttribute('src'))
        .toBe('https://example.test/signed-child-avatar.webp');
    });
    expect(getChildAvatarSignedUrl)
      .toHaveBeenCalledWith('account-space/child-profile/avatar.webp');
  });

  it('updates immediately when a new HTTPS avatar is received', () => {
    const { rerender } = render(<ChildAvatar name="Khôi" />);

    expect(screen.queryByRole('img')).toBeNull();
    rerender(
      <ChildAvatar
        avatarPath="https://example.test/latest-child-avatar.webp"
        name="Khôi"
      />,
    );

    expect(screen.getByRole('img', { name: 'Ảnh đại diện của Khôi' }).getAttribute('src'))
      .toBe('https://example.test/latest-child-avatar.webp');
  });
});
