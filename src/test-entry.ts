// Local test entry — NOT part of the deployed worker.
// Lets us feed saved HTML pages (fetched with curl, since this sandbox's
// workerd cannot egress directly) through the real parsers.
//
//   POST /parse/javbus?id=ADN-306        body: JavBus detail page HTML
//   POST /parse/javbus-search            body: JavBus search page HTML
//   POST /parse/fanza-search             body: DMM search page HTML (307 body)
import { parseJavbusPage, parseJavbusSearchPage } from "./providers/javbus";
import { extractSearchProducts } from "./providers/fanza";
import { movieInfoFromWork, searchResultsFromWorks } from "./providers/avbase";

function htmlResponse(html: string): Response {
  return new Response(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (request.method !== "POST") {
      return new Response("not found", { status: 404 });
    }
    const html = await request.text();
    switch (url.pathname) {
      case "/parse/javbus": {
        const id = url.searchParams.get("id") ?? "";
        const info = await parseJavbusPage(
          htmlResponse(html),
          `https://www.javbus.com/ja/${id}`,
          id.toUpperCase(),
        );
        return Response.json(info);
      }
      case "/parse/javbus-search": {
        const results = await parseJavbusSearchPage(
          htmlResponse(html),
          "https://www.javbus.com/ja/search/ADN",
        );
        return Response.json({ count: results.length, results });
      }
      case "/parse/fanza-search": {
        const products = extractSearchProducts(html);
        return Response.json({ count: products.length, products });
      }
      case "/parse/avbase-work": {
        const data = JSON.parse(html) as { pageProps: { work: never } };
        return Response.json(movieInfoFromWork(data.pageProps.work));
      }
      case "/parse/avbase-search": {
        const data = JSON.parse(html) as { pageProps: { works: never[] } };
        const results = searchResultsFromWorks(data.pageProps.works);
        return Response.json({ count: results.length, results });
      }
      default:
        return new Response("not found", { status: 404 });
    }
  },
};
