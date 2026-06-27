import React from 'react';
import Svg, { Path, Circle, Line, Rect } from 'react-native-svg';

export interface IconProps {
  size?: number;
  color?: string;
  opacity?: number;
}

const base = (size = 22, color = '#ccff00') => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none' as const,
  stroke: color,
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
});

// Bar chart — used for "Actifs" (Assets)
export function IconAssets({ size, color, opacity }: IconProps) {
  return (
    <Svg {...base(size, color)} opacity={opacity}>
      <Line x1="4" y1="20" x2="20" y2="20" />
      <Rect x="6" y="10" width="3" height="8" />
      <Rect x="11" y="6" width="3" height="12" />
      <Rect x="16" y="13" width="3" height="5" />
    </Svg>
  );
}

// Down trend — used for "Passifs" (Liabilities)
export function IconLiabilities({ size, color, opacity }: IconProps) {
  return (
    <Svg {...base(size, color)} opacity={opacity}>
      <Path d="M4 6 L11 13 L14 10 L20 17" />
      <Path d="M20 11 L20 17 L14 17" />
    </Svg>
  );
}

// Balance scale — used for "Simulateur"
export function IconScale({ size, color, opacity }: IconProps) {
  return (
    <Svg {...base(size, color)} opacity={opacity}>
      <Line x1="12" y1="3" x2="12" y2="21" />
      <Line x1="5" y1="6" x2="19" y2="6" />
      <Path d="M5 6 L2.5 11 a3 3 0 0 0 5 0 Z" />
      <Path d="M19 6 L16.5 11 a3 3 0 0 0 5 0 Z" />
      <Line x1="9" y1="21" x2="15" y2="21" />
    </Svg>
  );
}

// Minimalist brain / AI — used for "Coach IA" (modern, premium, medical-grade)
export function IconCoach({ size, color, opacity }: IconProps) {
  return (
    <Svg {...base(size, color)} opacity={opacity}>
      <Path d="M12 3 C7 3 4 6 4 10 C4 13 6 15 7 16 C5 18 5 20 7 21 C8 22 10 21 10 19 L10 17" />
      <Path d="M12 3 C17 3 20 6 20 10 C20 13 18 15 17 16 C19 18 19 20 17 21 C16 22 14 21 14 19 L14 17" />
      <Path d="M10 8 Q12 10 14 8" />
      <Path d="M10 13 Q12 11 14 13" />
    </Svg>
  );
}

// Bank / institution — Loan type
export function IconBank({ size, color, opacity }: IconProps) {
  return (
    <Svg {...base(size, color)} opacity={opacity}>
      <Path d="M3 10 L12 4 L21 10" />
      <Line x1="5" y1="10" x2="5" y2="19" />
      <Line x1="9" y1="10" x2="9" y2="19" />
      <Line x1="15" y1="10" x2="15" y2="19" />
      <Line x1="19" y1="10" x2="19" y2="19" />
      <Line x1="3" y1="19" x2="21" y2="19" />
    </Svg>
  );
}

// House — Mortgage / Real Estate
export function IconHouse({ size, color, opacity }: IconProps) {
  return (
    <Svg {...base(size, color)} opacity={opacity}>
      <Path d="M4 11 L12 4 L20 11" />
      <Path d="M6 10 V20 H18 V10" />
      <Line x1="10" y1="20" x2="10" y2="14" />
      <Line x1="14" y1="20" x2="14" y2="14" />
    </Svg>
  );
}

// Refresh / cycle — Subscription
export function IconRefresh({ size, color, opacity }: IconProps) {
  return (
    <Svg {...base(size, color)} opacity={opacity}>
      <Path d="M4 12a8 8 0 0 1 13.5-5.8L20 9" />
      <Path d="M20 4v5h-5" />
      <Path d="M20 12a8 8 0 0 1-13.5 5.8L4 15" />
      <Path d="M4 20v-5h5" />
    </Svg>
  );
}

// Credit card
export function IconCard({ size, color, opacity }: IconProps) {
  return (
    <Svg {...base(size, color)} opacity={opacity}>
      <Rect x="3" y="6" width="18" height="12" rx="2" />
      <Line x1="3" y1="10" x2="21" y2="10" />
      <Line x1="6" y1="14" x2="10" y2="14" />
    </Svg>
  );
}

