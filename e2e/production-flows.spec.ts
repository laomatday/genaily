import { expect, test, type Page } from '@playwright/test';

const deviceSetupStorageKeyPrefix = 'genai_family_device_setup_';

const parentEmail = process.env.E2E_PARENT_EMAIL;
const parentPassword = process.env.E2E_PARENT_PASSWORD;
const primaryChild = process.env.E2E_CHILD_NAME;
const secondaryChild = process.env.E2E_SECOND_CHILD_NAME;
const activitySubject = process.env.E2E_ACTIVITY_SUBJECT ?? 'Môn kiểm thử E2E';
const authenticatedSuiteEnabled = process.env.E2E_ALLOW_DATA_MUTATION === 'true'
  && Boolean(parentEmail && parentPassword && primaryChild);

async function signIn(page: Page): Promise<boolean> {
  await page.goto('/');
  await page.getByLabel('Email').fill(parentEmail!);
  await page.getByLabel('Mật khẩu').fill(parentPassword!);
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  const parentNavigation = page.getByRole('navigation', { name: 'Điều hướng dành cho phụ huynh' });
  const entryHeading = page.getByRole('heading', { name: 'Ai đang sử dụng ứng dụng?' });
  await expect(parentNavigation.or(entryHeading)).toBeVisible();
  const onboardingVisible = await entryHeading.isVisible();
  if (onboardingVisible) {
    await page.getByRole('button', { name: /Ba\/mẹ/ }).click();
  }
  await expect(parentNavigation).toBeVisible();
  return onboardingVisible;
}

