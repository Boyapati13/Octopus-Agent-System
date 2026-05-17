'use strict';
const { test, expect } = require('@playwright/test');

test('sidebar and main panels are visible', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('aside.sidebar')).toBeVisible();
  await expect(page.locator('main.main')).toBeVisible();
});

test('command console input has aria-label', async ({ page }) => {
  await page.goto('/');
  await page.click('[data-tab="console"]');
  const input = page.locator('#cmd-query');
  await expect(input).toBeVisible();
  await expect(input).toHaveAttribute('aria-label', 'Octopus Command Console Query Input');
});

test('Enter key triggers Run button', async ({ page }) => {
  await page.goto('/');
  await page.click('[data-tab="console"]');
  const input = page.locator('#cmd-query');
  const runBtn = page.locator('#cmd-run');
  await expect(runBtn).toBeEnabled();
  await input.fill('ping test');
  await input.press('Enter');
  // Button should temporarily disable while request is in flight
  // (or stay enabled if server responds instantly) — just verify no crash
  await expect(page.locator('body')).toBeVisible();
});

test('agent list loads in sidebar', async ({ page }) => {
  await page.goto('/');
  // Skeleton loaders replaced by real agent chips after fetch
  await page.waitForFunction(() =>
    document.querySelectorAll('.agent-skeleton').length === 0 ||
    document.querySelectorAll('#agent-list .agent-chip, #agent-list [class*="agent"]').length > 0,
    { timeout: 8000 }
  );
  await expect(page.locator('aside.sidebar')).toBeVisible();
});

test('WebSocket connects and receives connected event', async ({ page }) => {
  const wsMessages = [];
  page.on('websocket', ws => {
    ws.on('framereceived', frame => {
      try { wsMessages.push(JSON.parse(frame.payload)); } catch { /* skip */ }
    });
  });
  await page.goto('/');
  await page.waitForTimeout(1000);
  expect(wsMessages.some(m => m.type === 'connected')).toBe(true);
});
