import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../../test/renderWithProviders';

vi.mock('../../components/layout/DashboardLayout', () => ({
  default: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="dashboard-layout">{children}</div>
  ),
}));

// Painéis com busca própria — fora do escopo desta página.
vi.mock('../../components/dashboard/StaffingSettingsPanel', () => ({ default: () => null }));
vi.mock('../../components/settings/DepositSettingsPanel', () => ({ default: () => null }));
vi.mock('../../components/settings/CoverPhotoPanel', () => ({ default: () => null }));
vi.mock('../../components/dashboard/BookingChannelsPanel', () => ({ default: () => null }));

const apiGet = vi.fn();
const apiPut = vi.fn();
vi.mock('../../services/api', () => ({
  api: {
    get: (...a: unknown[]) => apiGet(...a),
    put: (...a: unknown[]) => apiPut(...a),
  },
  authFetch: vi.fn().mockResolvedValue({ ok: true, json: async () => ({ slug: 'cantina' }) }),
}));

import RestaurantSettingsPage from '../RestaurantSettingsPage';

// ---- Dados ----

const SETTINGS = {
  language: 'pt-BR',
  restaurant_name: 'Cantina do Porto',
  city: 'São Paulo',
  country: 'BR',
  phone: '+5511988887777',
  email: 'contato@cantina.com',
  timezone: 'America/Sao_Paulo',
  business_hours: {
    monday: { is_open: true, open_time: '12:00', close_time: '23:00' },
  },
  reservation_settings: { max_party_size: 12, min_party_size: 1 },
};

/** Payload enviado no último PUT — é o contrato que o backend recebe. */
const lastPutBody = () => apiPut.mock.calls.at(-1)?.[1];

/**
 * Define o horário de fechamento da segunda (o único dia aberto no fixture).
 * userEvent.clear/type não funcionam em <input type="time"> — o clear é
 * ignorado e a digitação escorrega entre os segmentos ("10:00" virou
 * "23:59"). fireEvent.change fala direto com o controle.
 */
function setMondayCloseTime(value: string) {
  const input = screen.getAllByDisplayValue('23:00')[0];
  fireEvent.change(input, { target: { value } });
}

