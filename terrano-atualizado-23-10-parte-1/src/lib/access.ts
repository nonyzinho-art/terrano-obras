import { useSyncExternalStore } from "react";
export const ROLE_LABELS = {
  administrador: "Administrador",
  diretor: "Diretor",
  coordenador_comercial: "Coordenador comercial",
  coordenador_obras: "Coordenador de obras",
  engenheiro: "Engenheiro",
} as const;
export type AppRole = keyof typeof ROLE_LABELS;
export type AppProfile = { user_id: string; role: AppRole; active: boolean };
let profile: AppProfile | null = null;
let permissions = new Map<string, boolean>();
let revision = 0;
const listeners = new Set<() => void>();
export function setAccess(
  next: AppProfile | null,
  works: { work_id: string; can_write: boolean }[] = [],
) {
  profile = next;
  permissions = new Map(works.map((w) => [w.work_id, w.can_write]));
  revision++;
  listeners.forEach((l) => l());
}
export const getProfile = () => profile;
export const canWriteWork = (id: string) => Boolean(profile?.active && permissions.get(id));
export function useAccess() {
  useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => {
        listeners.delete(l);
      };
    },
    () => revision,
    () => 0,
  );
  return { profile, canWriteWork };
}
