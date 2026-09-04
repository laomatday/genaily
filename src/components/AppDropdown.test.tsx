// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AppDropdown } from './AppDropdown';

describe('AppDropdown integration', () => {
  it('supports keyboard navigation and reports the selected option', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <AppDropdown
        ariaLabel="Môn học"
        placeholder="Chọn môn"
        value=""
        options={[
          { value: 'math', label: 'Toán' },
          { value: 'literature', label: 'Ngữ văn' },
        ]}
        onChange={onChange}
      />,
    );

    const trigger = screen.getByRole('button', { name: 'Môn học: Chọn môn' });
    await user.click(trigger);
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    await user.keyboard('{ArrowDown}{Enter}');
    expect(onChange).toHaveBeenCalledWith('literature');
    expect(document.activeElement).toBe(trigger);
  });
});
