import links from '../../data/links.json' with { type: 'json' };
import { esc } from '../guide/html.ts';
import type { Links, OutboundLink } from '../../src/launch/links.ts';
import { outboundLinks, readLinks } from '../../src/launch/links.ts';

export type Json = string | number | boolean | null | readonly Json[] | JsonObject;

export interface JsonObject {
  readonly [key: string]: Json;
}

export interface ShareImage {
  readonly path: string;
  readonly width: number;
  readonly height: number;
  readonly alt: string;
}

export interface Organization {
  readonly name: string;
  readonly url: string;
}

export interface SitePicture {
  readonly path: string;
  readonly width: number;
  readonly height: number;
  readonly caption: string;
}

export interface SiteVideo {
  readonly path: string;
  readonly poster: string;
  readonly width: number;
  readonly height: number;
  readonly duration: string;
  readonly uploaded: string;
  readonly name: string;
  readonly description: string;
}

export interface SiteLogo {
  readonly path: string;
  readonly width: number;
  readonly height: number;
}

export interface SiteFacts {
  readonly origin: string;
  readonly name: string;
  readonly alternateNames: readonly string[];
  readonly language: string;
  readonly description: string;
  readonly genres: readonly string[];
  readonly platform: string;
  readonly operatingSystem: string;
  readonly category: string;
  readonly currency: string;
  readonly playPath: string;
  readonly image: ShareImage;
  readonly logo: SiteLogo;
  readonly manifestPath: string;
  readonly publisher: Organization;
  readonly screenshots: readonly SitePicture[];
  readonly trailer: SiteVideo;
}

export const SITE: SiteFacts = {
  origin: 'https://theloststorm.com',
  name: 'The Lost Storm',
  alternateNames: ['Lost Storm', 'theloststorm.com'],
  language: 'en',
  description: 'The Lost Storm is a free hack-and-slash action RPG that runs in your browser: fight under a night storm, find loot and level up. Early alpha, no download.',
  genres: ['Action role-playing game', 'Hack and slash'],
  platform: 'Web browser',
  operatingSystem: 'Any',
  category: 'GameApplication',
  currency: 'USD',
  playPath: '/play/',
  image: { path: '/og.jpg', width: 1200, height: 630, alt: 'The hero stands with a sword in a shaft of pale light in the mist, beside the words The Lost Storm.' },
  logo: { path: '/icon-512.png', width: 512, height: 512 },
  manifestPath: '/site.webmanifest',
  publisher: { name: 'Mergestorm', url: 'https://mergestorm.ai' },
  screenshots: [
    { path: '/landing/tree-1200.webp', width: 1200, height: 675, caption: 'The Skill Tree: five paths spiral out from the centre, and a lightning build lights up the Gathering Storm.' },
    { path: '/landing/hideout-1200.webp', width: 1200, height: 675, caption: 'The Hideout at night: a fire, lamps, and the Wardens who keep the trade, the auction and the waypoint.' },
  ],
  trailer: {
    path: '/landing/fight.mp4',
    poster: '/landing/fight-poster.webp',
    width: 1280,
    height: 720,
    duration: 'PT6.6S',
    uploaded: '2026-11-14T23:50:53Z',
    name: 'The Lost Storm gameplay: a fight in the Hall of Time',
    description: 'In the rain on the black shore of the Hall of Time, the hero cuts down a pack of pale echoes; damage numbers rise and gear drops where they fall.',
  },
};

export type ShareKind = 'website' | 'article';

export interface SharePage {
  readonly path: string;
  readonly title: string;
  readonly description: string;
  readonly kind: ShareKind;
}

export interface Crumb {
  readonly name: string;
  readonly path: string;
}

export interface ArticlePage {
  readonly path: string;
  readonly headline: string;
  readonly description: string;
}

export const HOME_LD_MARK: string = '<script type="application/ld+json" data-ld="home"></script>';

export function absolute(path: string): string {
  return `${SITE.origin}${path}`;
}

function meta(attribute: 'name' | 'property', key: string, value: string): string {
  return `<meta ${attribute}="${key}" content="${esc(value)}" />`;
}

