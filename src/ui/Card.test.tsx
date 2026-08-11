import { render, screen } from '@testing-library/react';
import { Card } from './Card';

describe('Card', () => {
  it('is a plain container when it has no title', () => {
    const { container } = render(<Card>Body</Card>);
    expect(container.firstChild?.nodeName).toBe('DIV');
    expect(screen.queryByRole('region')).not.toBeInTheDocument();
  });

  it('becomes a section named by its title', () => {
    render(
      <Card title="Care team" description="People looking after you">
        Body
      </Card>,
    );
    const region = screen.getByRole('region', { name: 'Care team' });
    expect(region).toHaveTextContent('People looking after you');
    expect(screen.getByRole('heading', { level: 2, name: 'Care team' })).toBeInTheDocument();
  });

  it('accepts a header action and a lower heading level', () => {
    render(
      <Card title="Blood pressure" headingLevel={3} action={<button type="button">View all</button>}>
        Chart
      </Card>,
    );
    expect(screen.getByRole('heading', { level: 3, name: 'Blood pressure' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'View all' })).toBeInTheDocument();
  });

  it('switches styling by tone', () => {
    const { container } = render(<Card tone="pine">Next visit</Card>);
    expect(container.firstChild).toHaveClass('bg-rail');
    expect(container.firstChild).not.toHaveClass('border-line');
  });
});
