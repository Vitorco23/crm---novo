import { useMemo, useState } from "react";
import {
  type ScrumTask, type Sprint, type TaskStatus, type TaskPriority,
  getTasks, getSprints, addTask, addSprint, updateTask, deleteTask, updateSprint, deleteSprint,
  sprintBurndown, PRIORITY_LABELS, PRIORITY_COLORS,
} from "@/lib/scrum";
import { getLeads } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2, Calendar, Target, Building2, Users, Flag, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";

const STATUS_COLUMNS: { id: TaskStatus; label: string }[] = [
  { id: "todo", label: "A Fazer" },
  { id: "doing", label: "Em Andamento" },
  { id: "done", label: "Concluído" },
];

function TaskCard({
  task, onDragStart, onDelete, onClick,
}: {
  task: ScrumTask;
  onDragStart: (e: React.DragEvent, id: string) => void;
  onDelete: (id: string) => void;
  onClick: (t: ScrumTask) => void;
}) {
  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, task.id)}
      onClick={() => onClick(task)}
      className="group rounded-md border bg-card p-3 shadow-sm cursor-pointer hover:shadow-md transition-all"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="font-medium text-sm text-card-foreground flex-1">{task.title}</p>
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(task.id); }}
          className="opacity-0 group-hover:opacity-100 transition text-muted-foreground hover:text-destructive"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
      {task.description && (
        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{task.description}</p>
      )}
      <div className="flex flex-wrap items-center gap-1.5 mt-2">
        <Badge className={`text-[10px] px-1.5 py-0 ${PRIORITY_COLORS[task.priority]}`}>
          <Flag className="h-2.5 w-2.5 mr-0.5" />{PRIORITY_LABELS[task.priority]}
        </Badge>
        {typeof task.storyPoints === "number" && (
          <Badge variant="outline" className="text-[10px] px-1.5 py-0">
            {task.storyPoints} pts
          </Badge>
        )}
        {task.assignee && (
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
            <Users className="h-2.5 w-2.5 mr-0.5" />{task.assignee}
          </Badge>
        )}
      </div>
    </div>
  );
}

