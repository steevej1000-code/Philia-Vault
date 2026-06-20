import React, { useState, useRef } from 'react';
import { View, Text, StyleSheet, Dimensions, TouchableOpacity, FlatList } from 'react-native';
import { useRouter } from 'expo-router';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, Easing, interpolate, Extrapolate } from 'react-native-reanimated';
import { StatusBar } from 'expo-status-bar';
import { COLORS } from '../../constants/colors';
import { IconTarget, IconShield, IconCoach } from '../../components/icons/Icons';
import { storage } from '../../services/storage';
import { useUserPreferences } from '../../context/UserPreferencesContext';

const { width, height } = Dimensions.get('window');

export default function OnboardingScreen() {
  const router = useRouter();
  const { t } = useUserPreferences();
  const [currentIndex, setCurrentIndex] = useState(0);
  const flatListRef = useRef<FlatList>(null);
  const scrollX = useSharedValue(0);

  const SLIDES = [
    {
      id: '1',
      title: t('onboarding_slide1_title'),
      description: t('onboarding_slide1_desc'),
      icon: <IconTarget color={COLORS.primary} size={80} />,
    },
    {
      id: '2',
      title: t('onboarding_slide2_title'),
      description: t('onboarding_slide2_desc'),
      icon: <IconShield color={COLORS.primary} size={80} />,
    },
    {
      id: '3',
      title: t('onboarding_slide3_title'),
      description: t('onboarding_slide3_desc'),
      icon: <IconCoach color={COLORS.primary} size={80} />,
    },
  ];

  const handleScroll = (event: any) => {
    scrollX.value = event.nativeEvent.contentOffset.x;
    const index = Math.round(event.nativeEvent.contentOffset.x / width);
    setCurrentIndex(index);
  };

  const handleNext = async () => {
    if (currentIndex < SLIDES.length - 1) {
      flatListRef.current?.scrollToIndex({ index: currentIndex + 1, animated: true });
    } else {
      await storage.setItem('has_seen_onboarding', 'true');
      router.replace('/(auth)/login');
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      
      <Animated.FlatList
        ref={flatListRef as any}
        data={SLIDES}
        keyExtractor={(item) => item.id}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        bounces={false}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        renderItem={({ item, index }) => {
          return (
            <View style={styles.slide}>
              <View style={styles.iconContainer}>
                {item.icon}
              </View>
              <Text style={styles.title}>{item.title}</Text>
              <Text style={styles.description}>{item.description}</Text>
            </View>
          );
        }}
      />

      <View style={styles.footer}>
        <View style={styles.pagination}>
          {SLIDES.map((_, index) => {
            const animatedDotStyle = useAnimatedStyle(() => {
              const dotWidth = interpolate(
                scrollX.value,
                [(index - 1) * width, index * width, (index + 1) * width],
                [8, 24, 8],
                Extrapolate.CLAMP
              );
              const opacity = interpolate(
                scrollX.value,
                [(index - 1) * width, index * width, (index + 1) * width],
                [0.3, 1, 0.3],
                Extrapolate.CLAMP
              );
              return { width: dotWidth, opacity };
            });

            return <Animated.View key={index} style={[styles.dot, animatedDotStyle]} />;
          })}
        </View>

        <TouchableOpacity style={styles.button} onPress={handleNext} activeOpacity={0.8}>
          <Text style={styles.buttonText}>
            {currentIndex === SLIDES.length - 1 ? t('onboarding_btn_start') : t('onboarding_btn_next')}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  slide: {
    width,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  iconContainer: {
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: 'rgba(212, 175, 55, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 40,
    borderWidth: 1,
    borderColor: 'rgba(212, 175, 55, 0.3)',
  },
  title: {
    fontFamily: 'Montserrat-Bold',
    fontSize: 28,
    color: COLORS.onSurface,
    textAlign: 'center',
    marginBottom: 16,
  },
  description: {
    fontFamily: 'PlusJakartaSans-Regular',
    fontSize: 16,
    color: COLORS.onSurfaceVariant,
    textAlign: 'center',
    lineHeight: 24,
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 32,
    paddingBottom: 50,
  },
  pagination: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 32,
  },
  dot: {
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.primary,
    marginHorizontal: 4,
  },
  button: {
    backgroundColor: COLORS.primary,
    paddingVertical: 16,
    borderRadius: 999,
    alignItems: 'center',
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  buttonText: {
    fontFamily: 'PlusJakartaSans-Bold',
    fontSize: 16,
    color: '#000000',
  },
});
