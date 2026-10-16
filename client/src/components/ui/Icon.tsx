import {
  Briefcase, Camera, Clock, Compass, Eye, Flower2, Gem, Heart, Landmark, Layout, Lightbulb, Mail, MapPin, Monitor, Music, Plane, Radio, Receipt, Shield, ShieldCheck, Sparkles, Star, Target, Truck, Users, Utensils, Award, Calendar, Crown, Wine, PartyPopper, Mic, Palette, Gift, type LucideIcon,
} from 'lucide-react';

/** Icon names that admins can type in CMS fields. Unknown names fall back to "sparkles". */
export const ICONS: Record<string, LucideIcon> = {
  briefcase: Briefcase, camera: Camera, clock: Clock, compass: Compass, eye: Eye, flower: Flower2, gem: Gem, heart: Heart, landmark: Landmark, layout: Layout,
  lightbulb: Lightbulb, mail: Mail, 'map-pin': MapPin, monitor: Monitor, music: Music, plane: Plane, radio: Radio, receipt: Receipt, shield: Shield, 'shield-check': ShieldCheck,
  sparkles: Sparkles, star: Star, target: Target, truck: Truck, users: Users, utensils: Utensils, award: Award, calendar: Calendar, crown: Crown, wine: Wine, party: PartyPopper, mic: Mic, palette: Palette, gift: Gift,
};
export const ICON_NAMES = Object.keys(ICONS);

export function Icon({ name, className, strokeWidth = 1.25 }: { name: string; className?: string; strokeWidth?: number }) {
  const C = ICONS[name] ?? Sparkles;
  return <C className={className} strokeWidth={strokeWidth} aria-hidden />;
}
