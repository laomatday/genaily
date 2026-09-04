import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRandomUuid } from './randomId';

const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('createRandomUuid', () => {
  it('uses crypto.randomUUID when the browser provides it', () => {
    const expected = '123e4567-e89b-42d3-a456-426614174000';
    const randomUUID = vi.fn(() => expected);
    const getRandomValues = vi.fn();
    vi.stubGlobal('crypto', { randomUUID, getRandomValues });

    const result = createRandomUuid();

    expect(result).toBe(expected);
    expect(result).toMatch(UUID_V4_PATTERN);
    expect(randomUUID).toHaveBeenCalledOnce();
    expect(getRandomValues).not.toHaveBeenCalled();
  });

  it('creates a valid UUID v4 with getRandomValues when randomUUID is unavailable', () => {
    const getRandomValues = vi.fn((bytes: Uint8Array) => {
      bytes.set(Array.from({ length: 16 }, (_, index) => index));
      return bytes;
    });
    vi.stubGlobal('crypto', { getRandomValues });

    const result = createRandomUuid();

    expect(result).toBe('00010203-0405-4607-8809-0a0b0c0d0e0f');
    expect(result).toMatch(UUID_V4_PATTERN);
    expect(getRandomValues).toHaveBeenCalledOnce();
    expect(getRandomValues.mock.calls[0]?.[0]).toBeInstanceOf(Uint8Array);
    expect(getRandomValues.mock.calls[0]?.[0]).toHaveLength(16);
  });
});