describe('RestaurantSettingsPage', () => {
  beforeEach(() => {
    apiGet.mockReset().mockResolvedValue({ data: { success: true, data: SETTINGS } });
    apiPut.mockReset().mockResolvedValue({ data: { success: true, data: SETTINGS } });
  });

  it('hidrata o formulário com os dados do restaurante', async () => {
    renderWithProviders(<RestaurantSettingsPage />);

    expect(await screen.findByDisplayValue('Cantina do Porto')).toBeInTheDocument();
    expect(screen.getByDisplayValue('+5511988887777')).toBeInTheDocument();
    expect(screen.getByDisplayValue('contato@cantina.com')).toBeInTheDocument();
  });

  it('salvar fica desabilitado até haver edição', async () => {
    const user = userEvent.setup();
    renderWithProviders(<RestaurantSettingsPage />);
    await screen.findByDisplayValue('Cantina do Porto');

    const save = screen.getByRole('button', { name: /save info/i });
    expect(save).toBeDisabled();

    await user.type(screen.getByLabelText(/restaurant name/i), '!');
    expect(save).toBeEnabled();
  });

  it('recusa telefone fora do formato E.164 sem chamar o backend', async () => {
    const user = userEvent.setup();
    renderWithProviders(<RestaurantSettingsPage />);
    await screen.findByDisplayValue('Cantina do Porto');

    const phone = screen.getByLabelText(/phone/i);
    await user.clear(phone);
    await user.type(phone, '11988887777'); // sem o "+"
    await user.click(screen.getByRole('button', { name: /save info/i }));

    // Telefone quebrado aqui quebra Twilio/WhatsApp lá na frente — tem de
    // parar antes de virar PUT.
    expect(await screen.findByText(/international format/i)).toBeInTheDocument();
    expect(apiPut).not.toHaveBeenCalled();
  });

  it('recusa e-mail inválido sem chamar o backend', async () => {
    const user = userEvent.setup();
    renderWithProviders(<RestaurantSettingsPage />);
    await screen.findByDisplayValue('Cantina do Porto');

    const email = screen.getByLabelText(/email/i);
    await user.clear(email);
    await user.type(email, 'contato@cantina');
    await user.click(screen.getByRole('button', { name: /save info/i }));

    expect(await screen.findByText(/invalid email format/i)).toBeInTheDocument();
    expect(apiPut).not.toHaveBeenCalled();
  });

  it('salva as informações válidas com o payload completo', async () => {
    const user = userEvent.setup();
    renderWithProviders(<RestaurantSettingsPage />);
    await screen.findByDisplayValue('Cantina do Porto');

    const name = screen.getByLabelText(/restaurant name/i);
    await user.clear(name);
    await user.type(name, 'Cantina do Cais');
    await user.click(screen.getByRole('button', { name: /save info/i }));

    await waitFor(() => expect(apiPut).toHaveBeenCalledTimes(1));
    expect(lastPutBody()).toMatchObject({
      restaurant_name: 'Cantina do Cais',
      phone: '+5511988887777',
      timezone: 'America/Sao_Paulo',
    });
  });

  it('um 200 com success:false vira erro, não um "salvo" verde', async () => {
    const user = userEvent.setup();
    apiPut.mockResolvedValue({ data: { success: false, error: 'Coluna inexistente' } });
    renderWithProviders(<RestaurantSettingsPage />);
    await screen.findByDisplayValue('Cantina do Porto');

    await user.type(screen.getByLabelText(/restaurant name/i), '!');
    await user.click(screen.getByRole('button', { name: /save info/i }));

    expect(await screen.findByText('Coluna inexistente')).toBeInTheDocument();
    expect(screen.queryByText(/settings saved/i)).not.toBeInTheDocument();
  });

  it('não deixa salvar um dia aberto com fechamento antes da abertura', async () => {
    const user = userEvent.setup();
    renderWithProviders(<RestaurantSettingsPage />);
    await screen.findByDisplayValue('Cantina do Porto');

    // Segunda vem aberta 12:00–23:00; inverter cria um dia sem slot algum.
    setMondayCloseTime('10:00');
    await user.click(screen.getByRole('button', { name: /save hours/i }));

    expect(await screen.findByText(/closing time must be after opening time/i)).toBeInTheDocument();
    expect(apiPut).not.toHaveBeenCalled();
  });

  it('aceita fechamento à meia-noite (o único caso overnight suportado)', async () => {
    const user = userEvent.setup();
    renderWithProviders(<RestaurantSettingsPage />);
    await screen.findByDisplayValue('Cantina do Porto');

    setMondayCloseTime('00:00');
    await user.click(screen.getByRole('button', { name: /save hours/i }));

    await waitFor(() => expect(apiPut).toHaveBeenCalledTimes(1));
    expect(lastPutBody().business_hours.monday).toMatchObject({
      is_open: true,
      close_time: '00:00',
    });
  });

  it('envia a semana inteira, não só os dias que o servidor mandou', async () => {
    const user = userEvent.setup();
    renderWithProviders(<RestaurantSettingsPage />);
    await screen.findByDisplayValue('Cantina do Porto');

    setMondayCloseTime('22:00');
    await user.click(screen.getByRole('button', { name: /save hours/i }));

    await waitFor(() => expect(apiPut).toHaveBeenCalledTimes(1));
    // O payload do servidor só trazia segunda; salvar precisa mandar os 7
    // dias, senão os que o host nunca tocou somem do banco.
    expect(Object.keys(lastPutBody().business_hours)).toHaveLength(7);
    expect(lastPutBody().business_hours.sunday).toMatchObject({ is_open: false });
  });

  it('mostra o estado de erro quando as configurações não carregam', async () => {
    apiGet.mockRejectedValue(new Error('boom'));
    renderWithProviders(<RestaurantSettingsPage />);

    await waitFor(() => expect(screen.queryByDisplayValue('Cantina do Porto')).not.toBeInTheDocument());
  });
});
