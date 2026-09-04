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

test('parent header stays touch-friendly and collision-free at 320px', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto('/e2e/fixtures/ui-regression.html?view=parent-header');

  const header = page.locator('.parent-compact-header');
  const childButton = page.getByRole('button', { name: /Quản lý hồ sơ của Minh Triết/ });
  const notificationButton = page.getByRole('button', { name: 'Thông báo, 12 chưa đọc' });
  const accountButton = page.getByRole('button', { name: 'Mở menu tài khoản của Nguyễn Phụ huynh' });

  await expect(header).toBeVisible();
  await expect(childButton).not.toContainText('Lớp');
  await expect(header.locator('.parent-notification-badge')).toHaveText('9+');

  for (const button of [childButton, notificationButton, accountButton]) {
    const box = await button.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
  }

  const [childBox, notificationBox] = await Promise.all([
    childButton.boundingBox(),
    notificationButton.boundingBox(),
  ]);
  expect((childBox?.x ?? 0) + (childBox?.width ?? 0))
    .toBeLessThanOrEqual((notificationBox?.x ?? 0) + 1);
  expect(await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  )).toBe(false);

  const copyOverflow = await header.locator('.parent-child-copy b').evaluate((element) => {
    const style = window.getComputedStyle(element);
    return { overflow: style.overflow, textOverflow: style.textOverflow };
  });
  expect(copyOverflow).toEqual({ overflow: 'hidden', textOverflow: 'ellipsis' });

  const initialHeaderY = (await header.boundingBox())?.y;
  expect(await header.evaluate((element) => window.getComputedStyle(element).position)).toBe('sticky');
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
  expect((await header.boundingBox())?.y).toBeCloseTo(initialHeaderY ?? 0, 0);
  expect(await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  )).toBe(false);

  const lightAccessibility = await new AxeBuilder({ page })
    .include('.parent-compact-header')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(lightAccessibility.violations).toEqual([]);

  await page.locator('html').evaluate((element) => element.setAttribute('data-theme', 'dark'));
  const darkAccessibility = await new AxeBuilder({ page })
    .include('.parent-compact-header')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(darkAccessibility.violations).toEqual([]);
});

test('child header shows the saved avatar and name only, then stays fixed while scrolling', async ({ page }) => {
  await page.route('https://example.test/child-avatar.svg', async (route) => {
    await route.fulfill({
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="16" fill="#7c6ce7"/></svg>',
    });
  });
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto('/e2e/fixtures/ui-regression.html?view=child-header');

  const header = page.locator('.child-app-header');
  const avatar = page.getByRole('img', { name: 'Ảnh đại diện của Minh Triết' });
  const menuButton = page.getByRole('button', { name: 'Mở menu tài khoản của Minh Triết' });

  await expect(header).toBeVisible();
  await expect(header).toHaveAttribute('aria-label', 'Thanh điều khiển của bé');
  await expect(header.locator('.child-header-copy')).toHaveText('Minh Triết');
  await expect(header).not.toContainText('Lớp');
  await expect(header).not.toContainText('Tasks Learning');
  await expect(avatar).toHaveAttribute('src', 'https://example.test/child-avatar.svg');
  await expect.poll(() => avatar.evaluate((image) => image.naturalWidth)).toBeGreaterThan(0);

  const menuBox = await menuButton.boundingBox();
  expect(menuBox?.width ?? 0).toBeGreaterThanOrEqual(44);
  expect(menuBox?.height ?? 0).toBeGreaterThanOrEqual(44);
  await menuButton.click();
  await expect(page.locator('html')).toHaveAttribute('data-fixture-selection', 'child-menu');

  const initialHeaderY = (await header.boundingBox())?.y;
  expect(await header.evaluate((element) => window.getComputedStyle(element).position)).toBe('sticky');
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
  expect((await header.boundingBox())?.y).toBeCloseTo(initialHeaderY ?? 0, 0);
  expect(await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  )).toBe(false);

  const accessibility = await new AxeBuilder({ page })
    .include('.child-app-header')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(accessibility.violations).toEqual([]);
});
