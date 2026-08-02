import { test as base, expect, type Page } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';

/**
 * Showboat demo harness.
 *
 * A demo doc is a *generated artifact*, not a hand-written claim. It only exists
 * if the spec that produces it passes, so it cannot drift away from the app.
 * pr-review re-runs every done story's spec, which re-verifies every demo on
 * every PR — that is the regression mechanism.
 */

type Step = { caption: string; shot: string };

class Demo {
  private steps: Step[] = [];
  constructor(private storyId: string, private title: string, private page: Page) {}

  /** Capture one meaningful moment in the user flow. */
  async step(caption: string) {
    const n = String(this.steps.length + 1).padStart(2, '0');
    const shot = `${this.storyId.toLowerCase()}-${n}.png`;
    await this.page.screenshot({
      path: path.join('docs/demos/assets', shot),
      animations: 'disabled',
    });
    this.steps.push({ caption, shot });
  }

  async write(status: 'PASS' | 'FAIL') {
    const body = [
      `# ${this.storyId} — ${this.title}`,
      '',
      `_Generated from this story's spec · ${new Date().toISOString().slice(0, 10)} · ${status}_`,
      '',
      ...this.steps.flatMap((s, i) => [
        `## ${i + 1}. ${s.caption}`,
        `![${s.caption}](./assets/${s.shot})`,
        '',
      ]),
    ].join('\n');
    await fs.mkdir('docs/demos/assets', { recursive: true });
    await fs.writeFile(`docs/demos/${this.storyId}.md`, body);
  }
}

export const test = base.extend<{ demo: Demo }>({
  demo: async ({ page }, use, testInfo) => {
    const storyId = testInfo.title.match(/^(US-[A-Z]\d+)/)?.[1];
    if (!storyId) throw new Error('Demo test titles must start with the story ID, e.g. "US-H01: compose and send"');
    const d = new Demo(storyId, testInfo.title.replace(/^US-[A-Z]\d+:\s*/, ''), page);
    await use(d);
    await d.write(testInfo.status === 'passed' ? 'PASS' : 'FAIL');
  },
});

export { expect };