export default function Scrum() {
  const [tasks, setTasks] = useState<ScrumTask[]>(getTasks);
  const [sprints, setSprints] = useState<Sprint[]>(getSprints);
  const [scope, setScope] = useState<string>("agency"); // "agency" or clientId
  const [activeSprintId, setActiveSprintId] = useState<string | null>(null);
  const [taskDialogOpen, setTaskDialogOpen] = useState(false);
  const [sprintDialogOpen, setSprintDialogOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<ScrumTask | null>(null);

  const refresh = () => { setTasks(getTasks()); setSprints(getSprints()); };

  // Clients = leads that reached onboarding (any onboarding/oportunidades stage)
  const allLeads = getLeads();
  const clientLeads = useMemo(() => {
    const seen = new Set<string>();
    return allLeads.filter((l) => {
      if (seen.has(l.id)) return false;
      seen.add(l.id);
      return true;
    });
  }, [allLeads]);

  const scopeSprints = sprints.filter((s) => s.scope === scope);
  const scopeTasks = tasks.filter((t) => t.scope === scope);

  // Auto-select first sprint of the scope
  const currentSprint = activeSprintId
    ? scopeSprints.find((s) => s.id === activeSprintId)
    : scopeSprints.find((s) => s.status === "active") ?? scopeSprints[0];

  const sprintTasks = currentSprint ? scopeTasks.filter((t) => t.sprintId === currentSprint.id) : [];
  const backlogTasks = scopeTasks.filter((t) => t.sprintId === null);

  // Burndown
  const burndownData = currentSprint ? sprintBurndown(currentSprint, scopeTasks) : [];
  const sprintTotalPoints = sprintTasks.reduce((s, t) => s + (t.storyPoints ?? 0), 0);
  const sprintDonePoints = sprintTasks.filter((t) => t.status === "done").reduce((s, t) => s + (t.storyPoints ?? 0), 0);

  // ---- handlers ----
  const onDragStart = (e: React.DragEvent, id: string) => e.dataTransfer.setData("text/plain", id);
  const onDropStatus = (e: React.DragEvent, status: TaskStatus) => {
    e.preventDefault();
    const id = e.dataTransfer.getData("text/plain");
    updateTask(id, { status });
    refresh();
  };
  const onDropToSprint = (e: React.DragEvent, sprintId: string | null) => {
    e.preventDefault();
    const id = e.dataTransfer.getData("text/plain");
    updateTask(id, { sprintId });
    refresh();
    toast.success(sprintId ? "Tarefa movida para o sprint" : "Tarefa movida para o backlog");
  };

  const handleDeleteTask = (id: string) => {
    deleteTask(id);
    refresh();
  };

  const scopeLabel = scope === "agency"
    ? "Agência (interno)"
    : clientLeads.find((l) => l.id === scope)?.company ?? "Cliente";

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Tarefas / Scrum</h1>
          <p className="text-sm text-muted-foreground">Gestão ágil com sprints, backlog e burndown.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={scope} onValueChange={(v) => { setScope(v); setActiveSprintId(null); }}>
            <SelectTrigger className="w-[260px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="agency">
                <span className="flex items-center gap-2"><Building2 className="h-3.5 w-3.5" /> Agência (interno)</span>
              </SelectItem>
              {clientLeads.map((l) => (
                <SelectItem key={l.id} value={l.id}>
                  <span className="flex items-center gap-2"><Users className="h-3.5 w-3.5" /> {l.company}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <SprintDialog
            open={sprintDialogOpen}
            onOpenChange={setSprintDialogOpen}
            scope={scope}
            onCreated={(s) => { refresh(); setActiveSprintId(s.id); }}
          />
          <TaskDialog
            open={taskDialogOpen}
            onOpenChange={setTaskDialogOpen}
            scope={scope}
            sprints={scopeSprints}
            defaultSprintId={currentSprint?.id ?? null}
            editing={editingTask}
            onSaved={() => { refresh(); setEditingTask(null); }}
          />
        </div>
      </div>

      {/* Sprint selector */}
      {scopeSprints.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          {scopeSprints.map((s) => (
            <button
              key={s.id}
              onClick={() => setActiveSprintId(s.id)}
              className={`px-3 py-1.5 text-xs rounded-md border transition ${
                currentSprint?.id === s.id
                  ? "bg-accent text-accent-foreground border-accent"
                  : "bg-card hover:bg-muted/50"
              }`}
            >
              {s.name}
              <span className="ml-1.5 opacity-60">
                {s.startDate.slice(5)} → {s.endDate.slice(5)}
              </span>
            </button>
          ))}
        </div>
      )}

      <Tabs defaultValue="board" className="w-full">
        <TabsList>
          <TabsTrigger value="board">Sprint Board</TabsTrigger>
          <TabsTrigger value="backlog">Backlog</TabsTrigger>
          <TabsTrigger value="burndown">Burndown</TabsTrigger>
        </TabsList>

        {/* SPRINT BOARD */}
        <TabsContent value="board" className="mt-4">
          {!currentSprint ? (
            <Card>
              <CardContent className="p-8 text-center text-muted-foreground">
                Nenhum sprint criado para <strong>{scopeLabel}</strong>. Crie um sprint para começar.
              </CardContent>
            </Card>
          ) : (
            <>
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h2 className="text-lg font-semibold">{currentSprint.name}</h2>
                  {currentSprint.goal && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <Target className="h-3 w-3" /> {currentSprint.goal}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Calendar className="h-3.5 w-3.5" />
                  {currentSprint.startDate} → {currentSprint.endDate}
                  <Badge variant="outline">{sprintDonePoints}/{sprintTotalPoints} pts</Badge>
                  <Button
                    size="sm" variant="ghost"
                    onClick={() => {
                      if (!confirm(`Remover sprint "${currentSprint.name}"? Tarefas voltam ao backlog.`)) return;
                      deleteSprint(currentSprint.id);
                      setActiveSprintId(null);
                      refresh();
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {STATUS_COLUMNS.map((col) => {
                  const colTasks = sprintTasks.filter((t) => t.status === col.id);
                  return (
                    <div
                      key={col.id}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => onDropStatus(e, col.id)}
                      className="rounded-lg border bg-muted/20 p-3 min-h-[300px]"
                    >
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="text-sm font-semibold">{col.label}</h3>
                        <Badge variant="secondary">{colTasks.length}</Badge>
                      </div>
                      <div className="space-y-2">
                        {colTasks.map((t) => (
                          <TaskCard
                            key={t.id}
                            task={t}
                            onDragStart={onDragStart}
                            onDelete={handleDeleteTask}
                            onClick={(task) => { setEditingTask(task); setTaskDialogOpen(true); }}
                          />
                        ))}
                        {colTasks.length === 0 && (
                          <p className="text-xs text-muted-foreground/60 text-center py-6">Solte tarefas aqui</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </TabsContent>

        {/* BACKLOG */}
        <TabsContent value="backlog" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                Backlog do Produto <Badge variant="secondary">{backlogTasks.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => onDropToSprint(e, null)}
              className="space-y-2 min-h-[200px]"
            >
              {backlogTasks.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-8">
                  Nenhuma tarefa no backlog. Arraste tarefas do sprint para cá ou crie novas.
                </p>
              )}
              {backlogTasks.map((t) => (
                <div key={t.id} className="flex items-center justify-between gap-2 rounded-md border bg-card p-2"
                  draggable onDragStart={(e) => onDragStart(e, t.id)}>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{t.title}</p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <Badge className={`text-[10px] px-1 py-0 ${PRIORITY_COLORS[t.priority]}`}>
                        {PRIORITY_LABELS[t.priority]}
                      </Badge>
                      {typeof t.storyPoints === "number" && (
                        <Badge variant="outline" className="text-[10px] px-1 py-0">{t.storyPoints} pts</Badge>
                      )}
                    </div>
                  </div>
                  {currentSprint && (
                    <Button size="sm" variant="ghost"
                      onClick={() => { updateTask(t.id, { sprintId: currentSprint.id }); refresh(); }}>
                      Mover para Sprint <ChevronRight className="h-3 w-3 ml-1" />
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => handleDeleteTask(t.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        {/* BURNDOWN */}
        <TabsContent value="burndown" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Burndown Chart</CardTitle>
            </CardHeader>
            <CardContent>
              {!currentSprint ? (
                <p className="text-sm text-muted-foreground text-center py-8">Selecione um sprint.</p>
              ) : burndownData.length === 0 || sprintTotalPoints === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  Adicione tarefas com story points ao sprint para ver o burndown.
                </p>
              ) : (
                <div className="h-[320px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={(() => {
                      const total = burndownData[0]?.remaining ?? 0;
                      const n = burndownData.length - 1;
                      return burndownData.map((d, i) => ({
                        ...d,
                        ideal: n > 0 ? Math.round((total * (n - i) / n) * 10) / 10 : total,
                      }));
                    })()}>
                      <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                      <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                      <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
                      <Tooltip
                        contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}
                      />
                      <Legend />
                      <Line type="monotone" dataKey="ideal" stroke="hsl(var(--muted-foreground))" strokeDasharray="4 4" name="Ideal" dot={false} />
                      <Line type="monotone" dataKey="remaining" stroke="hsl(var(--accent))" strokeWidth={2} name="Restante" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ===== Dialogs =====
function SprintDialog({
  open, onOpenChange, scope, onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  scope: string;
  onCreated: (s: Sprint) => void;
}) {
  const [name, setName] = useState("");
  const [goal, setGoal] = useState("");
  const today = new Date().toISOString().slice(0, 10);
  const twoWeeks = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(twoWeeks);

  const handleSave = () => {
    if (!name.trim()) { toast.error("Informe o nome do sprint"); return; }
    const s = addSprint({
      name: name.trim(), goal: goal.trim() || undefined,
      startDate, endDate, scope, status: "active",
    });
    setName(""); setGoal("");
    onCreated(s);
    onOpenChange(false);
    toast.success("Sprint criado!");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm"><Calendar className="h-4 w-4 mr-1" />Novo Sprint</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Novo Sprint</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Nome</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Sprint 1" />
          </div>
          <div>
            <Label>Objetivo (opcional)</Label>
            <Textarea value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="Ex: Lançar landing page" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Início</Label>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div>
              <Label>Fim</Label>
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button onClick={handleSave}>Criar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TaskDialog({
  open, onOpenChange, scope, sprints, defaultSprintId, editing, onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  scope: string;
  sprints: Sprint[];
  defaultSprintId: string | null;
  editing: ScrumTask | null;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [storyPoints, setStoryPoints] = useState<string>("");
  const [assignee, setAssignee] = useState("");
  const [sprintId, setSprintId] = useState<string>("__backlog__");
  const [status, setStatus] = useState<TaskStatus>("todo");

  // Sync with editing
  const isEditing = !!editing;
  if (open && editing && title === "" && description === "") {
    setTitle(editing.title);
    setDescription(editing.description ?? "");
    setPriority(editing.priority);
    setStoryPoints(editing.storyPoints?.toString() ?? "");
    setAssignee(editing.assignee ?? "");
    setSprintId(editing.sprintId ?? "__backlog__");
    setStatus(editing.status);
  }

  const reset = () => {
    setTitle(""); setDescription(""); setPriority("medium");
    setStoryPoints(""); setAssignee("");
    setSprintId(defaultSprintId ?? "__backlog__");
    setStatus("todo");
  };

  const handleSave = () => {
    if (!title.trim()) { toast.error("Informe o título"); return; }
    const sp = storyPoints.trim() ? parseInt(storyPoints, 10) : undefined;
    const sid = sprintId === "__backlog__" ? null : sprintId;
    if (editing) {
      updateTask(editing.id, {
        title: title.trim(), description: description.trim() || undefined,
        priority, storyPoints: sp, assignee: assignee.trim() || undefined,
        sprintId: sid, status,
      });
      toast.success("Tarefa atualizada");
    } else {
      addTask({
        title: title.trim(), description: description.trim() || undefined,
        priority, storyPoints: sp, assignee: assignee.trim() || undefined,
        sprintId: sid, scope, status,
      });
      toast.success("Tarefa criada");
    }
    reset();
    onSaved();
    onOpenChange(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) reset();
        onOpenChange(v);
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm"><Plus className="h-4 w-4 mr-1" />Nova Tarefa</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEditing ? "Editar Tarefa" : "Nova Tarefa"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Título</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="O que precisa ser feito?" />
          </div>
          <div>
            <Label>Descrição</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Prioridade</Label>
              <Select value={priority} onValueChange={(v) => setPriority(v as TaskPriority)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Baixa</SelectItem>
                  <SelectItem value="medium">Média</SelectItem>
                  <SelectItem value="high">Alta</SelectItem>
                  <SelectItem value="urgent">Urgente</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Story Points</Label>
              <Input type="number" min="0" value={storyPoints} onChange={(e) => setStoryPoints(e.target.value)} placeholder="ex: 3" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Responsável</Label>
              <Input value={assignee} onChange={(e) => setAssignee(e.target.value)} placeholder="Nome" />
            </div>
            <div>
              <Label>Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as TaskStatus)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todo">A Fazer</SelectItem>
                  <SelectItem value="doing">Em Andamento</SelectItem>
                  <SelectItem value="done">Concluído</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>Sprint</Label>
            <Select value={sprintId} onValueChange={setSprintId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__backlog__">Backlog</SelectItem>
                {sprints.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button onClick={handleSave}>{isEditing ? "Salvar" : "Criar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
