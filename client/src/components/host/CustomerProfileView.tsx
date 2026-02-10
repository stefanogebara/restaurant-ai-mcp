/**
 * Individual Customer Profile View
 *
 * Displays a comprehensive DNA profile for a single customer including
 * behavioral data, AI insights, visit timeline, and predictions.
 */

import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { authFetch } from '../../services/api';
import {
  ArrowLeft,
  User,
  Phone,
  Clock,
  Calendar,
  DollarSign,
  Users,
  Brain,
  Sparkles,
  TrendingUp,
  Star,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Utensils,
  MessageSquare,
  Timer,
  MapPin
} from 'lucide-react';

interface Profile {
  customer_id: string;
  preferred_time_slot: string;
  preferred_day_type: string;
  booking_lead_time_avg: number | null;
  spontaneity_score: number;
  typical_party_size: number;
  dining_style: string;
  brings_children: boolean;
  avg_dining_duration_minutes: number;
  pace_preference: string;
  preferred_seating: string | null;
  noise_tolerance: string;
  dietary_restrictions: string[];
  cuisine_preferences: string[];
  primary_occasion_type: string;
  celebrates_occasions: boolean;
  price_sensitivity: string;
  avg_check_per_person: number | null;
  tip_percentage_avg: number | null;
  orders_appetizers_pct: number | null;
  orders_desserts_pct: number | null;
  orders_wine_pct: number | null;
  feedback_sentiment: string;
  complaint_count: number;
  compliment_count: number;
  profile_confidence: number;
  data_sources_used: string[];
  analysis_version: string;
  last_analyzed_at: string;
}

interface TextSignals {
  dietary_restrictions: string[];
  cuisine_preferences: string[];
  occasion_types: string[];
  dining_style_evidence: string | null;
  has_children: boolean | null;
  seating_preferences: string[];
  noise_sensitivity: string | null;
  sentiment_summary: string | null;
  key_phrases: string[];
  vip_signals: boolean;
  ai_confidence: number;
  text_sources_count: number;
  extracted_signals: Record<string, unknown>;
}

interface Reservation {
  id: string;
  date: string;
  time: string;
  party_size: number;
  status: string;
  special_requests: string | null;
  notes: string | null;
  customer_name: string | null;
}

interface Occasion {
  occasion_type: string;
  next_predicted_date: string;
  probability_score: number;
  party_size: number;
}

interface Prediction {
  prediction_type: string;
  predicted_value: string;
  confidence_score: number;
  predicted_for_date: string | null;
}

interface RevenueSummary {
  total_revenue: number;
  total_visits_with_revenue: number;
  avg_revenue: number;
  total_tips: number;
}

interface FullProfile {
  customer_id: string;
  customer_name: string | null;
  profile: Profile | null;
  text_signals: TextSignals | null;
  occasions: Occasion[];
  predictions: Prediction[];
  reservations: Reservation[];
  revenue_summary: RevenueSummary;
}

