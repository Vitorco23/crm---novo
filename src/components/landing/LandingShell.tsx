import { ReactNode, useState, createContext, useContext } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

type CtxT = { openSoon: (label?: string) => void };
const Ctx = createContext<CtxT>({ openSoon: () => {} });
export const useLandingCta = () => useContext(Ctx);

export function LandingShell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState<string | undefined>();
  const openSoon = (l?: string) => {
    console.log("[landing] CTA click:", l ?? "(sem rótulo)");
    setLabel(l);
    setOpen(true);
  };
  return (
    <Ctx.Provider value={{ openSoon }}>
      <div className="min-h-screen bg-[#0b1120] text-slate-100 antialiased">
        {children}
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="bg-[#0f1a30] border-white/10 text-slate-100">
          <DialogHeader>
            <DialogTitle className="text-[#9abd33]">Em breve</DialogTitle>
            <DialogDescription className="text-slate-300">
              {label ? <span className="block mb-2 text-sm text-slate-400">Ação: {label}</span> : null}
              Funcionalidade será implementada na próxima etapa.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end">
            <Button onClick={() => setOpen(false)} className="bg-[#9abd33] text-[#0b1120] hover:bg-[#88a82c]">
              Entendi
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Ctx.Provider>
  );
}
