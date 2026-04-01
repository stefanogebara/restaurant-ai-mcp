/**
 * SeoHead — injects meta tags, canonical URL, and JSON-LD structured data
 * into the document head for SEO landing pages.
 *
 * Uses document.head manipulation since React Helmet is not in the project.
 */

import { useEffect } from 'react';
import type { SeoPageData } from '../../data/seoPages';

const BASE_URL = 'https://seatable.one';

interface SeoHeadProps {
  readonly page: SeoPageData;
}

function buildJsonLd(page: SeoPageData): string {
  const softwareApp = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'Seatable',
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web',
    url: BASE_URL,
    description: page.metaDescription,
    offers: {
      '@type': 'AggregateOffer',
      lowPrice: '497',
      highPrice: '2997',
      priceCurrency: 'BRL',
      offerCount: 3,
    },
    aggregateRating: {
      '@type': 'AggregateRating',
      ratingValue: '4.8',
      reviewCount: '127',
    },
  };

  const faqPage = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: page.faqs.map((faq) => ({
      '@type': 'Question',
      name: faq.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: faq.answer,
      },
    })),
  };

  return JSON.stringify([softwareApp, faqPage]);
}

export default function SeoHead({ page }: SeoHeadProps) {
  const title = `Melhor Sistema de Reservas para ${page.cuisine} em ${page.city} | Seatable`;
  const canonical = `${BASE_URL}/para/${page.slug}`;
  const ogImage = `${BASE_URL}/og-image.png`;

  useEffect(() => {
    // Title
    document.title = title;

    // Helper to upsert meta tags
    const setMeta = (attr: string, key: string, content: string) => {
      let el = document.querySelector(`meta[${attr}="${key}"]`) as HTMLMetaElement | null;
      if (!el) {
        el = document.createElement('meta');
        el.setAttribute(attr, key);
        document.head.appendChild(el);
      }
      el.setAttribute('content', content);
    };

    setMeta('name', 'description', page.metaDescription);
    setMeta('name', 'robots', 'index, follow');
    setMeta('property', 'og:title', title);
    setMeta('property', 'og:description', page.metaDescription);
    setMeta('property', 'og:type', 'website');
    setMeta('property', 'og:url', canonical);
    setMeta('property', 'og:image', ogImage);
    setMeta('property', 'og:locale', 'pt_BR');
    setMeta('property', 'og:site_name', 'Seatable');
    setMeta('name', 'twitter:card', 'summary_large_image');
    setMeta('name', 'twitter:title', title);
    setMeta('name', 'twitter:description', page.metaDescription);

    // Canonical
    let canonicalEl = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
    if (!canonicalEl) {
      canonicalEl = document.createElement('link');
      canonicalEl.setAttribute('rel', 'canonical');
      document.head.appendChild(canonicalEl);
    }
    canonicalEl.setAttribute('href', canonical);

    // JSON-LD
    let scriptEl = document.querySelector('script[data-seo-jsonld]') as HTMLScriptElement | null;
    if (!scriptEl) {
      scriptEl = document.createElement('script');
      scriptEl.setAttribute('type', 'application/ld+json');
      scriptEl.setAttribute('data-seo-jsonld', 'true');
      document.head.appendChild(scriptEl);
    }
    scriptEl.textContent = buildJsonLd(page);

    // Cleanup on unmount
    return () => {
      document.title = 'Seatable - AI Restaurant Reservations';
      const jsonLd = document.querySelector('script[data-seo-jsonld]');
      if (jsonLd) jsonLd.remove();
      const canonicalLink = document.querySelector('link[rel="canonical"]');
      if (canonicalLink) canonicalLink.remove();
    };
  }, [page, title, canonical, ogImage]);

  return null;
}
