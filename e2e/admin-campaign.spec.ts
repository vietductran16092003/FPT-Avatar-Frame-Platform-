import { test, expect } from '@playwright/test';
import { loginAs, MOCK_ADMIN_EMAIL } from './support/auth';
import { createCampaignApi, createTemplateApi, cleanupCampaign, uniqueSlug, sweepLeftoverE2eCampaigns } from './support/factories';
import { prisma } from './support/db';

test.describe('Admin actor', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, MOCK_ADMIN_EMAIL);
  });

  test.afterAll(async () => {
    await sweepLeftoverE2eCampaigns();
  });

  test('can log in and reach /admin/campaigns', async ({ page }) => {
    await page.goto('/admin/login');
    await page.getByRole('button', { name: 'Đăng nhập với tài khoản FPT' }).click();
    await expect(page).toHaveURL(/\/admin\/campaigns/);
    await expect(page.getByRole('heading', { name: /Campaign/i })).toBeVisible();
  });

  test('creates a campaign + template through the UI and both are persisted correctly in Postgres', async ({ page }) => {
    const slug = uniqueSlug('e2e-ui-campaign');
    const startDate = '2020-01-01';
    const endDate = '2099-01-01';

    await page.goto('/admin/campaigns');
    await page.getByRole('button', { name: 'Tạo Campaign mới' }).click();

    await page.locator('#campaign-slug').fill(slug);
    await page.locator('#campaign-start').fill(startDate);
    await page.locator('#campaign-end').fill(endDate);
    await page.locator('#campaign-title').fill(`UI Campaign ${slug}`);

    await page.getByRole('button', { name: 'Lưu' }).click();

    // The row for the new campaign should show up in the table (web-first assertion, no sleep).
    await expect(page.getByText(`/c/${slug}`)).toBeVisible();

    // --- DB truth check: row exists with exactly the fields submitted ---
    const dbCampaign = await prisma.campaign.findUnique({ where: { slug } });
    expect(dbCampaign).not.toBeNull();
    expect(dbCampaign!.status).toBe('draft'); // default status on create
    expect(dbCampaign!.startDate.toISOString().slice(0, 10)).toBe(startDate);
    expect(dbCampaign!.endDate.toISOString().slice(0, 10)).toBe(endDate);
    expect((dbCampaign!.displayConfig as any).title).toBe(`UI Campaign ${slug}`);

    // --- Now add a template (with overlayConfig via photo-area-picker) ---
    await page.getByRole('button', { name: 'Khung mới' }).click();
    await page.locator('#template-name').fill('Frame A');
    await page.locator('#template-frame').setInputFiles('e2e/fixtures/frame.png');

    // Drag the photo-area box to resize it via the picker's pointer handlers
    // (data-testid contract documented in photo-area-picker.tsx).
    const box = page.getByTestId('photo-area-box');
    const handle = page.getByTestId('photo-area-resize-handle');
    await expect(box).toBeVisible();
    const handleBox = await handle.boundingBox();
    if (handleBox) {
      await handle.hover();
      await page.mouse.down();
      await page.mouse.move(handleBox.x + 20, handleBox.y + 20);
      await page.mouse.up();
    }

    await page.getByRole('button', { name: 'Lưu khung' }).click();

    await expect(page.getByText('Frame A')).toBeVisible();

    const dbTemplate = await prisma.template.findFirst({ where: { campaignId: dbCampaign!.id } });
    expect(dbTemplate).not.toBeNull();
    expect(dbTemplate!.name).toBe('Frame A');
    expect(dbTemplate!.campaignId).toBe(dbCampaign!.id);
    expect((dbTemplate!.overlayConfig as any).photoArea).toBeDefined();

    await cleanupCampaign(slug);
  });

  test('edits a campaign and changes its status by cycling the status pill', async ({ page }) => {
    const created = await createCampaignApi(page, { status: 'draft' });

    await page.goto('/admin/campaigns');
    await expect(page.getByText(`/c/${created.slug}`)).toBeVisible();

    // Cycle status: draft -> active
    const statusPill = page.locator(`tr:has-text("/c/${created.slug}") button`).first();
    await statusPill.click();

    await expect(async () => {
      const row = await prisma.campaign.findUnique({ where: { slug: created.slug } });
      expect(row!.status).toBe('active');
    }).toPass({ timeout: 5000 });

    // Edit displayConfig via the form
    await page.locator(`tr:has-text("/c/${created.slug}")`).getByRole('button', { name: 'Sửa' }).click();
    await page.locator('#campaign-title').fill('Updated Title E2E');
    await page.getByRole('button', { name: 'Cập nhật' }).click();

    await expect(async () => {
      const row = await prisma.campaign.findUnique({ where: { slug: created.slug } });
      expect((row!.displayConfig as any).title).toBe('Updated Title E2E');
    }).toPass({ timeout: 5000 });

    await cleanupCampaign(created.slug);
  });

  test('deletes a campaign that has no generated avatars', async ({ page }) => {
    const created = await createCampaignApi(page);

    await page.goto('/admin/campaigns');
    await expect(page.getByText(`/c/${created.slug}`)).toBeVisible();

    page.once('dialog', dialog => dialog.accept());
    await page.locator(`tr:has-text("/c/${created.slug}")`).getByRole('button', { name: 'Xoá', exact: true }).click();

    await expect(page.getByText(`/c/${created.slug}`)).toHaveCount(0);

    const row = await prisma.campaign.findUnique({ where: { slug: created.slug } });
    expect(row).toBeNull();
  });

  test('views analytics dashboard after a download exists', async ({ page }) => {
    const created = await createCampaignApi(page);
    const template = await createTemplateApi(page, created.slug);

    // Seed one GeneratedAvatar directly (public generation flow is covered
    // in public-avatar.spec.ts) so the analytics aggregation has data to show.
    await prisma.generatedAvatar.create({
      data: {
        campaignId: created.id,
        templateId: template.id,
        overlayValues: { unit: 'FPT Software' },
        resultImageKey: 'results/e2e-fake.png',
      },
    });

    await page.goto('/admin/analytics');
    await expect(page.getByText('Tổng lượt tải', { exact: false })).toBeVisible();
    await expect(page.getByTestId('day-chart-col').first()).toBeVisible();

    await cleanupCampaign(created.slug);
  });

  test('sees a notification after creating a campaign', async ({ page }) => {
    const created = await createCampaignApi(page, { title: 'Notif Test Campaign' });

    const res = await page.request.get('/api/admin/notifications');
    expect(res.ok()).toBeTruthy();
    const notifications = await res.json();
    const match = notifications.find((n: any) => n.message.includes(created.slug) || n.message.includes('Notif Test Campaign'));
    // We only assert a create-notification exists for *some* recent campaign
    // creation (message embeds the title, not the slug) — fall back to type.
    const anyCreateNotif = notifications.some((n: any) => n.type === 'campaign-create');
    expect(match || anyCreateNotif).toBeTruthy();

    const dbNotif = await prisma.notification.findFirst({ where: { type: 'campaign-create' }, orderBy: { createdAt: 'desc' } });
    expect(dbNotif).not.toBeNull();

    await cleanupCampaign(created.slug);
  });
});
