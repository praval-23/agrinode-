import { createContext, type ReactNode, useContext, useMemo, useState } from 'react';
import { createManualLocation, demoUserLocation, getCurrentUserLocation, type UserLocation } from '@/services/locationService';

type LocationState = {
  location: UserLocation;
  loading: boolean;
  error?: string;
  useCurrentLocation: () => Promise<void>;
  setManualLocation: (city: string, district: string, state: string) => void;
};

const Context = createContext<LocationState | undefined>(undefined);

export function LocationProvider({ children }: { children: ReactNode }) {
  const [location, setLocation] = useState<UserLocation>(demoUserLocation);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const value = useMemo<LocationState>(() => ({
    location,
    loading,
    error,
    useCurrentLocation: async () => {
      setLoading(true);
      setError(undefined);
      try { setLocation(await getCurrentUserLocation()); }
      catch (reason) { setLocation(demoUserLocation); setError(reason instanceof Error ? reason.message : 'Location unavailable'); }
      finally { setLoading(false); }
    },
    setManualLocation: (city, district, state) => { setLocation(createManualLocation(city, district, state)); setError(undefined); },
  }), [error, loading, location]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useLocationSelection() { const context = useContext(Context); if (!context) throw new Error('useLocationSelection must be inside LocationProvider'); return context; }