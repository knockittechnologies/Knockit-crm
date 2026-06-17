/**
 * Master permission list. Run once per environment via the seed script.
 * Format: module.action — matches the Permission Matrix designed earlier.
 */
export const PERMISSIONS_SEED: Array<{ module: string; action: string; description: string }> = [
  // Leads
  { module: 'leads', action: 'view-all', description: 'View all leads across the organisation' },
  { module: 'leads', action: 'view-assigned', description: 'View only leads assigned to self' },
  { module: 'leads', action: 'create', description: 'Create new leads' },
  { module: 'leads', action: 'update', description: 'Edit lead details and status' },
  { module: 'leads', action: 'delete', description: 'Delete leads' },

  // Companies & Contacts
  { module: 'companies', action: 'view', description: 'View companies' },
  { module: 'companies', action: 'manage', description: 'Create/edit/delete companies' },
  { module: 'contacts', action: 'view', description: 'View contacts' },
  { module: 'contacts', action: 'manage', description: 'Create/edit/delete contacts' },

  // Quotations / Proposals / Contracts
  { module: 'quotations', action: 'manage', description: 'Create and send quotations' },
  { module: 'proposals', action: 'manage', description: 'Create and send proposals' },
  { module: 'contracts', action: 'view', description: 'View contracts' },
  { module: 'contracts', action: 'manage', description: 'Create, sign and manage contracts' },

  // Projects
  { module: 'projects', action: 'view-all', description: 'View all projects' },
  { module: 'projects', action: 'view-own', description: 'View only assigned/own projects' },
  { module: 'projects', action: 'create', description: 'Create new projects' },
  { module: 'projects', action: 'manage', description: 'Edit project details, status, team' },
  { module: 'tasks', action: 'manage', description: 'Create/edit/assign tasks' },
  { module: 'milestones', action: 'manage', description: 'Create/edit milestones' },
  { module: 'timelogs', action: 'manage', description: 'Log and edit time entries' },

  // Tickets
  { module: 'tickets', action: 'view-all', description: 'View all support tickets' },
  { module: 'tickets', action: 'view-assigned', description: 'View only assigned tickets' },
  { module: 'tickets', action: 'create', description: 'Raise support tickets' },
  { module: 'tickets', action: 'assign', description: 'Assign tickets to staff' },
  { module: 'tickets', action: 'internal-notes', description: 'Add/view internal-only notes' },
  { module: 'tickets', action: 'manage', description: 'Change status, close, reopen tickets' },

  // Knowledge base
  { module: 'kb', action: 'view', description: 'View knowledge base articles' },
  { module: 'kb', action: 'manage', description: 'Create/edit knowledge base articles' },

  // AMC
  { module: 'amc', action: 'view', description: 'View AMC hours and contracts' },
  { module: 'amc', action: 'manage', description: 'Manage AMC contracts and log hours' },

  // Reports
  { module: 'reports', action: 'view-all', description: 'View all reports' },
  { module: 'reports', action: 'view-own', description: 'View reports scoped to self' },

  // Employees / Roles / Settings
  { module: 'employees', action: 'manage', description: 'Create employees, assign roles & module access' },
  { module: 'roles', action: 'manage', description: 'Create/edit custom roles and permissions' },
  { module: 'settings', action: 'manage', description: 'Manage tenant-wide settings' },
  { module: 'audit', action: 'view', description: 'View audit logs' },

  // Client portal specific
  { module: 'portal', action: 'view-projects', description: 'Client: view own project progress' },
  { module: 'portal', action: 'approve', description: 'Client: approve deliverables/designs' },
  { module: 'portal', action: 'view-contracts', description: 'Client: view own contracts' },
];

/** Maps each system role to the permission slugs it gets by default. */
export const ROLE_PERMISSION_MAP: Record<string, string[]> = {
  'super-admin': ['*'], // wildcard — gets everything, handled specially in seed script

  admin: [
    'leads.view-all', 'leads.create', 'leads.update', 'leads.delete',
    'companies.view', 'companies.manage', 'contacts.view', 'contacts.manage',
    'quotations.manage', 'proposals.manage', 'contracts.view', 'contracts.manage',
    'projects.view-all', 'projects.create', 'projects.manage',
    'tasks.manage', 'milestones.manage', 'timelogs.manage',
    'tickets.view-all', 'tickets.create', 'tickets.assign', 'tickets.internal-notes', 'tickets.manage',
    'kb.view', 'kb.manage', 'amc.view', 'amc.manage',
    'reports.view-all',
  ],

  manager: [
    'leads.view-all', 'leads.create', 'leads.update',
    'companies.view', 'contacts.view',
    'projects.view-all', 'projects.manage',
    'tasks.manage', 'milestones.manage', 'timelogs.manage',
    'tickets.view-all', 'tickets.assign', 'tickets.manage',
    'kb.view', 'reports.view-all',
  ],

  staff: [
    'leads.view-assigned',
    'projects.view-own',
    'tasks.manage', 'timelogs.manage',
    'tickets.view-assigned', 'tickets.internal-notes', 'tickets.manage',
    'kb.view', 'reports.view-own',
  ],

  client: [
    'tickets.create',
    'portal.view-projects', 'portal.approve', 'portal.view-contracts',
    'amc.view', 'kb.view',
  ],
};
