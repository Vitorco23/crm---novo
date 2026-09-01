import PipelineBoard from "@/modules/pipeline/components/PipelineBoard";
import { MissionThemeProvider } from "@/components/ui/mission-theme";
import { ColdCallConsole } from "@/modules/cold-call/components/ColdCallConsole";

export default function ColdCall() {
  return (
    <MissionThemeProvider value={true}>
    <div className="mission-theme bg-[hsl(var(--mission-bg))] space-y-4">
      <div className="px-4 pt-4">
        <ColdCallConsole />
      </div>
      <PipelineBoard pipeline="cold_call" title="Cold Call" subtitle="Prospecção Ativa" />
    </div>
    </MissionThemeProvider>
  );
}
