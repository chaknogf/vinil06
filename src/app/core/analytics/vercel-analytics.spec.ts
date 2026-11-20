import { beforeSendAnalytics } from './vercel-analytics';

describe('beforeSendAnalytics', () => {
  it('agrupa el código de sala y quita la query', () => {
    const event = {
      type: 'pageview' as const,
      url: 'https://vinil06.vercel.app/jugar/ABCD?code=secreto'
    };

    expect(beforeSendAnalytics(event)).toEqual({
      type: 'pageview',
      url: 'https://vinil06.vercel.app/jugar/:code'
    });
  });

  it('descarta el callback PKCE de Spotify', () => {
    expect(
      beforeSendAnalytics({
        type: 'pageview',
        url: 'https://vinil06.vercel.app/spotify/callback?code=secreto&state=otro'
      })
    ).toBeNull();
  });
});
