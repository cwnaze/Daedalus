import { test, expect } from './demo';

// Pattern reference for implement-story. Title MUST start with the story ID.
test('US-A00: app renders its landing page', async ({ page, demo }) => {
  await page.goto('/');
  await expect(page.getByRole('heading')).toBeVisible();
  await demo.step('Landing page renders with its heading');
});
