import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";

export type LeadFieldKey =
  | "company"
  | "contact"
  | "phone"
  | "website"
  | "niche"
  | "city"
  | "gmnLink"
  | "instagramLink"
  | "notes"
  | "googleRating"
  | "googleReviews"
  | "icpStars";

export interface LeadFieldDef {
  key: LeadFieldKey;
  label: string;
  required?: boolean;
  hints: string[];
}

export const LEAD_FIELDS: LeadFieldDef[] = [
  { key: "company", label: "Nome da Empresa", required: true, hints: ["empresa", "company", "nome", "razao", "razão"] },
  { key: "contact", label: "Contato (pessoa)", hints: ["contato", "contact", "responsavel", "responsável"] },
  { key: "phone", label: "Telefone", hints: ["telefone", "phone", "tel", "celular", "whatsapp"] },
  { key: "website", label: "Site / URL", hints: ["site", "website", "url", "www", "página", "pagina"] },
  { key: "gmnLink", label: "Link Google Meu Negócio", hints: ["gmn", "google", "maps", "gmb"] },
  { key: "instagramLink", label: "Link Instagram", hints: ["instagram", "insta", "ig"] },
  { key: "niche", label: "Nicho", hints: ["nicho", "niche", "segmento", "categoria"] },
  { key: "city", label: "Cidade", hints: ["cidade", "city", "municipio", "município"] },
  { key: "notes", label: "Informações Adicionais", hints: ["observ", "notes", "nota", "info", "adicional", "descricao", "descrição"] },
  { key: "googleRating", label: "Nota Google", hints: ["nota", "rating", "estrelas", "google rating", "google score"] },
  { key: "googleReviews", label: "Quantidade de Avaliações", hints: ["avaliações", "avaliacoes", "reviews", "total reviews", "google reviews", "número de avaliações", "numero de avaliacoes"] },
  { key: "icpStars", label: "ICP (1-5 estrelas)", hints: ["icp", "estrelas", "score", "qualificação", "ipc"] },
];

const NONE = "__none__";

function autoDetect(headers: string[]): Record<LeadFieldKey, string> {
  const mapping: Record<string, string> = {};
  const used = new Set<string>();
  LEAD_FIELDS.forEach((field) => {
    const lower = headers.map((h) => h.toLowerCase());
    let foundIdx = -1;
    for (const hint of field.hints) {
      foundIdx = lower.findIndex((h, i) => !used.has(headers[i]) && h.includes(hint));
      if (foundIdx !== -1) break;
    }
    if (foundIdx !== -1) {
      mapping[field.key] = headers[foundIdx];
      used.add(headers[foundIdx]);
    } else {
      mapping[field.key] = NONE;
    }
  });
  return mapping as Record<LeadFieldKey, string>;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  headers: string[];
  rows: Record<string, string>[];
  onConfirm: (mapping: Record<LeadFieldKey, string>, tag: string) => void;
}

export default function ImportMappingDialog({ open, onOpenChange, headers, rows, onConfirm }: Props) {
  const [mapping, setMapping] = useState<Record<LeadFieldKey, string>>(() => autoDetect(headers));
  const [selectedTag, setSelectedTag] = useState<string>("GMN");

  // reset when a new file is opened (headers change)
  useEffect(() => {
    setMapping(autoDetect(headers));
  }, [headers]);


  const previewRows = rows.slice(0, 3);
  const companyMapped = mapping.company && mapping.company !== NONE;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl h-[90vh] max-h-[900px] overflow-hidden flex flex-col p-0">
        <div className="p-6 pb-2">
        <DialogHeader>
          <DialogTitle>Mapear Colunas da Planilha</DialogTitle>
          <p className="text-sm text-muted-foreground">
            Selecione qual coluna da sua planilha corresponde a cada campo do lead.
            Detectamos {rows.length} linha(s) e {headers.length} coluna(s).
          </p>
        </div>

        <ScrollArea className="flex-1 px-6">
          <div className="space-y-3">
            {LEAD_FIELDS.map((field) => {
              const value = mapping[field.key] || NONE;
              const sample = value !== NONE ? previewRows.map((r) => r[value]).filter(Boolean)[0] : null;
              return (
                <div key={field.key} className="grid grid-cols-[200px_1fr_1fr] gap-3 items-center">
                  <div>
                    <Label className="text-sm">
                      {field.label}
                      {field.required && <span className="text-destructive ml-1">*</span>}
                    </Label>
                  </div>
                  <Select
                    value={value}
                    onValueChange={(v) => setMapping({ ...mapping, [field.key]: v })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione uma coluna..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>— Não importar —</SelectItem>
                      {headers.map((h) => (
                        <SelectItem key={h} value={h}>{h}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <div className="text-xs text-muted-foreground truncate">
                    {sample ? (
                      <Badge variant="outline" className="font-normal">Ex: {sample}</Badge>
                    ) : value !== NONE ? (
                      <span className="opacity-50">(sem exemplo)</span>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>

          {previewRows.length > 0 && (
            <div className="mt-6">
              <Label className="text-sm mb-2 block">Pré-visualização (primeiras 3 linhas)</Label>
              <div className="border rounded-md overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-muted/50">
                    <tr>
                      {headers.map((h) => (
                        <th key={h} className="px-2 py-1.5 text-left font-medium whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {previewRows.map((row, i) => (
                      <tr key={i} className="border-t">
                        {headers.map((h) => (
                          <td key={h} className="px-2 py-1.5 truncate max-w-[160px]">{row[h] || ""}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </ScrollArea>

        <DialogFooter className="border-t p-6 flex-col sm:flex-row gap-3 bg-muted/20">
          <div className="flex flex-col gap-1.5 mr-auto">
            <Label className="text-[10px] uppercase text-muted-foreground font-semibold">Tag dos leads importados</Label>
            <Select value={selectedTag} onValueChange={setSelectedTag}>
              <SelectTrigger className="h-8 w-[140px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="GMN">GMN</SelectItem>
                <SelectItem value="LUPUS">LUPUS</SelectItem>
                <SelectItem value="INBOUND">INBOUND</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          <div className="flex items-center gap-2">
            {!companyMapped && (
              <p className="text-xs text-destructive self-center">
                Selecione "Nome da Empresa"
              </p>
            )}
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button
              disabled={!companyMapped}
              onClick={() => onConfirm(mapping, selectedTag)}
              size="sm"
              className="bg-accent text-accent-foreground hover:bg-accent/90"
            >
              Importar {rows.length} leads
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