async function selectChild(page: Page, childName: string) {
  await page.getByRole('button', { name: /Quản lý hồ sơ của/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Quản lý hồ sơ trẻ' });
  await expect(dialog).toBeVisible();
  const childOption = dialog.getByRole('button').filter({ hasText: childName }).first();
  if (await childOption.getAttribute('aria-current') !== 'true') await childOption.click();
  else await dialog.getByRole('button', { name: 'Đóng', exact: true }).click();
  await expect(page.getByRole('button', { name: `Quản lý hồ sơ của ${childName}` })).toBeVisible();
}

async function openAccountMenu(page: Page) {
  await page.getByRole('button', { name: 'Mở menu tài khoản' }).click();
  await expect(page.getByRole('dialog', { name: 'Menu tài khoản' })).toBeVisible();
}

async function passParentGate(page: Page) {
  const gate = page.getByRole('dialog', { name: 'Xác minh phụ huynh' });
  await expect(gate).toBeVisible();
  const passwordInput = gate.getByLabel('Mật khẩu tài khoản');
  await expect(passwordInput).toBeFocused();
  const focusStyle = await passwordInput.evaluate((element) => {
    const style = window.getComputedStyle(element);
    return { outlineStyle: style.outlineStyle, boxShadow: style.boxShadow };
  });
  expect(focusStyle.outlineStyle).toBe('none');
  expect(focusStyle.boxShadow).toBe('none');
  await passwordInput.fill(parentPassword!);
  await gate.getByRole('button', { name: 'Mở trang ba/mẹ' }).click();
  await expect(page.getByRole('navigation', { name: 'Điều hướng dành cho phụ huynh' })).toBeVisible();
}

test.describe('production flows on a reset test account', () => {
  test.skip(
    !authenticatedSuiteEnabled,
    'Requires E2E_ALLOW_DATA_MUTATION=true and dedicated Supabase E2E account variables.',
  );
  // These flows intentionally mutate one reset account. Retrying the whole
  // serial group would reuse the persisted onboarding/schedule state and turn
  // a transient failure into a misleading, non-idempotent retry.
  test.describe.configure({ mode: 'serial', retries: 0 });
  let onboardingSeen = false;

  test.beforeEach(async ({ page }) => {
    onboardingSeen = await signIn(page);
    await selectChild(page, primaryChild!);
  });

  test('first login asks for an entry mode only once', async ({ page }) => {
    expect(onboardingSeen).toBe(true);
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Ai đang sử dụng ứng dụng?' })).toHaveCount(0);
    await expect(page.getByRole('navigation', { name: 'Điều hướng dành cho phụ huynh' })).toBeVisible();
    const hasHorizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    expect(hasHorizontalOverflow).toBe(false);
  });

  test('changing children ends on the latest requested profile', async ({ page }) => {
    test.skip(!secondaryChild, 'Set E2E_SECOND_CHILD_NAME to exercise multi-child switching.');
    await selectChild(page, secondaryChild!);
    await page.reload();
    await expect(page.getByRole('button', { name: `Quản lý hồ sơ của ${secondaryChild}` })).toBeVisible();
    await selectChild(page, primaryChild!);
    await expect(page.getByRole('button', { name: `Quản lý hồ sơ của ${primaryChild}` })).toBeVisible();
  });

  test('a new device ignores cached child hints and requires the exact child profile', async ({ page }) => {
    test.skip(!secondaryChild, 'Set E2E_SECOND_CHILD_NAME to exercise explicit child selection.');

    await page.evaluate((setupPrefix) => {
      Object.keys(localStorage)
        .filter((key) => key.startsWith(setupPrefix))
        .forEach((key) => localStorage.removeItem(key));
    }, deviceSetupStorageKeyPrefix);
    await page.goto('/?role=child');

    await expect(page.getByRole('heading', { name: 'Ai đang sử dụng ứng dụng?' })).toBeVisible();
    await page.getByRole('button', { name: /^Trẻ/ }).click();
    await expect(page.getByRole('heading', { name: 'Chọn hồ sơ của con' })).toBeVisible();
    const childOptions = page.locator('.entry-mode-child-option');
    await expect(childOptions.filter({ hasText: primaryChild! })).toBeVisible();
    await childOptions.filter({ hasText: secondaryChild! }).click();

    await expect(page.getByRole('navigation', { name: 'Điều hướng dành cho trẻ' })).toBeVisible();
    await expect(page.getByText(secondaryChild!, { exact: true }).first()).toBeVisible();
  });

  test('saving a learning schedule keeps Study Lock mandatory', async ({ page }) => {
    await page.getByRole('button', { name: 'Lịch', exact: true }).click();
    await page.getByRole('button', { name: 'Thiết lập' }).click();
    await page.getByRole('button', { name: 'Thêm hoạt động', exact: true }).click();

    const subjectDropdown = page.getByRole('button', { name: /^Môn học:/ });
    await subjectDropdown.click();
    await page.getByRole('option', { name: 'Khác…' }).click();
    await page.getByLabel('Tên môn học khác').fill(activitySubject);
    await page.locator('input[type="time"]').fill(process.env.E2E_ACTIVITY_TIME ?? '04:00');
    await page.locator('input[type="number"]').fill('15');

    const studyLock = page.getByRole('switch', { name: /Khóa tập trung/ });
    await expect(studyLock).toBeChecked();
    await expect(studyLock).toBeDisabled();
    await page.getByRole('button', { name: 'Lưu thay đổi thời khóa biểu' }).click();
    await expect(page.getByRole('heading', { name: 'Lịch học cố định theo tuần' })).toBeVisible();
  });

  test('parent can configure a real XP milestone', async ({ page }) => {
    await page.getByRole('button', { name: 'Kế hoạch', exact: true }).click();
    await page.getByRole('button', { name: /Chỉnh sửa thưởng/ }).click();
    const dialog = page.getByRole('dialog', { name: 'Cột mốc & phần thưởng' });
    await dialog.getByLabel('Tên phần thưởng').fill('Phần thưởng E2E');
    await dialog.getByLabel('Mô tả').fill('Cột mốc được lưu trên Supabase');
    await dialog.getByLabel('Số XP cần tích lũy').fill('250');
    await dialog.getByRole('button', { name: 'Lưu phần thưởng' }).click();
    await expect(page.getByRole('heading', { name: 'Phần thưởng E2E' })).toBeVisible();
  });

  test('child mode requires Parent Gate before returning to parent controls', async ({ page }) => {
    await openAccountMenu(page);
    await page.getByRole('button', { name: /Góc của bé/ }).click();
    await expect(page.getByRole('navigation', { name: 'Điều hướng dành cho trẻ' })).toBeVisible();

    const parentShortcut = page.getByRole('button', { name: 'Phụ huynh', exact: true });
    const shortcutBox = await parentShortcut.boundingBox();
    expect(shortcutBox?.height ?? 0).toBeGreaterThanOrEqual(44);
    const shortcutIcon = parentShortcut.locator('.material-symbol-icon');
    const iconStyle = await shortcutIcon.evaluate((element) => {
      const style = window.getComputedStyle(element);
      return { fontSize: Number.parseFloat(style.fontSize), paddingLeft: Number.parseFloat(style.paddingLeft) };
    });
    expect(iconStyle.fontSize).toBeGreaterThanOrEqual(16);
    expect(iconStyle.paddingLeft).toBe(0);

    await openAccountMenu(page);
    await page.getByRole('button', { name: /Trang ba\/mẹ/ }).click();
    await passParentGate(page);
  });

  test('child mode replaces a stale parent dashboard in another open tab', async ({ page, context }) => {
    const secondPage = await context.newPage();
    await secondPage.goto('/');
    const secondParentNavigation = secondPage.getByRole('navigation', { name: 'Điều hướng dành cho phụ huynh' });
    await expect(secondParentNavigation).toBeVisible();

    await openAccountMenu(page);
    await page.getByRole('button', { name: /Góc của bé/ }).click();
    await expect(page.getByRole('navigation', { name: 'Điều hướng dành cho trẻ' })).toBeVisible();
    await expect(secondPage.getByRole('navigation', { name: 'Điều hướng dành cho trẻ' })).toBeVisible();
    await expect(secondParentNavigation).toHaveCount(0);

    await secondPage.close();
  });

  test('Study Lock runs from start through parent-approved unlock', async ({ page }) => {
    await openAccountMenu(page);
    await page.getByRole('button', { name: /Góc của bé/ }).click();
    const startButton = page.getByRole('button', { name: 'Bắt đầu buổi học' });
    await expect(startButton).toBeEnabled();
    await startButton.click();

    await expect(page.getByText('Study Lock', { exact: true }).first()).toBeVisible();
    await page.getByRole('button', { name: 'Bắt đầu tập trung' }).click();
    await page.getByRole('button', { name: /Hoàn thành & gửi ba\/mẹ duyệt/i }).click();
    await page.getByRole('button', { name: 'Ổn' }).click();
    await page.getByRole('button', { name: /Hoàn thành & Gửi Bố Mẹ duyệt/i }).click();
    await expect(page.getByRole('heading', { name: 'Đã gửi cho ba/mẹ.' })).toBeVisible();

    await page.getByRole('button', { name: 'Mở trang ba/mẹ' }).click();
    await passParentGate(page);
    const approveButton = page.getByRole('button', { name: /Duyệt & thưởng/ });
    await approveButton.click();
    await expect(approveButton).toHaveCount(0);
  });
});
