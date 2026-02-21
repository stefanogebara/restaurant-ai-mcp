import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import Button, { IconButton } from '../Button';

describe('Button', () => {
  it('renders with text', () => {
    render(<Button>Click Me</Button>);
    expect(screen.getByRole('button', { name: 'Click Me' })).toBeInTheDocument();
  });

  it('handles click events', () => {
    const handleClick = vi.fn();
    render(<Button onClick={handleClick}>Click Me</Button>);
    fireEvent.click(screen.getByRole('button', { name: 'Click Me' }));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('is disabled when disabled prop is true', () => {
    const handleClick = vi.fn();
    render(
      <Button disabled onClick={handleClick}>
        Disabled
      </Button>
    );
    const button = screen.getByRole('button', { name: 'Disabled' });
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(handleClick).not.toHaveBeenCalled();
  });

  it('is disabled when isLoading is true', () => {
    const handleClick = vi.fn();
    render(
      <Button isLoading onClick={handleClick}>
        Loading
      </Button>
    );
    const button = screen.getByRole('button', { name: 'Loading' });
    expect(button).toBeDisabled();
  });

  it('shows a spinner SVG when isLoading is true', () => {
    const { container } = render(<Button isLoading>Loading</Button>);
    const spinner = container.querySelector('svg.animate-spin');
    expect(spinner).toBeInTheDocument();
  });

  it('does not show spinner when isLoading is false', () => {
    const { container } = render(<Button>Not Loading</Button>);
    const spinner = container.querySelector('svg.animate-spin');
    expect(spinner).not.toBeInTheDocument();
  });

  it('renders with primary variant by default', () => {
    render(<Button>Primary</Button>);
    const button = screen.getByRole('button', { name: 'Primary' });
    expect(button.className).toContain('bg-burgundy');
  });

  it('applies secondary variant styles', () => {
    render(<Button variant="secondary">Secondary</Button>);
    const button = screen.getByRole('button', { name: 'Secondary' });
    expect(button.className).toContain('bg-soft-gray');
  });

  it('applies danger variant styles', () => {
    render(<Button variant="danger">Danger</Button>);
    const button = screen.getByRole('button', { name: 'Danger' });
    expect(button.className).toContain('bg-red-600');
  });

  it('applies ghost variant styles', () => {
    render(<Button variant="ghost">Ghost</Button>);
    const button = screen.getByRole('button', { name: 'Ghost' });
    expect(button.className).toContain('bg-transparent');
  });

  it('applies outline variant styles', () => {
    render(<Button variant="outline">Outline</Button>);
    const button = screen.getByRole('button', { name: 'Outline' });
    expect(button.className).toContain('border-2');
  });

  it('applies small size styles', () => {
    render(<Button size="sm">Small</Button>);
    const button = screen.getByRole('button', { name: 'Small' });
    expect(button.className).toContain('text-sm');
  });

  it('applies large size styles', () => {
    render(<Button size="lg">Large</Button>);
    const button = screen.getByRole('button', { name: 'Large' });
    expect(button.className).toContain('text-lg');
  });

  it('applies fullWidth class when fullWidth is true', () => {
    render(<Button fullWidth>Full Width</Button>);
    const button = screen.getByRole('button', { name: 'Full Width' });
    expect(button.className).toContain('w-full');
  });

  it('renders left icon when provided and not loading', () => {
    render(
      <Button leftIcon={<span data-testid="left-icon">L</span>}>
        With Icon
      </Button>
    );
    expect(screen.getByTestId('left-icon')).toBeInTheDocument();
  });

  it('renders right icon when provided and not loading', () => {
    render(
      <Button rightIcon={<span data-testid="right-icon">R</span>}>
        With Icon
      </Button>
    );
    expect(screen.getByTestId('right-icon')).toBeInTheDocument();
  });

  it('hides left icon and shows spinner when loading', () => {
    render(
      <Button isLoading leftIcon={<span data-testid="left-icon">L</span>}>
        Loading
      </Button>
    );
    expect(screen.queryByTestId('left-icon')).not.toBeInTheDocument();
  });

  it('hides right icon when loading', () => {
    render(
      <Button isLoading rightIcon={<span data-testid="right-icon">R</span>}>
        Loading
      </Button>
    );
    expect(screen.queryByTestId('right-icon')).not.toBeInTheDocument();
  });

  it('applies additional className', () => {
    render(<Button className="my-custom-class">Custom</Button>);
    const button = screen.getByRole('button', { name: 'Custom' });
    expect(button.className).toContain('my-custom-class');
  });
});

describe('IconButton', () => {
  it('renders with the provided icon', () => {
    render(
      <IconButton
        icon={<span data-testid="icon">X</span>}
        aria-label="Close"
      />
    );
    expect(screen.getByTestId('icon')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
  });

  it('applies ghost variant by default', () => {
    render(
      <IconButton
        icon={<span>X</span>}
        aria-label="Close"
      />
    );
    const button = screen.getByRole('button', { name: 'Close' });
    expect(button.className).toContain('bg-transparent');
  });

  it('applies primary variant when specified', () => {
    render(
      <IconButton
        icon={<span>X</span>}
        aria-label="Close"
        variant="primary"
      />
    );
    const button = screen.getByRole('button', { name: 'Close' });
    expect(button.className).toContain('bg-burgundy');
  });

  it('handles click events', () => {
    const handleClick = vi.fn();
    render(
      <IconButton
        icon={<span>X</span>}
        aria-label="Close"
        onClick={handleClick}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });
});
