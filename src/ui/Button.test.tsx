import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { IconCalendarPlus, IconSearch } from '@tabler/icons-react';
import { Button, IconButton } from './Button';

describe('Button', () => {
  it('defaults to type="button" so it never submits a form by accident', async () => {
    const onSubmit = vi.fn((event: Event) => event.preventDefault());
    render(
      <form onSubmit={(event) => onSubmit(event.nativeEvent)}>
        <Button>Cancel</Button>
        <Button type="submit" variant="primary">
          Save
        </Button>
      </form>,
    );
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onSubmit).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSubmit).toHaveBeenCalledOnce();
  });

  it('applies the variant styles', () => {
    render(
      <>
        <Button variant="primary">Book visit</Button>
        <Button variant="danger">Cancel visit</Button>
      </>,
    );
    expect(screen.getByRole('button', { name: 'Book visit' })).toHaveClass('bg-accent', 'text-on-accent');
    expect(screen.getByRole('button', { name: 'Cancel visit' })).toHaveClass('text-critical-ink');
  });

  it('renders a leading icon that is hidden from assistive tech', () => {
    render(<Button icon={IconCalendarPlus}>Book visit</Button>);
    const button = screen.getByRole('button', { name: 'Book visit' });
    expect(button.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });

  it('shows a busy state and ignores clicks while loading', async () => {
    const onClick = vi.fn();
    render(
      <Button loading onClick={onClick}>
        Sending
      </Button>,
    );

    const button = screen.getByRole('button', { name: 'Sending' });
    expect(button).toHaveAttribute('aria-busy', 'true');
    await userEvent.setup().click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('forwards refs and extra attributes', () => {
    const ref = { current: null as HTMLButtonElement | null };
    render(
      <Button ref={ref} data-testid="cta" className="w-full">
        Continue
      </Button>,
    );
    expect(ref.current).toBe(screen.getByTestId('cta'));
    expect(ref.current).toHaveClass('w-full');
  });
});

describe('IconButton', () => {
  it('uses the label as its accessible name and tooltip', async () => {
    const onClick = vi.fn();
    render(<IconButton icon={IconSearch} label="Search" onClick={onClick} />);

    const button = screen.getByRole('button', { name: 'Search' });
    expect(button).toHaveAttribute('title', 'Search');
    await userEvent.setup().click(button);
    expect(onClick).toHaveBeenCalledOnce();
  });
});
