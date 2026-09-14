import { DeliveryNotesService } from '../src/modules/nexus/delivery-notes/delivery-notes.service';

describe('Delivery notes tenant and permission boundary', () => {
  const context = { organizationId: 'org-a', userId: 'user-a' };
  let membership: any;
  let tx: any;
  let service: DeliveryNotesService;
  beforeEach(() => {
    membership = { status: 'ACTIVE', user: { isActive: true }, role: {
      organizationId: 'org-a', rolePermissions: [{ permission: { code: 'nexus:delivery-notes:read' } }],
    } };
    tx = { organizationUser: { findUnique: jest.fn(async () => membership) }, deliveryNote: {
      findMany: jest.fn(async () => []), findFirst: jest.fn(async () => null),
    } };
    service = new DeliveryNotesService({ $transaction: (fn: any) => fn(tx) } as any);
  });
  it('rejects missing authentication before reading the database', async () => {
    await expect(service.list(undefined as any)).rejects.toThrow('Missing authenticated');
    expect(tx.organizationUser.findUnique).not.toHaveBeenCalled();
  });
  it.each(['missing', 'inactive', 'disabled user', 'foreign role', 'no permission'])(
    'denies %s without reading delivery notes', async reason => {
      if (reason === 'missing') membership = null;
      if (reason === 'inactive') membership.status = 'INACTIVE';
      if (reason === 'disabled user') membership.user.isActive = false;
      if (reason === 'foreign role') membership.role.organizationId = 'org-b';
      if (reason === 'no permission') membership.role.rolePermissions = [];
      await expect(service.list(context)).rejects.toThrow();
      expect(tx.deliveryNote.findMany).not.toHaveBeenCalled();
    },
  );
  it('scopes list and membership queries to the authenticated tenant', async () => {
    await expect(service.list(context)).resolves.toEqual([]);
    expect(tx.organizationUser.findUnique).toHaveBeenCalledWith(expect.objectContaining({
      where: { organizationId_userId: context },
    }));
    expect(tx.deliveryNote.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { organizationId: 'org-a' }, take: 100,
    }));
  });
  it('returns not found for an inaccessible document with a tenant scoped query', async () => {
    await expect(service.get(context, 'foreign-document')).rejects.toThrow('Delivery note not found');
    expect(tx.deliveryNote.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'foreign-document', organizationId: 'org-a' },
    }));
  });
  it('returns a permitted document', async () => {
    tx.deliveryNote.findFirst.mockResolvedValue({ id: 'note-a', organizationId: 'org-a' });
    await expect(service.get(context, 'note-a')).resolves.toEqual({ id: 'note-a', organizationId: 'org-a' });
  });
});
