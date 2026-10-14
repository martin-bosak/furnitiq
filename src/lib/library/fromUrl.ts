import "server-only";
import { lookup } from "node:dns/promises";
import net from "node:net";

/**
 * Read a product page (IKEA etc.): name, product images and dimensions.
 * The URL comes from the user, so fetches are restricted to public hosts.
 */

export type ProductInfo = {
  url: string;
  name?: string;
  images: string[];
  /** [width, depth, height] in meters when the page states them. */
  size?: [number, number, number];
  dimensionsText?: string;
};

function isPrivateIp(ip: string) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
  }
  const v = ip.toLowerCase();
  return v === "::1" || v === "::" || v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe80") || v.startsWith("::ffff:127.") || v.startsWith("::ffff:10.") || v.startsWith("::ffff:192.168.");
}

async function assertPublic(url: URL) {
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("Only http(s) links are supported");
  const addrs = await lookup(url.hostname, { all: true });
  if (!addrs.length || addrs.some((a) => isPrivateIp(a.address))) throw new Error("That address is not allowed");
}

/** Fetch with manual, re-checked redirects and a size cap. */
export async function safeFetch(raw: string, maxBytes: number, accept = "*/*"): Promise<{ data: Buffer; type: string; url: string }> {
  let url = new URL(raw);
  for (let hop = 0; hop < 4; hop++) {
    await assertPublic(url);
    const res = await fetch(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(15000),
      headers: {
        Accept: accept,
        "Accept-Language": "en,cs;q=0.8",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36",
      },
    });
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      url = new URL(res.headers.get("location")!, url);
      continue;
    }
    if (!res.ok) throw new Error(`The site answered ${res.status}`);
    if (Number(res.headers.get("content-length") ?? 0) > maxBytes) throw new Error("File too large");
    const data = Buffer.from(await res.arrayBuffer());
    if (data.length > maxBytes) throw new Error("File too large");
    return { data, type: res.headers.get("content-type") ?? "", url: url.toString() };
  }
  throw new Error("Too many redirects");
}

const decode = (s: string) => s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");

export async function readProductPage(raw: string): Promise<ProductInfo> {
  const page = await safeFetch(raw, 6_000_000, "text/html,application/xhtml+xml");
  const html = page.data.toString("utf8");
  const info: ProductInfo = { url: page.url, images: [] };
  const abs = (u: string) => {
    try {
      return new URL(decode(u), page.url).toString();
    } catch {
      return null;
    }
  };

  // 1. JSON-LD Product (most shops, IKEA included)
  for (const m of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const nodes = ([] as unknown[]).concat(JSON.parse(m[1])).flatMap((n: any) => (n?.["@graph"] ? n["@graph"] : [n]));
      for (const n of nodes as any[]) {
        const t = ([] as string[]).concat(n?.["@type"] ?? []);
        if (!t.includes("Product")) continue;
        info.name ??= [n.name, n.description && !n.name ? n.description : null].filter(Boolean)[0];
        for (const img of ([] as any[]).concat(n.image ?? [])) {
          const u = abs(typeof img === "string" ? img : img?.url ?? img?.contentUrl ?? "");
          if (u) info.images.push(u);
        }
        const dim = (k: string) => {
          const v = n[k];
          const val = typeof v === "object" ? Number(v?.value) : parseFloat(v);
          const unit = typeof v === "object" ? String(v?.unitCode ?? v?.unitText ?? "") : String(v ?? "");
          if (!Number.isFinite(val)) return undefined;
          return /mm|MMT/i.test(unit) ? val / 1000 : /\bm\b|MTR/i.test(unit) && !/cm|CMT/i.test(unit) ? val : val / 100;
        };
        const [w, d, h] = [dim("width"), dim("depth"), dim("height")];
        if (w && d && h) info.size = [w, d, h];
      }
    } catch {
      /* ignore malformed JSON-LD */
    }
  }

  // 2. Open Graph fallbacks
  const meta = (p: string) => html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${p}["'][^>]+content=["']([^"']+)["']`, "i"))?.[1];
  info.name ??= meta("og:title") ? decode(meta("og:title")!) : html.match(/<title>([^<]+)<\/title>/i)?.[1]?.trim();
  const og = meta("og:image");
  if (og && abs(og)) info.images.push(abs(og)!);

  // 3. Dimensions in text: "Width: 80 cm", "Šířka: 80 cm", "80x40x200 cm"
  if (!info.size) {
    const text = decode(html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ");
    const num = (re: RegExp) => {
      const m = text.match(re);
      if (!m) return undefined;
      const v = parseFloat(m[1].replace(",", "."));
      return /mm/i.test(m[2] ?? "") ? v / 1000 : v / 100;
    };
    const w = num(/(?:Width|Šířka|Breite|Szerokość)\s*:?\s*([\d.,]+)\s*(cm|mm)/i);
    const d = num(/(?:Depth|Hloubka|Tiefe|Głębokość)\s*:?\s*([\d.,]+)\s*(cm|mm)/i);
    const h = num(/(?:Height|Výška|Höhe|Wysokość)\s*:?\s*([\d.,]+)\s*(cm|mm)/i);
    if (w && d && h) info.size = [w, d, h];
    else {
      const m = text.match(/(\d{2,3}(?:[.,]\d)?)\s*[x×]\s*(\d{2,3}(?:[.,]\d)?)\s*[x×]\s*(\d{2,3}(?:[.,]\d)?)\s*(cm|mm)/i);
      if (m) {
        const k = /mm/i.test(m[4]) ? 1000 : 100;
        info.size = [m[1], m[2], m[3]].map((v) => parseFloat(v.replace(",", ".")) / k) as [number, number, number];
        info.dimensionsText = m[0];
      }
    }
  }

  info.images = [...new Set(info.images)].slice(0, 8);
  if (info.name) info.name = info.name.replace(/\s*[-|–]\s*IKEA.*$/i, "").trim().slice(0, 120);
  return info;
}
