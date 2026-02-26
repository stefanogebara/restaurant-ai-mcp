import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { authFetch } from '../services/api';

interface Customer {
  customer_id: string;
  customer_name: string | null;
  customer_phone: string | null;
  customer_email: string | null;
}

export function useCustomerSearch() {
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');

  // Debounce: state management, not data fetch
  useEffect(() => {
    if (searchQuery.length < 2) {
      setDebouncedQuery('');
      return;
    }
    const t = setTimeout(() => setDebouncedQuery(searchQuery), 300);
    return () => clearTimeout(t);
  }, [searchQuery]);

  const { data: searchResults = [], isFetching: isSearching } = useQuery<Customer[]>({
    queryKey: ['customer-search', debouncedQuery],
    queryFn: async () => {
      const response = await authFetch(
        `/api/revenue?action=customer-search&q=${encodeURIComponent(debouncedQuery)}`
      );
      const data = await response.json();
      return data.success ? (data.data.customers ?? []) : [];
    },
    enabled: debouncedQuery.length >= 2,
    staleTime: 30_000,
  });

  const clearSearch = () => {
    setSearchQuery('');
    setDebouncedQuery('');
  };

  return { searchQuery, setSearchQuery, searchResults, isSearching, clearSearch };
}

export type { Customer };
