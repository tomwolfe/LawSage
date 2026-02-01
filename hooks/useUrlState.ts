import { useState, useEffect, useCallback } from 'react';
import * as LZString from 'lz-string';

interface UrlStateOptions<T> {
  defaultValue?: T;
  compress?: boolean;
  debounceMs?: number;
}

/**
 * Custom hook for managing state that persists in the URL hash
 * @param key - The key to use in the URL state object
 * @param options - Configuration options for the hook
 * @returns [state, setState] tuple similar to useState
 */
export function useUrlState<T>(
  key: string,
  options: UrlStateOptions<T> = {}
): [T, (value: T | ((prevState: T) => T)) => void] {
  const { defaultValue, compress = true, debounceMs = 1000 } = options;

  // Initialize state with defaultValue during SSR, then hydrate on client
  const [state, setState] = useState<T>(() => {
    // Check if we're on the client side
    if (typeof window !== 'undefined') {
      // Initialize state from URL on component mount
      const urlState = getUrlState(compress);
      return urlState?.[key] ?? defaultValue;
    }
    // During SSR, return default value
    return defaultValue;
  });

  // Debounce function to limit URL updates
  const [debouncedUpdate, setDebouncedUpdate] = useState<NodeJS.Timeout | null>(null);

  // Function to get current state from URL
  const getUrlState = useCallback((shouldCompress: boolean) => {
    // Only run on client side
    if (typeof window === 'undefined') return null;

    try {
      const hash = window.location.hash.substring(1); // Remove the '#' character
      if (!hash) return null;

      if (shouldCompress) {
        // Decompress the fragment
        const decompressed = LZString.decompressFromEncodedURIComponent(hash);
        if (!decompressed) return null;
        return JSON.parse(decompressed);
      } else {
        return JSON.parse(decodeURIComponent(hash));
      }
    } catch (error) {
      console.error('Error getting state from URL:', error);
      return null;
    }
  }, []);

  // Function to update URL with current state
  const updateUrlState = useCallback(
    (newState: any) => {
      // Only run on client side
      if (typeof window === 'undefined') return;

      try {
        const currentState = getUrlState(compress);
        const updatedState = {
          ...(currentState || {}),
          [key]: newState,
        };

        let serializedState;
        if (compress) {
          // Serialize and compress the state
          const jsonString = JSON.stringify(updatedState);
          serializedState = LZString.compressToEncodedURIComponent(jsonString);
        } else {
          serializedState = encodeURIComponent(JSON.stringify(updatedState));
        }

        // Update the URL hash without triggering a page reload
        const newUrl = `${window.location.pathname}${window.location.search}#${serializedState}`;
        window.history.replaceState({}, '', newUrl);
      } catch (error) {
        console.error('Error updating URL with state:', error);
      }
    },
    [compress, getUrlState, key]
  );

  // Update URL when state changes (only on client side)
  useEffect(() => {
    // Only run on client side
    if (typeof window === 'undefined') return;

    if (debouncedUpdate) {
      clearTimeout(debouncedUpdate);
    }

    const timeoutId = setTimeout(() => {
      updateUrlState(state);
    }, debounceMs);

    setDebouncedUpdate(timeoutId);

    return () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [state, updateUrlState, debounceMs, debouncedUpdate]);

  // Create setter that handles both direct values and updater functions
  const setStateWrapper = useCallback(
    (value: T | ((prevState: T) => T)) => {
      setState(prev => {
        const newValue = value instanceof Function ? value(prev) : value;
        // Only update URL on client side
        if (typeof window !== 'undefined') {
          updateUrlState(newValue);
        }
        return newValue;
      });
    },
    [updateUrlState]
  );

  return [state, setStateWrapper];
}

/**
 * Hook to get the entire URL state object
 */
export function useUrlStateObject(compress: boolean = true) {
  const [state, setState] = useState<any>(null);

  useEffect(() => {
    // Only run on client side
    if (typeof window === 'undefined') return;

    const getUrlState = () => {
      try {
        const hash = window.location.hash.substring(1); // Remove the '#' character
        if (!hash) return null;

        if (compress) {
          // Decompress the fragment
          const decompressed = LZString.decompressFromEncodedURIComponent(hash);
          if (!decompressed) return null;
          return JSON.parse(decompressed);
        } else {
          return JSON.parse(decodeURIComponent(hash));
        }
      } catch (error) {
        console.error('Error getting state from URL:', error);
        return null;
      }
    };

    setState(getUrlState());

    // Listen for popstate events (browser back/forward)
    const handlePopState = () => {
      setState(getUrlState());
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [compress]);

  return state;
}