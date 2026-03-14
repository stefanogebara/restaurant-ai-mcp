import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Footer from '../components/Footer';

function renderFooter() {
  return render(
    <MemoryRouter>
      <Footer />
    </MemoryRouter>,
  );
}

describe('Footer', () => {
  it('renders the FAQ heading', () => {
    renderFooter();
    expect(screen.getByText('Frequently Asked Questions')).toBeInTheDocument();
  });

  it('renders all 9 FAQ questions as buttons', () => {
    renderFooter();
    const buttons = screen.getAllByRole('button', { expanded: false });
    // 9 FAQ items
    expect(buttons.length).toBeGreaterThanOrEqual(9);
  });

  it('expands a FAQ item on click', () => {
    renderFooter();
    const firstQuestion = screen.getByText(/How does the AI reservation assistant work/);
    fireEvent.click(firstQuestion);
    expect(firstQuestion.closest('button')).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText(/natural language processing/)).toBeInTheDocument();
  });

  it('renders privacy and terms links', () => {
    renderFooter();
    expect(screen.getByText('Privacy Policy')).toBeInTheDocument();
    expect(screen.getByText('Terms of Service')).toBeInTheDocument();
  });

  it('renders the Seatable logo', () => {
    renderFooter();
    expect(screen.getByText(/seatable/)).toBeInTheDocument();
  });

  it('renders the current year', () => {
    renderFooter();
    const year = new Date().getFullYear();
    expect(screen.getByText(new RegExp(`${year}`))).toBeInTheDocument();
  });
});
