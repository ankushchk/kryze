import { apiRequest } from './api';

export interface CoinLedgerItem {
  id: string;
  userId: string;
  amount: number;
  reason: 'SETTLEMENT' | 'REDEEMED_PREMIUM' | 'ADJUSTMENT' | string;
  referenceId?: string;
  createdAt: string;
}

export async function fetchCoinBalance(): Promise<{ balance: number; totalCollected?: number }> {
  return await apiRequest('/api/coins/balance');
}

export async function fetchCoinHistory(): Promise<{ history: CoinLedgerItem[] }> {
  return await apiRequest('/api/coins/history');
}

export async function redeemCoinsForPremium(redemptionType = 'PREMIUM_1_MONTH') {
  return await apiRequest('/api/coins/redeem', {
    method: 'POST',
    body: { redemptionType },
  });
}
