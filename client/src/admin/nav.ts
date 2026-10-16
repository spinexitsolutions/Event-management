import type { Permission } from '@maison/shared';
import {
  BarChart3, Bell, BookOpen, Briefcase, Building2, Calendar, CheckSquare, FileText, Globe, Image, Inbox, LayoutDashboard, Mail, MapPin, Package, Palette, Receipt, Settings, Shield, Users, Wallet, type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  any?: Permission[];
  end?: boolean;
}
export interface NavGroup {
  label: string;
  items: NavItem[];
}

/** Single source of truth for admin navigation (filtered by the user's permissions). */
export const ADMIN_NAV: NavGroup[] = [
  { label: '', items: [{ to: '/admin', label: 'Dashboard', icon: LayoutDashboard, any: ['dashboard.view'], end: true }] },
  {
    label: 'Sales',
    items: [
      { to: '/admin/inquiries', label: 'Inquiries', icon: Inbox, any: ['inquiries.view'] },
      { to: '/admin/clients', label: 'Clients', icon: Users, any: ['clients.view'] },
      { to: '/admin/quotations', label: 'Quotations', icon: FileText, any: ['quotations.manage'] },
    ],
  },
  {
    label: 'Events',
    items: [
      { to: '/admin/bookings', label: 'Bookings', icon: Briefcase, any: ['bookings.view'] },
      { to: '/admin/calendar', label: 'Calendar', icon: Calendar, any: ['calendar.manage', 'bookings.view', 'inquiries.view'] },
      { to: '/admin/tasks', label: 'My tasks', icon: CheckSquare, any: ['tasks.manage'] },
    ],
  },
  {
    label: 'Operations',
    items: [
      { to: '/admin/vendors', label: 'Vendors', icon: Building2, any: ['vendors.view'] },
      { to: '/admin/venues', label: 'Venues', icon: MapPin, any: ['venues.manage'] },
      { to: '/admin/inventory', label: 'Inventory', icon: Package, any: ['venues.manage'] },
    ],
  },
  {
    label: 'Finance',
    items: [
      { to: '/admin/finance', label: 'Finance', icon: Wallet, any: ['finance.view'] },
      { to: '/admin/reports', label: 'Reports', icon: BarChart3, any: ['reports.view'] },
    ],
  },
  {
    label: 'Website',
    items: [
      { to: '/admin/website/pages', label: 'Pages & homepage', icon: Globe, any: ['cms.manage'] },
      { to: '/admin/website/theme', label: 'Theme & branding', icon: Palette, any: ['theme.manage'] },
      { to: '/admin/website/settings', label: 'Global content', icon: Settings, any: ['theme.manage'] },
      { to: '/admin/website/content', label: 'Content library', icon: BookOpen, any: ['cms.manage'] },
      { to: '/admin/website/media', label: 'Media library', icon: Image, any: ['media.manage'] },
    ],
  },
  {
    label: 'Administration',
    items: [
      { to: '/admin/settings/staff', label: 'Staff & roles', icon: Shield, any: ['staff.manage'] },
      { to: '/admin/settings/notifications', label: 'Emails & automations', icon: Mail, any: ['notifications.manage'] },
      { to: '/admin/settings/audit', label: 'Audit log', icon: Receipt, any: ['audit.view'] },
      { to: '/admin/settings/business', label: 'Business settings', icon: Settings, any: ['settings.manage'] },
    ],
  },
];

export const NOTIFICATIONS_ICON = Bell;
