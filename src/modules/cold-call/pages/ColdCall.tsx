import { useState, useEffect } from "react";
import PipelineBoard from "@/modules/pipeline/components/PipelineBoard";
import ColdCallOpsPanel from "@/modules/cold-call/components/ColdCallOpsPanel";

export default function ColdCall() {
  const [refreshKey, setRefreshKey] = useState(0);

  // Refresh panel when leads/sessions are updated elsewhere in the app.
  useEffect(() => {
    const bump = () => setRefreshKey((k) => k + 1);
    window.addEventListener("p21:data-changed", bump);
    return () => window.removeEventListener("p21:data-changed", bump);
  }, []);

  return (
    <div className="space-y-4">
      <div className="px-4 pt-4">
        <ColdCallOpsPanel refreshKey={refreshKey} />
      </div>
      <PipelineBoard pipeline="cold_call" title="Cold Call" subtitle="Prospecção Ativa" />
    </div>
  );
}
