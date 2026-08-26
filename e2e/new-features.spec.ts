import { test, expect } from '@playwright/test';
import { loginAs, MOCK_ADMIN_EMAIL } from './support/auth';
import { createCampaignApi, createTemplateApi, cleanupCampaign, cleanupUser, sweepLeftoverE2eCampaigns } from './support/factories';
import { prisma } from './support/db';

const PUBLIC_USER_EMAIL = 'user@fpt.com.vn';

test.afterAll(async () => {
  await sweepLeftoverE2eCampaigns();
});

test.describe('New features', () => {
  // Feature 4: admin ticks the "Năm gia nhập FPT" preset in TemplateForm and
  // the persisted overlayConfig carries the full styled join-year overlay.
  test('preset "Năm gia nhập FPT" persists yearsSince + curve + bold + stroke + shadow to DB', async ({ page }) => {
    await loginAs(page, MOCK_ADMIN_EMAIL);
    const created = await createCampaignApi(page, { status: 'active', title: 'Preset Campaign' });

    await page.goto('/admin/campaigns');
    await page.locator(`tr:has-text("/c/${created.slug}")`).getByRole('button', { name: 'Sửa' }).click();
    await page.getByRole('button', { name: 'Khung mới' }).click();

    await page.locator('#template-name').fill('Join Year Frame');
    await page.locator('#template-frame').setInputFiles('e2e/fixtures/frame.png');
    // Tick the join-year preset checkbox.
    await page.locator('#preset-joinYear').check();
    await page.getByRole('button', { name: 'Lưu khung' }).click();

    await expect(page.getByText('Join Year Frame')).toBeVisible();

    const dbCampaign = await prisma.campaign.findUnique({ where: { slug: created.slug } });
    const dbTemplate = await prisma.template.findFirst({ where: { campaignId: dbCampaign!.id, name: 'Join Year Frame' } });
    expect(dbTemplate).not.toBeNull();
    const overlays = (dbTemplate!.overlayConfig as any).textOverlays as any[];
    const joinYear = overlays.find(o => o.key === 'joinYear');
    expect(joinYear).toBeDefined();
    expect(joinYear.type).toBe('yearsSince');
    expect(joinYear.curve).toBeDefined();
    expect(joinYear.curve.direction).toBe('cw');
    expect(joinYear.fontWeight).toBe('bold');
    expect(joinYear.fontSize).toBe(46);
    expect(joinYear.strokeColor).toBe('#FF5A01');
    expect(joinYear.strokeWidth).toBeGreaterThan(0);
    expect(joinYear.shadow).toBeDefined();

    await cleanupCampaign(created.slug);
  });

  // Feature 3: joinYear yearsSince overlay -> picking 2022 stores "2022" and
  // the generated download succeeds; the "N NĂM LÀM FPT" math is unit-tested.
  test('public picks a join year, generates, and DB stores the raw year in overlayValues', async ({ page, browser }) => {
    const adminContext = await browser.newContext();
    const admin = await adminContext.newPage();
    await loginAs(admin, MOCK_ADMIN_EMAIL);
    const campaign = await createCampaignApi(admin, { status: 'active', title: 'JoinYear Public' });

    // Build a template whose only overlay is a yearsSince+curve join-year field.
    const overlayConfig = {
      photoArea: { x: 10, y: 10, w: 80, h: 80 },
      textOverlays: [
        {
          key: 'joinYear', label: 'Năm gia nhập FPT', labelEn: 'Year', type: 'yearsSince',
          options: ['2026', '2022', '1988'], x: 21, y: 19, fontSize: 46, color: '#ffffff',
          fontWeight: 'bold', strokeColor: '#FF5A01', strokeWidth: 2.6,
          shadow: { offsetX: 0, offsetY: 7, blur: 7, color: 'rgba(0,0,0,0.25)' },
          curve: { centerX: 48, centerY: 58, radius: 55, angle: -122, direction: 'cw' },
        },
      ],
    };
    const res = await admin.request.post(`/api/admin/campaigns/${campaign.slug}/templates`, {
      multipart: {
        name: 'JoinYear Frame',
        overlayConfig: JSON.stringify(overlayConfig),
        frameImage: { name: 'frame.png', mimeType: 'image/png', buffer: require('node:fs').readFileSync('e2e/fixtures/frame.png') },
      },
    });
    const template = await res.json();

    await page.goto(`/c/${campaign.slug}`);
    await page.setInputFiles('#photo-input', 'e2e/fixtures/photo.png');
    // The join-year field renders as a <select> (PillSelect).
    await page.locator('#overlay-joinYear').selectOption('2022');

    const generateResponse = page.waitForResponse(
      r => r.url().includes(`/api/campaigns/${campaign.slug}/generate`) && r.request().method() === 'POST',
    );
    await page.getByRole('button', { name: /TẢI ẢNH|DOWNLOAD/i }).click();
    const gen = await generateResponse;
    expect(gen.status()).toBe(200);

    const avatar = await prisma.generatedAvatar.findFirst({
      where: { campaignId: campaign.id, templateId: template.id },
      orderBy: { createdAt: 'desc' },
    });
    expect(avatar).not.toBeNull();
    expect((avatar!.overlayValues as any).joinYear).toBe('2022');

    await cleanupCampaign(campaign.slug);
    await adminContext.close();
  });

  // Features 5 + 6: square preview box (rounded-2xl, not rounded-full) and
  // dropdown options forced to dark text (text-slate-900) for readability.
  test('preview box is square (rounded-2xl) and year dropdown options are dark-on-white', async ({ page, browser }) => {
    const adminContext = await browser.newContext();
    const admin = await adminContext.newPage();
    await loginAs(admin, MOCK_ADMIN_EMAIL);
    const campaign = await createCampaignApi(admin, { status: 'active', title: 'Style Campaign' });
    const overlayConfig = {
      photoArea: { x: 10, y: 10, w: 80, h: 80 },
      textOverlays: [{ key: 'joinYear', label: 'Năm gia nhập FPT', labelEn: 'Year', type: 'select', options: ['2026', '2022'], x: 21, y: 19, fontSize: 20, color: '#ffffff' }],
    };
    await admin.request.post(`/api/admin/campaigns/${campaign.slug}/templates`, {
      multipart: {
        name: 'Style Frame', overlayConfig: JSON.stringify(overlayConfig),
        frameImage: { name: 'frame.png', mimeType: 'image/png', buffer: require('node:fs').readFileSync('e2e/fixtures/frame.png') },
      },
    });

    await page.goto(`/c/${campaign.slug}`);
    // The canvas' wrapping preview box must carry rounded-2xl and never rounded-full.
    const previewBox = page.locator('canvas').locator('xpath=..');
    const cls = (await previewBox.getAttribute('class')) ?? '';
    expect(cls).toContain('rounded-2xl');
    expect(cls).not.toContain('rounded-full');

    // The select's options carry the readability utilities.
    const select = page.locator('#overlay-joinYear');
    const selCls = (await select.getAttribute('class')) ?? '';
    expect(selCls).toContain('[&>option]:text-slate-900');
    expect(selCls).toContain('[&>option]:bg-white');

    await cleanupCampaign(campaign.slug);
    await adminContext.close();
  });

  // Feature 7: a role=user account is redirected away from /admin/campaigns
  // by AdminGate, but can reach its own /tai-khoan page.
  test('role=user is blocked from /admin/campaigns but can open /tai-khoan', async ({ page }) => {
    await loginAs(page, PUBLIC_USER_EMAIL);

    const dbUser = await prisma.user.findUnique({ where: { email: PUBLIC_USER_EMAIL } });
    expect(dbUser).not.toBeNull();
    expect(dbUser!.role).toBe('user');

    await page.goto('/admin/campaigns');
    // AdminGate replaces the route with "/" for non-admins.
    await expect(page).toHaveURL(/localhost:3000\/(?:$|\?)/, { timeout: 8000 });
    await expect(page.getByRole('heading', { name: 'Campaigns' })).toHaveCount(0);

    await page.goto('/tai-khoan');
    await expect(page.getByRole('heading', { name: /Lịch sử|History/i })).toBeVisible();

    // Feature 8: the back link points at the home page.
    const back = page.getByRole('link', { name: /Trang chủ|Home/i });
    await expect(back).toHaveAttribute('href', '/');

    await cleanupUser(PUBLIC_USER_EMAIL);
  });

  // Feature 9: the frame-picker step label no longer carries a "2." prefix.
  test('frame-picker step label has no "2." number prefix', async ({ page, browser }) => {
    const adminContext = await browser.newContext();
    const admin = await adminContext.newPage();
    await loginAs(admin, MOCK_ADMIN_EMAIL);
    const campaign = await createCampaignApi(admin, { status: 'active', title: 'Label Campaign' });
    // Two templates so the "Chọn khung" step label renders.
    await createTemplateApi(admin, campaign.slug, 'Frame One');
    await createTemplateApi(admin, campaign.slug, 'Frame Two');

    await page.goto(`/c/${campaign.slug}`);
    const label = page.getByText(/Chọn khung/i);
    await expect(label).toBeVisible();
    await expect(label).not.toContainText('2.');

    await cleanupCampaign(campaign.slug);
    await adminContext.close();
  });
});
