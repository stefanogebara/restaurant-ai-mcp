import { useMutation, useQueryClient } from '@tanstack/react-query';
import { hostAPI } from '../services/api';
import { SeatPartyRequest, SeatPartyResponse } from '../types/host.types';

export function useSeatParty() {
  const queryClient = useQueryClient();

  return useMutation<SeatPartyResponse, Error, SeatPartyRequest>({
    mutationFn: async (data) => {
      const response = await hostAPI.seatParty(data);
      return response.data;
    },
    onSuccess: () => {
      // Invalidate and refetch dashboard data
      queryClient.invalidateQueries({ queryKey: ['hostDashboard'] });
    },
  });
}
