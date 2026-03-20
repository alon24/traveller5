
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useStopArrivals } from '../hooks/useStopArrivals';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false },
  },
});

const wrapper = ({ children }) => (
  <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
);

describe('useStopArrivals hook', () => {
  beforeEach(() => {
    queryClient.clear();
    vi.restoreAllMocks();
  });

  it('should throw trimmed error when curlbus returns errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ errors: ["Invalid stop code 15435\n"] }),
    }));

    const { result } = renderHook(() => useStopArrivals('15435'), { wrapper });

    await waitFor(() => {
      console.log('Hook state:', { 
        status: result.current.status, 
        isError: result.current.isError, 
        error: result.current.error?.message 
      });
      expect(result.current.isError).toBe(true);
    }, { timeout: 5000 });
    expect(result.current.error.message).toBe('Invalid stop code 15435');
  });

  it('should return visits when curlbus returns data', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        visits: {
          "15435": [
            { line_name: "16", eta: new Date(Date.now() + 500000).toISOString(), static_info: { route: { destination: { name: { HE: "מקום כלשהו" } } } } }
          ]
        }
      }),
    }));

    const { result } = renderHook(() => useStopArrivals('15435'), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data.length).toBe(1);
    expect(result.current.data[0].lineRef).toBe('16');
  });
});
