import { useMutation, useQueryClient } from '@tanstack/react-query';
import { hostAPI } from '../services/api';

interface CompleteServiceResponse {
  success: boolean;
  message?: string;
}

export function useCompleteService() {
  const queryClient = useQueryClient();

  return useMutation<CompleteServiceResponse, Error, string>({
    mutationFn: async (serviceRecordId: string) => {
      const response = await hostAPI.completeService(serviceRecordId);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hostDashboard'] });
    },
  });
}
