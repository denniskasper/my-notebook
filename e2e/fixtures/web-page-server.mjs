// Serves the web page the URL Source e2e test adds. The app under test may
// reach this loopback port only (URL_FETCH_TEST_LOOPBACK_PORT).
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

createServer((request, response) => {
  if (request.url === '/waermeplanung') {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end(ARTICLE);
    return;
  }
  response.writeHead(request.url === '/health' ? 200 : 404, { 'content-type': 'text/plain' });
  response.end();
}).listen(port, '127.0.0.1');
