import type { Page } from '@playwright/test';
import path from 'node:path';
import { prisma } from './db';

const FRAME_PATH = path.resolve(__dirname, '../fixtures/frame.png');

export function uniqueSlug(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
}

export interface CampaignOverrides {
  slug?: string;
  status?: 'draft' | 'active' | 'archived';
  startDate?: string; // ISO
  endDate?: string; // ISO
  title?: string;
}

/**
 * Creates a Campaign through the real admin API (POST /api/admin/campaigns).
 * `page` must already be authenticated as an admin (see loginAs). Test data
 * ownership rule: every test creates its own campaign with a unique slug so
 * parallel/sibling tests never collide.
 */
export async function createCampaignApi(page: Page, overrides: CampaignOverrides = {}) {
  const slug = overrides.slug ?? uniqueSlug('e2e-campaign');
  const now = Date.now();
  const body = {
    slug,
    status: overrides.status ?? 'active',
    startDate: overrides.startDate ?? new Date(now - 24 * 3600 * 1000).toISOString(),
    endDate: overrides.endDate ?? new Date(now + 24 * 3600 * 1000).toISOString(),
    language: 'vi',
    displayConfig: {
      title: overrides.title ?? `E2E Campaign ${slug}`,
      description: 'Created by Playwright E2E test',
      ctaLabel: 'Tạo avatar ngay',
    },
  };
  const res = await page.request.post('/api/admin/campaigns', { data: body });
  if (!res.ok()) {
    throw new Error(`createCampaignApi failed: ${res.status()} ${await res.text()}`);
  }
  return res.json();
}

/**
 * Creates a Template on the given campaign via the real admin API
 * (POST /api/admin/campaigns/[slug]/templates), uploading the fixture
 * frame.png and a photoArea + one free-text overlay field ("unit").
 */
export async function createTemplateApi(page: Page, slug: string, name = 'E2E Frame') {
  const overlayConfig = {
    photoArea: { x: 10, y: 10, w: 80, h: 80 },
    textOverlays: [
      { key: 'unit', label: 'Đơn vị', labelEn: 'Unit', type: 'text', x: 50, y: 90, fontSize: 20, color: '#ffffff' },
    ],
  };
  const res = await page.request.post(`/api/admin/campaigns/${slug}/templates`, {
    multipart: {
      name,
      overlayConfig: JSON.stringify(overlayConfig),
      frameImage: {
        name: 'frame.png',
        mimeType: 'image/png',
        buffer: require('node:fs').readFileSync(FRAME_PATH),
      },
    },
  });
  if (!res.ok()) {
    throw new Error(`createTemplateApi failed: ${res.status()} ${await res.text()}`);
  }
  return res.json();
}

/**
 * Deletes everything a test created for one campaign slug, in FK-safe order
 * (GeneratedAvatar -> Template -> Campaign), directly through Prisma. Used
 * in afterEach so tests never depend on each other's leftovers and never
 * pollute the shared dev DB between runs.
 */
export async function cleanupCampaign(slug: string): Promise<void> {
  const campaign = await prisma.campaign.findUnique({ where: { slug } });
  if (!campaign) return;
  await prisma.generatedAvatar.deleteMany({ where: { campaignId: campaign.id } });
  await prisma.template.deleteMany({ where: { campaignId: campaign.id } });
  await prisma.campaign.delete({ where: { id: campaign.id } }).catch(() => {});
}

/**
 * Best-effort sweep for any e2e-* campaign left behind by a test that threw
 * before reaching its own cleanupCampaign() call (e.g. a failed assertion
 * mid-test). Run this in an `afterAll` per spec file so a flaky assertion
 * never leaves permanent junk rows in the shared dev Postgres DB.
 */
export async function sweepLeftoverE2eCampaigns(): Promise<void> {
  const leftover = await prisma.campaign.findMany({
    where: { slug: { startsWith: 'e2e-' } },
    select: { slug: true },
  });
  for (const c of leftover) {
    await cleanupCampaign(c.slug);
  }
}

export async function cleanupUser(email: string): Promise<void> {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return;
  await prisma.generatedAvatar.updateMany({ where: { userId: user.id }, data: { userId: null } });
  await prisma.user.delete({ where: { id: user.id } }).catch(() => {});
}
