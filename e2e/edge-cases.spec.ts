import { test, expect } from '@playwright/test';
import { loginAs, MOCK_ADMIN_EMAIL } from './support/auth';
import { createCampaignApi, createTemplateApi, cleanupCampaign, sweepLeftoverE2eCampaigns } from './support/factories';
import { prisma } from './support/db';

test.describe('Edge cases: FK Restrict on Template/Campaign deletion', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, MOCK_ADMIN_EMAIL);
  });

  test.afterAll(async () => {
    await sweepLeftoverE2eCampaigns();
  });

  test('API: deleting a Template that has a GeneratedAvatar is blocked with 409, not silently deleted', async ({ page }) => {
    const campaign = await createCampaignApi(page);
    const template = await createTemplateApi(page, campaign.slug);

    await prisma.generatedAvatar.create({
      data: {
        campaignId: campaign.id,
        templateId: template.id,
        overlayValues: {},
        resultImageKey: 'results/e2e-restrict-test.png',
      },
    });

    const res = await page.request.delete(`/api/admin/campaigns/${campaign.slug}/templates/${template.id}`);
    expect(res.status()).toBe(409);
    const body = await res.json();
    expect(body.error).toMatch(/generated avatars/i);

    // Confirm nothing was silently removed.
    const stillThere = await prisma.template.findUnique({ where: { id: template.id } });
    expect(stillThere).not.toBeNull();

    await cleanupCampaign(campaign.slug);
  });

  test('API: deleting a Campaign that (transitively) has a GeneratedAvatar is blocked with 409', async ({ page }) => {
    const campaign = await createCampaignApi(page);
    const template = await createTemplateApi(page, campaign.slug);
    await prisma.generatedAvatar.create({
      data: {
        campaignId: campaign.id,
        templateId: template.id,
        overlayValues: {},
        resultImageKey: 'results/e2e-restrict-test-2.png',
      },
    });

    const res = await page.request.delete(`/api/admin/campaigns/${campaign.slug}`);
    expect(res.status()).toBe(409);
    const body = await res.json();
    expect(body.error).toMatch(/generated avatars/i);

    const stillThere = await prisma.campaign.findUnique({ where: { id: campaign.id } });
    expect(stillThere).not.toBeNull();

    await cleanupCampaign(campaign.slug);
  });

  test('admin UI shows an error message when deleting a referenced Template fails (409)', async ({ page }) => {
    const campaign = await createCampaignApi(page);
    const template = await createTemplateApi(page, campaign.slug, 'Referenced Frame');
    await prisma.generatedAvatar.create({
      data: {
        campaignId: campaign.id,
        templateId: template.id,
        overlayValues: {},
        resultImageKey: 'results/e2e-ui-swallow.png',
      },
    });

    await page.goto('/admin/campaigns');
    await page.locator(`tr:has-text("/c/${campaign.slug}")`).getByRole('button', { name: 'Sửa' }).click();
    await expect(page.getByText('Referenced Frame')).toBeVisible();

    const deleteResponse = page.waitForResponse(
      r => r.url().includes(`/api/admin/campaigns/${campaign.slug}/templates/${template.id}`) && r.request().method() === 'DELETE',
    );
    page.once('dialog', dialog => dialog.accept());
    await page.locator('div:has-text("Referenced Frame")').getByRole('button', { name: 'Xóa khung' }).click();
    const deleteRes = await deleteResponse;
    expect(deleteRes.status()).toBe(409); // backend correctly rejects it

    // The template card should still be there (delete was rejected server-side)...
    await expect(page.getByText('Referenced Frame')).toBeVisible();
    // ...and src/app/admin/campaigns/page.tsx's handleTemplateDelete() now
    // checks `res.ok` before reloading, surfacing the server's 409 message
    // via a role="alert" node instead of silently swallowing it.
    const alertTexts = await page.getByRole('alert').allInnerTexts();
    const anyNonEmptyAlert = alertTexts.some(t => t.trim().length > 0);
    expect(anyNonEmptyAlert).toBe(true);

    await cleanupCampaign(campaign.slug);
  });
});
