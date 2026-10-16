/**
 * Role-based access control. Permissions are enforced on the server for every protected endpoint;
 * the client only uses them to hide UI. Role → permission mappings are stored in the database
 * (Role table) and editable by a Super Admin; these are the seeded defaults.
 */
export const PERMISSIONS = {
  'dashboard.view': 'View the admin dashboard',
  'cms.manage': 'Edit pages, homepage builder and content collections',
  'theme.manage': 'Change theme, branding, navigation and global content',
  'media.manage': 'Upload, replace and delete media',
  'inquiries.view': 'View inquiries',
  'inquiries.manage': 'Assign, update and convert inquiries',
  'clients.view': 'View client profiles',
  'clients.manage': 'Create and edit client profiles',
  'quotations.manage': 'Create, revise and send quotations',
  'bookings.view': 'View bookings',
  'bookings.manage': 'Edit bookings, statuses and change requests',
  'tasks.manage': 'Manage event tasks and checklists',
  'calendar.manage': 'Create and edit calendar entries',
  'vendors.view': 'View vendor database (internal pricing and notes)',
  'vendors.manage': 'Manage vendors and vendor assignments',
  'venues.manage': 'Manage venues and inventory',
  'guests.manage': 'Manage guest lists, RSVPs and check-in',
  'finance.view': 'View invoices, payments and financial reports',
  'finance.manage': 'Issue invoices, record manual payments and expenses',
  'refunds.approve': 'Approve and process refunds',
  'reports.view': 'View reports and analytics',
  'notifications.manage': 'Manage email templates and automations',
  'staff.manage': 'Invite staff, change roles and permissions',
  'settings.manage': 'Change business and integration settings',
  'audit.view': 'View the audit log',
} as const;
export type Permission = keyof typeof PERMISSIONS;
export const ALL_PERMISSIONS = Object.keys(PERMISSIONS) as Permission[];

export const ROLE_KEYS = [
  'SUPER_ADMIN',
  'OWNER',
  'EVENT_MANAGER',
  'SALES_EXECUTIVE',
  'FINANCE_MANAGER',
  'CONTENT_EDITOR',
  'VENDOR_COORDINATOR',
  'OPERATIONS_STAFF',
  'CLIENT',
] as const;
export type RoleKey = (typeof ROLE_KEYS)[number];
export const STAFF_ROLES = ROLE_KEYS.filter((r) => r !== 'CLIENT');

export const ROLE_LABELS: Record<RoleKey, string> = {
  SUPER_ADMIN: 'Super Admin',
  OWNER: 'Business Owner',
  EVENT_MANAGER: 'Event Manager',
  SALES_EXECUTIVE: 'Sales Executive',
  FINANCE_MANAGER: 'Finance Manager',
  CONTENT_EDITOR: 'Content Editor',
  VENDOR_COORDINATOR: 'Vendor Coordinator',
  OPERATIONS_STAFF: 'Operations Staff',
  CLIENT: 'Client',
};

const P = (...p: Permission[]) => p;

export const DEFAULT_ROLE_PERMISSIONS: Record<RoleKey, Permission[]> = {
  SUPER_ADMIN: ALL_PERMISSIONS,
  OWNER: ALL_PERMISSIONS,
  EVENT_MANAGER: P(
    'dashboard.view', 'inquiries.view', 'inquiries.manage', 'clients.view', 'clients.manage', 'quotations.manage',
    'bookings.view', 'bookings.manage', 'tasks.manage', 'calendar.manage', 'vendors.view', 'vendors.manage',
    'venues.manage', 'guests.manage', 'finance.view', 'reports.view', 'media.manage',
  ),
  SALES_EXECUTIVE: P('dashboard.view', 'inquiries.view', 'inquiries.manage', 'clients.view', 'clients.manage', 'quotations.manage', 'bookings.view', 'calendar.manage'),
  FINANCE_MANAGER: P('dashboard.view', 'clients.view', 'bookings.view', 'finance.view', 'finance.manage', 'refunds.approve', 'reports.view', 'vendors.view'),
  CONTENT_EDITOR: P('dashboard.view', 'cms.manage', 'theme.manage', 'media.manage'),
  VENDOR_COORDINATOR: P('dashboard.view', 'bookings.view', 'vendors.view', 'vendors.manage', 'venues.manage', 'tasks.manage', 'calendar.manage'),
  OPERATIONS_STAFF: P('dashboard.view', 'bookings.view', 'tasks.manage', 'calendar.manage', 'guests.manage', 'venues.manage'),
  CLIENT: [],
};

export function hasPermission(perms: readonly string[] | undefined, p: Permission) {
  return !!perms && perms.includes(p);
}
