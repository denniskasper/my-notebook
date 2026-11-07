// Serves the web pages the e2e tests add: the URL Source page, and the two
// pages the fake Agent's web search finds. The app under test may reach this
// loopback port only (URL_FETCH_TEST_LOOPBACK_PORT).
import { createServer } from 'node:http';

const port = Number(process.env.PORT);

const ARTICLE = `<!doctype html>
<html lang="de">
  <head>
    <meta charset="utf-8" />
    <title>Kommunale Wärmeplanung</title>
  </head>
  <body>
    <nav><a href="/">Start</a> <a href="/energie">Energie</a></nav>
    <article>
      <h1>Kommunale Wärmeplanung</h1>
      <p>Jede Gemeinde legt fest, welche Straßen künftig an ein Wärmenetz angeschlossen werden und wo Haushalte selbst heizen.</p>
      <p>Große Städte müssen ihre Wärme­pläne bis Mitte 2026 vorlegen, kleinere Gemeinden haben bis 2028 Zeit.</p>
      <p>Der Plan selbst verpflichtet niemanden, eine neue Heizung einzubauen, gibt aber Orientierung für die nächste Entscheidung.</p>
    </article>
    <footer>Impressum</footer>
  </body>
</html>`;

// Test fixtures for the Agent's research demo; the wording is made up.
const PRESS_RELEASE = `<!doctype html>
<html lang="de">
  <head>
    <meta charset="utf-8" />
    <title>KI-Verordnung: Zuständigkeiten in Deutschland</title>
  </head>
  <body>
    <article>
      <h1>KI-Verordnung: Zuständigkeiten in Deutschland</h1>
      <p>Die Bundesnetzagentur wird zentrale Marktüberwachungsbehörde für KI-Systeme in Deutschland.</p>
      <p>Für Finanzdienstleistungen bleibt die Finanzaufsicht zuständig, für Medizinprodukte die bisherigen Fachbehörden.</p>
      <p>Ein KI-Service-Desk berät kleine und mittlere Unternehmen bei der Umsetzung.</p>
    </article>
  </body>
</html>`;

const COMMENTARY = `<!doctype html>
<html lang="de">
  <head>
    <meta charset="utf-8" />
    <title>Was die KI-Verordnung für Unternehmen bedeutet</title>
  </head>
  <body>
    <article>
      <h1>Was die KI-Verordnung für Unternehmen bedeutet</h1>
      <p>Ein Überblick über Fristen, Risikoklassen und Pflichten für Anbieter und Betreiber.</p>
    </article>
  </body>
</html>`;

const PAGES = {
  '/waermeplanung': ARTICLE,
  '/ki-verordnung/bundesnetzagentur': PRESS_RELEASE,
  '/ki-verordnung/einordnung': COMMENTARY,
};

createServer((request, response) => {
  const page = PAGES[request.url ?? ''];
  if (page) {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end(page);
    return;
  }
  response.writeHead(request.url === '/health' ? 200 : 404, { 'content-type': 'text/plain' });
  response.end();
}).listen(port, '127.0.0.1');
