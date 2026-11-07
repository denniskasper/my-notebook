import { describe, expect, it } from 'vitest';

import { extractArticle } from './web-page';

const URL = 'https://zeitung.example/artikel/heizung';

function page(body: string, head = '<title>Heizungsgesetz – Zeitung</title>'): Buffer {
  return Buffer.from(`<!doctype html><html><head>${head}</head><body>${body}</body></html>`);
}

const ARTICLE = `
  <nav><a href="/">Start</a> <a href="/politik">Politik</a></nav>
  <article>
    <h1>Was das Heizungsgesetz ändert</h1>
    <p>Ab 2024 soll jede neu eingebaute Heizung zu 65 Prozent mit erneuerbaren Energien betrieben werden. Das betrifft vor allem Neubauten in Neubaugebieten.</p>
    <p>Für bestehende Heizungen gelten Übergangs­fristen, die sich nach der kommunalen Wärmeplanung richten.</p>
    <script>window.track('artikel')</script>
    <ul><li>Wärmepumpen werden gefördert.</li><li>Gasheizungen bleiben erlaubt.</li></ul>
    <p>Die Förderung deckt je nach Einkommen einen Teil der Kosten, im besten Fall bis zu 70 Prozent.</p>
  </article>
  <footer>Impressum · Datenschutz</footer>`;

describe('extractArticle', () => {
  it('keeps the article as paragraphs, without navigation, scripts or footer', () => {
    const article = extractArticle(page(ARTICLE), 'text/html', URL);
    expect(article?.text.split('\n\n')).toEqual([
      'Was das Heizungsgesetz ändert',
      'Ab 2024 soll jede neu eingebaute Heizung zu 65 Prozent mit erneuerbaren Energien betrieben werden. Das betrifft vor allem Neubauten in Neubaugebieten.',
      'Für bestehende Heizungen gelten Übergangsfristen, die sich nach der kommunalen Wärmeplanung richten.',
      'Wärmepumpen werden gefördert.',
      'Gasheizungen bleiben erlaubt.',
      'Die Förderung deckt je nach Einkommen einen Teil der Kosten, im besten Fall bis zu 70 Prozent.',
    ]);
  });

  it('strips soft hyphens', () => {
    expect(extractArticle(page(ARTICLE), 'text/html', URL)?.text).not.toContain('­');
  });

  it('takes the title from the page', () => {
    expect(extractArticle(page(ARTICLE), 'text/html', URL)?.title).toBe('Heizungsgesetz – Zeitung');
  });

  it('decodes the charset the server declares', () => {
    const latin1 = Buffer.from(
      '<html><head><title>Grüße</title></head><body><article><p>Schöne Grüße aus Köln, wo die Straßenbahn über die Brücke fährt und alle Menschen fröhlich sind.</p></article></body></html>',
      'latin1',
    );
    const article = extractArticle(latin1, 'text/html; charset=iso-8859-1', URL);
    expect(article?.text).toContain('Schöne Grüße aus Köln');
  });

  it('reads an undeclared charset as UTF-8, or from the meta tag', () => {
    expect(extractArticle(page(ARTICLE), 'text/html', URL)?.text).toContain('Übergangsfristen');
    const declared = Buffer.from(
      '<html><head><meta charset="windows-1252"><title>T</title></head><body><article><p>Grüße aus Köln, wo die Straßenbahn über die Brücke fährt und alle Menschen fröhlich sind.</p></article></body></html>',
      'latin1',
    );
    expect(extractArticle(declared, 'text/html', URL)?.text).toContain('Grüße aus Köln');
  });

  it('finds nothing in a page without text', () => {
    expect(extractArticle(page('<div><img src="a.png"></div>'), 'text/html', URL)).toBeNull();
  });
});
