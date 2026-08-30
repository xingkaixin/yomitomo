import type { Page } from 'playwright-core';
import { describe, expect, it } from 'vitest';
import {
  importRelationSource,
  openRelationSource,
  saveRelationJudgment,
  selectRelationQuote,
  waitForRelationProjection,
  waitForRelationSource,
  withRelationDesktopApp,
  type RelationSource,
} from '../helpers/reading-relations-fixtures';
import { withReadingRelationsProvider } from '../helpers/reading-relations-provider';

const quote = 'Reading memory connects saved judgments';
const reference: RelationSource = { kind: 'web', title: 'RD970 Reference', quote };
const referenceThought =
  'Reading memory connects saved judgments when the original evidence stays available.';

describe('reading relations', () => {
  it.each(['web', 'ebook', 'pdf'] as const)(
    '%s selection finds local evidence, explicitly compares, and returns to both sources',
    async (kind) => {
      await withReadingRelationsProvider(async (provider) => {
        await withRelationDesktopApp(
          `reading-relations-${kind}`,
          provider.baseUrl,
          async ({ fixtureDir, page, artifactsDir }) => {
            const source: RelationSource = { kind, title: `RD970 ${kind}`, quote };
            await importRelationSource(page, fixtureDir, reference);
            await importRelationSource(page, fixtureDir, source);
            await openRelationSource(page, reference);
            await saveRelationJudgment(page, reference, referenceThought);
            await page.getByRole('button', { name: 'Back to library' }).click();
            await openRelationSource(page, source);
            const saved = await saveRelationJudgment(
              page,
              source,
              'Reading memory connects saved judgments but similarity alone cannot prove agreement.',
            );
            expect(saved.anchor.exact).toBe(quote);
            if (kind === 'pdf')
              expect(saved.anchor).toMatchObject({ kind: 'pdf-text', pageIndex: 0 });
            if (kind === 'ebook') expect(saved.anchor.chapterId).toBeTruthy();
            await waitForRelationProjection(page, 2);
            const panel = await findRelated(page, source);
            const card = panel
              .locator('.reading-evidence-card')
              .filter({ hasText: referenceThought });
            await card.waitFor();
            expect(await panel.locator('.reading-evidence-card').count()).toBeLessThanOrEqual(3);
            await card.scrollIntoViewIfNeeded();
            expect(provider.requests).toHaveLength(0);
            await panel
              .getByRole('button', { name: 'Compare with Local E2E · controlled-relations' })
              .click();
            await panel
              .getByRole('region', { name: 'Before using remote reading memory' })
              .waitFor();
            expect(provider.requests).toHaveLength(0);
            await panel
              .getByRole('button', { name: 'Understand and compare this selection' })
              .click();
            await card.getByText('Controlled reading relation.', { exact: true }).waitFor();
            if (kind === 'web')
              await page.screenshot({
                path: `${artifactsDir}/rd970-web-relations.png`,
                fullPage: true,
              });
            expect(provider.requests).toHaveLength(1);
            console.info('reading-relations proof', {
              source: kind,
              anchor:
                'kind' in saved.anchor
                  ? saved.anchor.kind
                  : saved.anchor.chapterId
                    ? 'ebook'
                    : 'text',
              localBeforeConsent: true,
              remoteRequests: provider.requests.length,
            });

            await card.getByRole('button', { name: 'Back to source' }).click();
            await panel.waitFor({ state: 'detached' });
            await waitForRelationSource(page, reference);
            await page
              .locator('.reader-note-quote-text')
              .getByText(quote, { exact: true })
              .waitFor();
            const returnPanel = await findRelated(page, reference);
            await returnPanel
              .locator('.reading-evidence-card')
              .filter({ hasText: source.title })
              .first()
              .getByRole('button', { name: 'Back to source' })
              .click();
            await returnPanel.waitFor({ state: 'detached' });
            await waitForRelationSource(page, source);
            await page
              .locator('.reader-note-quote-text')
              .getByText(quote, { exact: true })
              .waitFor();
            expect(provider.requests).toHaveLength(1);
            console.info('reading-relations navigation', {
              source: kind,
              roundTrip: true,
              remoteRequests: provider.requests.length,
            });
            if (kind === 'web') {
              await page.getByRole('button', { name: 'Back to library' }).click();
              await page.getByRole('button', { name: 'Settings', exact: true }).click();
              await page.getByRole('button', { name: 'Models & routing', exact: true }).click();
              const localModel = page.getByRole('region', {
                name: 'Local reading memory',
                exact: true,
              });
              await localModel.getByText('Not downloaded', { exact: true }).waitFor();
              await localModel.scrollIntoViewIfNeeded();
              await page.screenshot({
                path: `${artifactsDir}/rd970-local-model-settings.png`,
                fullPage: true,
              });
              expect(provider.requests).toHaveLength(1);
            }
          },
        );
      });
    },
  );

  it('cancels an in-flight comparison and never attaches its late response to another source', async () => {
    await withReadingRelationsProvider(
      async (provider) => {
        await withRelationDesktopApp(
          'reading-relations-cancel',
          provider.baseUrl,
          async ({ fixtureDir, page }) => {
            const source: RelationSource = { kind: 'web', title: 'RD970 Cancel', quote };
            await importRelationSource(page, fixtureDir, reference);
            await importRelationSource(page, fixtureDir, source);
            await openRelationSource(page, reference);
            await saveRelationJudgment(page, reference, referenceThought);
            await page.getByRole('button', { name: 'Back to library' }).click();
            await openRelationSource(page, source);
            await saveRelationJudgment(
              page,
              source,
              'Reading memory needs reliable saved judgments.',
            );
            await waitForRelationProjection(page, 2);
            const panel = await findRelated(page, source);
            await panel
              .getByRole('button', { name: 'Compare with Local E2E · controlled-relations' })
              .click();
            await panel
              .getByRole('button', { name: 'Understand and compare this selection' })
              .click();
            await expect.poll(() => provider.requests.length).toBe(1);
            await panel.getByRole('button', { name: 'Cancel', exact: true }).click();
            await panel.waitFor({ state: 'detached' });
            await expect.poll(() => provider.requests[0].canceled).toBe(true);
            await page.getByRole('button', { name: 'Back to library' }).click();
            await openRelationSource(page, reference);
            const nextPanel = await findRelated(page, reference);
            provider.requests[0].respond('Stale response must never appear.');
            await nextPanel.locator('.reading-evidence-card').first().waitFor();
            expect(await nextPanel.getByText('Stale response must never appear.').count()).toBe(0);
            expect(provider.requests).toHaveLength(1);
            await nextPanel
              .getByRole('button', { name: 'Compare with Local E2E · controlled-relations' })
              .click();
            await expect.poll(() => provider.requests.length).toBe(2);
            await nextPanel
              .locator('.reading-evidence-card')
              .first()
              .getByRole('button', { name: 'Back to source' })
              .click();
            await nextPanel.waitFor({ state: 'detached' });
            await waitForRelationSource(page, source);
            await expect.poll(() => provider.requests[1].canceled).toBe(true);
            const switchedPanel = await findRelated(page, source);
            provider.requests[1].respond('Old source response must never appear.');
            await switchedPanel.locator('.reading-evidence-card').first().waitFor();
            expect(
              await switchedPanel.getByText('Old source response must never appear.').count(),
            ).toBe(0);
            expect(provider.requests).toHaveLength(2);
            console.info('reading-relations cancellation', {
              transportCanceled: true,
              sourceChangeCanceled: true,
              remoteRequests: provider.requests.length,
            });
          },
        );
      },
      { holdResponses: true },
    );
  });
});

async function findRelated(page: Page, source: RelationSource) {
  await selectRelationQuote(page, source);
  await page
    .locator('.reader-selection-menu')
    .getByRole('button', { name: 'Find related' })
    .click();
  const panel = page.getByRole('dialog', { name: 'Related reading', exact: true });
  await panel.waitFor();
  await panel.getByRole('region', { name: 'Index coverage for this query' }).waitFor();
  return panel;
}
