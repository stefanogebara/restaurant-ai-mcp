import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const mockConfig = { roles: [{ name: 'FOH', covers_per_staff: 15 }, { name: 'BOH', covers_per_staff: 20 }] };
const mockMutate = vi.fn();

vi.mock('../../../hooks/useStaffingConfig', () => ({
  useStaffingConfig: vi.fn(),
  useSaveStaffingConfig: vi.fn(),
}));

vi.mock('../../../contexts/ToastContext', () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn() }),
}));

import { useStaffingConfig, useSaveStaffingConfig } from '../../../hooks/useStaffingConfig';
import StaffingSettingsPanel from '../StaffingSettingsPanel';

const mockUseConfig = useStaffingConfig as ReturnType<typeof vi.fn>;
const mockUseSave = useSaveStaffingConfig as ReturnType<typeof vi.fn>;

describe('StaffingSettingsPanel', () => {
  beforeEach(() => {
    mockUseSave.mockReturnValue({ mutate: mockMutate, isPending: false });
  });

  it('renders heading', () => {
    mockUseConfig.mockReturnValue({ data: mockConfig, isLoading: false });
    render(<StaffingSettingsPanel />);
    expect(screen.getByText('Staffing Ratios')).toBeInTheDocument();
  });

  it('renders a row for each role', () => {
    mockUseConfig.mockReturnValue({ data: mockConfig, isLoading: false });
    render(<StaffingSettingsPanel />);
    expect(screen.getByDisplayValue('15')).toBeInTheDocument();
    expect(screen.getByDisplayValue('20')).toBeInTheDocument();
  });

  it('renders loading state', () => {
    mockUseConfig.mockReturnValue({ data: undefined, isLoading: true });
    const { container } = render(<StaffingSettingsPanel />);
    expect(container.querySelector('.animate-pulse')).toBeTruthy();
  });

  it('save button disabled when no changes', () => {
    mockUseConfig.mockReturnValue({ data: mockConfig, isLoading: false });
    render(<StaffingSettingsPanel />);
    const saveBtn = screen.getByRole('button', { name: /save/i });
    expect(saveBtn).toBeDisabled();
  });

  it('save button enabled after editing a value', async () => {
    mockUseConfig.mockReturnValue({ data: mockConfig, isLoading: false });
    const user = userEvent.setup();
    render(<StaffingSettingsPanel />);
    const input = screen.getByDisplayValue('15');
    await user.clear(input);
    await user.type(input, '12');
    const saveBtn = screen.getByRole('button', { name: /save/i });
    expect(saveBtn).not.toBeDisabled();
  });
});
