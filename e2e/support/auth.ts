import type { Page, APIRequestContext } from '@playwright/test';

// Fixed mock accounts wired in src/lib/mock-fpt-auth.ts / auth-options.ts.
// admin@fpt.com.vn is granted role "admin" because it is listed in
// DEV_LOGIN_ADMIN_EMAILS (.env). Any other email signs in as role "user" —
// there is no dedicated "mock user" button in the UI (see bug report), so
// public-actor tests authenticate a plain user account the same way, via
// the dev-login credentials provider directly.
export const MOCK_ADMIN_EMAIL = 'admin@fpt.com.vn';

/**
 * Signs the given Playwright `page`'s browser context in via NextAuth's
 * "dev-login" CredentialsProvider (no password field — see
 * src/lib/server/auth-options.ts lines 37-45), bypassing the UI entirely.
 * This is API-based auth setup (rule #5: "setup through the API, assert
 * through the UI") — it uses `page.request`, which shares the cookie jar
 * with `page`, so the resulting session cookie lands in the browser
 * context automatically.
 */
export async function loginAs(page: Page, email: string): Promise<void> {
  const csrfRes = await page.request.get('/api/auth/csrf');
  if (!csrfRes.ok()) {
    throw new Error(`GET /api/auth/csrf failed with ${csrfRes.status()} — is dev-login enabled (NEXT_PUBLIC_DEV_LOGIN_ENABLED=true) and the dev server running?`);
  }
  const { csrfToken } = await csrfRes.json();

  const signInRes = await page.request.post('/api/auth/callback/dev-login', {
    form: { csrfToken, email, callbackUrl: '/', json: 'true' },
  });
  if (!signInRes.ok()) {
    throw new Error(`dev-login sign-in for ${email} failed with ${signInRes.status()}`);
  }
}

/** Same as loginAs but for a raw APIRequestContext (no browser page attached). */
export async function loginApiContext(request: APIRequestContext, email: string): Promise<void> {
  const csrfRes = await request.get('/api/auth/csrf');
  const { csrfToken } = await csrfRes.json();
  await request.post('/api/auth/callback/dev-login', {
    form: { csrfToken, email, callbackUrl: '/', json: 'true' },
  });
}
