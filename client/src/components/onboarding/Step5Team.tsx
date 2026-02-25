/**
 * Step 5: Team Setup - Modern Elegant Design
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
import ThiingsIcon from '../common/ThiingsIcon';

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
        <h2 className="font-serif text-2xl font-bold text-deep-charcoal mb-2">Invite your team</h2>
        <p className="text-stone-gray text-sm">
          Add team members who will help manage reservations. You can skip this step and invite them later.
        </p>
      </div>

      {/* Team Member Form */}
      <div className="bg-soft-gray border border-border-gray rounded-xl p-5">
        <label className="block text-sm font-semibold text-deep-charcoal mb-3">Add team members</label>

        <div className="space-y-3">
          <div>
            <input
              type="email"
              value={newMemberEmail}
              onChange={(e) => setNewMemberEmail(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addTeamMember()}
              placeholder="colleague@yourrestaurant.com"
              className="w-full px-4 py-3 bg-white border border-border-gray rounded-xl text-deep-charcoal placeholder-muted-stone focus:outline-none focus:ring-2 focus:ring-burgundy focus:border-transparent transition-all"
            />
            {errors.email && (
              <p className="mt-1 text-sm text-burgundy">{errors.email}</p>
            )}
          </div>

          <div className="flex gap-3">
            <select
              value={newMemberRole}
              onChange={(e) => setNewMemberRole(e.target.value as any)}
              aria-label="Member role"
              className="flex-1 px-4 py-3 bg-white border border-border-gray rounded-xl text-deep-charcoal appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-burgundy focus:border-transparent transition-all"
            >
              {ROLES.map((role) => (
                <option key={role.value} value={role.value}>
                  {role.value} - {role.description}
                </option>
              ))}
            </select>

            <button
              onClick={addTeamMember}
              disabled={!canAddMoreMembers()}
              className="px-6 py-3 bg-burgundy hover:bg-burgundy-dark disabled:bg-border-gray disabled:text-muted-stone disabled:cursor-not-allowed text-white font-semibold rounded-xl transition-all"
            >
              Add
            </button>
          </div>
        </div>

        <div className="mt-3 text-xs text-muted-stone">
          {data.team_members.length} of {TEAM_LIMIT} team members added
        </div>
      </div>

      {/* Team Members List */}
      {data.team_members.length > 0 && (
        <div className="space-y-2">
          <label className="block text-sm font-semibold text-deep-charcoal">Team members ({data.team_members.length})</label>
          {data.team_members.map((member, index) => (
            <div
              key={index}
              className="flex items-center justify-between p-4 bg-soft-gray border border-border-gray rounded-xl"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-burgundy flex items-center justify-center text-white font-semibold">
                  {member.email.charAt(0).toUpperCase()}
                </div>
                <div>
                  <p className="text-deep-charcoal font-medium">{member.email}</p>
                  <p className="text-stone-gray text-sm">{member.role}</p>
                </div>
              </div>
              <button
                onClick={() => removeMember(index)}
                className="p-2 hover:bg-red-600/10 text-red-600 rounded-xl transition-colors"
                aria-label="Remove member"
              >
                <ThiingsIcon name="close" pxSize={20} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Role Descriptions */}
      <div className="bg-burgundy/5 border border-burgundy/20 rounded-xl p-4">
        <p className="text-deep-charcoal font-semibold text-sm mb-2">Available roles:</p>
        <ul className="space-y-1 text-stone-gray text-sm">
          {ROLES.map((role) => (
            <li key={role.value}>
              <span className="font-semibold text-burgundy">{role.value}</span> - {role.description}
            </li>
          ))}
        </ul>
      </div>

      {/* Actions */}
      <div className="flex justify-between pt-4">
        <button
          onClick={onBack}
          disabled={isSubmitting}
          className="px-6 py-3 bg-white hover:bg-soft-gray disabled:opacity-50 disabled:cursor-not-allowed border border-border-gray text-deep-charcoal font-semibold rounded-xl transition-all flex items-center gap-2"
        >
          <ThiingsIcon name="chevron-left" pxSize={20} />
          Back
        </button>
        <button
          onClick={handleComplete}
          disabled={isSubmitting}
          className="px-8 py-3 bg-burgundy hover:bg-burgundy-dark text-white font-bold rounded-xl flex items-center gap-2 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSubmitting ? (
            <>
              <svg aria-hidden="true" className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Completing...
            </>
          ) : (
            <>
              Complete Setup
              <ThiingsIcon name="check" pxSize={20} />
            </>
          )}
        </button>
      </div>
    </motion.div>
  );
}
