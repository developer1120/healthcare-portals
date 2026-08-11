import { render, screen } from '@testing-library/react';
import { signInAs } from '@/test/session';
import { App } from './App';

describe('App', () => {
  it('sends signed-out visitors to sign in', async () => {
    render(<App />);
    expect(await screen.findByRole('heading', { level: 1, name: 'Sign in' })).toBeInTheDocument();
  });

  it('mounts the app shell for a signed-in patient', async () => {
    signInAs('patient');
    window.history.replaceState(null, '', '/');
    render(<App />);
    expect(await screen.findByRole('navigation', { name: 'Primary' })).toBeInTheDocument();
  });

  it('applies a theme to the document', () => {
    render(<App />);
    expect(document.documentElement.dataset.theme).toBe('light');
  });
});
