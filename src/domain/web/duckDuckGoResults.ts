import type { WebPage } from "@domain/web/webPorts";

const SEARCH_ADDRESS = "https://html.duckduckgo.com/html/?q=";
const RESULT_LINK = /<a\b[^>]*\bclass="result__a"[^>]*>[\s\S]*?<\/a>/g;
const HREF = /\bhref="([^"]*)"/;
const LINK_TEXT = />([\s\S]*)<\/a>$/;
const REDIRECT_TARGET = /[?&]uddg=([^&]+)/;
const ENTITY = /&(#x[0-9a-f]+|#\d+|[a-z]+);/gi;
const TAG = /<[^>]*>/g;
const WEB_ADDRESS = /^https?:\/\//i;
const SEARCH_ENGINE_ADDRESS = /^https?:\/\/([^/?#]*\.)?duckduckgo\.com([/?#:]|$)/i;
const MAX_CODE_POINT = 0x10ffff;

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

const fromCodePoint = (code: number): string =>
  Number.isInteger(code) && code >= 0 && code <= MAX_CODE_POINT ? String.fromCodePoint(code) : "";

const decodeEntity = (entity: string, name: string): string => {
  if (/^#x/i.test(name)) return fromCodePoint(Number.parseInt(name.slice(2), 16));
  if (name.startsWith("#")) return fromCodePoint(Number(name.slice(1)));
  return NAMED_ENTITIES[name.toLowerCase()] ?? entity;
};

const decodeHtmlEntities = (text: string): string =>
  text.replace(ENTITY, (entity, name: string) => decodeEntity(entity, name));

const decodeComponent = (text: string): string | undefined => {
  try {
    return decodeURIComponent(text);
  } catch {
    return undefined;
  }
};

const resolveTarget = (href: string): string | undefined => {
  const address = decodeHtmlEntities(href);
  const redirect = REDIRECT_TARGET.exec(address)?.[1];
  const target = redirect ? decodeComponent(redirect) : address;

  if (!target || !WEB_ADDRESS.test(target) || SEARCH_ENGINE_ADDRESS.test(target)) return undefined;
  return target;
};

const readTitle = (link: string): string =>
  decodeHtmlEntities((LINK_TEXT.exec(link)?.[1] ?? "").replace(TAG, ""))
    .replace(/\s+/g, " ")
    .trim();

const toPage = (link: string): WebPage[] => {
  const url = resolveTarget(HREF.exec(link)?.[1] ?? "");
  const title = readTitle(link);
  if (!url || !title) return [];

  return [{ title, url }];
};

export const parseDuckDuckGoResults = (html: string): WebPage[] => {
  const seen = new Set<string>();

  return (html.match(RESULT_LINK) ?? []).flatMap(toPage).filter((page) => {
    if (seen.has(page.url)) return false;
    seen.add(page.url);
    return true;
  });
};

export const buildDuckDuckGoUrl = (term: string): string =>
  `${SEARCH_ADDRESS}${encodeURIComponent(term)}`;

export const formatDisplayUrl = (url: string): string =>
  url
    .replace(WEB_ADDRESS, "")
    .replace(/^www\./i, "")
    .replace(/\/$/, "");
