// Sprint 1.1 — Meu Perfil.
// Tela para o usuário informar como o CRM deve chamá-lo e personalizar
// contexto básico enviado à IA. Sem roles/tenants (fora de escopo aqui —
// ver Sprint 1.5). Fonte oficial de autenticação continua sendo Supabase
// Auth; este perfil só guarda dados de exibição/contexto.

import { useEffect, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Loader2, Save, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { resolveInitials, useProfile, type ProfileDraft } from "@/shared/hooks/useProfile";

const MAX_AVATAR_BYTES = 2 * 1024 * 1024; // 2MB

export default function MeuPerfil() {
  const { user } = useAuth();
  const { profile, isLoading, save, setAvatar, removeAvatar } = useProfile();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState<ProfileDraft>({
    first_name: "",
    last_name: "",
    display_name: "",
    phone: "",
    job_title: "",
    company_name: "",
  });

  // Hidrata o form quando o perfil carrega (ou muda por save em outra aba).
  useEffect(() => {
    if (!profile) return;
    setForm({
      first_name: profile.first_name ?? "",
      last_name: profile.last_name ?? "",
      display_name: profile.display_name ?? "",
      phone: profile.phone ?? "",
      job_title: profile.job_title ?? "",
      company_name: profile.company_name ?? "",
    });
  }, [profile]);

  const isConfigured = Boolean(profile?.display_name || profile?.first_name);
  const initials = resolveInitials(profile, user);
  const headerName = form.display_name || form.first_name || "Seu nome";
  const headerRole = [form.job_title, form.company_name].filter(Boolean).join(" · ");

  const handleChange = (field: keyof ProfileDraft) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm((f) => ({ ...f, [field]: e.target.value }));
  };

  const handleSave = () => {
    const cleaned: ProfileDraft = {
      first_name: form.first_name?.trim() || null,
      last_name: form.last_name?.trim() || null,
      display_name: form.display_name?.trim() || null,
      phone: form.phone?.trim() || null,
      job_title: form.job_title?.trim() || null,
      company_name: form.company_name?.trim() || null,
    } as ProfileDraft;

    save.mutate(cleaned, {
      onSuccess: () => toast.success("Perfil atualizado."),
      onError: (err) => toast.error("Não foi possível salvar", { description: err instanceof Error ? err.message : String(err) }),
    });
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Formato inválido", { description: "Envie uma imagem (JPG, PNG ou WebP)." });
      return;
    }
    if (file.size > MAX_AVATAR_BYTES) {
      toast.error("Imagem muito grande", { description: "O limite é 2MB." });
      return;
    }
    setAvatar.mutate(file, {
      onSuccess: () => toast.success("Foto atualizada."),
      onError: (err) => toast.error("Não foi possível enviar a foto", { description: err instanceof Error ? err.message : String(err) }),
    });
  };

  const handleRemoveAvatar = () => {
    removeAvatar.mutate(undefined, {
      onSuccess: () => toast.success("Foto removida."),
      onError: (err) => toast.error("Não foi possível remover a foto", { description: err instanceof Error ? err.message : String(err) }),
    });
  };

  return (
    <div className="p-4 max-w-3xl mx-auto space-y-4">
      <div>
        <h1 className="text-xl font-bold text-foreground">Meu Perfil</h1>
        <p className="text-xs text-muted-foreground">
          Personalize como o Performance21 CRM identifica e interage com você.
        </p>
      </div>

      {!isLoading && !isConfigured && (
        <div className="rounded-md border border-accent/30 bg-accent/5 px-3 py-2.5 text-xs text-foreground">
          Complete seu perfil para personalizar sua experiência no CRM — a Missão do Dia vai usar o nome de exibição definido aqui.
        </div>
      )}

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-4">
            <div className="relative">
              <Avatar className="h-16 w-16">
                {profile?.avatar_url && <AvatarImage src={profile.avatar_url} alt={headerName} />}
                <AvatarFallback className="text-lg">{initials}</AvatarFallback>
              </Avatar>
              {(setAvatar.isPending || removeAvatar.isPending) && (
                <div className="absolute inset-0 flex items-center justify-center rounded-full bg-background/70">
                  <Loader2 className="h-4 w-4 animate-spin text-accent" />
                </div>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <CardTitle className="text-base truncate">{headerName}</CardTitle>
              {headerRole && <p className="text-xs text-muted-foreground truncate">{headerRole}</p>}
              <div className="mt-2 flex items-center gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleFileChange}
                />
                <Button size="sm" variant="outline" className="h-7 px-2 text-xs gap-1"
                  onClick={() => fileInputRef.current?.click()} disabled={setAvatar.isPending}>
                  <Upload className="h-3 w-3" /> Alterar foto
                </Button>
                {profile?.avatar_url && (
                  <Button size="sm" variant="ghost" className="h-7 px-2 text-xs gap-1 text-muted-foreground"
                    onClick={handleRemoveAvatar} disabled={removeAvatar.isPending}>
                    <X className="h-3 w-3" /> Remover foto
                  </Button>
                )}
              </div>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-6">
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Informações pessoais</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="first_name" className="text-xs">Nome</Label>
                <Input id="first_name" value={form.first_name ?? ""} onChange={handleChange("first_name")} placeholder="Vítor" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="last_name" className="text-xs">Sobrenome</Label>
                <Input id="last_name" value={form.last_name ?? ""} onChange={handleChange("last_name")} placeholder="Oliveira" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="display_name" className="text-xs">Nome de exibição</Label>
                <Input id="display_name" value={form.display_name ?? ""} onChange={handleChange("display_name")} placeholder="Vítor" />
                <p className="text-[11px] text-muted-foreground">É este nome que o CRM usa para falar com você — inclusive na Missão do Dia.</p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="phone" className="text-xs">Telefone</Label>
                <Input id="phone" value={form.phone ?? ""} onChange={handleChange("phone")} placeholder="(11) 99999-9999" />
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Informações profissionais</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="job_title" className="text-xs">Cargo</Label>
                <Input id="job_title" value={form.job_title ?? ""} onChange={handleChange("job_title")} placeholder="Diretor Comercial" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="company_name" className="text-xs">Empresa</Label>
                <Input id="company_name" value={form.company_name ?? ""} onChange={handleChange("company_name")} placeholder="Performance21" />
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Conta</p>
            <div className="space-y-1.5 max-w-sm">
              <Label htmlFor="email" className="text-xs">E-mail</Label>
              <Input id="email" value={user?.email ?? ""} readOnly disabled className="bg-muted/40" />
              <p className="text-[11px] text-muted-foreground">Gerenciado pela autenticação — não pode ser alterado aqui.</p>
            </div>
          </div>

          <div className="pt-1">
            <Button onClick={handleSave} disabled={save.isPending || isLoading} className="gap-1.5 bg-accent text-accent-foreground hover:bg-accent/90">
              {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Salvar alterações
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
