export interface OpenApiRouteDoc {
  path: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  summary: string;
  tags: string[];
  security: boolean;
  requiredPermissions?: string[];
  requestBody?: Record<string, any>;
  responses: Record<number, string>;
}

export class OpenApiRegistry {
  private static routes: OpenApiRouteDoc[] = [];

  public static registerRoute(route: OpenApiRouteDoc): void {
    this.routes.push(route);
  }

  public static getSpec(): { openapi: string; info: Record<string, any>; paths: Record<string, any> } {
    const pathsSpec: Record<string, any> = {};

    for (const r of this.routes) {
      if (!pathsSpec[r.path]) {
        pathsSpec[r.path] = {};
      }
      pathsSpec[r.path][r.method.toLowerCase()] = {
        summary: r.summary,
        tags: r.tags,
        security: r.security ? [{ BearerAuth: [] }] : [],
        xPermissions: r.requiredPermissions || [],
        responses: r.responses,
      };
    }

    return {
      openapi: '3.0.0',
      info: {
        title: 'NEXORA NEXUS Platform API',
        version: '1.0.0',
        description: 'Multi-tenant ERP & Business Management API with Offline-First Sync Engine',
      },
      paths: pathsSpec,
    };
  }

  public static clearForTesting(): void {
    this.routes = [];
  }
}
