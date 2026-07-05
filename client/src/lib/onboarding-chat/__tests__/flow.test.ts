/**
 * Integration test for the real onboarding flow defined in flow.ts.
 *
 * Walks the happy path end-to-end and asserts the accumulated FlowState.data
 * contains every field /api/onboarding/complete needs to create a restaurant.
 * This catches drift between the flow + the OnboardingData contract before
 * a user ever hits the network.
 */
import { describe, it, expect } from 'vitest';
import { init, advance } from '../engine';
import { onboardingFlow } from '../flow';


describe('onboardingFlow — happy path', () => {
  it('captures every required OnboardingData field walking the linear flow', () => {
    let s = init(onboardingFlow);

    // start → ask-name
    s = advance(onboardingFlow, s, { kind: 'option', optionId: 'go' });
    expect(s.currentNodeId).toBe('ask-name');

    // ask-name → ask-type (validates length >= 2)
    s = advance(onboardingFlow, s, { kind: 'text', raw: 'Cantina Bella' });
    expect(s.data.restaurant_name).toBe('Cantina Bella');
    expect(s.currentNodeId).toBe('ask-type');

    // ask-type → ask-city
    s = advance(onboardingFlow, s, { kind: 'option', optionId: 'italian' });
    expect(s.data.restaurant_type).toBe('Italian');

    // ask-city → ask-country
    s = advance(onboardingFlow, s, { kind: 'text', raw: 'São Paulo' });
    expect(s.data.city).toBe('São Paulo');

    // ask-country → ask-phone
    s = advance(onboardingFlow, s, { kind: 'option', optionId: 'br' });
    expect(s.data.country).toBe('Brazil');

    // ask-phone → ask-email
    s = advance(onboardingFlow, s, { kind: 'text', raw: '+55 11 5555 1234' });
    expect(s.data.phone_number).toBe('+55 11 5555 1234');

    // ask-email → ask-hours
    s = advance(onboardingFlow, s, { kind: 'text', raw: 'host@cantinabella.com' });
    expect(s.data.email).toBe('host@cantinabella.com');

    // ask-hours → ask-duration
    s = advance(onboardingFlow, s, { kind: 'option', optionId: 'hours-ok' });
    expect(s.data.business_hours).toBeDefined();
    expect(s.data.business_hours).toHaveLength(7);

    // ask-duration → confirm-tables
    s = advance(onboardingFlow, s, { kind: 'option', optionId: 'd90' });
    expect(s.data.average_dining_duration).toBe(90);

    // confirm-tables → ask-booking-policy
    s = advance(onboardingFlow, s, { kind: 'option', optionId: 'tables-ok' });
    expect(s.data.areas).toBeDefined();
    expect(s.data.areas?.[0]?.tables.length).toBeGreaterThan(0);

    // ask-booking-policy → ask-buffer
    s = advance(onboardingFlow, s, { kind: 'option', optionId: 'b30' });
    expect(s.data.advance_booking_days).toBe(30);

    // ask-buffer → ask-cancellation
    s = advance(onboardingFlow, s, { kind: 'option', optionId: 'b15' });
    expect(s.data.buffer_time).toBe(15);

    // ask-cancellation → review
    s = advance(onboardingFlow, s, { kind: 'option', optionId: '24h' });
    expect(s.data.cancellation_policy).toMatch(/24 hours/i);
    expect(s.currentNodeId).toBe('review');

    // review → END (submit)
    s = advance(onboardingFlow, s, { kind: 'option', optionId: 'submit' });
    expect(s.done).toBe(true);

    // Final assertion: every OnboardingField the flow's nodes claim to write
    // is actually present in data. Drift catcher.
    expect(s.data).toMatchObject({
      restaurant_name: 'Cantina Bella',
      restaurant_type: 'Italian',
      city: 'São Paulo',
      country: 'Brazil',
      phone_number: '+55 11 5555 1234',
      email: 'host@cantinabella.com',
      average_dining_duration: 90,
      advance_booking_days: 30,
      buffer_time: 15,
    });
  });

  it('interpolates restaurant_name into the type-ask bot message', () => {
    let s = init(onboardingFlow);
    s = advance(onboardingFlow, s, { kind: 'option', optionId: 'go' });
    s = advance(onboardingFlow, s, { kind: 'text', raw: 'Pizza Place' });
    // ask-type's first bot message uses {restaurant_name}
    const lastBot = s.messages.filter((m) => m.turn === 'bot').slice(-1)[0];
    expect(lastBot.text).toContain('Pizza Place');
  });

  it('review → "Start over" jumps back to start', () => {
    let s = init(onboardingFlow);
    s = advance(onboardingFlow, s, { kind: 'option', optionId: 'go' });
    s = advance(onboardingFlow, s, { kind: 'text', raw: 'Cantina' });
    s = advance(onboardingFlow, s, { kind: 'option', optionId: 'italian' });
    s = advance(onboardingFlow, s, { kind: 'text', raw: 'São Paulo' });
    s = advance(onboardingFlow, s, { kind: 'option', optionId: 'br' });
    s = advance(onboardingFlow, s, { kind: 'text', raw: '+55 11 5555 1234' });
    s = advance(onboardingFlow, s, { kind: 'text', raw: 'a@b.com' });
    s = advance(onboardingFlow, s, { kind: 'option', optionId: 'hours-ok' });
    s = advance(onboardingFlow, s, { kind: 'option', optionId: 'd90' });
    s = advance(onboardingFlow, s, { kind: 'option', optionId: 'tables-ok' });
    s = advance(onboardingFlow, s, { kind: 'option', optionId: 'b30' });
    s = advance(onboardingFlow, s, { kind: 'option', optionId: 'b15' });
    s = advance(onboardingFlow, s, { kind: 'option', optionId: '24h' });
    expect(s.currentNodeId).toBe('review');
    s = advance(onboardingFlow, s, { kind: 'option', optionId: 'restart' });
    expect(s.currentNodeId).toBe('start');
    expect(s.done).toBe(false);
  });
});

describe('onboardingFlow — validation', () => {
  it('rejects an empty name and stays on ask-name', () => {
    let s = init(onboardingFlow);
    s = advance(onboardingFlow, s, { kind: 'option', optionId: 'go' });
    s = advance(onboardingFlow, s, { kind: 'text', raw: 'X' });  // length 1
    expect(s.currentNodeId).toBe('ask-name');
    expect(s.lastError).toMatch(/too short/i);
  });

  it('rejects a malformed email', () => {
    let s = init(onboardingFlow);
    s = advance(onboardingFlow, s, { kind: 'option', optionId: 'go' });
    s = advance(onboardingFlow, s, { kind: 'text', raw: 'Cantina' });
    s = advance(onboardingFlow, s, { kind: 'option', optionId: 'italian' });
    s = advance(onboardingFlow, s, { kind: 'text', raw: 'São Paulo' });
    s = advance(onboardingFlow, s, { kind: 'option', optionId: 'br' });
    s = advance(onboardingFlow, s, { kind: 'text', raw: '+55 11 5555 1234' });
    s = advance(onboardingFlow, s, { kind: 'text', raw: 'not an email' });
    expect(s.currentNodeId).toBe('ask-email');
    expect(s.lastError).toMatch(/email/i);
  });
});
