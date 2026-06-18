import { useState, useEffect } from 'react';
import { Alert } from 'react-native';
import { useUserPreferences } from '../context/UserPreferencesContext';

// MOCKED VERSION FOR LOCAL TESTING (CocoaPods missing on your Mac)
// The actual native code for expo-notifications will be used in production builds via EAS.

export interface PushNotificationState {
  expoPushToken?: string;
  notification?: any;
  permissionStatus: string;
}

export function usePushNotifications() {
  const [expoPushToken, setExpoPushToken] = useState<string | undefined>();
  const [notification, setNotification] = useState<any | undefined>();
  const [permissionStatus, setPermissionStatus] = useState<string>('undetermined');
  const { t } = useUserPreferences();

  useEffect(() => {
    console.log('[Mock] Checking permissions...');
  }, []);

  const requestPermissions = async () => {
    console.log('[Mock] Requesting push permissions...');
    // Simulate user accepting
    setPermissionStatus('granted');
    setExpoPushToken('ExponentPushToken[mocked-token]');
    
    // TEST LOCAL: Simulate Backend Push 5 seconds after opt-in via an Alert
    setTimeout(() => {
      Alert.alert(
        "📲 " + t('push_scenario_a_title'),
        t('push_scenario_a_body') + "\n\n(Ceci est une simulation de la notification sur écran verrouillé, car le module natif attend la compilation cloud)",
        [{ text: "OK" }]
      );
    }, 5000);

    return true;
  };

  return {
    expoPushToken,
    notification,
    permissionStatus,
    requestPermissions,
  };
}
