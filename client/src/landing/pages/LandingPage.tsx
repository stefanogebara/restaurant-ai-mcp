import { useEffect } from 'react';
import { trackLandingPageViewed } from '../../lib/analytics';
import { LS_REFERRAL_CODE } from '../../config/localStorageKeys';
import LaunchNav from '../components/LaunchNav';
import PhotographicHero from '../components/PhotographicHero';
import LaunchProductSection from '../components/LaunchProductSection';
import CinematicServiceStory from '../components/CinematicServiceStory';
import LaunchClosingSection from '../components/LaunchClosingSection';
import LaunchFooter from '../components/LaunchFooter';

export default function LandingPage() {
  useEffect(() => {
    trackLandingPageViewed();
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ref = params.get('ref');
    if (!ref || ref.length > 20) return;

    fetch('/api/referral?action=track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ referral_code: ref }),
    })
      .then((response) => response.ok ? response.json() : null)
      .then((data) => {
        if (data?.valid !== true) return;
        localStorage.setItem(LS_REFERRAL_CODE, ref);
        params.delete('ref');
        const query = params.toString();
        history.replaceState(null, '', `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`);
      })
      .catch((error) => {
        console.error('[LandingPage] referral tracking failed', error);
      });
  }, []);

  return (
    <div className="landing-launch min-h-screen bg-[#FAFAF9] text-[#0B0B0C] selection:bg-burgundy selection:text-white">
      <LaunchNav />
      <main id="main-content">
        <PhotographicHero />
        <LaunchProductSection />
        <CinematicServiceStory />
        <LaunchClosingSection />
      </main>
      <LaunchFooter />
    </div>
  );
}
