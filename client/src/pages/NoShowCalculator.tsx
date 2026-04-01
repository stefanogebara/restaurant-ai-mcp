import { useState, useMemo, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import LandingNav from '../landing/components/LandingNav';
import Footer from '../landing/components/Footer';
import CalculatorSliders from '../components/calculator/CalculatorSliders';
import CalculatorResults from '../components/calculator/CalculatorResults';
import CalculatorCTA from '../components/calculator/CalculatorCTA';

export interface CalculatorInputs {
  tables: number;
  avgTicket: number;
  noShowRate: number;
  daysPerWeek: number;
  turnsPerDay: number;
  occupancy: number;
}

const DEFAULTS: CalculatorInputs = {
  tables: 20,
  avgTicket: 150,
  noShowRate: 20,
  daysPerWeek: 6,
  turnsPerDay: 2,
  occupancy: 75,
};

function parseInputsFromParams(params: URLSearchParams): CalculatorInputs {
  const parse = (key: string, min: number, max: number, fallback: number) => {
    const raw = params.get(key);
    if (!raw) return fallback;
    const n = Number(raw);
    if (Number.isNaN(n)) return fallback;
    return Math.max(min, Math.min(max, n));
  };
  return {
    tables: parse('tables', 5, 50, DEFAULTS.tables),
    avgTicket: parse('ticket', 50, 500, DEFAULTS.avgTicket),
    noShowRate: parse('noshow', 5, 40, DEFAULTS.noShowRate),
    daysPerWeek: parse('days', 4, 7, DEFAULTS.daysPerWeek),
    turnsPerDay: parse('turns', 1, 2, DEFAULTS.turnsPerDay),
    occupancy: parse('occ', 50, 100, DEFAULTS.occupancy),
  };
}

function buildShareParams(inputs: CalculatorInputs): string {
  const params = new URLSearchParams();
  params.set('tables', String(inputs.tables));
  params.set('ticket', String(inputs.avgTicket));
  params.set('noshow', String(inputs.noShowRate));
  params.set('days', String(inputs.daysPerWeek));
  params.set('turns', String(inputs.turnsPerDay));
  params.set('occ', String(inputs.occupancy));
  return params.toString();
}

export interface CalculatorOutput {
  monthlyPotentialRevenue: number;
  monthlyLoss: number;
  annualLoss: number;
  emptyTablesPerWeek: number;
  recoveredRevenue: number;
}

function calculate(inputs: CalculatorInputs): CalculatorOutput {
  const occupiedTables = inputs.tables * (inputs.occupancy / 100);
  const dailyRevenue = occupiedTables * inputs.turnsPerDay * inputs.avgTicket;
  const weeklyRevenue = dailyRevenue * inputs.daysPerWeek;
  const monthlyPotentialRevenue = weeklyRevenue * 4.33; // avg weeks/month

  const noShowFraction = inputs.noShowRate / 100;
  const monthlyLoss = monthlyPotentialRevenue * noShowFraction;
  const annualLoss = monthlyLoss * 12;

  const emptyTablesPerWeek = Math.round(
    occupiedTables * inputs.turnsPerDay * inputs.daysPerWeek * noShowFraction
  );

  // Seatable reduces no-shows by ~50%
  const recoveredRevenue = monthlyLoss * 0.5;

  return {
    monthlyPotentialRevenue,
    monthlyLoss,
    annualLoss,
    emptyTablesPerWeek,
    recoveredRevenue,
  };
}

export default function NoShowCalculator() {
  const { t, i18n } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const [inputs, setInputs] = useState<CalculatorInputs>(() =>
    parseInputsFromParams(searchParams)
  );

  const output = useMemo(() => calculate(inputs), [inputs]);

  const handleChange = (field: keyof CalculatorInputs, value: number) => {
    setInputs((prev) => ({ ...prev, [field]: value }));
  };

  const handleShare = () => {
    const url = `${window.location.origin}/calculadora?${buildShareParams(inputs)}`;
    navigator.clipboard.writeText(url);
  };

  // Sync URL params on input change (debounced via effect)
  useEffect(() => {
    const timeout = setTimeout(() => {
      setSearchParams(buildShareParams(inputs), { replace: true });
    }, 500);
    return () => clearTimeout(timeout);
  }, [inputs, setSearchParams]);

  const lang = i18n.language?.startsWith('pt') ? 'pt' : i18n.language?.startsWith('es') ? 'es' : 'en';
  const titles: Record<string, string> = {
    pt: 'Calculadora de No-Show para Restaurantes | Seatable',
    es: 'Calculadora de No-Show para Restaurantes | Seatable',
    en: 'No-Show Calculator for Restaurants | Seatable',
  };
  const descriptions: Record<string, string> = {
    pt: 'Descubra quanto seu restaurante perde com no-shows. Calculadora gratuita com dados em tempo real.',
    es: 'Descubre cuanto pierde tu restaurante con no-shows. Calculadora gratuita con datos en tiempo real.',
    en: 'Discover how much your restaurant loses to no-shows. Free calculator with real-time data.',
  };

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name: titles[lang] || titles.en,
    description: descriptions[lang] || descriptions.en,
    url: 'https://seatable.one/calculadora',
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'All',
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'BRL',
    },
    creator: {
      '@type': 'Organization',
      name: 'Seatable',
      url: 'https://seatable.one',
    },
  };

  return (
    <>
      <Helmet>
        <title>{titles[lang] || titles.en}</title>
        <meta name="description" content={descriptions[lang] || descriptions.en} />
        <meta property="og:title" content={titles[lang] || titles.en} />
        <meta property="og:description" content={descriptions[lang] || descriptions.en} />
        <meta property="og:url" content="https://seatable.one/calculadora" />
        <meta property="og:type" content="website" />
        <link rel="canonical" href="https://seatable.one/calculadora" />
        <script type="application/ld+json">{JSON.stringify(jsonLd)}</script>
      </Helmet>

      <div className="min-h-screen bg-warm-white">
        <LandingNav />

        {/* Hero */}
        <section className="px-6 sm:px-16 pt-16 pb-8 max-w-5xl mx-auto text-center">
          <h1 className="font-serif text-4xl sm:text-[48px] leading-tight text-deep-charcoal mb-4">
            {t('calculator.hero.heading', 'Quanto seu restaurante perde com no-shows?')}
          </h1>
          <p className="text-lg text-stone-gray max-w-2xl mx-auto">
            {t('calculator.hero.subtitle', 'Use a calculadora gratuita e descubra o impacto real dos no-shows na sua receita.')}
          </p>
        </section>

        {/* Calculator */}
        <section className="px-6 sm:px-16 pb-16 max-w-5xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <CalculatorSliders inputs={inputs} onChange={handleChange} />
            <CalculatorResults output={output} onShare={handleShare} />
          </div>
        </section>

        {/* CTA Section */}
        <CalculatorCTA />

        <Footer />
      </div>
    </>
  );
}
