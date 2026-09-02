import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ReloadlyProductSelector } from '../ReloadlyProductSelector';

// Mock fetch
global.fetch = vi.fn();

describe('ReloadlyProductSelector Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (global.fetch as any).mockClear();
  });

  describe('Data Prize Flow', () => {
    it('should render network selector for data prizes', () => {
      const onChange = vi.fn();
      render(
        <ReloadlyProductSelector
          field={{ name: 'test' }}
          value={undefined}
          onChange={onChange}
          fulfilmentType="data"
        />
      );

      expect(screen.getByText('Network')).toBeInTheDocument();
      expect(screen.getByDisplayValue('Select a network')).toBeInTheDocument();
    });

    it('should show all network options', () => {
      const onChange = vi.fn();
      render(
        <ReloadlyProductSelector
          field={{ name: 'test' }}
          value={undefined}
          onChange={onChange}
          fulfilmentType="data"
        />
      );

      const select = screen.getByDisplayValue('Select a network') as HTMLSelectElement;
      fireEvent.click(select);

      expect(screen.getByText('MTN Nigeria')).toBeInTheDocument();
      expect(screen.getByText('Airtel Nigeria')).toBeInTheDocument();
      expect(screen.getByText('Glo Nigeria')).toBeInTheDocument();
      expect(screen.getByText('9mobile / T2 Nigeria')).toBeInTheDocument();
    });

    it('should fetch products when network is selected', async () => {
      const mockProducts = {
        operatorId: 345,
        operatorName: 'MTN Nigeria Data',
        denominationType: 'FIXED',
        localFixedAmounts: [500, 1000, 2500, 5000],
        localMinAmount: null,
        localMaxAmount: null,
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockProducts,
      });

      const onChange = vi.fn();
      render(
        <ReloadlyProductSelector
          field={{ name: 'test' }}
          value={undefined}
          onChange={onChange}
          fulfilmentType="data"
        />
      );

      const networkSelect = screen.getByDisplayValue('Select a network') as HTMLSelectElement;
      await userEvent.selectOptions(networkSelect, 'mtn');

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith('/api/reloadly/operators/345/products');
      });
    });

    it('should display available plans in dropdown', async () => {
      const mockProducts = {
        operatorId: 345,
        operatorName: 'MTN Nigeria Data',
        denominationType: 'FIXED',
        localFixedAmounts: [500, 1000, 2500, 5000],
        localMinAmount: null,
        localMaxAmount: null,
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockProducts,
      });

      const onChange = vi.fn();
      render(
        <ReloadlyProductSelector
          field={{ name: 'test' }}
          value={undefined}
          onChange={onChange}
          fulfilmentType="data"
        />
      );

      const networkSelect = screen.getByDisplayValue('Select a network') as HTMLSelectElement;
      await userEvent.selectOptions(networkSelect, 'mtn');

      await waitFor(() => {
        expect(screen.getByText('₦500 data')).toBeInTheDocument();
        expect(screen.getByText('₦1,000 data')).toBeInTheDocument();
        expect(screen.getByText('₦2,500 data')).toBeInTheDocument();
        expect(screen.getByText('₦5,000 data')).toBeInTheDocument();
      });
    });

    it('should call onChange when plan is selected', async () => {
      const mockProducts = {
        operatorId: 345,
        operatorName: 'MTN Nigeria Data',
        denominationType: 'FIXED',
        localFixedAmounts: [500, 1000, 2500, 5000],
        localMinAmount: null,
        localMaxAmount: null,
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockProducts,
      });

      const onChange = vi.fn();
      render(
        <ReloadlyProductSelector
          field={{ name: 'test' }}
          value={undefined}
          onChange={onChange}
          fulfilmentType="data"
        />
      );

      const networkSelect = screen.getByDisplayValue('Select a network') as HTMLSelectElement;
      await userEvent.selectOptions(networkSelect, 'mtn');

      await waitFor(() => {
        expect(screen.getByText('₦5,000 data')).toBeInTheDocument();
      });

      const planSelect = screen.getByDisplayValue('Select a plan') as HTMLSelectElement;
      await userEvent.selectOptions(planSelect, '5000');

      expect(onChange).toHaveBeenCalledWith({
        network: 'mtn',
        reloadlyOperatorId: 345,
        reloadlyLocalAmount: 5000,
      });
    });

    it('should show error when API fails', async () => {
      (global.fetch as any).mockRejectedValueOnce(new Error('API request failed'));

      const onChange = vi.fn();
      render(
        <ReloadlyProductSelector
          field={{ name: 'test' }}
          value={undefined}
          onChange={onChange}
          fulfilmentType="data"
        />
      );

      const networkSelect = screen.getByDisplayValue('Select a network') as HTMLSelectElement;
      await userEvent.selectOptions(networkSelect, 'mtn');

      await waitFor(() => {
        expect(screen.getByText(/API request failed/)).toBeInTheDocument();
      });
    });
  });

  describe('Airtime Prize Flow', () => {
    it('should render amount selector for airtime prizes', () => {
      const onChange = vi.fn();
      render(
        <ReloadlyProductSelector
          field={{ name: 'test' }}
          value={undefined}
          onChange={onChange}
          fulfilmentType="airtime"
        />
      );

      expect(screen.getByText('Airtime Amount')).toBeInTheDocument();
    });

    it('should fetch airtime products on mount', async () => {
      const mockProducts = {
        operatorId: 317,
        operatorName: 'Nigeria Airtime',
        denominationType: 'FIXED',
        localFixedAmounts: [500, 1000, 2000, 5000, 10000],
        localMinAmount: null,
        localMaxAmount: null,
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockProducts,
      });

      const onChange = vi.fn();
      render(
        <ReloadlyProductSelector
          field={{ name: 'test' }}
          value={undefined}
          onChange={onChange}
          fulfilmentType="airtime"
        />
      );

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith('/api/reloadly/operators/317/products');
      });
    });

    it('should display airtime amounts in dropdown', async () => {
      const mockProducts = {
        operatorId: 317,
        operatorName: 'Nigeria Airtime',
        denominationType: 'FIXED',
        localFixedAmounts: [500, 1000, 2000, 5000],
        localMinAmount: null,
        localMaxAmount: null,
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockProducts,
      });

      const onChange = vi.fn();
      render(
        <ReloadlyProductSelector
          field={{ name: 'test' }}
          value={undefined}
          onChange={onChange}
          fulfilmentType="airtime"
        />
      );

      await waitFor(() => {
        expect(screen.getByText('₦500 airtime')).toBeInTheDocument();
        expect(screen.getByText('₦1,000 airtime')).toBeInTheDocument();
        expect(screen.getByText('₦2,000 airtime')).toBeInTheDocument();
        expect(screen.getByText('₦5,000 airtime')).toBeInTheDocument();
      });
    });

    it('should call onChange when airtime amount is selected', async () => {
      const mockProducts = {
        operatorId: 317,
        operatorName: 'Nigeria Airtime',
        denominationType: 'FIXED',
        localFixedAmounts: [500, 1000, 2000, 5000],
        localMinAmount: null,
        localMaxAmount: null,
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockProducts,
      });

      const onChange = vi.fn();
      render(
        <ReloadlyProductSelector
          field={{ name: 'test' }}
          value={undefined}
          onChange={onChange}
          fulfilmentType="airtime"
        />
      );

      await waitFor(() => {
        expect(screen.getByText('₦5,000 airtime')).toBeInTheDocument();
      });

      const amountSelect = screen.getByDisplayValue('Select an amount') as HTMLSelectElement;
      await userEvent.selectOptions(amountSelect, '5000');

      expect(onChange).toHaveBeenCalledWith(5000);
    });

    it('should support range-based airtime amounts', async () => {
      const mockProducts = {
        operatorId: 317,
        operatorName: 'Nigeria Airtime Range',
        denominationType: 'RANGE',
        localFixedAmounts: null,
        localMinAmount: 100,
        localMaxAmount: 100000,
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockProducts,
      });

      const onChange = vi.fn();
      render(
        <ReloadlyProductSelector
          field={{ name: 'test' }}
          value={undefined}
          onChange={onChange}
          fulfilmentType="airtime"
        />
      );

      await waitFor(() => {
        const input = screen.getByPlaceholderText(/Enter amount/);
        expect(input).toHaveAttribute('min', '100');
        expect(input).toHaveAttribute('max', '100000');
      });
    });
  });

  describe('Loading States', () => {
    it('should show loading indicator while fetching', async () => {
      const mockProducts = {
        operatorId: 345,
        operatorName: 'MTN Nigeria Data',
        denominationType: 'FIXED',
        localFixedAmounts: [500, 1000, 2500, 5000],
        localMinAmount: null,
        localMaxAmount: null,
      };

      (global.fetch as any).mockImplementationOnce(
        () =>
          new Promise((resolve) =>
            setTimeout(() => resolve({ ok: true, json: async () => mockProducts }), 100)
          )
      );

      const onChange = vi.fn();
      render(
        <ReloadlyProductSelector
          field={{ name: 'test' }}
          value={undefined}
          onChange={onChange}
          fulfilmentType="data"
        />
      );

      const networkSelect = screen.getByDisplayValue('Select a network') as HTMLSelectElement;
      await userEvent.selectOptions(networkSelect, 'mtn');

      expect(screen.getByText('Loading available plans...')).toBeInTheDocument();

      await waitFor(() => {
        expect(screen.queryByText('Loading available plans...')).not.toBeInTheDocument();
      });
    });
  });
});
