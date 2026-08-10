import { render, screen } from '@testing-library/react';
import { Avatar } from './Avatar';
import { initialsOf, toneFor } from './initials';
import { StatusDot } from './StatusDot';

describe('initialsOf', () => {
  it.each([
    ['Ava Thompson', 'AT'],
    ['Dr. Maya Okafor', 'MO'],
    ['dr maya okafor', 'MO'],
    ['Jonas Lindqvist-Berg', 'JB'],
    ['Cher', 'C'],
    ["Siobhán O'Neill", 'SO'],
    ['  ', '?'],
  ])('%s → %s', (name, initials) => {
    expect(initialsOf(name)).toBe(initials);
  });
});

describe('toneFor', () => {
  it('is stable for the same name', () => {
    expect(toneFor('Maya Okafor')).toBe(toneFor('Maya Okafor'));
  });

  it('spreads names across the tones', () => {
    const tones = new Set(['Ava', 'Ben', 'Cleo', 'Dev', 'Esme', 'Femi', 'Gus', 'Hana'].map(toneFor));
    expect(tones.size).toBeGreaterThan(1);
  });
});

describe('Avatar', () => {
  it('shows initials and is named for screen readers', () => {
    render(<Avatar name="Dr. Maya Okafor" />);
    expect(screen.getByRole('img', { name: 'Dr. Maya Okafor' })).toHaveTextContent('MO');
  });

  it('is hidden from screen readers when decorative', () => {
    render(<Avatar name="Maya Okafor" decorative />);
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('honours an explicit tone', () => {
    render(<Avatar name="Maya Okafor" tone="glacier" />);
    expect(screen.getByRole('img')).toHaveClass('bg-data-soft', 'text-data-ink');
  });
});

describe('StatusDot', () => {
  it('pairs the colour with a readable label', () => {
    render(<StatusDot tone="critical">Review</StatusDot>);
    const status = screen.getByText('Review');
    expect(status).toHaveAttribute('data-tone', 'critical');
    expect(status.querySelector('[aria-hidden="true"]')).toHaveClass('bg-critical');
  });
});
