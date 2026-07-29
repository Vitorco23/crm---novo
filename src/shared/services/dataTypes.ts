// Tipos compartilhados da camada de dados (Refatoração 002).
// Preparação para multiusuário: Owner / Tenant / Roles / Permissions.
// NADA aqui altera o comportamento atual de autenticação.

export type OwnerId = string;
export type TenantId = string;

export type AppRole = "owner" | "admin" | "member" | "viewer";

export interface AccessScope {
  /** e-mail do owner atual (modelo single-owner vigente) */
  ownerEmail: string;
  /** reservado para futura adoção de multi-tenant */
  tenantId?: TenantId | null;
  /** reservado para futura adoção de RBAC */
  roles?: AppRole[];
}

/** Resultado padrão de qualquer chamada de Repository. */
export interface RepositoryResult<T> {
  data: T | null;
  error: Error | null;
}

/** Estado de leitura padronizado consumido pelos hooks. */
export interface QueryState<T> {
  data: T | undefined;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  refetch: () => void;
}
