// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ChildNav } from './child/components/ChildNav';
import { ParentNav } from './parent/components/ParentNav';

afterEach(cleanup);

describe('bottom navigation', () => {
  it('keeps the parent navigation icon-only while preserving accessible names', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ParentNav active="today" onChange={onChange} />);

    const navigation = screen.getByRole('navigation', { name: 'Điều hướng dành cho phụ huynh' });
    const buttons = within(navigation).getAllByRole('button');
    expect(buttons).toHaveLength(5);
    expect(buttons.map((button) => button.getAttribute('title'))).toEqual([
      'Hôm nay',
      'Lịch',
      'Kế hoạch',
      'Học tập',
      'Ngoại lệ',
    ]);
    expect(navigation.textContent).toBe('');
    expect(screen.getByRole('button', { name: 'Hôm nay' }).getAttribute('aria-current')).toBe('page');

    await user.click(screen.getByRole('button', { name: 'Lịch' }));
    expect(onChange).toHaveBeenCalledWith('week');
  });

  it('keeps the child navigation icon-only and marks the active destination', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ChildNav active="rewards" onChange={onChange} />);

    const navigation = screen.getByRole('navigation', { name: 'Điều hướng dành cho trẻ' });
    const buttons = within(navigation).getAllByRole('button');
    expect(buttons).toHaveLength(4);
    expect(buttons.map((button) => button.getAttribute('title'))).toEqual([
      'Nhiệm vụ',
      'Lịch',
      'Phần thưởng',
      'Thành tựu',
    ]);
    expect(navigation.textContent).toBe('');
    expect(screen.getByRole('button', { name: 'Phần thưởng' }).getAttribute('aria-current')).toBe('page');

    await user.click(screen.getByRole('button', { name: 'Thành tựu' }));
    expect(onChange).toHaveBeenCalledWith('progress');
  });
});
