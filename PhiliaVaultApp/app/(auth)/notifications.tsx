import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView, Dimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { IconBell } from '../../components/icons/Icons';
import { usePushNotifications } from '../../hooks/usePushNotifications';
import { useUserPreferences } from '../../context/UserPreferencesContext';

const { width } = Dimensions.get('window');

export default function NotificationsScreen() {
  const router = useRouter();
  const { t } = useUserPreferences();
  const { requestPermissions } = usePushNotifications();

  // MOCKED for local testing without CocoaPods:
  // In production, we'd check status here to skip if already determined.
  
  const handleAccept = async () => {
    // Request permission, then continue to tabs
    await requestPermissions();
    router.replace('/(tabs)');
  };

  const handleSkip = () => {
    // Continue without requesting permission
    router.replace('/(tabs)');
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="light" />
      <View style={styles.content}>
        
        <View style={styles.iconContainer}>
          <LinearGradient
            colors={['rgba(215, 255, 0, 0.2)', 'rgba(215, 255, 0, 0.05)']}
            style={styles.iconBackground}
          >
            <IconBell size={48} color="#D7FF00" />
          </LinearGradient>
        </View>

        <Text style={styles.title}>{t('push_optin_title')}</Text>
        <Text style={styles.description}>{t('push_optin_desc')}</Text>

        <View style={styles.actionsContainer}>
          <TouchableOpacity 
            style={styles.primaryButton}
            onPress={handleAccept}
            activeOpacity={0.8}
          >
            <Text style={styles.primaryButtonText}>{t('push_optin_btn_accept')}</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.secondaryButton}
            onPress={handleSkip}
            activeOpacity={0.7}
          >
            <Text style={styles.secondaryButtonText}>{t('push_optin_btn_skip')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0A0A',
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconContainer: {
    marginBottom: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBackground: {
    width: 100,
    height: 100,
    borderRadius: 50,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(215, 255, 0, 0.1)',
  },
  title: {
    fontSize: 28,
    fontFamily: 'PlusJakartaSans_700Bold',
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 16,
    letterSpacing: -0.5,
  },
  description: {
    fontSize: 16,
    fontFamily: 'Montserrat_400Regular',
    color: '#A0A0A0',
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 48,
    paddingHorizontal: 10,
  },
  actionsContainer: {
    width: '100%',
    gap: 16,
  },
  primaryButton: {
    backgroundColor: '#D7FF00',
    borderRadius: 16,
    paddingVertical: 18,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    shadowColor: '#D7FF00',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 5,
  },
  primaryButtonText: {
    color: '#0A0A0A',
    fontSize: 16,
    fontFamily: 'PlusJakartaSans_700Bold',
  },
  secondaryButton: {
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  secondaryButtonText: {
    color: '#808080',
    fontSize: 15,
    fontFamily: 'PlusJakartaSans_600SemiBold',
  },
});
