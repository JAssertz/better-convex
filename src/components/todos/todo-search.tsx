'use client';

import { useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Search } from 'lucide-react';
import { useDebouncedCallback } from 'use-debounce';

interface TodoSearchProps {
  onSearchChange: (query: string) => void;
  placeholder?: string;
}

export function TodoSearch({ onSearchChange, placeholder = "Search todos..." }: TodoSearchProps) {
  const [value, setValue] = useState('');

  const debouncedSearch = useDebouncedCallback((query: string) => {
    onSearchChange(query);
  }, 300);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setValue(newValue);
    debouncedSearch(newValue);
  };

  // Clear search when component unmounts
  useEffect(() => {
    return () => {
      onSearchChange('');
    };
  }, [onSearchChange]);

  return (
    <div className="relative">
      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        type="search"
        placeholder={placeholder}
        value={value}
        onChange={handleChange}
        className="pl-9"
      />
    </div>
  );
}