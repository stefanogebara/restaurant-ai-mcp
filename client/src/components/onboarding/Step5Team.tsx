/**
 * Step 5: Team Setup (Professional+ Only)
 *
 * Allows users to invite team members with role-based access:
 * - Owner: Full access
 * - Manager: Manage reservations, view analytics
 * - Host: View and manage reservations only
 *
 * Plan Limits:
 * - Basic: 1 user (owner only)
 * - Professional: Up to 5 users
 * - Enterprise: Unlimited users
 */

import { useState } from 'react';
import { motion } from 'framer-motion';
import type { OnboardingStepProps, TeamMember } from '../../types/onboarding.types';

const ROLES = [
  { value: 'Owner', description: 'Full access to everything' },
  { value: 'Manager', description: 'Manage reservations, view analytics' },
  { value: 'Host', description: 'View and manage reservations only' },
];

export default function Step5Team({ data, updateData, onComplete, onBack, isSubmitting }: OnboardingStepProps) {
  const [newMemberEmail, setNewMemberEmail] = useState('');
  const [newMemberRole, setNewMemberRole] = useState<'Owner' | 'Manager' | 'Host'>('Manager');
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Get plan info (would come from subscription in production)
  const getCurrentPlan = () => {
    // This would be retrieved from subscription data
    return 'basic'; // or 'professional', 'enterprise'
  };

  const getTeamLimit = () => {
    const plan = getCurrentPlan();
    if (plan === 'basic') return 1;
    if (plan === 'professional') return 5;
    return -1; // unlimited for enterprise
  };

  const canAddMoreMembers = () => {
    const limit = getTeamLimit();
    return limit === -1 || data.team_members.length < limit;
  };

  const addTeamMember = () => {
    const newErrors: Record<string, string> = {};

    // Validate email
    if (!newMemberEmail.trim()) {
      newErrors.email = 'Email is required';
      setErrors(newErrors);
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newMemberEmail)) {
      newErrors.email = 'Invalid email format';
      setErrors(newErrors);
      return;
    }

    // Check if email already exists
    if (data.team_members.some((m) => m.email === newMemberEmail)) {
      newErrors.email = 'This team member is already added';
      setErrors(newErrors);
      return;
    }

    // Check if same as customer email
    if (newMemberEmail === data.customer_email) {
      newErrors.email = 'You are already the owner';
      setErrors(newErrors);
      return;
    }

    // Check plan limits
    if (!canAddMoreMembers()) {
      newErrors.email = `You've reached the limit for your plan (${getTeamLimit()} users)`;
      setErrors(newErrors);
      return;
    }

    // Add member
    const newMember: TeamMember = {
      email: newMemberEmail,
      role: newMemberRole,
      status: 'pending',
    };

    updateData({ team_members: [...data.team_members, newMember] });
    setNewMemberEmail('');
    setNewMemberRole('Manager');
    setErrors({});
  };

  const removeMember = (index: number) => {
    const updatedMembers = data.team_members.filter((_, i) => i !== index);
    updateData({ team_members: updatedMembers });
  };

  const handleComplete = () => {
    if (onComplete) {
      onComplete();
    }
  };

  const isBasicPlan = getCurrentPlan() === 'basic';
  const teamLimit = getTeamLimit();

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="space-y-6"
    >
      <div>
        <h2 className="text-2xl font-bold text-white mb-2">Invite your team</h2>
        <p className="text-purple-200 text-sm">
          {isBasicPlan
            ? 'Team management is available on Professional and Enterprise plans'
            : 'Add team members who will manage reservations'}
        </p>
      </div>

      {/* Basic Plan Upgrade Prompt */}
      {isBasicPlan && (
        <div className="bg-gradient-to-br from-purple-500/20 to-pink-500/20 border border-white/30 rounded-lg p-6">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center flex-shrink-0">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <div className="flex-1">
              <h3 className="text-white font-bold text-lg mb-2">🔒 Team Management (Professional Plan)</h3>
              <p className="text-purple-200 text-sm mb-4">
                Upgrade to Professional to:
              </p>
              <ul className="space-y-2 text-purple-200 text-sm mb-4">
                <li className="flex items-center gap-2">
                  <svg className="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Add up to 5 team members
                </li>
                <li className="flex items-center gap-2">
                  <svg className="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Set role-based permissions
                </li>
                <li className="flex items-center gap-2">
                  <svg className="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Track who made changes
                </li>
              </ul>
              <div className="flex gap-3">
                <button
                  onClick={() => window.location.href = '/#pricing'}
                  className="px-6 py-2.5 bg-gradient-to-r from-emerald-400 to-cyan-400 hover:from-emerald-500 hover:to-cyan-500 text-gray-900 font-bold rounded-lg transition-all shadow-lg"
                >
                  Upgrade Now
                </button>
                <button
                  onClick={handleComplete}
                  className="px-6 py-2.5 bg-white/10 hover:bg-white/20 text-white font-semibold rounded-lg transition-all"
                >
                  Skip for now
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Team Member Form (Pro+ only) */}
      {!isBasicPlan && (
        <>
          <div className="bg-white/5 border border-white/20 rounded-lg p-5">
            <label className="block text-sm font-semibold text-white mb-3">Add team members</label>

            <div className="space-y-3">
              <div>
                <input
                  type="email"
                  value={newMemberEmail}
                  onChange={(e) => setNewMemberEmail(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && addTeamMember()}
                  placeholder="team@restaurant.com"
                  className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-lg text-white placeholder-purple-300 focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:border-transparent backdrop-blur-sm"
                />
                {errors.email && (
                  <p className="mt-1 text-sm text-red-300">{errors.email}</p>
                )}
              </div>

              <div className="flex gap-3">
                <select
                  value={newMemberRole}
                  onChange={(e) => setNewMemberRole(e.target.value as any)}
                  className="flex-1 px-4 py-3 bg-white/10 border border-white/20 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:border-transparent backdrop-blur-sm appearance-none cursor-pointer"
                >
                  {ROLES.map((role) => (
                    <option key={role.value} value={role.value} className="bg-gray-900">
                      {role.value} - {role.description}
                    </option>
                  ))}
                </select>

                <button
                  onClick={addTeamMember}
                  disabled={!canAddMoreMembers()}
                  className="px-6 py-3 bg-emerald-500 hover:bg-emerald-600 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-all"
                >
                  Add
                </button>
              </div>
            </div>

            <div className="mt-3 flex items-center justify-between text-xs text-purple-200">
              <span>
                {data.team_members.length} / {teamLimit === -1 ? '∞' : teamLimit} team members
              </span>
              <span>
                {teamLimit === 5 && 'Professional plan: Up to 5 users'}
                {teamLimit === -1 && 'Enterprise plan: Unlimited users'}
              </span>
            </div>
          </div>

          {/* Team Members List */}
          {data.team_members.length > 0 && (
            <div className="space-y-2">
              <label className="block text-sm font-semibold text-white">Team members ({data.team_members.length})</label>
              {data.team_members.map((member, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between p-4 bg-white/5 border border-white/20 rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-cyan-400 to-blue-500 flex items-center justify-center text-white font-semibold">
                      {member.email.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className="text-white font-medium">{member.email}</p>
                      <p className="text-purple-200 text-sm">{member.role}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => removeMember(index)}
                    className="p-2 hover:bg-red-500/20 text-red-300 rounded-lg transition-colors"
                    title="Remove member"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Role Descriptions */}
          <div className="bg-gradient-to-br from-indigo-500/10 to-purple-500/10 border border-white/20 rounded-lg p-4">
            <p className="text-white font-semibold text-sm mb-2">Available roles:</p>
            <ul className="space-y-1 text-purple-200 text-sm">
              {ROLES.map((role) => (
                <li key={role.value}>
                  <span className="font-semibold text-cyan-300">{role.value}</span> - {role.description}
                </li>
              ))}
            </ul>
          </div>
        </>
      )}

      {/* Actions */}
      <div className="flex justify-between pt-4">
        <button
          onClick={onBack}
          disabled={isSubmitting}
          className="px-6 py-3 bg-white/10 hover:bg-white/20 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-all flex items-center gap-2"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back
        </button>
        <button
          onClick={handleComplete}
          disabled={isSubmitting}
          className="px-8 py-3 bg-gradient-to-r from-emerald-400 to-cyan-400 hover:from-emerald-500 hover:to-cyan-500 disabled:opacity-50 disabled:cursor-not-allowed text-gray-900 font-bold rounded-lg transition-all shadow-lg hover:shadow-xl hover:-translate-y-0.5 flex items-center gap-2"
        >
          {isSubmitting ? (
            <>
              <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Completing...
            </>
          ) : (
            <>
              Complete Setup
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </>
          )}
        </button>
      </div>
    </motion.div>
  );
}
