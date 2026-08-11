import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider, createBrowserRouter } from 'react-router';
import { createQueryClient } from '@/api/queryClient';
import { routes } from '@/app/routes';
import { useApplyTheme } from '@/theme/useApplyTheme';

const router = createBrowserRouter(routes);
const queryClient = createQueryClient();

/** Root component: applies the colour theme and provides data and routing. */
export function App() {
  useApplyTheme();
  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
}
