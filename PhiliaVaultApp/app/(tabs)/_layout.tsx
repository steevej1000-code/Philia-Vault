import { Tabs } from 'expo-router';
import { View, Text, StyleSheet } from 'react-native';
import { COLORS, RADIUS } from '../../constants/colors';
import { IconAssets, IconLiabilities, IconGift, IconCoach, IconProps } from '../../components/icons/Icons';
import { useUserPreferences } from '../../context/UserPreferencesContext';

interface TabIconProps {
  focused: boolean;
  Icon?: React.ComponentType<IconProps>;
  emoji?: string;
  label: string;
}

function TabIcon({ focused, Icon, emoji, label }: TabIconProps) {
  return (
    <View style={styles.iconWrapper}>
      <View style={[styles.iconContainer, focused && styles.iconContainerActive]}>
        {Icon ? (
          <Icon size={20} color={focused ? '#000000' : COLORS.primary} opacity={focused ? 1 : 0.5} />
        ) : (
          <Text style={[styles.emoji, focused && styles.emojiActive]}>{emoji}</Text>
        )}
      </View>
      <Text style={[styles.label, focused && styles.labelActive]}>{label}</Text>
    </View>
  );
}

export default function TabsLayout() {
  const { t } = useUserPreferences();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: styles.tabBar,
        tabBarShowLabel: false,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t('tab_dashboard'),
          tabBarIcon: ({ focused }) => <TabIcon focused={focused} emoji="◎" label={t('tab_dashboard')} />,
        }}
      />
      <Tabs.Screen
        name="assets"
        options={{
          title: t('tab_assets'),
          tabBarIcon: ({ focused }) => <TabIcon focused={focused} Icon={IconAssets} label={t('tab_assets')} />,
        }}
      />
      <Tabs.Screen
        name="liabilities"
        options={{
          title: t('tab_liabilities'),
          tabBarIcon: ({ focused }) => <TabIcon focused={focused} Icon={IconLiabilities} label={t('tab_liabilities')} />,
        }}
      />
      <Tabs.Screen
        name="affiliation"
        options={{
          title: t('tab_affiliation'),
          tabBarIcon: ({ focused }) => <TabIcon focused={focused} Icon={IconGift} label={t('tab_affiliation')} />,
        }}
      />
      <Tabs.Screen
        name="coach"
        options={{
          title: t('tab_coach'),
          tabBarIcon: ({ focused }) => <TabIcon focused={focused} Icon={IconCoach} label={t('tab_coach')} />,
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: 'rgba(12, 14, 18, 0.95)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
    height: 85,
    paddingBottom: 20,
    paddingTop: 8,
  },
  iconWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    width: 72,
  },
  iconContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconContainerActive: {
    backgroundColor: '#C8FF00',
    shadowColor: '#C8FF00',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 10,
    elevation: 5,
  },
  emoji: {
    fontSize: 20,
    opacity: 0.5,
    color: COLORS.primary,
  },
  emojiActive: {
    opacity: 1,
    color: '#000000',
  },
  label: {
    fontSize: 9,
    fontWeight: '600',
    color: COLORS.onSurfaceVariant,
    opacity: 0.5,
  },
  labelActive: {
    color: COLORS.primary,
    opacity: 1,
  },
});
