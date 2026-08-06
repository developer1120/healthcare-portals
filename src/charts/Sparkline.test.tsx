import { render, screen } from '@testing-library/react';
import { SPARK_HEIGHT, linePoints, scaleY } from './scale';
import { Sparkline } from './Sparkline';

describe('scale helpers', () => {
  it('puts the minimum at the bottom and the maximum at the top', () => {
    expect(scaleY(0, 0, 10)).toBe(SPARK_HEIGHT);
    expect(scaleY(10, 0, 10)).toBe(0);
    expect(scaleY(5, 0, 10)).toBe(SPARK_HEIGHT / 2);
  });

  it('centres a flat series', () => {
    expect(scaleY(7, 7, 7)).toBe(SPARK_HEIGHT / 2);
  });

  it('spreads points evenly across the width', () => {
    expect(linePoints([0, 5, 10], 0, 10)).toBe('0,32 50,16 100,0');
  });

  it('draws a single value as a flat line', () => {
    expect(linePoints([4], 0, 8)).toBe('0,16 100,16');
  });
});

describe('Sparkline', () => {
  it('draws one line per non-empty series', () => {
    const { container } = render(
      <Sparkline
        series={[
          { values: [1, 2, 3], color: 'red' },
          { values: [2, 2, 2], color: 'blue' },
          { values: [], color: 'green' },
        ]}
      />,
    );
    expect(container.querySelectorAll('polyline')).toHaveLength(2);
  });

  it('is decorative unless given a label', () => {
    const { container, rerender } = render(<Sparkline series={[{ values: [1, 2], color: 'red' }]} />);
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');

    rerender(<Sparkline series={[{ values: [1, 2], color: 'red' }]} label="Weight, last 90 days" />);
    expect(screen.getByRole('img', { name: 'Weight, last 90 days' })).toBeInTheDocument();
  });

  it('shades the target band and marks the latest point', () => {
    const { container } = render(
      <Sparkline series={[{ values: [120, 140], color: 'red' }]} band={{ low: 90, high: 130 }} markLast />,
    );
    expect(screen.getByTestId('sparkline-band')).toBeInTheDocument();
    expect(container.querySelector('line')).toHaveAttribute('x1', '100');
  });

  it('draws a dashed reference line at the threshold', () => {
    render(<Sparkline series={[{ values: [120, 140], color: 'red' }]} threshold={130} padding={0} />);
    const line = screen.getByTestId('sparkline-threshold');
    expect(line).toHaveAttribute('stroke-dasharray', '4 4');
    expect(line).toHaveAttribute('y1', '16');
  });

  it('renders nothing without data', () => {
    const { container } = render(<Sparkline series={[{ values: [], color: 'red' }]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
