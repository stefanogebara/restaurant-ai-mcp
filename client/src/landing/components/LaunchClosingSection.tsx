import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import ThiingsIcon from '../../components/common/ThiingsIcon';

export default function LaunchClosingSection() {
  const { t } = useTranslation();

  return (
    <>
      <section className="bg-[#FAFAF9] px-5 py-24 text-[#0B0B0C] sm:px-10 sm:py-32 lg:px-16 lg:py-40">
        <div className="mx-auto grid max-w-[1200px] gap-12 lg:grid-cols-[0.88fr_1.12fr] lg:items-center lg:gap-20">
          <div className="overflow-hidden rounded-[28px] bg-[#E9E6E2]">
            <img src="/images/landing/owner-portrait.webp" alt="" className="aspect-[4/5] h-full w-full object-cover" width="1122" height="1402" loading="lazy" />
          </div>
          <div>
            <p className="text-[12px] font-semibold uppercase tracking-[0.1em] text-[#706A65]">{t('landing.launch.humanEyebrow', 'Made for the person responsible for tonight')}</p>
            <h2 className="mt-6 max-w-[680px] text-balance text-[clamp(2.75rem,5vw,5.25rem)] font-semibold leading-[0.98] tracking-[-0.05em]">
              {t('landing.launch.humanTitle', 'More attention for the room. Less admin behind it.')}
            </h2>
            <p className="mt-7 max-w-[590px] text-pretty text-[18px] leading-[1.52] text-[#706A65] sm:text-[21px]">
              {t('landing.launch.humanBody', 'Seatable answers guests, protects your rules, keeps the floor current, and turns every service into a clearer next decision.')}
            </p>
            <div className="mt-10 grid border-y border-black/[0.12] sm:grid-cols-3 sm:divide-x sm:divide-black/[0.12]">
              <span className="flex min-h-16 items-center gap-2 py-4 text-sm sm:px-4"><ThiingsIcon name="lock" pxSize={15} />{t('landing.trustLgpd', 'LGPD-compliant')}</span>
              <span className="flex min-h-16 items-center gap-2 border-t border-black/[0.12] py-4 text-sm sm:border-t-0 sm:px-4"><ThiingsIcon name="shield-check" pxSize={15} />{t('landing.trustEncrypted', 'Encrypted data')}</span>
              <span className="flex min-h-16 items-center gap-2 border-t border-black/[0.12] py-4 text-sm sm:border-t-0 sm:px-4"><ThiingsIcon name="phone" pxSize={15} />{t('landing.trustHumanSupport', 'Human support within 24h')}</span>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-[#0B0B0C] px-5 py-24 text-center text-white sm:px-10 sm:py-32 lg:px-16 lg:py-40">
        <div className="mx-auto max-w-[1060px]">
          <p className="text-[12px] font-semibold uppercase tracking-[0.1em] text-white/[0.52]">{t('landing.launch.closingEyebrow', 'Ready when the next guest is')}</p>
          <h2 className="mt-7 text-balance text-[clamp(3.25rem,8vw,7.7rem)] font-semibold leading-[0.92] tracking-[-0.055em]">
            {t('landing.launch.closingTitle', 'Make the room feel effortless.')}
          </h2>
          <p className="mx-auto mt-7 max-w-[620px] text-pretty text-[17px] leading-[1.5] text-white/[0.62] sm:text-[20px]">
            {t('landing.launch.closingBody', 'Give us your restaurant name and city. We will build a personalised preview around your real service.')}
          </p>
          <div className="mt-9 flex flex-col justify-center gap-3 sm:flex-row">
            <Link to="/demo/setup" className="inline-flex min-h-[54px] items-center justify-center gap-2 rounded-full bg-burgundy px-8 text-[15px] font-semibold text-white transition-[transform,background-color] duration-200 hover:-translate-y-px hover:bg-burgundy-dark">
              {t('landing.launch.closingCta', 'Create my restaurant preview')}<ThiingsIcon name="arrow-right" pxSize={15} />
            </Link>
            <Link to="/precos" className="inline-flex min-h-[54px] items-center justify-center gap-2 rounded-full border border-white/20 px-8 text-[15px] font-semibold text-white transition-colors duration-200 hover:bg-white/[0.08]">
              {t('landing.pricingTeaser.cta', 'See plans and pricing')}
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
