/**
 * SeoLandingPage — programmatic SEO page for cuisine+city combinations.
 * Route: /para/:slug (e.g., /para/pizzaria-sao-paulo)
 *
 * Renders unique content per cuisine/city to target long-tail keywords
 * like "melhor sistema de reservas para pizzarias em São Paulo".
 */

import { useParams, Navigate } from 'react-router-dom';
import { findSeoPage } from '../data/seoPages';
import SeoHead from '../components/seo/SeoHead';
import SeoNav from '../components/seo/SeoNav';
import SeoHero from '../components/seo/SeoHero';
import SeoPainPoints from '../components/seo/SeoPainPoints';
import SeoSolution from '../components/seo/SeoSolution';
import SeoStats from '../components/seo/SeoStats';
import SeoPricing from '../components/seo/SeoPricing';
import SeoFaq from '../components/seo/SeoFaq';
import SeoCta from '../components/seo/SeoCta';
import RelatedPages from '../components/seo/RelatedPages';
import SeoFooter from '../components/seo/SeoFooter';

export default function SeoLandingPage() {
  const { slug } = useParams<{ slug: string }>();
  const page = slug ? findSeoPage(slug) : undefined;

  if (!page) {
    return <Navigate to="/404" replace />;
  }

  return (
    <>
      <SeoHead page={page} />
      <div className="min-h-screen bg-warm-white">
        <SeoNav />
        <SeoHero page={page} />
        <SeoPainPoints page={page} />
        <SeoSolution page={page} />
        <SeoStats page={page} />
        <SeoPricing page={page} />
        <SeoFaq page={page} />
        <SeoCta page={page} />
        <RelatedPages currentSlug={page.slug} />
        <SeoFooter />
      </div>
    </>
  );
}
