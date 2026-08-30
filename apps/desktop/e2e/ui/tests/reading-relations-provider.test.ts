import { describe, expect, it } from 'vitest';
import { withReadingRelationsProvider } from '../helpers/reading-relations-provider';

describe('controlled reading provider transport', () => {
  it('sends the supplied output unchanged so real callers must validate its citations', async () => {
    await withReadingRelationsProvider(
      async (provider) => {
        const pending = fetch(`${provider.baseUrl}/chat/completions`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            model: 'controlled-relations',
            messages: [{ role: 'user', content: '{}' }],
          }),
        });
        await expect.poll(() => provider.requests.length).toBe(1);
        const output = {
          relations: [
            {
              evidenceId: 'never-sent',
              relation: 'invalid',
              explanation: 'Do not sanitize this fixture.',
            },
          ],
        };
        provider.requests[0].respondWith(output);
        const response = await pending;
        const body = (await response.json()) as { choices: { message: { content: string } }[] };
        expect(response.status).toBe(200);
        expect(JSON.parse(body.choices[0].message.content)).toEqual(output);
      },
      { holdResponses: true },
    );
  });

  it('uses an unreachable loopback endpoint for offline scenarios', async () => {
    await withReadingRelationsProvider(
      async (provider) => {
        expect(new URL(provider.baseUrl).hostname).toBe('127.0.0.1');
        await expect(
          fetch(`${provider.baseUrl}/chat/completions`, { method: 'POST' }),
        ).rejects.toThrow();
        expect(provider.requests).toEqual([]);
      },
      { offline: true },
    );
  });
});
