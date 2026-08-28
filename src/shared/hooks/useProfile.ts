// Perfil do usuário autenticado (Sprint 1.1 — Meu Perfil).
// Única fonte de verdade para "como o CRM chama o usuário" e para o
// contexto básico enviado às funcionalidades de IA conversacionais.
// Não introduz roles/tenants — cada usuário só enxerga o próprio perfil
// (RLS: auth.uid() = id).

import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface Profile {
  id: string;
  first_name: string | null;
  last_name: string | null;
  display_name: string | null;
  phone: string | null;
  job_title: string | null;
  company_name: string | null;
  avatar_url: string | null;
  updated_at: string;
}

export type ProfileDraft = Partial<
  Pick<Profile, "first_name" | "last_name" | "display_name" | "phone" | "job_title" | "company_name">
>;

const profileKey = (userId: string | undefined) => ["profile", userId] as const;

/**
 * O bucket `avatars` é privado: o banco guarda apenas o caminho do arquivo
 * e a leitura acontece por URL assinada (1h), gerada sob demanda.
 */
async function resolveAvatar(profile: Profile | null): Promise<Profile | null> {
  if (!profile?.avatar_url) return profile;
  if (/^https?:\/\//.test(profile.avatar_url)) return profile;
  const { data } = await supabase.storage.from("avatars").createSignedUrl(profile.avatar_url, 3600);
  return { ...profile, avatar_url: data?.signedUrl ?? null };
}

async function fetchProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
  if (error) throw error;
  return resolveAvatar(data);
}

export function useProfile() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: profileKey(user?.id),
    queryFn: () => fetchProfile(user!.id),
    enabled: Boolean(user?.id),
    staleTime: 60_000,
  });

  const save = useMutation({
    mutationFn: async (draft: ProfileDraft) => {
      if (!user?.id) throw new Error("Usuário não autenticado.");
      const { data, error } = await supabase
        .from("profiles")
        .upsert({ id: user.id, ...draft }, { onConflict: "id" })
        .select("*")
        .single();
      if (error) throw error;
      return data as Profile;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(profileKey(user?.id), data);
    },
  });

  const setAvatar = useMutation({
    mutationFn: async (file: File) => {
      if (!user?.id) throw new Error("Usuário não autenticado.");
      const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const path = `${user.id}/avatar.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(path, file, { upsert: true, cacheControl: "3600" });
      if (uploadError) throw uploadError;
      const { data, error } = await supabase
        .from("profiles")
        .upsert({ id: user.id, avatar_url: path }, { onConflict: "id" })
        .select("*")
        .single();
      if (error) throw error;
      return (await resolveAvatar(data as Profile)) as Profile;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(profileKey(user?.id), data);
    },
  });

  const removeAvatar = useMutation({
    mutationFn: async () => {
      if (!user?.id) throw new Error("Usuário não autenticado.");
      const { data, error } = await supabase
        .from("profiles")
        .upsert({ id: user.id, avatar_url: null }, { onConflict: "id" })
        .select("*")
        .single();
      if (error) throw error;
      return data as Profile;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(profileKey(user?.id), data);
    },
  });

  return {
    profile: query.data ?? null,
    isLoading: query.isLoading,
    save,
    setAvatar,
    removeAvatar,
  };
}

/**
 * Ordem determinística para "como o CRM chama o usuário":
 * 1. display_name do perfil
 * 2. primeiro nome informado no perfil
 * 3. nome confiável já existente no Auth (user_metadata.full_name)
 * 4. nenhuma identificação nominal (string vazia) — NUNCA o prefixo do e-mail.
 */
export function resolveDisplayName(profile: Profile | null | undefined, user: User | null | undefined): string {
  const display = profile?.display_name?.trim();
  if (display) return display;

  const first = profile?.first_name?.trim();
  if (first) return first;

  const metaName = (user?.user_metadata as { full_name?: string } | undefined)?.full_name?.trim();
  if (metaName) return metaName.split(/\s+/)[0];

  return "";
}

export function resolveInitials(profile: Profile | null | undefined, user: User | null | undefined): string {
  const name = [profile?.first_name, profile?.last_name].filter(Boolean).join(" ").trim()
    || profile?.display_name?.trim()
    || (user?.user_metadata as { full_name?: string } | undefined)?.full_name?.trim()
    || "";
  if (name) {
    const parts = name.split(/\s+/).filter(Boolean);
    const letters = parts.length > 1 ? `${parts[0][0]}${parts[parts.length - 1][0]}` : parts[0].slice(0, 2);
    return letters.toUpperCase();
  }
  const email = user?.email;
  return email ? email.slice(0, 2).toUpperCase() : "?";
}

/** Contexto mínimo e seguro para IA conversacional — nunca telefone/foto. */
export function useAIUserContext() {
  const { profile } = useProfile();
  const { user } = useAuth();
  return useMemo(() => {
    const name = resolveDisplayName(profile, user);
    const role = profile?.job_title?.trim() || undefined;
    const company = profile?.company_name?.trim() || undefined;
    if (!name && !role && !company) return undefined;
    return { name: name || undefined, role, company };
  }, [profile, user]);
}
