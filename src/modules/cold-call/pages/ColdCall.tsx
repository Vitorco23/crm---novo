import PipelineBoard from "@/modules/pipeline/components/PipelineBoard";
import { ColdCallConsole } from "@/modules/cold-call/components/ColdCallConsole";

export default function ColdCall() {
  return (
    <div className="space-y-4">
      <div className="px-4 pt-4">
        <ColdCallConsole />
      </div>
      <PipelineBoard pipeline="cold_call" title="Cold Call" subtitle="Prospecção Ativa" />
    </div>
  );
}
