import ThiingsIcon from '../common/ThiingsIcon';
import { getDiningStyleColor, getSentimentColor } from './customerProfileHelpers';
import type { Profile, TextSignals } from './customerProfile.types';

interface CustomerBehavioralProfileProps {
  profile: Profile | null;
  textSignals: TextSignals | null;
}

export default function CustomerBehavioralProfile({ profile, textSignals }: CustomerBehavioralProfileProps) {
  return (
    <div className="glass-card p-6">
      <h2 className="text-lg font-semibold font-serif text-deep-charcoal mb-4 flex items-center gap-2">
        <ThiingsIcon name="brain" size="sm" />
        Behavioral Profile
      </h2>
      <div className="space-y-4">
        <div>
          <div className="text-xs text-stone-gray mb-1">Dining Style</div>
          <span className={`inline-flex px-3 py-1 rounded-full text-sm font-semibold border capitalize ${getDiningStyleColor(profile?.dining_style || 'unknown')}`}>
            {profile?.dining_style || 'Unknown'}
          </span>
          {textSignals?.extracted_signals && (textSignals.extracted_signals as Record<string, string>).dining_style_reasoning && (
            <p className="text-xs text-stone-gray mt-1 italic">
              AI: "{(textSignals.extracted_signals as Record<string, string>).dining_style_reasoning}"
            </p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className="text-xs text-stone-gray mb-1">Primary Occasion</div>
            <div className="text-sm font-medium text-deep-charcoal capitalize">{profile?.primary_occasion_type || '--'}</div>
          </div>
          <div>
            <div className="text-xs text-stone-gray mb-1">Spontaneity</div>
            <div className="text-sm font-medium text-deep-charcoal">{profile?.spontaneity_score || 0}/100</div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className="text-xs text-stone-gray mb-1">Price Sensitivity</div>
            <div className="text-sm font-medium text-deep-charcoal capitalize">{profile?.price_sensitivity || '--'}</div>
          </div>
          <div>
            <div className="text-xs text-stone-gray mb-1">Dining Pace</div>
            <div className="text-sm font-medium text-deep-charcoal capitalize">{profile?.pace_preference || '--'}</div>
          </div>
        </div>

        {profile?.dietary_restrictions && profile.dietary_restrictions.length > 0 && (
          <div>
            <div className="text-xs text-stone-gray mb-1">Dietary Restrictions</div>
            <div className="flex flex-wrap gap-1">
              {profile.dietary_restrictions.map((d) => (
                <span key={d} className="px-2 py-0.5 bg-red-600/10 text-red-600 text-xs rounded-full">{d}</span>
              ))}
            </div>
          </div>
        )}

        {profile?.cuisine_preferences && profile.cuisine_preferences.length > 0 && (
          <div>
            <div className="text-xs text-stone-gray mb-1">Cuisine Preferences</div>
            <div className="flex flex-wrap gap-1">
              {profile.cuisine_preferences.map((c) => (
                <span key={c} className="px-2 py-0.5 bg-rose-600/10 text-rose-600 text-xs rounded-full">{c}</span>
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className="text-xs text-stone-gray mb-1">Preferred Seating</div>
            <div className="text-sm font-medium text-deep-charcoal flex items-center gap-1">
              <ThiingsIcon name="map-pin" pxSize={12} />
              {profile?.preferred_seating || 'No preference'}
            </div>
          </div>
          <div>
            <div className="text-xs text-stone-gray mb-1">Brings Children</div>
            <div className="text-sm font-medium text-deep-charcoal">{profile?.brings_children ? 'Yes' : 'No'}</div>
          </div>
        </div>

        <div>
          <div className="text-xs text-stone-gray mb-1">Feedback Sentiment</div>
          <div className={`text-sm font-medium capitalize ${getSentimentColor(profile?.feedback_sentiment || 'neutral')}`}>
            {profile?.feedback_sentiment || 'Neutral'}
            {(profile?.compliment_count || 0) > 0 && <span className="text-rose-600 ml-2">+{profile?.compliment_count} compliments</span>}
            {(profile?.complaint_count || 0) > 0 && <span className="text-red-600 ml-2">{profile?.complaint_count} complaints</span>}
          </div>
        </div>
      </div>
    </div>
  );
}
