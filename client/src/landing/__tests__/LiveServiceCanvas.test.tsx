import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import LiveServiceCanvas from '../components/LiveServiceCanvas';

describe('LiveServiceCanvas', () => {
  it('labels the product proof as an illustrative service scenario', () => {
    render(<LiveServiceCanvas />);
    expect(screen.getByText(/friday dinner service|serviço de sexta à noite|servicio del viernes por la noche/i)).toBeInTheDocument();
    expect(screen.getByText(/illustrative service scenario|cenário ilustrativo de serviço|escenario ilustrativo del servicio/i)).toBeInTheDocument();
  });

  it('shows operational metrics, the floor, and upcoming reservations', () => {
    render(<LiveServiceCanvas />);
    expect(screen.getByText(/covers|comensales|lugares/i)).toBeInTheDocument();
    expect(screen.getByText('78%')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /floor plan|planta ilustrativa|plano ilustrativo/i })).toBeInTheDocument();
    expect(screen.getByRole('complementary', { name: /upcoming reservations|próximas reservas|próximas reservaciones/i })).toBeInTheDocument();
  });

  it('avoids browser chrome and a false live-data claim', () => {
    const { container } = render(<LiveServiceCanvas />);
    expect(container).not.toHaveTextContent(/https?:\/\//i);
    expect(container).not.toHaveTextContent(/localhost/i);
    expect(container).not.toHaveTextContent(/^live$/i);
  });
});
