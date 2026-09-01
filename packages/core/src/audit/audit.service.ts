export interface AuditLogEntry {
  organizationId: string;
  userId?: string;
  action: 'CREATE' | 'UPDATE' | 'DELETE' | 'LOGIN' | 'LOGOUT';
  entityName: string;
  entityId: string;
  changes?: Record<string, any>;
  ipAddress?: string;
}

export class AuditService {
  private static logs: AuditLogEntry[] = [];

  public static log(entry: AuditLogEntry): AuditLogEntry {
    const formattedEntry: AuditLogEntry = {
      ...entry,
    };
    this.logs.push(formattedEntry);
    return formattedEntry;
  }

  public static getLogs(organizationId: string): AuditLogEntry[] {
    return this.logs.filter((log) => log.organizationId === organizationId);
  }
}
