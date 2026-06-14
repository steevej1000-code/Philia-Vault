import { Tabs } from 'expo-router';
import { View, Text, StyleSheet } from 'react-native';
import { COLORS, RADIUS } from '../../constants/colors';
import { IconAssets, IconLiabilities, IconGift, IconCoach, IconProps } from '../../components/icons/Icons';

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
          <Icon size={20} color={COLORS.primary} opacity={focused ? 1 : 0.5} />
        ) : (
          <Text style={[styles.emoji, focused && styles.emojiActive]}>{emoji}</Text>
        )}
      </View>
      <Text style={[styles.label, focused && styles.labelActive]}>{label}</Text>
      {focused && <View style={styles.pill} />}
    </View>
  );
}

export default function TabsLayout() {
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
          title: 'Tableau',
          tabBarIcon: ({ focused }) => <TabIcon focused={focused} emoji="◎" label="Tableau" />,
        }}
      />
      <Tabs.Screen
        name="assets"
        options={{
          title: 'Actifs ✎',
          tabBarIcon: ({ focused }) => <TabIcon focused={focused} Icon={IconAssets} label="Actifs ✎" />,
        }}
      />
      <Tabs.Screen
        name="liabilities"
        options={{
          title: 'Passifs ✎',
          tabBarIcon: ({ focused }) => <TabIcon focused={focused} Icon={IconLiabilities} label="Passifs ✎" />,
        }}
      />
      <Tabs.Screen
        name="affiliation"
        options={{
          title: 'Affiliation',
          tabBarIcon: ({ focused }) => <TabIcon focused={focused} Icon={IconGift} label="Affiliation" />,
        }}
      />
      <Tabs.Screen
        name="coach"
        options={{
          title: 'Coach',
          tabBarIcon: ({ focused }) => <TabIcon focused={focused} Icon={IconCoach} label="Coach" />,
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
    width: 60,
  },
  iconContainer: {
    width: 40,
    height: 32,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconContainerActive: {
    backgroundColor: 'rgba(204, 255, 0, 0.12)',
  },
  emoji: {
    fontSize: 20,
    opacity: 0.5,
  },
  emojiActive: {
    opacity: 1,
  },
  label: {
    fontSize: 10,
    fontWeight: '600',
    color: COLORS.onSurfaceVariant,
    opacity: 0.5,
  },
  labelActive: {
    color: COLORS.primary,
    opacity: 1,
  },
  pill: {
    position: 'absolute',
    bottom: -6,
    width: 20,
    height: 3,
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.full,
  },
});
