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
import {
  parseAvleagueActorPage,
  parseAvleagueSearchPage,
} from "./providers/av-league";
import { parsePondoDetail, pondoConfigs, sprintf } from "./providers/pondo-core";
import { caribConfigs, parseCaribPage } from "./providers/carib-core";
import { parse0930Page, site0930Configs } from "./providers/site0930";
import { falenoConfigs, parseFalenoPage } from "./providers/faleno-core";
import { parseHeyzoPage } from "./providers/heyzo";
import { parseHeydougaPage } from "./providers/heydouga";
import { parseKin8Page } from "./providers/kin8";
import { parseMywifePage } from "./providers/mywife";
import { parsePcollePage } from "./providers/pcolle";
import { parseGcollePage } from "./providers/gcolle";
import { parseTokyoHotPage } from "./providers/tokyo-hot";
import { parseMadouquPage } from "./providers/madouqu";
import { parseFc2hubPage } from "./providers/fc2hub";

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
      case "/parse/av-league": {
        const info = await parseAvleagueActorPage(
          html,
          "https://www.av-league.com/actress/8301.html",
          "8301",
        );
        return Response.json(info);
      }
      case "/parse/av-league-search": {
        const results = await parseAvleagueSearchPage(
          html,
          "https://www.av-league.com/search/search.php?k=x",
        );
        return Response.json({ count: results.length, results });
      }
      // --- batch-1 providers: parse a saved detail page/JSON ---
      // /parse/<key>?name=<provider>&url=<page-url>&id=<id>
      case "/parse/pondo-json": {
        const name = (url.searchParams.get("name") ?? "1Pondo").toUpperCase();
        const cfg = pondoConfigs.find((x) => x.name.toUpperCase() === name)!;
        const id = url.searchParams.get("id") ?? "";
        const homepage = sprintf(cfg.movieURL, id);
        const detailURL = new URL(
          `/dyn/phpauto/movie_details/movie_id/${id}.json`,
          homepage,
        ).toString();
        const info = parsePondoDetail(JSON.parse(html), detailURL, cfg, homepage);
        return Response.json(info);
      }
      case "/parse/carib": {
        const name = (url.searchParams.get("name") ?? "Caribbeancom").toUpperCase();
        const cfg = caribConfigs.find((x) => x.name.toUpperCase() === name)!;
        const pageURL = url.searchParams.get("url") ?? "";
        const id = url.searchParams.get("id") ?? "";
        const info = await parseCaribPage(html, pageURL, cfg, id);
        return Response.json(info);
      }
      case "/parse/0930": {
        const name = (url.searchParams.get("name") ?? "H0930").toUpperCase();
        const cfg = site0930Configs.find((x) => x.name.toUpperCase() === name)!;
        const pageURL = url.searchParams.get("url") ?? "";
        const id = url.searchParams.get("id") ?? "";
        const info = await parse0930Page(html, pageURL, cfg, id);
        return Response.json(info);
      }
      case "/parse/faleno": {
        const name = (url.searchParams.get("name") ?? "DAHLIA").toUpperCase();
        const cfg = falenoConfigs.find((x) => x.name.toUpperCase() === name)!;
        const pageURL = url.searchParams.get("url") ?? "";
        const id = url.searchParams.get("id") ?? "";
        const info = await parseFalenoPage(html, pageURL, cfg, id);
        return Response.json(info);
      }
      case "/parse/heyzo": {
        const pageURL = url.searchParams.get("url") ?? "";
        const id = url.searchParams.get("id") ?? "";
        return Response.json(await parseHeyzoPage(html, pageURL, id));
      }
      case "/parse/heydouga": {
        const pageURL = url.searchParams.get("url") ?? "";
        const id = url.searchParams.get("id") ?? "";
        return Response.json(await parseHeydougaPage(html, pageURL, id));
      }
      case "/parse/kin8": {
        const pageURL = url.searchParams.get("url") ?? "";
        const id = url.searchParams.get("id") ?? "";
        return Response.json(await parseKin8Page(html, pageURL, id));
      }
      case "/parse/mywife": {
        const pageURL = url.searchParams.get("url") ?? "";
        const id = url.searchParams.get("id") ?? "";
        return Response.json(await parseMywifePage(html, pageURL, id));
      }
      case "/parse/pcolle": {
        const pageURL = url.searchParams.get("url") ?? "";
        const id = url.searchParams.get("id") ?? "";
        return Response.json(await parsePcollePage(html, pageURL, id));
      }
      case "/parse/gcolle": {
        const pageURL = url.searchParams.get("url") ?? "";
        const id = url.searchParams.get("id") ?? "";
        return Response.json(await parseGcollePage(html, pageURL, id));
      }
      case "/parse/tokyo-hot": {
        const pageURL = url.searchParams.get("url") ?? "";
        const id = url.searchParams.get("id") ?? "";
        return Response.json(await parseTokyoHotPage(html, pageURL, id));
      }
      case "/parse/madouqu": {
        const pageURL = url.searchParams.get("url") ?? "";
        const id = url.searchParams.get("id") ?? "";
        return Response.json(await parseMadouquPage(html, pageURL, id));
      }
      case "/parse/fc2hub": {
        const pageURL = url.searchParams.get("url") ?? "";
        const id = url.searchParams.get("id") ?? "";
        return Response.json(await parseFc2hubPage(html, pageURL, id));
      }
      default:
        return new Response("not found", { status: 404 });
    }
  },
};
