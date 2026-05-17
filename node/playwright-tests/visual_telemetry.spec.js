'use strict';
const { test, expect } = require('@playwright/test');

test('left and center panels are visible', async ({ page }) => {
  await page.goto('/dashboard');
  await expect(page.locator('aside.left-panel')).toBeVisible();
  await expect(page.locator('main.center-panel')).toBeVisible();
});

test('right panel is visible', async ({ page }) => {
  await page.goto('/dashboard');
  await expect(page.locator('aside.right-panel')).toBeVisible();
});

test('WebSocket connects and receives connected event', async ({ page }) => {
  const wsMessages = [];
  page.on('websocket', ws => {
    ws.on('framereceived', frame => {
      try { wsMessages.push(JSON.parse(frame.payload)); } catch { /* skip */ }
    });
  });
  await page.goto('/dashboard');
  await page.waitForTimeout(2000);
  expect(wsMessages.some(m => m.type === 'connected')).toBe(true);
});

test('API health endpoint returns ok', async ({ request }) => {
  const res  = await request.get('/api/health');
  const body = await res.json();
  expect(res.ok()).toBe(true);
  expect(body.status).toBe('ok');
});

test('agents API returns a list', async ({ request }) => {
  const res  = await request.get('/api/agents');
  const body = await res.json();
  expect(res.ok()).toBe(true);
  expect(Array.isArray(body)).toBe(true);
  expect(body.length).toBeGreaterThan(0);
});
