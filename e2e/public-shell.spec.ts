import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test('login shell is responsive, keyboard accessible and theme-aware', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Đăng nhập' })).toBeVisible();
  if (!process.env.E2E_SUPABASE_URL) {
    await expect(page.getByText('Chưa cấu hình Supabase')).toBeVisible();
  }

  const themeButton = page.getByRole('button', { name: /Chuyển sang giao diện/ });
  await themeButton.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

  await page.getByRole('button', { name: 'Tạo tài khoản' }).click();
  await expect(page.getByRole('heading', { name: 'Tạo tài khoản' })).toBeVisible();
  await expect(page.getByLabel('Email')).toBeVisible();
  await expect(page.getByLabel('Mật khẩu')).toBeVisible();

  await page.setViewportSize({ width: 320, height: 568 });
  const hasHorizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(hasHorizontalOverflow).toBe(false);

  const accessibility = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(accessibility.violations).toEqual([]);
});

test('entry-mode and reported control regressions remain usable on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto('/e2e/fixtures/ui-regression.html');
  await expect(page.getByRole('heading', { name: 'Ai đang sử dụng ứng dụng?' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Ba\/mẹ/ })).toBeVisible();
  expect(await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  )).toBe(false);
  const entryAccessibility = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(entryAccessibility.violations).toEqual([]);
  await page.getByRole('button', { name: 'Chuyển sang giao diện tối' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  const darkEntryAccessibility = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(darkEntryAccessibility.violations).toEqual([]);
  await page.getByRole('button', { name: /^Trẻ/ }).click();
  await expect(page.getByRole('button', { name: /Lớp/ })).toHaveCount(3);
  await page.getByRole('button', { name: /Bình.*Lớp 7/ }).click();
  await expect(page.locator('html')).toHaveAttribute(
    'data-fixture-selection',
    'child:10000000-0000-4000-8000-000000000023',
  );
  const hasHorizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(hasHorizontalOverflow).toBe(false);

  await page.goto('/e2e/fixtures/ui-regression.html?view=parent-gate');
  const passwordInput = page.getByLabel('Mật khẩu tài khoản');
  await expect(passwordInput).toBeFocused();
  const gateAccessibility = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(gateAccessibility.violations).toEqual([]);
  const focusStyle = await passwordInput.evaluate((element) => {
    const style = window.getComputedStyle(element);
    const primaryProbe = document.createElement('span');
    primaryProbe.style.color = 'var(--app-primary)';
    document.body.append(primaryProbe);
    const primaryColor = window.getComputedStyle(primaryProbe).color;
    primaryProbe.remove();
    return {
      outlineStyle: style.outlineStyle,
      boxShadow: style.boxShadow,
      borderColor: style.borderTopColor,
      borderWidth: style.borderTopWidth,
      primaryColor,
    };
  });
  expect(focusStyle).toEqual({
    outlineStyle: 'none',
    boxShadow: 'none',
    borderColor: focusStyle.primaryColor,
    borderWidth: '1px',
    primaryColor: focusStyle.primaryColor,
  });

  await page.goto('/e2e/fixtures/ui-regression.html?view=parent-pill');
  const parentButton = page.getByRole('button', { name: 'Phụ huynh' });
  const buttonBox = await parentButton.boundingBox();
  expect(buttonBox?.height ?? 0).toBeGreaterThanOrEqual(44);
  const iconStyle = await parentButton.locator('.material-symbol-icon').evaluate((element) => {
    const style = window.getComputedStyle(element);
    return {
      backgroundColor: style.backgroundColor,
      fontSize: Number.parseFloat(style.fontSize),
      paddingLeft: Number.parseFloat(style.paddingLeft),
    };
  });
  expect(iconStyle.backgroundColor).toBe('rgba(0, 0, 0, 0)');
  expect(iconStyle.fontSize).toBeGreaterThanOrEqual(16);
  expect(iconStyle.paddingLeft).toBe(0);
});

test('bottom navigation stays icon-only, touch-friendly and accessible at 320px', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });

  const cases = [
    {
      view: 'parent-nav',
      navigation: 'Điều hướng dành cho phụ huynh',
      labels: ['Hôm nay', 'Lịch', 'Kế hoạch', 'Học tập', 'Ngoại lệ'],
      nextActive: 'Lịch',
    },
    {
      view: 'child-nav',
      navigation: 'Điều hướng dành cho trẻ',
      labels: ['Nhiệm vụ', 'Lịch', 'Phần thưởng', 'Thành tựu'],
      nextActive: 'Phần thưởng',
    },
  ];

  for (const fixture of cases) {
    await page.goto(`/e2e/fixtures/ui-regression.html?view=${fixture.view}`);
    const navigation = page.getByRole('navigation', { name: fixture.navigation });
    await expect(navigation).toBeVisible();
    await expect(navigation.getByRole('button')).toHaveCount(fixture.labels.length);
    expect(await navigation.textContent()).toBe('');

    for (const label of fixture.labels) {
      const button = navigation.getByRole('button', { name: label });
      await expect(button).toHaveAttribute('title', label);
      const box = await button.boundingBox();
      expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
    }

    await navigation.getByRole('button', { name: fixture.nextActive }).click();
    await expect(navigation.getByRole('button', { name: fixture.nextActive })).toHaveAttribute('aria-current', 'page');
    expect(await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    )).toBe(false);

    await page.locator('html').evaluate((element) => element.setAttribute('data-theme', 'dark'));
    const accessibility = await new AxeBuilder({ page })
      .include('nav')
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    expect(accessibility.violations).toEqual([]);
  }
});
