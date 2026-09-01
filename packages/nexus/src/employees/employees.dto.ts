export interface CreateEmployeeDto {
  organizationId: string;
  userId?: string;
  employeeNumber: string;
  firstName: string;
  lastName: string;
  position: string;
  email?: string;
  phone?: string;
  hireDate?: Date;
  status?: string;
}

export interface UpdateEmployeeDto {
  userId?: string;
  employeeNumber?: string;
  firstName?: string;
  lastName?: string;
  position?: string;
  email?: string;
  phone?: string;
  hireDate?: Date;
  status?: string;
}
