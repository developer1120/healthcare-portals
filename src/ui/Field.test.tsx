import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Field, Input, Textarea } from './Field';
import { Select } from './Select';

describe('Field', () => {
  it('labels its control', async () => {
    render(
      <Field label="Full name">
        <Input />
      </Field>,
    );
    const input = screen.getByRole('textbox', { name: 'Full name' });
    await userEvent.setup().type(input, 'Ava Thompson');
    expect(input).toHaveValue('Ava Thompson');
  });

  it('describes the control with its hint', () => {
    render(
      <Field label="Reason for visit" hint="A few words help your clinician prepare.">
        <Textarea />
      </Field>,
    );
    expect(screen.getByRole('textbox', { name: 'Reason for visit' })).toHaveAccessibleDescription(
      'A few words help your clinician prepare.',
    );
  });

  it('marks the control invalid and announces the error', () => {
    render(
      <Field label="Date of birth" hint="DD/MM/YYYY" error="Enter a date in the past">
        <Input />
      </Field>,
    );
    const input = screen.getByRole('textbox', { name: 'Date of birth' });
    expect(input).toBeInvalid();
    expect(input).toHaveAccessibleDescription('DD/MM/YYYY Enter a date in the past');
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a date in the past');
  });

  it('passes required down and shows a visual marker', () => {
    render(
      <Field label="Email" required>
        <Input type="email" />
      </Field>,
    );
    expect(screen.getByRole('textbox', { name: /Email/ })).toBeRequired();
  });

  it('can hide the label visually but keep the accessible name', () => {
    render(
      <Field label="Search providers" hideLabel>
        <Input type="search" placeholder="Name or specialty" />
      </Field>,
    );
    expect(screen.getByText('Search providers')).toHaveClass('sr-only');
    expect(screen.getByRole('searchbox', { name: 'Search providers' })).toBeInTheDocument();
  });

  it('uses the id given to the field for its control', () => {
    render(
      <Field label="Postcode" id="postcode">
        <Input />
      </Field>,
    );
    expect(screen.getByRole('textbox', { name: 'Postcode' })).toHaveAttribute('id', 'postcode');
  });

  it('works without a Field wrapper', () => {
    render(<Input aria-label="Quick note" />);
    expect(screen.getByRole('textbox', { name: 'Quick note' })).not.toBeInvalid();
  });
});

describe('Select', () => {
  const options = [
    { value: 'cardiology', label: 'Cardiology' },
    { value: 'dermatology', label: 'Dermatology' },
    { value: 'neurology', label: 'Neurology', disabled: true },
  ];

  it('renders options inside a labelled field and reports changes', async () => {
    const onChange = vi.fn();
    render(
      <Field label="Specialty">
        <Select options={options} placeholder="Any specialty" defaultValue="" onChange={onChange} />
      </Field>,
    );
    const select = screen.getByRole('combobox', { name: 'Specialty' });
    expect(screen.getByRole('option', { name: 'Any specialty' })).toHaveValue('');
    expect(screen.getByRole('option', { name: 'Neurology' })).toBeDisabled();

    await userEvent.setup().selectOptions(select, 'dermatology');
    expect(select).toHaveValue('dermatology');
    expect(onChange).toHaveBeenCalledOnce();
  });

  it('picks up the field error state', () => {
    render(
      <Field label="Specialty" error="Choose a specialty">
        <Select options={options} />
      </Field>,
    );
    expect(screen.getByRole('combobox', { name: 'Specialty' })).toBeInvalid();
  });
});

describe('controls outside a Field', () => {
  it('keep an aria-invalid they are given', () => {
    render(<Textarea aria-label="Reply" aria-invalid />);
    expect(screen.getByRole('textbox', { name: 'Reply' })).toBeInvalid();
  });
});