// List — "Other" type
export function IconList({ size, color, opacity }: IconProps) {
  return (
    <Svg {...base(size, color)} opacity={opacity}>
      <Line x1="9" y1="6" x2="20" y2="6" />
      <Line x1="9" y1="12" x2="20" y2="12" />
      <Line x1="9" y1="18" x2="20" y2="18" />
      <Circle cx="4.5" cy="6" r="1" fill={color} />
      <Circle cx="4.5" cy="12" r="1" fill={color} />
      <Circle cx="4.5" cy="18" r="1" fill={color} />
    </Svg>
  );
}

// Trending up — Stocks
export function IconTrendUp({ size, color, opacity }: IconProps) {
  return (
    <Svg {...base(size, color)} opacity={opacity}>
      <Path d="M4 17 L10 11 L14 15 L20 7" />
      <Path d="M14 7 H20 V13" />
    </Svg>
  );
}

// Shopping bag — Commerce
export function IconBag({ size, color, opacity }: IconProps) {
  return (
    <Svg {...base(size, color)} opacity={opacity}>
      <Path d="M6 8 H18 L19 20 H5 Z" />
      <Path d="M9 8 V6 a3 3 0 0 1 6 0 V8" />
    </Svg>
  );
}

// Building — Real estate / asset
export function IconBuilding({ size, color, opacity }: IconProps) {
  return (
    <Svg {...base(size, color)} opacity={opacity}>
      <Rect x="5" y="3" width="9" height="18" />
      <Rect x="14" y="9" width="6" height="12" />
      <Line x1="8" y1="7" x2="8" y2="7.01" />
      <Line x1="11" y1="7" x2="11" y2="7.01" />
      <Line x1="8" y1="11" x2="8" y2="11.01" />
      <Line x1="11" y1="11" x2="11" y2="11.01" />
      <Line x1="8" y1="15" x2="8" y2="15.01" />
      <Line x1="11" y1="15" x2="11" y2="15.01" />
    </Svg>
  );
}

// Briefcase — Other asset / generic
export function IconBriefcase({ size, color, opacity }: IconProps) {
  return (
    <Svg {...base(size, color)} opacity={opacity}>
      <Rect x="3" y="8" width="18" height="11" rx="2" />
      <Path d="M8 8 V6 a2 2 0 0 1 2 -2 h4 a2 2 0 0 1 2 2 v2" />
      <Line x1="3" y1="13" x2="21" y2="13" />
    </Svg>
  );
}

// Trash — delete
export function IconTrash({ size, color, opacity }: IconProps) {
  return (
    <Svg {...base(size, color)} opacity={opacity}>
      <Path d="M4 7 H20" />
      <Path d="M9 7 V4 H15 V7" />
      <Path d="M6 7 L7 20 H17 L18 7" />
      <Line x1="10" y1="11" x2="10" y2="16" />
      <Line x1="14" y1="11" x2="14" y2="16" />
    </Svg>
  );
}

// Close / X
export function IconClose({ size, color, opacity }: IconProps) {
  return (
    <Svg {...base(size, color)} opacity={opacity}>
      <Line x1="5" y1="5" x2="19" y2="19" />
      <Line x1="19" y1="5" x2="5" y2="19" />
    </Svg>
  );
}

// Seedling — empty state for assets
export function IconSeedling({ size, color, opacity }: IconProps) {
  return (
    <Svg {...base(size, color)} opacity={opacity}>
      <Path d="M12 21 V11" />
      <Path d="M12 11 C12 7 8 6 5 6 C5 9 7 11 12 11 Z" />
      <Path d="M12 13 C12 9 16 8 19 8 C19 11 17 13 12 13 Z" />
    </Svg>
  );
}

// Shield — security
export function IconShield({ size, color, opacity }: IconProps) {
  return (
    <Svg {...base(size, color)} opacity={opacity}>
      <Path d="M12 3 L19 6 V11 C19 16 16 19 12 21 C8 19 5 16 5 11 V6 Z" />
      <Path d="M9 12 L11.5 14.5 L15.5 10" />
    </Svg>
  );
}

