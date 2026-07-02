import { Tabs } from 'expo-router';
import { View, Text, StyleSheet } from 'react-native';
import { COLORS, RADIUS } from '../../constants/colors';
import { IconAssets, IconLiabilities, IconGift, IconCoach, IconShield, IconProps } from '../../components/icons/Icons';
import { useUserPreferences } from '../../context/UserPreferencesContext';

interface TabIconProps {
  focused: boolean;
  Icon?: React.ComponentType<IconProps>;
  emoji?: string;
  label: string;
  isLiabilities?: boolean;
}

function TabIcon({ focused, Icon, emoji, label, isLiabilities }: TabIconProps) {
  const activeBgColor = isLiabilities ? '#FF0000' : '#C8FF00';
  const activeTextColor = isLiabilities ? '#FFFFFF' : '#C8FF00';
  const activeIconColor = isLiabilities ? '#FFFFFF' : '#000000';

  return (
    <View style={styles.iconWrapper}>
      <View style={[
        styles.iconContainer,
        focused && {
          backgroundColor: activeBgColor,
          shadowColor: activeBgColor,
          shadowOffset: { width: 0, height: 0 },
          shadowOpacity: 0.6,
          shadowRadius: 10,
          elevation: 5,
        }
      ]}>
        {Icon ? (
          <Icon size={focused ? 23 : 20} color={focused ? activeIconColor : '#8e8e93'} opacity={focused ? 1 : 0.7} />
        ) : (
          <Text style={[styles.emoji, focused && { color: activeIconColor, opacity: 1 }, focused && { fontSize: 23 }]}>{emoji}</Text>
        )}
      </View>
      <Text style={[styles.label, focused && { color: activeTextColor, opacity: 1 }]}>{label}</Text>
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
          tabBarIcon: ({ focused }) => <TabIcon focused={focused} Icon={IconLiabilities} label={t('tab_liabilities')} isLiabilities />,
        }}
      />
      <Tabs.Screen
        name="affiliation"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="coach"
        options={{
          title: t('tab_coach'),
          tabBarIcon: ({ focused }) => <TabIcon focused={focused} Icon={IconCoach} label={t('tab_coach')} />,
        }}
      />
      <Tabs.Screen
        name="discipline"
        options={{
          title: t('tab_discipline'),
          tabBarIcon: ({ focused }) => <TabIcon focused={focused} Icon={IconShield} label={t('tab_discipline')} />,
        }}
      />
      <Tabs.Screen
        name="todo"
        options={{
          title: 'Tâches',
          tabBarIcon: ({ focused }) => <TabIcon focused={focused} emoji="✓" label="Tâches" />,
        }}
      />
      <Tabs.Screen
        name="simulator"
        options={{
          href: null,
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: '#000000',
    borderTopWidth: 1,
    borderTopColor: '#000000',
    height: 85,
    paddingBottom: 20,
    paddingTop: 8,
  },
  iconWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    width: 76,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
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
    color: '#8e8e93',
  },
  emojiActive: {
    opacity: 1,
    color: '#000000',
  },
  label: {
    fontSize: 10,
    fontWeight: '600',
    color: '#8e8e93',
    opacity: 0.6,
  },
  labelActive: {
    color: '#C8FF00',
    opacity: 1,
  },
});
