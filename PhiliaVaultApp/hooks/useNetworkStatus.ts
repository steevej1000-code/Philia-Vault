import { useEffect, useState } from 'react';
import NetInfo, { NetInfoState } from '@react-native-community/netinfo';

interface NetworkStatus {
  /** true once we have an initial reading from NetInfo */
  isReady: boolean;
  /** device has a network connection (wifi/cellular/etc.) */
  isConnected: boolean;
  /** device is connected AND the connection is usable (internet reachable) */
  isOnline: boolean;
}

/**
 * Tracks live network connectivity using @react-native-community/netinfo.
 *
 * - `isConnected` reflects NetInfo's `isConnected` flag.
 * - `isOnline` additionally requires `isInternetReachable` to not be `false`
 *   (it can be `null` on some platforms while still detecting, in which case
 *   we optimistically treat the connection as online).
 */
export function useNetworkStatus(): NetworkStatus {
  const [state, setState] = useState<{ isReady: boolean; isConnected: boolean; isOnline: boolean }>({
    isReady: false,
    isConnected: true,
    isOnline: true,
  });

  useEffect(() => {
    const applyState = (netState: NetInfoState) => {
      const isConnected = !!netState.isConnected;
      const isOnline = isConnected && netState.isInternetReachable !== false;
      setState({ isReady: true, isConnected, isOnline });
    };

    NetInfo.fetch().then(applyState).catch(() => {
      setState({ isReady: true, isConnected: true, isOnline: true });
    });

    const unsubscribe = NetInfo.addEventListener(applyState);
    return () => unsubscribe();
  }, []);

  return state;
}

export default useNetworkStatus;
