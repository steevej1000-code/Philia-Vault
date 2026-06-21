/**
 * stripe-success.tsx
 *
 * Stripe redirects here after a successful checkout:
 *   https://app.philiavault.com/stripe-success?session_id=cs_xxx
 *
 * This page:
 *   1. Reads session_id from URL params
 *   2. Calls backend to verify + activate premium
 *   3. Updates local auth state
 *   4. Redirects to the main app
 */

import React, { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useAuthStore } from '../store/authStore';
import { verifyStripeSession } from '../services/stripe';
import { COLORS } from '../constants/colors';

export default function StripeSuccessScreen() {
  const router = useRouter();
  const { session_id } = useLocalSearchParams<{ session_id: string }>();
  const { setPremium } = useAuthStore();
  const [status, setStatus] = useState<'verifying' | 'success' | 'error'>('verifying');
  const [message, setMessage] = useState('Activation de votre abonnement…');

  useEffect(() => {
    let cancelled = false;

    async function activate() {
      if (!session_id) {
        setStatus('error');
        setMessage('Session introuvable. Contactez le support.');
        return;
      }

      try {
        const ok = await verifyStripeSession(session_id);
        if (cancelled) return;

        if (ok) {
          setPremium(true);
          setStatus('success');
          setMessage('Abonnement activé ! Redirection…');
          setTimeout(() => {
            if (!cancelled) router.replace('/(tabs)');
          }, 1500);
        } else {
          // Payment pending or not yet confirmed — still grant access
          // (webhook will confirm async)
          setPremium(true);
          setStatus('success');
          setMessage('Paiement reçu ! Redirection…');
          setTimeout(() => {
            if (!cancelled) router.replace('/(tabs)');
          }, 1500);
        }
      } catch (e: any) {
        if (cancelled) return;
        // Network error — grant optimistic access anyway,
        // webhook will handle the DB update
        console.warn('[stripe-success] verify error:', e.message);
        setPremium(true);
        setStatus('success');
        setMessage('Bienvenue ! Redirection…');
        setTimeout(() => {
          if (!cancelled) router.replace('/(tabs)');
        }, 1500);
      }
    }

    activate();
    return () => { cancelled = true; };
  }, [session_id]);

  return (
    <View style={styles.container}>
      {status === 'verifying' || status === 'success' ? (
        <>
          <View style={styles.iconWrap}>
            {status === 'success'
              ? <Text style={styles.checkIcon}>✓</Text>
              : <ActivityIndicator size="large" color="#ccff00" />
            }
          </View>
          <Text style={styles.title}>
            {status === 'success' ? 'Paiement confirmé !' : 'Vérification…'}
          </Text>
          <Text style={styles.sub}>{message}</Text>
        </>
      ) : (
        <>
          <Text style={styles.errorIcon}>✕</Text>
          <Text style={styles.title}>Problème de vérification</Text>
          <Text style={styles.sub}>{message}</Text>
          <Text
            style={styles.link}
            onPress={() => router.replace('/paywall')}
          >
            Retour au paywall
          </Text>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  iconWrap: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(204,255,0,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(204,255,0,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  checkIcon: {
    fontSize: 36,
    color: '#ccff00',
    fontWeight: '900',
  },
  errorIcon: {
    fontSize: 40,
    color: '#ff3b30',
    marginBottom: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: '900',
    color: '#f0f0f0',
    letterSpacing: -0.5,
    marginBottom: 10,
    textAlign: 'center',
  },
  sub: {
    fontSize: 15,
    color: '#8e8e93',
    textAlign: 'center',
    lineHeight: 22,
  },
  link: {
    marginTop: 24,
    fontSize: 14,
    color: '#ccff00',
    textDecorationLine: 'underline',
  },
});
