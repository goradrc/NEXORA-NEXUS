import { TenantContext, RolesGuard, AuditService } from '@nexora/core';
import { CreateEmployeeDto, UpdateEmployeeDto } from '@nexora/nexus';

export interface EmployeeRecord {
  id: string;
  organizationId: string;
  userId?: string;
  employeeNumber: string;
  firstName: string;
  lastName: string;
  position: string;
  email?: string;
  phone?: string;
  hireDate?: Date;
  status: string;
  createdAt: Date;
}

export class EmployeesService {
  private static employeesStore: EmployeeRecord[] = [];

  public static getEmployees(
    tenantContext: TenantContext,
    userPermissions: string[]
  ): EmployeeRecord[] {
    RolesGuard.enforcePermission(userPermissions, 'nexus:employees:read');
    return this.employeesStore.filter(
      emp => emp.organizationId === tenantContext.organizationId
    );
  }

  public static createEmployee(
    tenantContext: TenantContext,
    dto: CreateEmployeeDto,
    userPermissions: string[]
  ): EmployeeRecord {
    RolesGuard.enforcePermission(userPermissions, 'nexus:employees:create');
    const orgId = tenantContext.organizationId;

    const existingEmp = this.employeesStore.find(
      emp => emp.organizationId === orgId && emp.employeeNumber === dto.employeeNumber
    );

    if (existingEmp) {
      throw new Error(`DUPLICATE_EMPLOYEE_NUMBER: Employee number ${dto.employeeNumber} already exists in this organization`);
    }

    const newEmployee: EmployeeRecord = {
      id: `emp-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      organizationId: orgId,
      userId: dto.userId,
      employeeNumber: dto.employeeNumber,
      firstName: dto.firstName,
      lastName: dto.lastName,
      position: dto.position,
      email: dto.email,
      phone: dto.phone,
      hireDate: dto.hireDate || new Date(),
      status: dto.status || 'ACTIVE',
      createdAt: new Date(),
    };

    this.employeesStore.push(newEmployee);

    AuditService.log({
      organizationId: orgId,
      userId: tenantContext.userId,
      action: 'CREATE',
      entityName: 'Employee',
      entityId: newEmployee.id,
      changes: {
        employeeNumber: dto.employeeNumber,
        firstName: dto.firstName,
        lastName: dto.lastName,
        position: dto.position,
      },
    });

    return newEmployee;
  }

  public static updateEmployee(
    tenantContext: TenantContext,
    employeeId: string,
    dto: UpdateEmployeeDto,
    userPermissions: string[]
  ): EmployeeRecord {
    RolesGuard.enforcePermission(userPermissions, 'nexus:employees:update');
    const employee = this.employeesStore.find(
      emp => emp.id === employeeId && emp.organizationId === tenantContext.organizationId
    );

    if (!employee) {
      throw new Error('EMPLOYEE_NOT_FOUND: Target employee record does not exist for this tenant');
    }

    if (dto.firstName) employee.firstName = dto.firstName;
    if (dto.lastName) employee.lastName = dto.lastName;
    if (dto.position) employee.position = dto.position;
    if (dto.email !== undefined) employee.email = dto.email;
    if (dto.phone !== undefined) employee.phone = dto.phone;
    if (dto.userId !== undefined) employee.userId = dto.userId;
    if (dto.status) employee.status = dto.status;
    if (dto.hireDate) employee.hireDate = dto.hireDate;

    AuditService.log({
      organizationId: tenantContext.organizationId,
      userId: tenantContext.userId,
      action: 'UPDATE',
      entityName: 'Employee',
      entityId: employee.id,
      changes: dto,
    });

    return employee;
  }

  public static clearStoreForTesting(): void {
    this.employeesStore = [];
  }
}
