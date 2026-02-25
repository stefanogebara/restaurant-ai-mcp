import { useState, useEffect } from 'react';
import { authFetch } from '../services/api';

interface Customer {
  customer_id: string;
  customer_name: string | null;
  customer_phone: string | null;
  customer_email: string | null;
}

export function useCustomerSearch() {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Customer[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  useEffect(() => {
    if (searchQuery.length < 2) {
      setSearchResults([]);
      return;
    }

    const searchTimeout = setTimeout(async () => {
      setIsSearching(true);
      try {
        const response = await authFetch(
          `/api/revenue?action=customer-search&q=${encodeURIComponent(searchQuery)}`
        );
        const data = await response.json();
        if (data.success) {
          setSearchResults(data.data.customers || []);
        }
      } catch (err) {
        console.error('Customer search error:', err);
      } finally {
        setIsSearching(false);
      }
    }, 300);

    return () => clearTimeout(searchTimeout);
  }, [searchQuery]);

  const clearSearch = () => {
    setSearchQuery('');
    setSearchResults([]);
  };

  return { searchQuery, setSearchQuery, searchResults, isSearching, clearSearch };
}

export type { Customer };