// Star — premium badge
export function IconStar({ size, color, opacity }: IconProps) {
  return (
    <Svg {...base(size, color)} opacity={opacity}>
      <Path d="M12 3 L14.6 8.6 L20.7 9.3 L16.2 13.4 L17.5 19.5 L12 16.4 L6.5 19.5 L7.8 13.4 L3.3 9.3 L9.4 8.6 Z" fill={color} />
    </Svg>
  );
}

// Target — strategy / yield
export function IconTarget({ size, color, opacity }: IconProps) {
  return (
    <Svg {...base(size, color)} opacity={opacity}>
      <Circle cx="12" cy="12" r="9" />
      <Circle cx="12" cy="12" r="5" />
      <Circle cx="12" cy="12" r="1.2" fill={color} />
    </Svg>
  );
}

// Search / magnifier — audit
export function IconSearch({ size, color, opacity }: IconProps) {
  return (
    <Svg {...base(size, color)} opacity={opacity}>
      <Circle cx="11" cy="11" r="6" />
      <Line x1="20" y1="20" x2="15.5" y2="15.5" />
    </Svg>
  );
}

// Bolt — instant / fast
export function IconBolt({ size, color, opacity }: IconProps) {
  return (
    <Svg {...base(size, color)} opacity={opacity}>
      <Path d="M13 2 L4 14 H11 L10 22 L20 9 H13 Z" fill={color} />
    </Svg>
  );
}

// Wallet — cashflow / money
export function IconWallet({ size, color, opacity }: IconProps) {
  return (
    <Svg {...base(size, color)} opacity={opacity}>
      <Rect x="3" y="6" width="18" height="13" rx="2" />
      <Path d="M3 10 H21" />
      <Circle cx="17" cy="14.5" r="1.2" fill={color} />
    </Svg>
  );
}

// Clock — break-even time
export function IconClock({ size, color, opacity }: IconProps) {
  return (
    <Svg {...base(size, color)} opacity={opacity}>
      <Circle cx="12" cy="12" r="9" />
      <Path d="M12 7 V12 L15.5 14" />
    </Svg>
  );
}

// Gift — used for "Affiliation" (Revenu Passif / referral program)
export function IconGift({ size, color, opacity }: IconProps) {
  return (
    <Svg {...base(size, color)} opacity={opacity}>
      <Rect x="3" y="8" width="18" height="13" rx="2" />
      <Line x1="3" y1="13" x2="21" y2="13" />
      <Line x1="12" y1="8" x2="12" y2="21" />
      <Path d="M12 8 C9 8 7.5 6.5 7.5 5 a2.5 2.5 0 0 1 5 0 C12.5 6.5 12 8 12 8 Z" />
      <Path d="M12 8 C15 8 16.5 6.5 16.5 5 a2.5 2.5 0 0 0 -5 0 C11.5 6.5 12 8 12 8 Z" />
    </Svg>
  );
}

// Coin — crypto / generic asset
export function IconCoin({ size, color, opacity }: IconProps) {
  return (
    <Svg {...base(size, color)} opacity={opacity}>
      <Circle cx="12" cy="12" r="9" />
      <Path d="M9 9 H14 a2 2 0 0 1 0 4 H10 a2 2 0 0 0 0 4 H15" />
      <Line x1="12" y1="6" x2="12" y2="18" />
    </Svg>
  );
}

// Pencil — used for Edit
export function IconEdit({ size, color, opacity }: IconProps) {
  return (
    <Svg {...base(size, color)} opacity={opacity}>
      <Path d="M12 20h9" />
      <Path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
    </Svg>
  );
}

// Plus — generic add icon
export function IconPlus({ size, color, opacity }: IconProps) {
  return (
    <Svg {...base(size, color)} opacity={opacity}>
      <Line x1="12" y1="5" x2="12" y2="19" />
      <Line x1="5" y1="12" x2="19" y2="12" />
    </Svg>
  );
}

// Bell — used for notifications
export function IconBell({ size, color, opacity }: IconProps) {
  return (
    <Svg {...base(size, color)} opacity={opacity}>
      <Path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <Path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </Svg>
  );
}
