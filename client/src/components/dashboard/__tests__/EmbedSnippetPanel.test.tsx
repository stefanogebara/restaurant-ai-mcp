import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import EmbedSnippetPanel from '../EmbedSnippetPanel';

describe('EmbedSnippetPanel', () => {
  it('renders heading', () => {
    render(<EmbedSnippetPanel slug="la-rosa" />);
    expect(screen.getByText('Booking Widget')).toBeInTheDocument();
  });

  it('renders snippet containing the slug', () => {
    render(<EmbedSnippetPanel slug="la-rosa" />);
    expect(screen.getByText(/la-rosa/)).toBeInTheDocument();
  });

  it('renders copy button', () => {
    render(<EmbedSnippetPanel slug="la-rosa" />);
    expect(screen.getByRole('button', { name: /copy/i })).toBeInTheDocument();
  });
});
