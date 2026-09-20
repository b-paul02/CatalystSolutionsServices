"use client";

// Drag-and-connect workflow builder on React Flow (MIT). The canvas is only an
// editor: nothing here runs a workflow. Save → server validates; Preview → the
// server walks the path against sample data without executing anything.
import { useCallback, useMemo, useState, useTransition } from "react";
import {
  addEdge, Background, Controls, Handle, Position, ReactFlow, useEdgesState, useNodesState,
  type Connection, type Edge as RfEdge, type Node as RfNode, type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { BLOCKS, BLOCK_LIST } from "@/lib/os/automation/catalog";
import type { BlockMeta, Definition, PreviewStep } from "@/lib/os/automation/definition";
import { previewCanvas, saveCanvas } from "../actions";

type Data = { blockType: string; config: Record<string, string>; reached?: PreviewStep["status"] };
type CardNode = RfNode<Data, "card">;

const KIND_TONE: Record<string, string> = { trigger: "var(--los-brand)", condition: "var(--los-warn)", wait: "var(--los-muted)", action: "var(--los-success)" };
const field = "w-full rounded-lg border border-[var(--los-line)] bg-[var(--los-surface)] px-2.5 py-1.5 text-[13px]";

function Card({ id, data, selected }: NodeProps<CardNode>) {
  const meta: BlockMeta | undefined = BLOCKS[data.blockType];
  const tone = KIND_TONE[meta?.kind ?? "action"];
  return (
    <div className={`w-[240px] rounded-xl border bg-[var(--los-surface)] p-3 shadow-sm ${selected ? "border-[var(--los-brand)] ring-2 ring-[var(--los-brand-soft)]" : data.reached ? "border-[var(--los-success)]" : "border-[var(--los-line)]"}`}>
      {meta?.kind !== "trigger" && <Handle type="target" position={Position.Left} className="!h-2.5 !w-2.5 !bg-[var(--los-muted)]" />}
      <div className="flex items-start justify-between">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg" style={{ background: "var(--los-surface-2)", color: tone }}>
          <span className="material-symbols-outlined text-[18px]" aria-hidden>{meta?.icon ?? "help"}</span>
        </span>
        <span className="text-[10.5px] text-[var(--los-faint)]">{data.reached ? "✓ " : ""}{id}</span>
      </div>
      <div className="mt-2 text-[10px] font-semibold uppercase tracking-[0.08em]" style={{ color: tone }}>{meta?.kind ?? "unknown"}</div>
      <div className="text-[13.5px] font-semibold leading-tight">{meta?.label ?? data.blockType}</div>
      <div className="mt-0.5 line-clamp-2 text-[11.5px] text-[var(--los-muted)]">{meta ? meta.describe(data.config) : "This step type no longer exists."}</div>
      {(meta?.contacts || meta?.external) && <div className="mt-1.5 text-[10.5px] text-[var(--los-faint)]">{meta.contacts ? "consent checked" : "sends data outside"}</div>}
      {meta?.kind === "condition" ? (
        <>
          <Handle id="true" type="source" position={Position.Right} className="!h-2.5 !w-2.5 !bg-[var(--los-success)]" />
          <Handle id="false" type="source" position={Position.Bottom} className="!h-2.5 !w-2.5 !bg-[var(--los-danger)]" />
        </>
      ) : <Handle type="source" position={Position.Right} className="!h-2.5 !w-2.5 !bg-[var(--los-muted)]" />}
    </div>
  );
}
const nodeTypes = { card: Card };

const toRf = (def: Definition): { nodes: CardNode[]; edges: RfEdge[] } => ({
  nodes: def.nodes.map((n, i) => ({ id: n.id, type: "card" as const, position: n.position ?? { x: 40 + i * 300, y: 80 }, data: { blockType: n.type, config: n.config ?? {} } })),
  edges: def.edges.map((e) => ({ id: `${e.from}-${e.to}-${e.branch ?? ""}`, source: e.from, target: e.to, sourceHandle: e.branch ?? null, label: e.branch === "true" ? "Yes" : e.branch === "false" ? "No" : undefined, animated: false })),
});
const fromRf = (nodes: CardNode[], edges: RfEdge[]): Definition => ({
  nodes: nodes.map((n) => ({ id: n.id, type: n.data.blockType, config: n.data.config, position: { x: Math.round(n.position.x), y: Math.round(n.position.y) } })),
  edges: edges.map((e) => ({ from: e.source, to: e.target, ...(e.sourceHandle === "true" || e.sourceHandle === "false" ? { branch: e.sourceHandle } : {}) })),
});

export default function Builder({ id, initialName, initial, canEdit, sampleHint }: { id: string; initialName: string; initial: Definition; canEdit: boolean; sampleHint: string }) {
  const start = useMemo(() => toRf(initial), [initial]);
  const [nodes, setNodes, onNodesChange] = useNodesState<CardNode>(start.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<RfEdge>(start.edges);
  const [name, setName] = useState(initialName);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [problems, setProblems] = useState<string[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [sample, setSample] = useState(sampleHint);
  const [preview, setPreview] = useState<{ steps: PreviewStep[]; skipped: string[] } | null>(null);
  const [pending, startTransition] = useTransition();
  const selected = nodes.find((n) => n.id === selectedId) ?? null;
  const selectedMeta = selected ? BLOCKS[selected.data.blockType] : undefined;
  const touch = () => { setDirty(true); setPreview(null); setNodes((ns) => ns.map((n) => (n.data.reached ? { ...n, data: { ...n.data, reached: undefined } } : n))); };

  const onConnect = useCallback((c: Connection) => {
    if (!canEdit || c.source === c.target) return;
    const branch = c.sourceHandle === "true" || c.sourceHandle === "false" ? c.sourceHandle : null;
    // one path per output: connecting again replaces the old line
    setEdges((es) => addEdge({ ...c, id: `${c.source}-${c.target}-${branch ?? ""}`, label: branch === "true" ? "Yes" : branch === "false" ? "No" : undefined }, es.filter((e) => !(e.source === c.source && (e.sourceHandle ?? null) === branch))));
    touch();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canEdit, setEdges]);

  const addBlock = (meta: BlockMeta) => {
    if (meta.kind === "trigger" && nodes.some((n) => BLOCKS[n.data.blockType]?.kind === "trigger")) { setNotice("A workflow has one trigger — delete the current one first."); return; }
    const nid = `n${Date.now().toString(36).slice(-5)}`;
    const maxX = nodes.reduce((m, n) => Math.max(m, n.position.x), -260);
    setNodes((ns) => [...ns, { id: nid, type: "card", position: { x: maxX + 300, y: 80 }, data: { blockType: meta.type, config: Object.fromEntries(meta.fields.filter((f) => f.type === "select" && f.required).map((f) => [f.key, f.options?.[0]?.value ?? ""])) } }]);
    setSelectedId(nid); touch();
  };
  const setConfig = (key: string, value: string) => { setNodes((ns) => ns.map((n) => (n.id === selectedId ? { ...n, data: { ...n.data, config: { ...n.data.config, [key]: value } } } : n))); touch(); };
  const removeSelected = () => { setNodes((ns) => ns.filter((n) => n.id !== selectedId)); setEdges((es) => es.filter((e) => e.source !== selectedId && e.target !== selectedId)); setSelectedId(null); touch(); };

  const save = () => startTransition(async () => {
    const r = await saveCanvas(id, name, fromRf(nodes, edges));
    if (r.error) { setNotice(r.error); return; }
    setProblems(r.problems ?? []); setDirty(false);
    setNotice(r.deactivated ? "Saved. The logic changed, so this workflow is back to Draft — activate it again to go live." : r.problems?.length ? "Saved with problems to fix before activating." : "Saved.");
  });
  const runPreview = () => startTransition(async () => {
    const r = await previewCanvas(fromRf(nodes, edges), sample);
    if (r.error) { setNotice(r.error); return; }
    setProblems(r.problems ?? []); setPreview({ steps: r.steps ?? [], skipped: r.skipped ?? [] });
    const hit = new Map((r.steps ?? []).map((s) => [s.nodeId, s.status]));
    setNodes((ns) => ns.map((n) => ({ ...n, data: { ...n.data, reached: hit.get(n.id) } })));
  });

  const groups = [...new Set(BLOCK_LIST.map((b) => b.group))];
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input value={name} onChange={(e) => { setName(e.target.value); setDirty(true); }} disabled={!canEdit} aria-label="Workflow name" className="min-w-[220px] flex-1 rounded-lg border border-transparent bg-transparent px-2 py-1 text-[20px] font-extrabold tracking-tight hover:border-[var(--los-line)] focus:border-[var(--los-brand)]" />
        <button onClick={runPreview} disabled={pending} className="rounded-lg border border-[var(--los-line)] px-3 py-1.5 text-[13px] font-semibold hover:bg-[var(--los-surface-2)] disabled:opacity-50">Path preview</button>
        {canEdit && <button onClick={save} disabled={pending || !dirty} className="rounded-lg bg-[var(--los-brand)] px-3 py-1.5 text-[13px] font-semibold text-white disabled:opacity-40">{pending ? "…" : dirty ? "Save" : "Saved"}</button>}
      </div>
      {notice && <p role="status" className="mb-2 text-[12.5px] text-[var(--los-muted)]">{notice}</p>}
      {problems.length > 0 && <ul className="mb-2 list-disc rounded-lg border border-[var(--los-warn)] py-2 pl-7 pr-3 text-[12.5px]">{problems.map((p) => <li key={p}>{p}</li>)}</ul>}

      <div className={`grid gap-3 ${canEdit ? "md:grid-cols-[180px_1fr] xl:grid-cols-[190px_1fr_290px]" : "xl:grid-cols-[1fr_290px]"}`}>
        {canEdit && (
          <div className="max-h-[560px] overflow-y-auto rounded-xl border border-[var(--los-line)] bg-[var(--los-surface)] p-2">
            {groups.map((g) => (
              <details key={g} open={g === "Triggers" || g === "Logic" || g === "CRM"} className="mb-1">
                <summary className="cursor-pointer px-1 py-1 text-[11.5px] font-semibold text-[var(--los-faint)]">{g}</summary>
                {BLOCK_LIST.filter((b) => b.group === g).map((b) => (
                  <button key={b.type} onClick={() => addBlock(b)} className="flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left text-[12.5px] hover:bg-[var(--los-surface-2)]">
                    <span className="material-symbols-outlined text-[16px]" style={{ color: KIND_TONE[b.kind] }} aria-hidden>{b.icon}</span>{b.label}
                  </button>
                ))}
              </details>
            ))}
          </div>
        )}
        <div className="h-[560px] overflow-hidden rounded-xl border border-[var(--los-line)] bg-[var(--los-surface-2)]">
          <ReactFlow
            nodes={nodes} edges={edges} nodeTypes={nodeTypes} fitView fitViewOptions={{ padding: 0.2, maxZoom: 1 }} proOptions={{ hideAttribution: false }}
            onNodesChange={(c) => { onNodesChange(c); if (c.some((x) => x.type === "position" && x.dragging === false)) setDirty(true); }}
            onEdgesChange={(c) => { onEdgesChange(c); if (c.some((x) => x.type === "remove")) touch(); }}
            onConnect={onConnect} onNodeClick={(_e, n) => setSelectedId(n.id)} onPaneClick={() => setSelectedId(null)}
            nodesDraggable={canEdit} nodesConnectable={canEdit} elementsSelectable deleteKeyCode={canEdit ? ["Backspace", "Delete"] : null}
            onNodesDelete={() => { setSelectedId(null); touch(); }}
          >
            <Background gap={18} size={1} />
            <Controls showInteractive={false} />
          </ReactFlow>
        </div>

        <div className={`grid gap-3 md:grid-cols-2 xl:block xl:space-y-3 ${canEdit ? "md:col-span-2 xl:col-span-1" : ""}`}>
          {selected && selectedMeta ? (
            <div className="rounded-xl border border-[var(--los-line)] bg-[var(--los-surface)] p-3">
              <div className="mb-2 flex items-center justify-between"><div className="text-[14px] font-bold">{selectedMeta.label}</div><span className="text-[11px] text-[var(--los-faint)]">id: {selected.id}</span></div>
              {selectedMeta.fields.length === 0 && <p className="text-[12.5px] text-[var(--los-muted)]">Nothing to set for this step.</p>}
              {selectedMeta.fields.map((f) => (
                <label key={f.key} className="mb-2 block text-[12px] font-medium text-[var(--los-muted)]">{f.label}{f.required ? " *" : ""}
                  {f.type === "select" ? (
                    <select value={selected.data.config[f.key] ?? ""} onChange={(e) => setConfig(f.key, e.target.value)} disabled={!canEdit} className={`${field} mt-1`}>{!f.required && <option value="">—</option>}{f.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
                  ) : f.type === "textarea" ? (
                    <textarea rows={4} value={selected.data.config[f.key] ?? ""} onChange={(e) => setConfig(f.key, e.target.value)} disabled={!canEdit} placeholder={f.placeholder} className={`${field} mt-1`} />
                  ) : (
                    <input type={f.type === "number" ? "number" : "text"} value={selected.data.config[f.key] ?? ""} onChange={(e) => setConfig(f.key, e.target.value)} disabled={!canEdit} placeholder={f.placeholder} className={`${field} mt-1`} />
                  )}
                  {f.help && <span className="mt-0.5 block text-[11px] font-normal text-[var(--los-faint)]">{f.help}</span>}
                </label>
              ))}
              {selectedMeta.provider && <p className="text-[11.5px] text-[var(--los-faint)]">Needs a {selectedMeta.provider} connection (Workflows → Connections).</p>}
              {canEdit && <button onClick={removeSelected} className="mt-1 rounded-lg border border-[var(--los-danger)] px-2.5 py-1 text-[12px] font-semibold text-[var(--los-danger)]">Delete step</button>}
            </div>
          ) : <div className="rounded-xl border border-dashed border-[var(--los-line)] p-3 text-[12.5px] text-[var(--los-faint)]">Select a step to edit it. Drag from a step&apos;s right dot to the next step&apos;s left dot. A condition has a green Yes dot and a red No dot.</div>}

          <div className="rounded-xl border border-[var(--los-line)] bg-[var(--los-surface)] p-3">
            <div className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-[var(--los-success)]">Simulated path</div>
            <label className="mt-1 block text-[12px] text-[var(--los-muted)]">Sample trigger data (JSON)
              <textarea rows={3} value={sample} onChange={(e) => setSample(e.target.value)} className={`${field} mt-1 font-mono text-[11.5px]`} />
            </label>
            {preview ? (
              <>
                <ol className="mt-2 space-y-1 text-[12.5px]">
                  {preview.steps.map((s, i) => (
                    <li key={s.nodeId}><span className="text-[var(--los-faint)]">{i + 1}.</span> <b>{s.label}</b>{s.status === "taken_yes" ? " → Yes" : s.status === "taken_no" ? " → No" : s.status === "would_wait" ? " (pauses here)" : ""}<div className="text-[11.5px] text-[var(--los-muted)]">{s.detail}{s.contacts ? " · consent checked at run time" : ""}</div></li>
                  ))}
                </ol>
                {preview.skipped.length > 0 && <p className="mt-2 text-[11.5px] text-[var(--los-faint)]">Skipped on this path: {preview.skipped.join(", ")}.</p>}
                <p className="mt-2 inline-block rounded-md border border-[var(--los-success)] px-2 py-0.5 text-[11.5px] text-[var(--los-success)]">{preview.steps.length} steps previewed</p>
                <p className="mt-1 text-[11px] text-[var(--los-faint)]">Preview only. Nothing was run, sent or saved.</p>
              </>
            ) : <p className="mt-2 text-[12px] text-[var(--los-faint)]">Click Path preview to see which steps this data would reach.</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
