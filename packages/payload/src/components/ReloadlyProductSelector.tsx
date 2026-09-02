'use client';

import { useEffect, useState } from 'react';
import type { FieldBase } from 'payload';
import type { TextFieldClientComponent } from 'payload';

interface ReloadlyProduct {
  operatorId: number;
  operatorName: string;
  denominationType: 'RANGE' | 'FIXED';
  localFixedAmounts: number[] | null;
  localMinAmount: number | null;
  localMaxAmount: number | null;
}

interface DataPlan {
  network: string;
  reloadlyOperatorId: number;
  reloadlyLocalAmount: number;
}

interface AirtimeProduct {
  operatorId: number;
  operatorName: string;
  localFixedAmounts: number[];
}

interface ReloadlyProductSelectorProps {
  field: FieldBase;
  value?: number | DataPlan[];
  onChange: (value: number | DataPlan[] | undefined) => void;
  path?: string;
  fulfilmentType?: string;
  network?: string;
}

const NETWORKS = [
  { label: 'MTN Nigeria', value: 'mtn', operatorId: 345 },
  { label: 'Airtel Nigeria', value: 'airtel', operatorId: 646 },
  { label: 'Glo Nigeria', value: 'glo', operatorId: 647 },
  { label: '9mobile / T2 Nigeria', value: 't2', operatorId: 645 },
];

const AIRTIME_OPERATOR_ID = 317; // Nigeria generic airtime operator

/**
 * Admin component for selecting Reloadly products dynamically.
 * Shows available denominations/plans fetched from Reloadly API.
 * Supports both airtime (amount selection) and data (plan selection per network).
 */
