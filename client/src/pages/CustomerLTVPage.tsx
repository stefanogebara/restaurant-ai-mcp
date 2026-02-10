import { useState, useEffect, useRef, useCallback } from 'react';
import { Users, Lock, Crown, Loader2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import DashboardLayout from '../components/layout/DashboardLayout';
import LTVDashboard from '../components/host/LTVDashboard';
import AnalyticsGuide from '../components/common/AnalyticsGuide';
import Breadcrumb, { breadcrumbConfigs } from '../components/common/Breadcrumb';
import { useSubscription } from '../hooks/useSubscription';
import { hasFeatureAccess, type PlanType } from '../config/planFeatures';

function LTVDashboardWithTimeout() {
  const [timedOut, setTimedOut] = useState(false);
  const [, setLoaded] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // After 10 seconds, check if still showing spinner
  useEffect(() => {
    const timer = setTimeout(() => {
      if (containerRef.current) {
        const hasSpinner = containerRef.current.querySelector('.animate-spin');
        if (hasSpinner) {
          setTimedOut(true);
        } else {
          setLoaded(true);
        }
      }
    }, 10000);
    return () => clearTimeout(timer);
  }, []);

  // Observe DOM changes to detect when loading finishes even after timeout
  const containerRefCallback = useCallback((node: HTMLDivElement | null) => {
    if (node) {
      (containerRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
      const observer = new MutationObserver(() => {
        const hasSpinner = node.querySelector('.animate-spin');
        if (!hasSpinner && timedOut) {
          setTimedOut(false);
          setLoaded(true);
        }
      });
      observer.observe(node, { childList: true, subtree: true });
      return () => observer.disconnect();
    }
  }, [timedOut]);

  if (timedOut) {
    return (
      <div className="bg-white rounded-xl shadow-lg p-6 border border-[#E7E5E4]">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-[#F5F5F4] flex items-center justify-center">
            <Users className="w-6 h-6 text-[#57534E]" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-[#1C1917]">No analytics data yet</h3>
            <p className="text-sm text-[#57534E]">Customer analytics will appear once reservation data is available. Make sure you have reservations with customer history to see LTV metrics.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRefCallback}>
      <LTVDashboard />
    </div>
  );
}

export default function CustomerLTVPage() {
  const subscription = useSubscription();
  const currentPlan = (subscription.data?.subscription?.plan?.toLowerCase() as PlanType) || undefined;
  const hasAccess = currentPlan ? hasFeatureAccess(currentPlan, 'customerLTV') : false;

  if (subscription.isLoading) {
    return (
      <DashboardLayout>
        <div className="p-8">
          <Breadcrumb items={breadcrumbConfigs.ltv} className="mb-4" />
          <div className="flex items-center justify-center min-h-[50vh]">
            <Loader2 className="w-8 h-8 text-[#9F1239] animate-spin" />
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (!hasAccess) {
    return (
      <DashboardLayout>
        <div className="p-8">
          <Breadcrumb items={breadcrumbConfigs.ltv} className="mb-4" />
          <div className="flex flex-col items-center justify-center min-h-[50vh]">
            <div className="bg-white rounded-2xl border border-[#E7E5E4] p-12 max-w-lg text-center shadow-lg">
              <div className="w-16 h-16 bg-[#9F1239]/10 rounded-full flex items-center justify-center mx-auto mb-6">
                <Lock className="w-8 h-8 text-[#9F1239]" />
              </div>
              <h2 className="text-2xl font-bold text-[#1C1917] mb-3">Customer Lifetime Value</h2>
              <p className="text-[#57534E] mb-6">
                Track your most valuable customers and identify churn risks. Available on the Professional plan.
              </p>
              <div className="flex items-center justify-center gap-2 text-sm text-[#9F1239] font-medium mb-6">
                <Crown className="w-4 h-4" />
                Professional Plan Feature
              </div>
              <Link
                to="/welcome"
                className="inline-flex items-center gap-2 px-6 py-3 bg-[#9F1239] text-white rounded-xl hover:bg-[#881337] transition-colors font-medium"
              >
                Upgrade Plan
              </Link>
            </div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="p-8">
        {/* Breadcrumb Navigation */}
        <Breadcrumb items={breadcrumbConfigs.ltv} className="mb-4" />

        {/* Page Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-[#1C1917] mb-2">Customer Lifetime Value</h1>
          <p className="text-[#57534E]">
            Understand your most valuable customers and identify churn risks
          </p>
        </div>

        {/* Simple Guide - First! */}
        <div className="max-w-7xl mb-8">
          <AnalyticsGuide page="ltv" />
        </div>

        {/* LTV Dashboard - Full Width with timeout fallback */}
        <div className="max-w-7xl">
          <LTVDashboardWithTimeout />
        </div>

        {/* Customer Insights Section */}
        <div className="mt-8 max-w-7xl">
          <div className="bg-white rounded-xl border border-[#E7E5E4] p-6 shadow-lg">
            <h2 className="text-xl font-bold text-[#1C1917] mb-4">Customer Segmentation Strategy</h2>
            <div className="grid md:grid-cols-5 gap-4">
              <div className="bg-[#7c3aed]/10 p-4 rounded-xl border border-[#7c3aed]/20">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-6 h-6 bg-[#7c3aed] rounded-full"></div>
                  <h3 className="font-semibold text-[#7c3aed]">VIP</h3>
                </div>
                <p className="text-xs text-[#57534E]">
                  High-value customers with frequent visits. Offer exclusive perks and priority reservations.
                </p>
              </div>
              <div className="bg-[#9F1239]/10 p-4 rounded-xl border border-[#9F1239]/20">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-6 h-6 bg-[#9F1239] rounded-full"></div>
                  <h3 className="font-semibold text-[#9F1239]">Regular</h3>
                </div>
                <p className="text-xs text-[#57534E]">
                  Loyal customers with consistent visits. Maintain engagement with personalized offers.
                </p>
              </div>
              <div className="bg-[#16a34a]/10 p-4 rounded-xl border border-[#16a34a]/20">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-6 h-6 bg-[#16a34a] rounded-full"></div>
                  <h3 className="font-semibold text-[#16a34a]">Occasional</h3>
                </div>
                <p className="text-xs text-[#57534E]">
                  Moderate visitors. Encourage frequency with targeted promotions and reminders.
                </p>
              </div>
              <div className="bg-[#57534E]/10 p-4 rounded-xl border border-[#57534E]/20">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-6 h-6 bg-[#57534E] rounded-full"></div>
                  <h3 className="font-semibold text-[#57534E]">New</h3>
                </div>
                <p className="text-xs text-[#57534E]">
                  First-time or recent customers. Focus on exceptional experience to drive return visits.
                </p>
              </div>
              <div className="bg-[#d97706]/10 p-4 rounded-xl border border-[#d97706]/20">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-6 h-6 bg-[#d97706] rounded-full"></div>
                  <h3 className="font-semibold text-[#d97706]">At Risk</h3>
                </div>
                <p className="text-xs text-[#57534E]">
                  Customers showing churn signs. Launch retention campaigns immediately.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
