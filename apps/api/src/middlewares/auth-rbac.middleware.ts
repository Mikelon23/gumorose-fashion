/**
 * Pipeline de middlewares RBAC — Diagrama 1, Capa 2.
 *
 * - `resolveUserContext`: lee `x-gumorose-user-id` / `x-gumorose-role` o
 *   `Authorization: Bearer <role:userId>` (también `role:userId` o solo
 *   `role`). Sin cabeceras asigna un contexto por defecto compatible
 *   (`CLIENTE_B2C` anónimo) para no romper Web/Móvil. Un rol inválido
 *   responde `403 Forbidden` de inmediato.
 * - `requireRoles`: `preHandler` de Fastify que exige uno de los roles.
 */
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { UserRole } from '@gumorose/shared';

export const VALID_ROLES: readonly UserRole[] = [
  'SUPER_ADMIN',
  'ADMIN_GERENCIA',
  'ADMIN_BODEGA',
  'ADMIN_PLANTA',
  'CLIENTE_B2C',
  'CLIENTE_B2B',
];

export interface GumoroseUserContext {
  userId: string;
  role: UserRole;
}

declare module 'fastify' {
  interface FastifyRequest {
    gumoroseUser?: GumoroseUserContext;
  }
}

const DEFAULT_USER: GumoroseUserContext = {
  userId: 'anonymous-web',
  role: 'CLIENTE_B2C',
};

function isUserRole(value: unknown): value is UserRole {
  return typeof value === 'string' && (VALID_ROLES as readonly string[]).includes(value);
}

function parseBearer(value: string): { role?: string; userId?: string } {
  const token = value.replace(/^Bearer\s+/i, '').trim();
  if (!token) return {};
  // Formatos: "ROLE:userId", "ROLE:userId" con otro separador, o solo "ROLE".
  const sepIndex = token.indexOf(':');
  if (sepIndex >= 0) {
    return {
      role: token.slice(0, sepIndex).trim(),
      userId: token.slice(sepIndex + 1).trim() || undefined,
    };
  }
  return { role: token };
}

/** Resuelve el contexto de usuario desde cabeceras opcionales (compatible). */
export async function resolveUserContext(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  if (request.gumoroseUser) return;

  const headers = request.headers as Record<string, string | string[] | undefined>;
  const headerRoleRaw = headers['x-gumorose-role'];
  const headerUserIdRaw = headers['x-gumorose-user-id'];
  const authRaw = headers.authorization;

  const headerRole = Array.isArray(headerRoleRaw) ? headerRoleRaw[0] : headerRoleRaw;
  const headerUserId = Array.isArray(headerUserIdRaw) ? headerUserIdRaw[0] : headerUserIdRaw;
  const auth = Array.isArray(authRaw) ? authRaw[0] : authRaw;

  let roleRaw: string | undefined;
  let userId: string | undefined = headerUserId?.trim() || undefined;

  if (headerRole?.trim()) {
    roleRaw = headerRole.trim();
  } else if (auth?.trim()) {
    const parsed = parseBearer(auth.trim());
    roleRaw = parsed.role;
    if (!userId && parsed.userId) userId = parsed.userId;
  }

  // Sin cabeceras: contexto por defecto para no romper flujos Web/Móvil.
  if (!roleRaw) {
    request.gumoroseUser = { ...DEFAULT_USER };
    if (userId) request.gumoroseUser.userId = userId;
    return;
  }

  const normalizedRole = roleRaw.toUpperCase().trim();
  if (!isUserRole(normalizedRole)) {
    return reply.code(403).send({
      error: `Rol inválido: ${roleRaw}. Roles válidos: ${VALID_ROLES.join(', ')}`,
    });
  }

  request.gumoroseUser = {
    role: normalizedRole,
    userId: userId && userId.length > 0 ? userId : `anon-${normalizedRole.toLowerCase()}`,
  };
}

/** Exige que el rol del usuario esté en `allowedRoles` (403 si no). */
export function requireRoles(allowedRoles: UserRole[]) {
  return async function requireRolesHandler(request: FastifyRequest, reply: FastifyReply) {
    if (!request.gumoroseUser) {
      await resolveUserContext(request, reply);
      if (reply.sent) return;
    }
    const role = request.gumoroseUser?.role;
    if (!role || !allowedRoles.includes(role)) {
      return reply.code(403).send({
        error: `Acceso denegado para el rol ${role ?? 'desconocido'}. Requiere: ${allowedRoles.join(', ')}`,
      });
    }
  };
}

/** Atajos de roles por área (misma matriz que exige el Diagrama 1). */
export const SUPERADMIN_ONLY: UserRole[] = ['SUPER_ADMIN'];
export const ERP_BODEGA_ROLES: UserRole[] = ['SUPER_ADMIN', 'ADMIN_BODEGA', 'ADMIN_GERENCIA'];
export const ERP_PLANTA_ROLES: UserRole[] = ['SUPER_ADMIN', 'ADMIN_PLANTA', 'ADMIN_GERENCIA'];
export const ERP_FINANCE_ROLES: UserRole[] = ['SUPER_ADMIN', 'ADMIN_GERENCIA'];
