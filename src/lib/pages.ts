export interface PageDef {
  key: string
  label: string
  route: string
}

export const PERMISSIONED_PAGES: PageDef[] = [
  { key: 'this-month',        label: 'This Month',       route: '/this-month' },
  { key: 'stats',             label: 'Statistics',       route: '/stats' },
  { key: 'clients',           label: 'Clients',          route: '/clients' },
  { key: 'projects',          label: 'Projects',         route: '/projects' },
  { key: 'internal',          label: 'Internal',         route: '/internal' },
  { key: 'maintenances',      label: 'Maintenances',     route: '/maintenances' },
  { key: 'contracts',         label: 'Contracts',        route: '/contracts' },
  { key: 'contractors',       label: 'Contractors',      route: '/contractors' },
  { key: 'sales',             label: 'Sales',            route: '/sales' },
  { key: 'infrastructure',    label: 'Hosting',          route: '/infrastructure' },
  { key: 'domains',           label: 'Domains',          route: '/domains' },
  { key: 'planning',          label: 'Invoice Plan',     route: '/planning' },
  { key: 'stack',             label: 'Software & Tools', route: '/stack' },
  { key: 'forecast',          label: 'Forecast',         route: '/forecast' },
  { key: 'resource-planning', label: 'Allocation',       route: '/resource-planning' },
  { key: 'reports',           label: 'Reports',          route: '/reports' },
  { key: 'resource-yearly',   label: 'Yearly Plan',      route: '/resource-yearly' },
  { key: 'tools',             label: 'Tools',            route: '/tools' },
  { key: 'automations',       label: 'Automations',      route: '/automations' },
  { key: 'pixel',             label: 'Pixel AI',         route: '/pixel' },
]
