import DashboardLayout from '../components/layout/DashboardLayout';
import { authFetch } from '../services/api';
import { useQuery } from '@tanstack/react-query';

export default function SegoviaInsightsPage() {
  // Fetch Segovia insights from API
  const { data: insights, isLoading } = useQuery({
    queryKey: ['segovia-insights'],
    queryFn: async () => {
      const response = await authFetch('/api/ml-training-status?action=segovia-insights');
      if (!response.ok) throw new Error('Failed to fetch Segovia insights');
      return response.json();
    },
    refetchInterval: 30000 // Refresh every 30 seconds
  });

  const segoviaData = insights?.data || {};

  return (
    <DashboardLayout>
      <div className="p-8">
        {/* Page Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-[#1C1917] mb-2 flex items-center gap-3">
            🏰 Segovia Tourism Insights
          </h1>
          <p className="text-[#57534E]">
            Understand your international tourist patterns, language needs, and local vs visitor dynamics
          </p>
        </div>

        {/* Simple Guide */}
        <div className="max-w-7xl mb-8">
          <div className="bg-[#d97706]/5 rounded-xl border-2 border-[#d97706]/20 p-6">
            <div className="flex items-start gap-4 mb-4">
              <div className="w-12 h-12 bg-[#d97706]/20 rounded-full flex items-center justify-center flex-shrink-0">
                <span className="text-2xl">🏰</span>
              </div>
              <div>
                <h3 className="text-xl font-bold text-[#1C1917] mb-1">Understanding Segovia Tourism Data</h3>
                <p className="text-sm text-[#57534E]">
                  Segovia attracts thousands of international tourists for its famous cochinillo (roast suckling pig), medieval architecture, and Roman aqueduct. This dashboard tracks key patterns to help you serve both tourists and locals better.
                </p>
              </div>
            </div>
            <div className="grid md:grid-cols-3 gap-4 text-sm">
              <div className="bg-white rounded-xl border border-[#E7E5E4] p-4 shadow-md">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xl">🌍</span>
                  <h4 className="font-bold text-[#1C1917]">Tourist vs Local</h4>
                </div>
                <p className="text-[#57534E]">
                  Tourists often have different booking patterns (last-minute, language needs) compared to locals. Track this ratio to optimize staffing.
                </p>
              </div>
              <div className="bg-white rounded-xl border border-[#E7E5E4] p-4 shadow-md">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xl">🗣️</span>
                  <h4 className="font-bold text-[#1C1917]">Language Support</h4>
                </div>
                <p className="text-[#57534E]">
                  Know which languages your customers speak to provide better service and reduce no-shows from miscommunication.
                </p>
              </div>
              <div className="bg-white rounded-xl border border-[#E7E5E4] p-4 shadow-md">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xl">🥗</span>
                  <h4 className="font-bold text-[#1C1917]">Dietary Needs</h4>
                </div>
                <p className="text-[#57534E]">
                  Track vegetarian and other dietary requests to prepare alternatives to cochinillo and meet international tastes.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Tourist vs Local Analytics */}
        <div className="max-w-7xl mb-6">
          <div className="bg-white rounded-xl border border-[#E7E5E4] p-6 shadow-lg">
            <h2 className="text-xl font-bold text-[#1C1917] mb-6 flex items-center gap-2">
              <span className="text-2xl">🌍</span>
              Tourist vs Local Breakdown
            </h2>

            {isLoading ? (
              <div className="text-center py-12 text-[#57534E]">Loading insights...</div>
            ) : (
              <div className="grid md:grid-cols-2 gap-6">
                {/* Tourist Stats */}
                <div className="bg-[#7c3aed]/10 rounded-xl border border-[#7c3aed]/20 p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 bg-[#7c3aed]/20 rounded-full flex items-center justify-center">
                        <span className="text-2xl">✈️</span>
                      </div>
                      <div>
                        <h3 className="text-lg font-bold text-[#1C1917]">International Tourists</h3>
                        <p className="text-sm text-[#57534E]">Visitors from abroad</p>
                      </div>
                    </div>
                    <div className="text-3xl font-bold text-[#7c3aed]">
                      {segoviaData.touristVsLocal?.tourist?.count || 0}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-[#57534E]">No-Show Rate:</span>
                      <span className="font-semibold text-[#1C1917]">
                        {segoviaData.touristVsLocal?.tourist?.noShowRate || 0}%
                      </span>
                    </div>
                    <div className="text-xs text-[#57534E] mt-2">
                      💡 Tourists may need extra confirmation due to travel uncertainties
                    </div>
                  </div>
                </div>

                {/* Local Stats */}
                <div className="bg-[#16a34a]/10 rounded-xl border border-[#16a34a]/20 p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 bg-[#16a34a]/20 rounded-full flex items-center justify-center">
                        <span className="text-2xl">🏘️</span>
                      </div>
                      <div>
                        <h3 className="text-lg font-bold text-[#1C1917]">Local Customers</h3>
                        <p className="text-sm text-[#57534E]">Segovia residents</p>
                      </div>
                    </div>
                    <div className="text-3xl font-bold text-[#16a34a]">
                      {segoviaData.touristVsLocal?.local?.count || 0}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-[#57534E]">No-Show Rate:</span>
                      <span className="font-semibold text-[#1C1917]">
                        {segoviaData.touristVsLocal?.local?.noShowRate || 0}%
                      </span>
                    </div>
                    <div className="text-xs text-[#57534E] mt-2">
                      💡 Locals are typically more reliable and become repeat customers
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Language & Seating Preferences */}
        <div className="max-w-7xl grid md:grid-cols-2 gap-6 mb-6">
          {/* Language Distribution */}
          <div className="bg-white rounded-xl border border-[#E7E5E4] p-6 shadow-lg">
            <h3 className="text-lg font-bold text-[#1C1917] mb-4 flex items-center gap-2">
              <span className="text-xl">🗣️</span>
              Language Preferences
            </h3>
            {isLoading ? (
              <div className="text-center py-8 text-[#57534E]">Loading...</div>
            ) : (
              <div className="space-y-3">
                {Object.entries(segoviaData.languageDistribution || {}).map(([lang, count]: [string, any]) => (
                  <div key={lang} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">
                        {lang === 'Spanish' && '🇪🇸'}
                        {lang === 'English' && '🇬🇧'}
                        {lang === 'Chinese' && '🇨🇳'}
                        {lang === 'French' && '🇫🇷'}
                      </span>
                      <span className="font-medium text-[#1C1917]">{lang}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-24 bg-[#F5F5F4] rounded-full h-2">
                        <div
                          className="bg-[#7c3aed] h-2 rounded-full"
                          style={{width: `${(count / segoviaData.totalAnalyzed * 100)}%`}}
                        ></div>
                      </div>
                      <span className="text-sm font-semibold w-8 text-right text-[#1C1917]">{count}</span>
                    </div>
                  </div>
                ))}
                {Object.keys(segoviaData.languageDistribution || {}).length === 0 && (
                  <div className="text-center py-4 text-[#57534E] text-sm">
                    No language data yet. Data will appear as reservations are completed.
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Seating Preferences */}
          <div className="bg-white rounded-xl border border-[#E7E5E4] p-6 shadow-lg">
            <h3 className="text-lg font-bold text-[#1C1917] mb-4 flex items-center gap-2">
              <span className="text-xl">🪑</span>
              Seating Preferences
            </h3>
            {isLoading ? (
              <div className="text-center py-8 text-[#57534E]">Loading...</div>
            ) : (
              <div className="space-y-3">
                {Object.entries(segoviaData.seatingPreferences || {}).map(([seat, count]: [string, any]) => (
                  <div key={seat} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">
                        {seat === 'Terrace' && '☀️'}
                        {seat === 'Window' && '🪟'}
                        {seat === 'Indoor' && '🏠'}
                        {seat === 'Bar' && '🍷'}
                      </span>
                      <span className="font-medium text-[#1C1917]">{seat}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-24 bg-[#F5F5F4] rounded-full h-2">
                        <div
                          className="bg-[#16a34a] h-2 rounded-full"
                          style={{width: `${(count / segoviaData.totalAnalyzed * 100)}%`}}
                        ></div>
                      </div>
                      <span className="text-sm font-semibold w-8 text-right text-[#1C1917]">{count}</span>
                    </div>
                  </div>
                ))}
                {Object.keys(segoviaData.seatingPreferences || {}).length === 0 && (
                  <div className="text-center py-4 text-[#57534E] text-sm">
                    No seating data yet. Data will appear as reservations are completed.
                  </div>
                )}
              </div>
            )}
            <div className="mt-4 p-3 bg-[#d97706]/10 border border-[#d97706]/20 rounded-xl text-xs text-[#57534E]">
              💡 Terrace seating is highly popular in Segovia! Consider weather-based cancellation policies.
            </div>
          </div>
        </div>

        {/* Dietary Restrictions & Special Occasions */}
        <div className="max-w-7xl grid md:grid-cols-2 gap-6">
          {/* Dietary Restrictions */}
          <div className="bg-white rounded-xl border border-[#E7E5E4] p-6 shadow-lg">
            <h3 className="text-lg font-bold text-[#1C1917] mb-4 flex items-center gap-2">
              <span className="text-xl">🥗</span>
              Dietary Restrictions
            </h3>
            {isLoading ? (
              <div className="text-center py-8 text-[#57534E]">Loading...</div>
            ) : (
              <div className="space-y-2">
                {Object.entries(segoviaData.dietaryRestrictions || {}).map(([diet, count]: [string, any]) => (
                  <div key={diet} className="flex items-center justify-between text-sm">
                    <span className="capitalize text-[#1C1917]">{diet}</span>
                    <span className="font-semibold text-[#1C1917]">{count}</span>
                  </div>
                ))}
                {Object.keys(segoviaData.dietaryRestrictions || {}).length === 0 && (
                  <div className="text-center py-4 text-[#57534E] text-sm">
                    No dietary restriction data yet
                  </div>
                )}
              </div>
            )}
            <div className="mt-4 p-3 bg-[#7c3aed]/10 border border-[#7c3aed]/20 rounded-xl text-xs text-[#57534E]">
              🐷 Many tourists seek vegetarian alternatives to cochinillo - be prepared!
            </div>
          </div>

          {/* Special Occasions */}
          <div className="bg-white rounded-xl border border-[#E7E5E4] p-6 shadow-lg">
            <h3 className="text-lg font-bold text-[#1C1917] mb-4 flex items-center gap-2">
              <span className="text-xl">🎉</span>
              Special Occasions
            </h3>
            {isLoading ? (
              <div className="text-center py-8 text-[#57534E]">Loading...</div>
            ) : (
              <div className="space-y-2">
                {Object.entries(segoviaData.specialOccasions || {}).map(([occasion, count]: [string, any]) => (
                  <div key={occasion} className="flex items-center justify-between text-sm">
                    <span className="text-[#1C1917]">{occasion}</span>
                    <span className="font-semibold text-[#1C1917]">{count}</span>
                  </div>
                ))}
                {Object.keys(segoviaData.specialOccasions || {}).length === 0 && (
                  <div className="text-center py-4 text-[#57534E] text-sm">
                    No special occasion data yet
                  </div>
                )}
              </div>
            )}
            <div className="mt-4 p-3 bg-[#9F1239]/10 border border-[#9F1239]/20 rounded-xl text-xs text-[#57534E]">
              💝 Special occasions have lower no-show rates - treat them as VIP!
            </div>
          </div>
        </div>

        {/* Data Collection Notice */}
        <div className="mt-6 max-w-7xl">
          <div className="bg-[#F5F5F4] rounded-xl border border-[#E7E5E4] p-4 text-sm text-[#57534E] text-center">
            📊 Analyzed {segoviaData.totalAnalyzed || 0} completed reservations • Data updates in real-time as customers dine
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
