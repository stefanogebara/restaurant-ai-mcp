import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../services/api';

interface DepositConfig {
  enabled: boolean;
  type?: 'flat' | 'per_person';
  amount?: number;
}

export function useDepositConfig() {
  return useQuery<DepositConfig>({
    queryKey: ['depositConfig'],
    queryFn: async () => {
      const response = await api.get('/deposit-config');
      return response.data.deposit_config;
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function useUpdateDepositConfig() {
  const queryClient = useQueryClient();
  return useMutation<DepositConfig, Error, DepositConfig>({
    mutationFn: async (config) => {
      const response = await api.patch('/deposit-config', config);
      return response.data.deposit_config;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(['depositConfig'], data);
    },
  });
}
