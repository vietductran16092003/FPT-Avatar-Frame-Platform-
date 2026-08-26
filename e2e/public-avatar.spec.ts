import { test, expect } from '@playwright/test';
import { loginAs, MOCK_ADMIN_EMAIL } from './support/auth';
import { createCampaignApi, createTemplateApi, cleanupCampaign, cleanupUser, sweepLeftoverE2eCampaigns } from './support/factories';
import { prisma } from './support/db';

test.afterAll(async () => {
  await sweepLeftoverE2eCampaigns();
});

// NOTE: there is no dedicated "mock public user" login button in the UI —
// /admin/login always signs in as the fixed admin account regardless of
// the callbackUrl it was reached from (see bug report: src/lib/mock-fpt-auth.ts
// only exports signInAsMockAdmin, and .env.example's documented
// "user@fpt.com.vn from /" flow does not exist in code). For the account-history
// test we therefore authenticate a distinct non-admin identity directly via
// the same dev-login provider the app itself uses (not a bypass of the app —
// it's the same mechanism, just invoked without going through the one UI
// button that happens to hardcode the admin email).
const PUBLIC_USER_EMAIL = 'e2e-public-user@fpt.com.vn';

test.describe('Public actor', () => {
  test('home page lists only active, in-date-range campaigns (not draft, not archived, not expired/future)', async ({ page, browser }) => {
    const adminContext = await browser.newContext();
    const admin = await adminContext.newPage();
    await loginAs(admin, MOCK_ADMIN_EMAIL);

    const now = Date.now();
    const day = 24 * 3600 * 1000;

    const active = await createCampaignApi(admin, { status: 'active', title: 'Visible Active Campaign' });
    const draft = await createCampaignApi(admin, { status: 'draft', title: 'Hidden Draft Campaign' });
    const archived = await createCampaignApi(admin, { status: 'archived', title: 'Hidden Archived Campaign' });
    const expired = await createCampaignApi(admin, {
      status: 'active',
      title: 'Hidden Expired Campaign',
      startDate: new Date(now - 10 * day).toISOString(),
      endDate: new Date(now - 1 * day).toISOString(),
    });
    const future = await createCampaignApi(admin, {
      status: 'active',
      title: 'Hidden Future Campaign',
      startDate: new Date(now + 1 * day).toISOString(),
      endDate: new Date(now + 10 * day).toISOString(),
    });

    await page.goto('/');
    await expect(page.getByText('Visible Active Campaign')).toBeVisible();
    await expect(page.getByText('Hidden Draft Campaign')).toHaveCount(0);
    await expect(page.getByText('Hidden Archived Campaign')).toHaveCount(0);
    await expect(page.getByText('Hidden Expired Campaign')).toHaveCount(0);
    await expect(page.getByText('Hidden Future Campaign')).toHaveCount(0);

    // Also verify the public API directly, matching the @@index([status,startDate,endDate]) contract.
    const apiRes = await page.request.get('/api/campaigns');
    const apiCampaigns = await apiRes.json();
    const slugs = apiCampaigns.map((c: any) => c.slug);
    expect(slugs).toContain(active.slug);
    expect(slugs).not.toContain(draft.slug);
    expect(slugs).not.toContain(archived.slug);
    expect(slugs).not.toContain(expired.slug);
    expect(slugs).not.toContain(future.slug);

    for (const c of [active, draft, archived, expired, future]) await cleanupCampaign(c.slug);
    await adminContext.close();
  });

  test('visits a campaign page by slug, uploads a photo, fills overlay fields, and generates+downloads an avatar; DB row matches', async ({ page, browser }) => {
    const adminContext = await browser.newContext();
    const admin = await adminContext.newPage();
    await loginAs(admin, MOCK_ADMIN_EMAIL);

    const campaign = await createCampaignApi(admin, { status: 'active', title: 'Photo Campaign' });
    const template = await createTemplateApi(admin, campaign.slug, 'Photo Frame');

    await page.goto(`/c/${campaign.slug}`);
    await expect(page.getByText('Photo Campaign')).toBeVisible();

    await page.setInputFiles('#photo-input', 'e2e/fixtures/photo.png');
    await page.locator('#overlay-unit').fill('FPT Software');

    const generateResponse = page.waitForResponse(
      r => r.url().includes(`/api/campaigns/${campaign.slug}/generate`) && r.request().method() === 'POST',
    );
    await page.getByRole('button', { name: /TẢI ẢNH|DOWNLOAD/i }).click();
    const res = await generateResponse;
    expect(res.status()).toBe(200);
    const { resultUrl } = await res.json();
    expect(resultUrl).toBeTruthy();

    // --- DB truth check: GeneratedAvatar points at the right campaign/template ---
    const avatar = await prisma.generatedAvatar.findFirst({
      where: { campaignId: campaign.id, templateId: template.id },
      orderBy: { createdAt: 'desc' },
    });
    expect(avatar).not.toBeNull();
    expect(avatar!.campaignId).toBe(campaign.id);
    expect(avatar!.templateId).toBe(template.id);
    expect((avatar!.overlayValues as any).unit).toBe('FPT Software');
    expect(avatar!.userId).toBeNull(); // anonymous visitor, not logged in

    await cleanupCampaign(campaign.slug);
    await adminContext.close();
  });

  test('logged-in user sees their own generated avatar in /tai-khoan history, keyed by session user', async ({ page, browser }) => {
    const adminContext = await browser.newContext();
    const admin = await adminContext.newPage();
    await loginAs(admin, MOCK_ADMIN_EMAIL);
    const campaign = await createCampaignApi(admin, { status: 'active', title: 'Account History Campaign' });
    const template = await createTemplateApi(admin, campaign.slug, 'History Frame');

    await loginAs(page, PUBLIC_USER_EMAIL);

    // Confirm the dev-login account really landed as role "user", not admin
    // (guards against a regression in isDevLoginAdminEmail's allowlist).
    const dbUser = await prisma.user.findUnique({ where: { email: PUBLIC_USER_EMAIL } });
    expect(dbUser).not.toBeNull();
    expect(dbUser!.role).toBe('user');

    await page.goto(`/c/${campaign.slug}`);
    await page.setInputFiles('#photo-input', 'e2e/fixtures/photo.png');
    await page.locator('#overlay-unit').fill('FPT Telecom');
    const generateResponse = page.waitForResponse(
      r => r.url().includes(`/api/campaigns/${campaign.slug}/generate`) && r.request().method() === 'POST',
    );
    await page.getByRole('button', { name: /TẢI ẢNH|DOWNLOAD/i }).click();
    await generateResponse;

    await page.goto('/tai-khoan');
    await expect(page.getByRole('heading', { name: /Lịch sử|History/i })).toBeVisible();
    await expect(page.getByText('History Frame')).toBeVisible();
    await expect(page.getByText('Account History Campaign')).toBeVisible();

    const avatar = await prisma.generatedAvatar.findFirst({ where: { campaignId: campaign.id, userId: dbUser!.id } });
    expect(avatar).not.toBeNull();

    await cleanupCampaign(campaign.slug);
    await cleanupUser(PUBLIC_USER_EMAIL);
    await adminContext.close();
  });

  test('draft campaign is blocked from public access (page and API both 404, not just hidden from the list)', async ({ page, browser }) => {
    const adminContext = await browser.newContext();
    const admin = await adminContext.newPage();
    await loginAs(admin, MOCK_ADMIN_EMAIL);
    const draft = await createCampaignApi(admin, { status: 'draft', title: 'Direct Nav Draft' });
    await createTemplateApi(admin, draft.slug);

    const apiRes = await page.request.get(`/api/campaigns/${draft.slug}`);
    expect(apiRes.status()).toBe(404);

    await page.goto(`/c/${draft.slug}`);
    await expect(page.getByText('Không tìm thấy chiến dịch này.')).toBeVisible();

    await cleanupCampaign(draft.slug);
    await adminContext.close();
  });

  test('expired campaign (endDate in the past) is blocked from public access even though status is active', async ({ page, browser }) => {
    const adminContext = await browser.newContext();
    const admin = await adminContext.newPage();
    await loginAs(admin, MOCK_ADMIN_EMAIL);
    const day = 24 * 3600 * 1000;
    const expired = await createCampaignApi(admin, {
      status: 'active',
      title: 'Direct Nav Expired',
      startDate: new Date(Date.now() - 10 * day).toISOString(),
      endDate: new Date(Date.now() - 1 * day).toISOString(),
    });
    await createTemplateApi(admin, expired.slug);

    const apiRes = await page.request.get(`/api/campaigns/${expired.slug}`);
    expect(apiRes.status()).toBe(404);

    await page.goto(`/c/${expired.slug}`);
    await expect(page.getByText('Không tìm thấy chiến dịch này.')).toBeVisible();

    // Generation must also be blocked, not just the listing page.
    const genRes = await page.request.post(`/api/campaigns/${expired.slug}/generate`, {
      multipart: { templateId: 'irrelevant', overlayValues: '{}', language: 'vi' },
    });
    expect(genRes.status()).toBe(404);

    await cleanupCampaign(expired.slug);
    await adminContext.close();
  });
});
