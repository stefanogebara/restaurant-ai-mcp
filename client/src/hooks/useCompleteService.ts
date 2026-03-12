import { useMutation, useQueryClient } from '@tanstack/react-query';
import { hostAPI } from '../services/api';

interface CompleteServiceResponse {
  success: boolean;
  message?: string;
}

interface CompleteServiceInput {
  serviceRecordId: string;
  totalBill?: number;
}

export function useCompleteService() {
  const queryClient = useQueryClient();

  return useMutation<CompleteServiceResponse, Error, CompleteServiceInput>({
    mutationFn: async ({ serviceRecordId, totalBill }: CompleteServiceInput) => {
      const response = await hostAPI.completeService(serviceRecordId, totalBill);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hostDashboard'] });
      queryClient.invalidateQueries({ queryKey: ['revenue-stats'] });
      queryClient.invalidateQueries({ queryKey: ['activity-feed'] });
    },
  });
}