export function shareTags(page: SharePage): readonly string[] {
  const image: string = absolute(SITE.image.path);
  return [
    meta('property', 'og:type', page.kind),
    meta('property', 'og:site_name', SITE.name),
    meta('property', 'og:url', absolute(page.path)),
    meta('property', 'og:title', page.title),
    meta('property', 'og:description', page.description),
    meta('property', 'og:image', image),
    meta('property', 'og:image:width', String(SITE.image.width)),
    meta('property', 'og:image:height', String(SITE.image.height)),
    meta('property', 'og:image:alt', SITE.image.alt),
    meta('name', 'twitter:card', 'summary_large_image'),
    meta('name', 'twitter:title', page.title),
    meta('name', 'twitter:description', page.description),
    meta('name', 'twitter:image', image),
    meta('name', 'twitter:image:alt', SITE.image.alt),
  ];
}

const SITE_LINKS: Links = readLinks(links);

export function socialProfiles(): readonly string[] {
  return outboundLinks(SITE_LINKS).map((link: OutboundLink): string => link.href);
}

function organization(): JsonObject {
  return { '@type': 'Organization', name: SITE.publisher.name, url: SITE.publisher.url };
}

function siteRef(): JsonObject {
  return { '@type': 'WebSite', name: SITE.name, url: absolute('/') };
}

function gameRef(): JsonObject {
  return { '@type': 'VideoGame', name: SITE.name, url: absolute('/') };
}

function picture(entry: SitePicture): JsonObject {
  return { '@type': 'ImageObject', contentUrl: absolute(entry.path), url: absolute(entry.path), width: entry.width, height: entry.height, caption: entry.caption };
}

function video(entry: SiteVideo): JsonObject {
  return {
    '@type': 'VideoObject',
    name: entry.name,
    description: entry.description,
    thumbnailUrl: [absolute(entry.poster)],
    uploadDate: entry.uploaded,
    duration: entry.duration,
    contentUrl: absolute(entry.path),
    width: entry.width,
    height: entry.height,
    inLanguage: SITE.language,
  };
}

export function webSite(): JsonObject {
  return { ...siteRef(), '@id': absolute('/#website'), alternateName: [...SITE.alternateNames], description: SITE.description, inLanguage: SITE.language, publisher: organization() };
}

export function brand(): JsonObject {
  const logo: string = absolute(SITE.logo.path);
  return {
    '@type': 'Organization',
    '@id': absolute('/#brand'),
    name: SITE.name,
    alternateName: [...SITE.alternateNames],
    url: absolute('/'),
    logo: { '@type': 'ImageObject', url: logo, contentUrl: logo, width: SITE.logo.width, height: SITE.logo.height },
    image: absolute(SITE.image.path),
    sameAs: [...socialProfiles()],
    parentOrganization: organization(),
  };
}

export function videoGame(): JsonObject {
  return {
    ...gameRef(),
    '@id': absolute('/#game'),
    description: SITE.description,
    image: absolute(SITE.image.path),
    genre: [...SITE.genres],
    gamePlatform: SITE.platform,
    operatingSystem: SITE.operatingSystem,
    applicationCategory: SITE.category,
    inLanguage: SITE.language,
    isAccessibleForFree: true,
    offers: { '@type': 'Offer', price: '0', priceCurrency: SITE.currency, url: absolute(SITE.playPath) },
    screenshot: SITE.screenshots.map(picture),
    trailer: video(SITE.trailer),
    sameAs: [...socialProfiles()],
    publisher: organization(),
  };
}

export function breadcrumbList(crumbs: readonly Crumb[]): JsonObject {
  return {
    '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((crumb: Crumb, index: number): JsonObject => ({ '@type': 'ListItem', position: index + 1, name: crumb.name, item: absolute(crumb.path) })),
  };
}

export function article(page: ArticlePage): JsonObject {
  const url: string = absolute(page.path);
  return {
    '@type': 'Article',
    '@id': `${url}#article`,
    headline: page.headline,
    description: page.description,
    url,
    mainEntityOfPage: url,
    image: [absolute(SITE.image.path)],
    inLanguage: SITE.language,
    author: organization(),
    publisher: organization(),
    isPartOf: siteRef(),
    about: gameRef(),
  };
}

export function ldScript(nodes: readonly JsonObject[]): string {
  const text: string = JSON.stringify({ '@context': 'https://schema.org', '@graph': nodes }).replace(/</g, '\\u003c');
  return `<script type="application/ld+json">${text}</script>`;
}

export function fillHome(html: string): string {
  return html.replace(HOME_LD_MARK, ldScript([webSite(), brand(), videoGame()]));
}
