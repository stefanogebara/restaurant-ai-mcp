import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api as apiClient } from '../services/api';

export interface Coupon {
  id: string;
  restaurant_id: string;
  code: string;
  description: string | null;
  discount_type: 'percentage' | 'fixed';
  discount_value: number;
  min_order: number;
  max_uses: number | null;
  used_count: number;
  valid_from: string;
  valid_until: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CouponValidation extends Coupon {
  valid: boolean;
  invalid_reasons: string[];
}

export function useCouponList() {
  return useQuery({
    queryKey: ['coupons'],
    queryFn: async () => {
      const res = await apiClient.get('/coupons?action=list');
      return res.data.data.coupons as Coupon[];
    },
    staleTime: 2 * 60 * 1000,
  });
}

export function useCreateCoupon() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: {
      code?: string;
      description?: string;
      discount_type: 'percentage' | 'fixed';
      discount_value: number;
      min_order?: number;
      max_uses?: number | null;
      valid_from?: string;
      valid_until?: string | null;
    }) => {
      const res = await apiClient.post('/coupons?action=create', data);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['coupons'] });
    },
  });
}

export function useDeactivateCoupon() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (couponId: string) => {
      const res = await apiClient.post('/coupons?action=deactivate', { coupon_id: couponId });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['coupons'] });
    },
  });
}

export function useValidateCoupon(code: string | null) {
  return useQuery({
    queryKey: ['coupon-validate', code],
    queryFn: async () => {
      const res = await apiClient.get(`/coupons?action=validate&code=${encodeURIComponent(code!)}`);
      return res.data.data as CouponValidation;
    },
    enabled: !!code && code.trim().length > 0,
    staleTime: 30 * 1000,
  });
}
