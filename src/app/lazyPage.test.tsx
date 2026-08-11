import { Component, Suspense } from 'react';
import type { ReactNode } from 'react';
import { render, screen } from '@testing-library/react';
import type { RouteObject } from 'react-router';
import { lazyPage } from './lazyPage';
import { routes } from './routes';

class Boundary extends Component<{ children: ReactNode }, { error?: Error }> {
  state: { error?: Error } = {};
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    return this.state.error ? <p role="alert">{this.state.error.message}</p> : this.props.children;
  }
}

function renderPage(Page: () => ReactNode) {
  return render(
    <Boundary>
      <Suspense fallback={<p>Loading page</p>}>
        <Page />
      </Suspense>
    </Boundary>,
  );
}

describe('lazyPage', () => {
  it('shows the fallback while the code loads, then the page', async () => {
    const load = vi.fn(() => Promise.resolve(() => <h1>Billing</h1>));
    const Page = lazyPage(load, 'Billing');
    renderPage(Page);
    expect(screen.getByText('Loading page')).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'Billing' })).toBeInTheDocument();
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('renders straight away once loaded, without the fallback', async () => {
    const load = vi.fn(() => Promise.resolve(() => <h1>Vitals</h1>));
    const Page = lazyPage(load, 'Vitals');
    await Page.preload();
    await Page.preload();
    renderPage(Page);
    expect(screen.getByRole('heading', { name: 'Vitals' })).toBeInTheDocument();
    expect(screen.queryByText('Loading page')).not.toBeInTheDocument();
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('hands a failed download to the error boundary without retrying on its own', async () => {
    // React logs errors that reach a boundary; this one is expected.
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const swallow = (event: ErrorEvent) => event.preventDefault();
    window.addEventListener('error', swallow);
    const load = vi
      .fn<() => Promise<() => ReactNode>>()
      .mockRejectedValueOnce(new Error('Failed to fetch dynamically imported module'))
      .mockResolvedValueOnce(() => <h1>Results</h1>);
    const Page = lazyPage(load, 'Results');

    const first = renderPage(Page);
    expect(await screen.findByRole('alert')).toHaveTextContent('Failed to fetch');
    first.unmount();
    // Rendering again (e.g. coming back to the page) shows the same failure, with no new download.
    const second = renderPage(Page);
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    second.unmount();
    expect(load).toHaveBeenCalledTimes(1);

    // A deliberate retry fetches again.
    await Page.preload();
    renderPage(Page);
    expect(screen.getByRole('heading', { name: 'Results' })).toBeInTheDocument();
    expect(load).toHaveBeenCalledTimes(2);
    window.removeEventListener('error', swallow);
  });
});

describe('route splitting', () => {
  it('loads every page lazily except the shell, gates, sign-in and not-found', () => {
    const eager: string[] = [];
    const visit = (list: RouteObject[]) => {
      for (const route of list) {
        const component = route.Component as { preload?: unknown; name?: string } | undefined;
        if (component && !component.preload) eager.push(component.name ?? '?');
        if (route.children) visit(route.children);
      }
    };
    visit(routes);
    expect([...new Set(eager)].sort()).toEqual(['AppShell', 'ClinicianGate', 'NotFoundPage', 'PatientGate', 'SignInPage']);
  });
});
