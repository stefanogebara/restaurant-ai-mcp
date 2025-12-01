/**
 * Step 5: Team Setup
 *
 * Allows users to invite team members with role-based access:
 * - Owner: Full access
 * - Manager: Manage reservations, view analytics
 * - Host: View and manage reservations only
 *
 * Team limit: Up to 5 members
 */

import { useState } from 'react';
import { motion } from 'framer-motion';
import type { OnboardingStepProps, TeamMember } from '../../types/onboarding.types';
import '../../landing/styles/glass-morphism.css';

const ROLES = [
  { value: 'Owner', description: 'Full access to everything' },
  { value: 'Manager', description: 'Manage reservations, view analytics' },
  { value: 'Host', description: 'View and manage reservations only' },
];

const TEAM_LIMIT = 5;

export default function Step5Team({ data, updateData, onComplete, onBack, isSubmitting }: OnboardingStepProps) {
  const [newMemberEmail, setNewMemberEmail] = useState('');
  const [newMemberRole, setNewMemberRole] = useState<'Owner' | 'Manager' | 'Host'>('Manager');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const canAddMoreMembers = () => {
    return data.team_members.length < TEAM_LIMIT;
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

    // Check team limit
    if (!canAddMoreMembers()) {
      newErrors.email = `You've reached the maximum team size (${TEAM_LIMIT} members)`;
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

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="space-y-6"
    >
      <div>
        <h2 className="text-2xl font-bold text-white mb-2">Invite your team</h2>
        <p className="text-gray-300 text-sm">
          Add team members who will manage reservations (optional)
        </p>
      </div>

      {/* Team Member Form */}
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
              className="glass-input w-full px-4 py-3 text-white placeholder-gray-400"
            />
            {errors.email && (
              <p className="mt-1 text-sm text-red-400">{errors.email}</p>
            )}
          </div>

          <div className="flex gap-3">
            <select
              value={newMemberRole}
              onChange={(e) => setNewMemberRole(e.target.value as any)}
              className="glass-input flex-1 px-4 py-3 text-white appearance-none cursor-pointer"
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
              className="px-6 py-3 bg-indigo-500 hover:bg-indigo-600 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-all"
            >
              Add
            </button>
          </div>
        </div>

        <div className="mt-3 text-xs text-gray-400">
          {data.team_members.length} / {TEAM_LIMIT} team members
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
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center text-white font-semibold">
                  {member.email.charAt(0).toUpperCase()}
                </div>
                <div>
                  <p className="text-white font-medium">{member.email}</p>
                  <p className="text-gray-400 text-sm">{member.role}</p>
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
        <ul className="space-y-1 text-gray-300 text-sm">
          {ROLES.map((role) => (
            <li key={role.value}>
              <span className="font-semibold text-indigo-300">{role.value}</span> - {role.description}
            </li>
          ))}
        </ul>
      </div>

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
          className="glass-button-primary px-8 py-3 text-white font-bold rounded-lg flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
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