export const ReloadlyProductSelector = ({
  field,
  value,
  onChange,
  fulfilmentType,
  network,
}: ReloadlyProductSelectorProps) => {
  const [products, setProducts] = useState<ReloadlyProduct | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedNetwork, setSelectedNetwork] = useState(network || '');

  const fetchProducts = async (operatorId: number) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/reloadly/operators/${operatorId}/products`
      );
      if (!response.ok) {
        throw new Error(`Failed to fetch products: ${response.statusText}`);
      }
      const data = await response.json();
      setProducts(data);
    } catch (err: any) {
      setError(err.message);
      setProducts(null);
    } finally {
      setLoading(false);
    }
  };

  // For data prizes: fetch when network changes
  useEffect(() => {
    if (fulfilmentType === 'data' && selectedNetwork) {
      const network = NETWORKS.find((n) => n.value === selectedNetwork);
      if (network) {
        fetchProducts(network.operatorId);
      }
    }
  }, [selectedNetwork, fulfilmentType]);

  // For airtime prizes: fetch on mount
  useEffect(() => {
    if (fulfilmentType === 'airtime') {
      fetchProducts(AIRTIME_OPERATOR_ID);
    }
  }, [fulfilmentType]);

  // DATA PRIZE FLOW
  if (fulfilmentType === 'data') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div>
          <label style={{ display: 'block', marginBottom: '6px' }}>
            Network
          </label>
          <select
            value={selectedNetwork}
            onChange={(e) => {
              setSelectedNetwork(e.target.value);
              onChange(undefined);
            }}
            style={{
              padding: '8px',
              borderRadius: '4px',
              border: '1px solid #ccc',
              fontSize: '14px',
              width: '100%',
            }}
          >
            <option value="">Select a network</option>
            {NETWORKS.map((n) => (
              <option key={n.value} value={n.value}>
                {n.label}
              </option>
            ))}
          </select>
        </div>

        {selectedNetwork && (
          <div>
            <label style={{ display: 'block', marginBottom: '6px' }}>
              Data Plan Amount
            </label>
            {loading && <div style={{ color: '#999' }}>Loading available plans...</div>}
            {error && (
              <div style={{ color: '#d32f2f', fontSize: '12px' }}>{error}</div>
            )}
            {products && products.denominationType === 'FIXED' && products.localFixedAmounts ? (
              <select
                value={value || ''}
                onChange={(e) => {
                  const amount = Number(e.target.value);
                  const network = NETWORKS.find((n) => n.value === selectedNetwork);
                  if (network) {
                    onChange({
                      network: selectedNetwork,
                      reloadlyOperatorId: network.operatorId,
                      reloadlyLocalAmount: amount,
                    });
                  }
                }}
                style={{
                  padding: '8px',
                  borderRadius: '4px',
                  border: '1px solid #ccc',
                  fontSize: '14px',
                  width: '100%',
                }}
              >
                <option value="">Select a plan</option>
                {products.localFixedAmounts.map((amount) => (
                  <option key={amount} value={amount}>
                    ₦{amount.toLocaleString()} data
                  </option>
                ))}
              </select>
            ) : products && products.denominationType === 'RANGE' ? (
              <input
                type="number"
                min={products.localMinAmount || 0}
                max={products.localMaxAmount || 100000}
                value={value || ''}
                onChange={(e) => {
                  const amount = Number(e.target.value);
                  const network = NETWORKS.find((n) => n.value === selectedNetwork);
                  if (network) {
                    onChange({
                      network: selectedNetwork,
                      reloadlyOperatorId: network.operatorId,
                      reloadlyLocalAmount: amount,
                    });
                  }
                }}
                placeholder={`Enter amount (₦${products.localMinAmount} - ₦${products.localMaxAmount})`}
                style={{
                  padding: '8px',
                  borderRadius: '4px',
                  border: '1px solid #ccc',
                  fontSize: '14px',
                  width: '100%',
                }}
              />
            ) : null}
          </div>
        )}
      </div>
    );
  }

  // AIRTIME PRIZE FLOW
  if (fulfilmentType === 'airtime') {
    return (
      <div>
        <label style={{ display: 'block', marginBottom: '6px' }}>
          Airtime Amount
        </label>
        {loading && <div style={{ color: '#999' }}>Loading available amounts...</div>}
        {error && (
          <div style={{ color: '#d32f2f', fontSize: '12px' }}>{error}</div>
        )}
        {products && products.denominationType === 'FIXED' && products.localFixedAmounts ? (
          <select
            value={value || ''}
            onChange={(e) => onChange(Number(e.target.value))}
            style={{
              padding: '8px',
              borderRadius: '4px',
              border: '1px solid #ccc',
              fontSize: '14px',
              width: '100%',
            }}
          >
            <option value="">Select an amount</option>
            {products.localFixedAmounts.map((amount) => (
              <option key={amount} value={amount}>
                ₦{amount.toLocaleString()} airtime
              </option>
            ))}
          </select>
        ) : products && products.denominationType === 'RANGE' ? (
          <input
            type="number"
            min={products.localMinAmount || 0}
            max={products.localMaxAmount || 100000}
            value={value || ''}
            onChange={(e) => onChange(Number(e.target.value))}
            placeholder={`Enter amount (₦${products.localMinAmount} - ₦${products.localMaxAmount})`}
            style={{
              padding: '8px',
              borderRadius: '4px',
              border: '1px solid #ccc',
              fontSize: '14px',
              width: '100%',
            }}
          />
        ) : null}
      </div>
    );
  }

  return null;
};

/**
 * Payload field component for airtime amount selection
 */
export const AirtimeProductField: TextFieldClientComponent = ({
  field,
  value,
  onChange,
  path,
}: any) => {
  return (
    <ReloadlyProductSelector
      field={field}
      value={value}
      onChange={onChange}
      path={path}
      fulfilmentType="airtime"
    />
  );
};

/**
 * Payload field component for data plan selection within array
 */
export const DataPlanField: TextFieldClientComponent = ({
  field,
  value,
  onChange,
  path,
  parentData,
}: any) => {
  return (
    <ReloadlyProductSelector
      field={field}
      value={value}
      onChange={onChange}
      path={path}
      fulfilmentType="data"
      network={parentData?.network}
    />
  );
};

/**
 * Row label for data plans array showing network and amount
 */
export const ReloadlyDataPlanRowLabel = ({ data }: any) => {
  const networkLabel = NETWORKS.find((n) => n.value === data?.network)?.label;
  return `${networkLabel || 'Unknown'} - ₦${(data?.reloadlyLocalAmount || 0).toLocaleString()}`;
};

export default ReloadlyProductSelector;
