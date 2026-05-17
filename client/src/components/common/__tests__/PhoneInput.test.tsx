import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PhoneInput, { COUNTRIES } from '../PhoneInput';

describe('PhoneInput', () => {
  const defaultProps = {
    value: '',
    onChange: vi.fn(),
  };

  it('renders with default label and country (Brazil)', () => {
    render(<PhoneInput {...defaultProps} />);
    expect(screen.getByText('Phone Number')).toBeInTheDocument();
    expect(screen.getByText('+55')).toBeInTheDocument();
  });

  it('renders with custom label', () => {
    render(<PhoneInput {...defaultProps} label="Contact Phone" />);
    expect(screen.getByText('Contact Phone')).toBeInTheDocument();
  });

  it('shows required asterisk when required', () => {
    render(<PhoneInput {...defaultProps} required />);
    expect(screen.getByText('*')).toBeInTheDocument();
  });

  it('uses specified defaultCountry', () => {
    render(<PhoneInput {...defaultProps} defaultCountry="US" />);
    expect(screen.getByText('+1')).toBeInTheDocument();
  });

  it('calls onChange with full international number on input', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<PhoneInput {...defaultProps} onChange={onChange} defaultCountry="US" />);

    const input = screen.getByRole('textbox');
    await user.type(input, '5551234567');

    // Should have been called with the full number
    const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1];
    expect(lastCall[0]).toBe('+1 5551234567');
    expect(lastCall[1]).toBe(true); // valid US number
  });

  it('strips non-numeric characters from input', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<PhoneInput {...defaultProps} onChange={onChange} defaultCountry="US" />);

    const input = screen.getByRole('textbox');
    await user.type(input, 'abc123');

    // Should only contain digits
    expect(input).toHaveValue('123');
  });

  it('validates phone number length (accepts landlines + mobiles, 7-15 digits)', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<PhoneInput {...defaultProps} onChange={onChange} defaultCountry="BR" />);

    const input = screen.getByRole('textbox');

    // Too short — 6 digits
    await user.type(input, '112951');
    let lastCall = onChange.mock.calls[onChange.mock.calls.length - 1];
    expect(lastCall[1]).toBe(false);

    // BR landline (10 digits) — the regression we just fixed. Mocotó's real
    // Google-Maps number was rejected before f6f1310d8.
    await user.clear(input);
    await user.type(input, '1129513056');
    lastCall = onChange.mock.calls[onChange.mock.calls.length - 1];
    expect(lastCall[1]).toBe(true);

    // BR mobile (11 digits) — also valid
    await user.clear(input);
    await user.type(input, '11987654321');
    lastCall = onChange.mock.calls[onChange.mock.calls.length - 1];
    expect(lastCall[1]).toBe(true);
  });

  it('shows length-based warning for too-short number', async () => {
    const user = userEvent.setup();
    render(<PhoneInput {...defaultProps} defaultCountry="ES" />);

    const input = screen.getByRole('textbox');
    await user.type(input, '123');

    expect(
      screen.getByText(/too short/i)
    ).toBeInTheDocument();
  });

  it('shows error message when error prop is set', () => {
    render(<PhoneInput {...defaultProps} error="Phone is required" />);
    expect(screen.getByText('Phone is required')).toBeInTheDocument();
  });

  it('displays format hint for selected country', () => {
    render(<PhoneInput {...defaultProps} defaultCountry="US" />);
    expect(screen.getByText(/Format:.*\+1/)).toBeInTheDocument();
  });

  it('opens country dropdown on button click', async () => {
    const user = userEvent.setup();
    render(<PhoneInput {...defaultProps} />);

    // Click the country selector
    await user.click(screen.getByText('+55'));

    // Should show all countries
    expect(screen.getByText('United States')).toBeInTheDocument();
    expect(screen.getByText('France')).toBeInTheDocument();
    expect(screen.getByText('Japan')).toBeInTheDocument();
  });

  it('switches country when a different one is selected', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<PhoneInput {...defaultProps} onChange={onChange} defaultCountry="ES" />);

    // Open dropdown
    await user.click(screen.getByText('+34'));

    // Select UK
    await user.click(screen.getByText('United Kingdom'));

    // Should now show +44
    expect(screen.getByText('+44')).toBeInTheDocument();
  });

  it('shows placeholder for the selected country', () => {
    render(<PhoneInput {...defaultProps} defaultCountry="US" />);
    expect(screen.getByPlaceholderText('(555) 123-4567')).toBeInTheDocument();
  });

  it('has correct number of countries defined', () => {
    expect(COUNTRIES.length).toBeGreaterThanOrEqual(30);
  });

  it('all countries have required fields', () => {
    for (const country of COUNTRIES) {
      expect(country.code).toBeTruthy();
      expect(country.name).toBeTruthy();
      expect(country.dial).toMatch(/^\+\d+$/);
      expect(country.flag).toBeTruthy();
      expect(country.pattern).toBeInstanceOf(RegExp);
      expect(country.placeholder).toBeTruthy();
      expect(country.format).toBeTruthy();
    }
  });
});