export default function CustomerProfileView() {
  const { customerId } = useParams<{ customerId: string }>();
  const navigate = useNavigate();
  const [data, setData] = useState<FullProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAllReservations, setShowAllReservations] = useState(false);

  useEffect(() => {
    if (customerId) {
      fetchProfile(customerId);
    }
  }, [customerId]);

  const fetchProfile = async (id: string) => {
    try {
      setIsLoading(true);
      setError(null);
      const response = await authFetch(`/api/customer-dna?action=profile&customer_id=${encodeURIComponent(id)}`);
      const result = await response.json();
      if (result.success) {
        setData(result.data);
      } else {
        setError(result.error || 'Failed to load profile');
      }
    } catch (err) {
      setError('Failed to load customer profile');
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAnalyze = async () => {
    if (!customerId) return;
    try {
      setIsLoading(true);
      await authFetch(`/api/customer-dna?action=analyze&customer_id=${encodeURIComponent(customerId)}`);
      await fetchProfile(customerId);
    } catch (err) {
      console.error(err);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-[#E7E5E4] border-t-[#9F1239]"></div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="space-y-4">
        <button onClick={() => navigate('/host-dashboard/dna')} className="flex items-center gap-2 text-[#57534E] hover:text-[#1C1917] transition-colors">
          <ArrowLeft className="w-4 h-4" /> Back to DNA Dashboard
        </button>
        <div className="bg-white rounded-xl border border-[#E7E5E4] p-8 text-center">
          <AlertCircle className="w-12 h-12 text-[#57534E] mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-[#1C1917] mb-2">{error || 'Profile not found'}</h3>
          <p className="text-sm text-[#57534E] mb-4">This customer may not have been analyzed yet.</p>
          <button onClick={handleAnalyze} className="px-4 py-2 bg-[#9F1239] text-white rounded-xl hover:bg-[#881337] transition-colors">
            Analyze Now
          </button>
        </div>
      </div>
    );
  }

  const profile = data.profile;
  const textSignals = data.text_signals;
  const displayName = data.customer_name || data.customer_id;

  const getTierBadge = () => {
    const confidence = profile?.profile_confidence || 0;
    if (confidence >= 80) return { label: 'VIP', color: 'bg-[#9F1239] text-white' };
    if (confidence >= 50) return { label: 'Regular', color: 'bg-[#7c3aed]/20 text-[#7c3aed]' };
    return { label: 'New', color: 'bg-[#57534E]/20 text-[#57534E]' };
  };

  const tier = getTierBadge();

  const getDiningStyleColor = (style: string) => {
    const colors: Record<string, string> = {
      solo: 'bg-[#57534E]/10 text-[#57534E] border-[#57534E]/30',
      couple: 'bg-[#9F1239]/10 text-[#9F1239] border-[#9F1239]/30',
      family: 'bg-[#7c3aed]/10 text-[#7c3aed] border-[#7c3aed]/30',
      business: 'bg-[#d97706]/10 text-[#d97706] border-[#d97706]/30',
      group: 'bg-[#16a34a]/10 text-[#16a34a] border-[#16a34a]/30'
    };
    return colors[style] || colors.solo;
  };

  const getSentimentColor = (sentiment: string) => {
    if (sentiment.includes('positive') || sentiment === 'happy' || sentiment === 'satisfied') return 'text-[#16a34a]';
    if (sentiment.includes('negative') || sentiment === 'frustrated' || sentiment === 'angry') return 'text-[#dc2626]';
    return 'text-[#d97706]';
  };

  const formatCurrency = (val: number | null) => {
    if (val == null) return '--';
    return `$${val.toFixed(2)}`;
  };

  return (
    <div className="space-y-6">
      {/* Back Navigation */}
      <button onClick={() => navigate('/host-dashboard/dna')} className="flex items-center gap-2 text-[#57534E] hover:text-[#1C1917] transition-colors">
        <ArrowLeft className="w-4 h-4" /> Back to DNA Dashboard
      </button>

      {/* Header */}
      <div className="bg-white rounded-xl border border-[#E7E5E4] p-6 shadow-lg">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-[#7c3aed]/10 flex items-center justify-center">
              <User className="w-8 h-8 text-[#7c3aed]" />
            </div>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold text-[#1C1917]">{displayName}</h1>
                <span className={`px-3 py-1 rounded-full text-xs font-semibold ${tier.color}`}>{tier.label}</span>
                {textSignals?.vip_signals && (
                  <span className="px-3 py-1 rounded-full text-xs font-semibold bg-[#d97706]/20 text-[#d97706]">
                    <Star className="w-3 h-3 inline mr-1" />VIP Signals
                  </span>
                )}
              </div>
              <div className="flex items-center gap-4 mt-1 text-sm text-[#57534E]">
                <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{data.customer_id}</span>
                <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{data.reservations.length} visits</span>
                {profile?.last_analyzed_at && (
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    Analyzed {new Date(profile.last_analyzed_at).toLocaleDateString()}
                  </span>
                )}
              </div>
            </div>
          </div>
          {/* Confidence Meter */}
          <div className="text-center">
            <div className="relative w-16 h-16">
              <svg className="w-16 h-16 -rotate-90" viewBox="0 0 36 36">
                <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="#E7E5E4" strokeWidth="3" />
                <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="#7c3aed" strokeWidth="3" strokeDasharray={`${profile?.profile_confidence || 0}, 100`} />
              </svg>
              <span className="absolute inset-0 flex items-center justify-center text-sm font-bold text-[#1C1917]">
                {profile?.profile_confidence || 0}%
              </span>
            </div>
            <div className="text-xs text-[#57534E] mt-1">Confidence</div>
          </div>
        </div>

        {/* Data Sources */}
        {profile?.data_sources_used && profile.data_sources_used.length > 0 && (
          <div className="mt-4 flex items-center gap-2 flex-wrap">
            <span className="text-xs text-[#57534E]">Data sources:</span>
            {profile.data_sources_used.map((src) => (
              <span key={src} className="px-2 py-0.5 bg-[#F5F5F4] rounded-full text-xs text-[#57534E]">{src.replace('_', ' ')}</span>
            ))}
            {profile.analysis_version && (
              <span className="px-2 py-0.5 bg-[#7c3aed]/10 rounded-full text-xs text-[#7c3aed]">{profile.analysis_version}</span>
            )}
          </div>
        )}
      </div>

      {/* Key Metrics Row */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-[#E7E5E4] p-4 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <DollarSign className="w-4 h-4 text-[#16a34a]" />
            <span className="text-xs text-[#57534E]">Avg Check/Person</span>
          </div>
          <div className="text-2xl font-bold text-[#1C1917]">{formatCurrency(profile?.avg_check_per_person ?? null)}</div>
        </div>
        <div className="bg-white rounded-xl border border-[#E7E5E4] p-4 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="w-4 h-4 text-[#d97706]" />
            <span className="text-xs text-[#57534E]">Avg Tip</span>
          </div>
          <div className="text-2xl font-bold text-[#1C1917]">
            {profile?.tip_percentage_avg != null ? `${profile.tip_percentage_avg}%` : '--'}
          </div>
        </div>
        <div className="bg-white rounded-xl border border-[#E7E5E4] p-4 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <Timer className="w-4 h-4 text-[#7c3aed]" />
            <span className="text-xs text-[#57534E]">Avg Duration</span>
          </div>
          <div className="text-2xl font-bold text-[#1C1917]">
            {profile?.avg_dining_duration_minutes ? `${profile.avg_dining_duration_minutes}m` : '--'}
          </div>
        </div>
        <div className="bg-white rounded-xl border border-[#E7E5E4] p-4 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <Users className="w-4 h-4 text-[#9F1239]" />
            <span className="text-xs text-[#57534E]">Typical Party</span>
          </div>
          <div className="text-2xl font-bold text-[#1C1917]">
            {profile?.typical_party_size || '--'}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* Behavioral Profile */}
        <div className="bg-white rounded-xl border border-[#E7E5E4] p-6 shadow-lg">
          <h2 className="text-lg font-semibold text-[#1C1917] mb-4 flex items-center gap-2">
            <Brain className="w-5 h-5 text-[#7c3aed]" />
            Behavioral Profile
          </h2>
          <div className="space-y-4">
            {/* Dining Style */}
            <div>
              <div className="text-xs text-[#57534E] mb-1">Dining Style</div>
              <span className={`inline-flex px-3 py-1 rounded-full text-sm font-semibold border capitalize ${getDiningStyleColor(profile?.dining_style || 'unknown')}`}>
                {profile?.dining_style || 'Unknown'}
              </span>
              {textSignals?.extracted_signals && (textSignals.extracted_signals as Record<string, string>).dining_style_reasoning && (
                <p className="text-xs text-[#57534E] mt-1 italic">
                  AI: "{(textSignals.extracted_signals as Record<string, string>).dining_style_reasoning}"
                </p>
              )}
            </div>

            {/* Occasion & Spontaneity */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="text-xs text-[#57534E] mb-1">Primary Occasion</div>
                <div className="text-sm font-medium text-[#1C1917] capitalize">{profile?.primary_occasion_type || '--'}</div>
              </div>
              <div>
                <div className="text-xs text-[#57534E] mb-1">Spontaneity</div>
                <div className="text-sm font-medium text-[#1C1917]">{profile?.spontaneity_score || 0}/100</div>
              </div>
            </div>

            {/* Price Sensitivity & Pace */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="text-xs text-[#57534E] mb-1">Price Sensitivity</div>
                <div className="text-sm font-medium text-[#1C1917] capitalize">{profile?.price_sensitivity || '--'}</div>
              </div>
              <div>
                <div className="text-xs text-[#57534E] mb-1">Dining Pace</div>
                <div className="text-sm font-medium text-[#1C1917] capitalize">{profile?.pace_preference || '--'}</div>
              </div>
            </div>

            {/* Dietary Restrictions */}
            {profile?.dietary_restrictions && profile.dietary_restrictions.length > 0 && (
              <div>
                <div className="text-xs text-[#57534E] mb-1">Dietary Restrictions</div>
                <div className="flex flex-wrap gap-1">
                  {profile.dietary_restrictions.map((d) => (
                    <span key={d} className="px-2 py-0.5 bg-[#dc2626]/10 text-[#dc2626] text-xs rounded-full">{d}</span>
                  ))}
                </div>
              </div>
            )}

            {/* Cuisine Preferences */}
            {profile?.cuisine_preferences && profile.cuisine_preferences.length > 0 && (
              <div>
                <div className="text-xs text-[#57534E] mb-1">Cuisine Preferences</div>
                <div className="flex flex-wrap gap-1">
                  {profile.cuisine_preferences.map((c) => (
                    <span key={c} className="px-2 py-0.5 bg-[#16a34a]/10 text-[#16a34a] text-xs rounded-full">{c}</span>
                  ))}
                </div>
              </div>
            )}

            {/* Seating & Children */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="text-xs text-[#57534E] mb-1">Preferred Seating</div>
                <div className="text-sm font-medium text-[#1C1917] flex items-center gap-1">
                  <MapPin className="w-3 h-3" />
                  {profile?.preferred_seating || 'No preference'}
                </div>
              </div>
              <div>
                <div className="text-xs text-[#57534E] mb-1">Brings Children</div>
                <div className="text-sm font-medium text-[#1C1917]">{profile?.brings_children ? 'Yes' : 'No'}</div>
              </div>
            </div>

            {/* Feedback Sentiment */}
            <div>
              <div className="text-xs text-[#57534E] mb-1">Feedback Sentiment</div>
              <div className={`text-sm font-medium capitalize ${getSentimentColor(profile?.feedback_sentiment || 'neutral')}`}>
                {profile?.feedback_sentiment || 'Neutral'}
                {(profile?.compliment_count || 0) > 0 && <span className="text-[#16a34a] ml-2">+{profile?.compliment_count} compliments</span>}
                {(profile?.complaint_count || 0) > 0 && <span className="text-[#dc2626] ml-2">{profile?.complaint_count} complaints</span>}
              </div>
            </div>
          </div>
        </div>

        {/* AI Insights */}
        <div className="bg-white rounded-xl border border-[#E7E5E4] p-6 shadow-lg">
          <h2 className="text-lg font-semibold text-[#1C1917] mb-4 flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-[#d97706]" />
            AI Insights
          </h2>

          {textSignals ? (
            <div className="space-y-4">
              <div className="p-3 bg-[#d97706]/5 rounded-lg border border-[#d97706]/20">
                <div className="text-xs text-[#57534E] mb-1">
                  Based on {textSignals.text_sources_count} text sources (AI confidence: {textSignals.ai_confidence}%)
                </div>
              </div>

              {/* Key Phrases */}
              {textSignals.key_phrases && textSignals.key_phrases.length > 0 && (
                <div>
                  <div className="text-xs text-[#57534E] mb-2">Key Phrases</div>
                  <div className="space-y-1">
                    {textSignals.key_phrases.map((phrase, i) => (
                      <div key={i} className="flex items-start gap-2">
                        <MessageSquare className="w-3 h-3 text-[#d97706] mt-1 shrink-0" />
                        <span className="text-sm text-[#1C1917] italic">"{phrase}"</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* AI-Detected Occasion Types */}
              {textSignals.occasion_types && textSignals.occasion_types.length > 0 && (
                <div>
                  <div className="text-xs text-[#57534E] mb-1">Detected Occasions</div>
                  <div className="flex flex-wrap gap-1">
                    {textSignals.occasion_types.map((o) => (
                      <span key={o} className="px-2 py-0.5 bg-[#9F1239]/10 text-[#9F1239] text-xs rounded-full capitalize">{o.replace('_', ' ')}</span>
                    ))}
                  </div>
                </div>
              )}

              {/* Seating Preferences from AI */}
              {textSignals.seating_preferences && textSignals.seating_preferences.length > 0 && (
                <div>
                  <div className="text-xs text-[#57534E] mb-1">Seating Preferences (AI)</div>
                  <div className="flex flex-wrap gap-1">
                    {textSignals.seating_preferences.map((s) => (
                      <span key={s} className="px-2 py-0.5 bg-[#7c3aed]/10 text-[#7c3aed] text-xs rounded-full">{s}</span>
                    ))}
                  </div>
                </div>
              )}

              {/* Sentiment */}
              {textSignals.sentiment_summary && (
                <div>
                  <div className="text-xs text-[#57534E] mb-1">AI Sentiment</div>
                  <div className={`text-sm font-medium capitalize ${getSentimentColor(textSignals.sentiment_summary)}`}>
                    {textSignals.sentiment_summary.replace('_', ' ')}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-8 text-[#57534E]">
              <Sparkles className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No AI insights available yet.</p>
              <p className="text-xs mt-1">Run analysis to extract signals from text data.</p>
              <button onClick={handleAnalyze} className="mt-3 px-4 py-2 bg-[#d97706] text-white text-sm rounded-lg hover:bg-[#b45309] transition-colors">
                Analyze with AI
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Visit Timeline */}
      <div className="bg-white rounded-xl border border-[#E7E5E4] p-6 shadow-lg">
        <button
          onClick={() => setShowAllReservations(!showAllReservations)}
          className="w-full flex items-center justify-between"
        >
          <h2 className="text-lg font-semibold text-[#1C1917] flex items-center gap-2">
            <Utensils className="w-5 h-5 text-[#9F1239]" />
            Visit History
            <span className="px-2 py-0.5 bg-[#9F1239]/10 text-[#9F1239] text-xs rounded-full font-semibold">{data.reservations.length}</span>
          </h2>
          {showAllReservations ? <ChevronUp className="w-5 h-5 text-[#57534E]" /> : <ChevronDown className="w-5 h-5 text-[#57534E]" />}
        </button>

        <div className="mt-4 space-y-2">
          {(showAllReservations ? data.reservations : data.reservations.slice(0, 5)).map((res) => (
            <div key={res.id} className="flex items-center justify-between p-3 bg-[#F5F5F4] rounded-lg">
              <div className="flex items-center gap-4">
                <div>
                  <div className="text-sm font-medium text-[#1C1917]">
                    {new Date(res.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </div>
                  <div className="text-xs text-[#57534E]">{res.time}</div>
                </div>
                <div>
                  <div className="text-sm text-[#1C1917]">Party of {res.party_size}</div>
                  <div className="text-xs text-[#57534E] capitalize">{res.status}</div>
                </div>
              </div>
              {res.special_requests && (
                <div className="max-w-xs text-right">
                  <div className="text-xs text-[#57534E] italic truncate">"{res.special_requests}"</div>
                </div>
              )}
            </div>
          ))}
          {data.reservations.length === 0 && (
            <div className="text-center py-4 text-sm text-[#57534E]">No reservation history</div>
          )}
        </div>
      </div>

      {/* Predictions & Revenue */}
      <div className="grid grid-cols-2 gap-6">
        {/* Predictions */}
        <div className="bg-white rounded-xl border border-[#E7E5E4] p-6 shadow-lg">
          <h2 className="text-lg font-semibold text-[#1C1917] mb-4 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-[#16a34a]" />
            Predictions
          </h2>
          {data.predictions.length > 0 ? (
            <div className="space-y-3">
              {data.predictions.map((pred, i) => (
                <div key={i} className="p-3 bg-[#16a34a]/5 rounded-lg border border-[#16a34a]/20">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-medium text-[#1C1917] capitalize">{pred.prediction_type.replace(/_/g, ' ')}</div>
                    <div className="text-xs text-[#57534E]">{Math.round(pred.confidence_score * 100)}% confidence</div>
                  </div>
                  <div className="text-lg font-bold text-[#16a34a] mt-1">{pred.predicted_value}</div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-4 text-sm text-[#57534E]">No predictions available. Need more visit data.</div>
          )}

          {/* Occasions */}
          {data.occasions.length > 0 && (
            <div className="mt-4 pt-4 border-t border-[#E7E5E4]">
              <div className="text-sm font-semibold text-[#1C1917] mb-2">Upcoming Occasions</div>
              {data.occasions.map((occ, i) => (
                <div key={i} className="flex items-center justify-between p-2 bg-[#9F1239]/5 rounded-lg mb-1">
                  <span className="text-sm text-[#1C1917] capitalize">{occ.occasion_type}</span>
                  <span className="text-sm font-medium text-[#9F1239]">
                    {new Date(occ.next_predicted_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Revenue Summary */}
        <div className="bg-white rounded-xl border border-[#E7E5E4] p-6 shadow-lg">
          <h2 className="text-lg font-semibold text-[#1C1917] mb-4 flex items-center gap-2">
            <DollarSign className="w-5 h-5 text-[#d97706]" />
            Revenue Summary
          </h2>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 bg-[#d97706]/5 rounded-lg">
                <div className="text-xs text-[#57534E]">Total Revenue</div>
                <div className="text-xl font-bold text-[#1C1917]">${data.revenue_summary.total_revenue.toFixed(2)}</div>
              </div>
              <div className="p-3 bg-[#d97706]/5 rounded-lg">
                <div className="text-xs text-[#57534E]">Avg per Visit</div>
                <div className="text-xl font-bold text-[#1C1917]">${data.revenue_summary.avg_revenue.toFixed(2)}</div>
              </div>
              <div className="p-3 bg-[#d97706]/5 rounded-lg">
                <div className="text-xs text-[#57534E]">Total Tips</div>
                <div className="text-xl font-bold text-[#1C1917]">${data.revenue_summary.total_tips.toFixed(2)}</div>
              </div>
              <div className="p-3 bg-[#d97706]/5 rounded-lg">
                <div className="text-xs text-[#57534E]">Revenue Visits</div>
                <div className="text-xl font-bold text-[#1C1917]">{data.revenue_summary.total_visits_with_revenue}</div>
              </div>
            </div>

            {/* Ordering Patterns */}
            {(profile?.orders_appetizers_pct != null || profile?.orders_desserts_pct != null || profile?.orders_wine_pct != null) && (
              <div>
                <div className="text-sm font-medium text-[#1C1917] mb-2">Ordering Patterns</div>
                <div className="space-y-2">
                  {profile?.orders_appetizers_pct != null && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-[#57534E] w-24">Appetizers</span>
                      <div className="flex-1 bg-[#F5F5F4] h-2 rounded-full overflow-hidden">
                        <div className="h-full bg-[#d97706]" style={{ width: `${profile.orders_appetizers_pct}%` }} />
                      </div>
                      <span className="text-xs text-[#57534E] w-10 text-right">{profile.orders_appetizers_pct}%</span>
                    </div>
                  )}
                  {profile?.orders_desserts_pct != null && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-[#57534E] w-24">Desserts</span>
                      <div className="flex-1 bg-[#F5F5F4] h-2 rounded-full overflow-hidden">
                        <div className="h-full bg-[#9F1239]" style={{ width: `${profile.orders_desserts_pct}%` }} />
                      </div>
                      <span className="text-xs text-[#57534E] w-10 text-right">{profile.orders_desserts_pct}%</span>
                    </div>
                  )}
                  {profile?.orders_wine_pct != null && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-[#57534E] w-24">Wine</span>
                      <div className="flex-1 bg-[#F5F5F4] h-2 rounded-full overflow-hidden">
                        <div className="h-full bg-[#7c3aed]" style={{ width: `${profile.orders_wine_pct}%` }} />
                      </div>
                      <span className="text-xs text-[#57534E] w-10 text-right">{profile.orders_wine_pct}%</span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Re-analyze Button */}
      <div className="flex justify-center">
        <button
          onClick={handleAnalyze}
          className="px-6 py-3 bg-[#9F1239] hover:bg-[#881337] text-white font-semibold rounded-xl transition-all shadow-lg hover:shadow-[#9F1239]/30 flex items-center gap-2"
        >
          <Brain className="w-5 h-5" />
          Re-analyze Customer DNA
        </button>
      </div>
    </div>
  );
}
