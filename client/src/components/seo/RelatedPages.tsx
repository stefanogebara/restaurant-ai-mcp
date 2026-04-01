/**
 * RelatedPages — internal linking for SEO pages.
 * Shows "Veja tambem" cards linking to related cuisine/city pages.
 */

import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { getRelatedPages } from '../../data/seoPages';
import type { SeoPageData } from '../../data/seoPages';

interface RelatedPagesProps {
  readonly currentSlug: string;
}

function RelatedCard({ page }: { readonly page: SeoPageData }) {
  return (
    <Link
      to={`/para/${page.slug}`}
      className="group block border border-border-gray rounded-2xl p-5 bg-white hover:border-burgundy transition-colors"
    >
      <p className="text-xs font-medium text-burgundy mb-1">
        {page.city}, {page.state}
      </p>
      <h3 className="text-base font-semibold text-deep-charcoal group-hover:text-burgundy transition-colors mb-2">
        {page.cuisine}
      </h3>
      <p className="text-sm text-warm-stone line-clamp-2 mb-3">
        {page.painPoints[0].title}
      </p>
      <span className="inline-flex items-center gap-1 text-sm font-medium text-burgundy">
        Ver mais
        <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
      </span>
    </Link>
  );
}

export default function RelatedPages({ currentSlug }: RelatedPagesProps) {
  const related = getRelatedPages(currentSlug, 4);

  if (related.length === 0) return null;

  return (
    <section className="py-16 border-t border-border-gray">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <h2 className="font-serif text-2xl sm:text-3xl font-bold text-deep-charcoal mb-8">
          Veja tamb&eacute;m
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {related.map((page) => (
            <RelatedCard key={page.slug} page={page} />
          ))}
        </div>
      </div>
    </section>
  );
}
