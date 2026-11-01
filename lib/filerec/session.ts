/**
 * Estado de la sesión de recuperación de archivos, fuera de los componentes (useSyncExternalStore).
 *
 * Corrige el vacío de File Recovery: antes los informes vivían dentro del componente y se perdían al cambiar de sección.
 *   · `runs`: resultados de esta pestaña, con bytes, en memoria (nunca se guardan).
 *   · `history`: historial persistente en localStorage con SOLO metadatos (nombre, formato, tamaño, SHA-256, veredicto).
 *     Ningún contenido de archivo sale de la memoria. Tolerante a almacenamiento ausente, lleno o corrupto.
 */
import type { CarveReport } from './index';
import type { Outcome, ResurrectionRun } from './protocol';

export const HISTORY_KEY = 'quetzal:filerec-history:v1';
export const HISTORY_MAX = 60;

export interface HistoryEntry {
  id: string; at: string; name: string; format: string; size: number; sha256: string;
  integrity: string; outcome: Outcome; verifiedItems: number; repaired: boolean; validated: boolean;
  intactBytesPct: number | null; synthetic: boolean; ms: number;
}
export interface SessionState { runs: ResurrectionRun[]; sources: Record<string, Uint8Array>; carves: Array<{ c: CarveReport; synthetic: boolean }>; active: string | null; busy: boolean; history: HistoryEntry[]; storage: 'ok' | 'no-disponible' | 'error' }

const OUTCOMES: Outcome[] = ['integro', 'reparado-validado', 'recuperacion-parcial', 'reparacion-sin-verificar', 'solo-diagnostico', 'irrecuperable', 'no-analizado'];

/** Valida cada entrada; descarta lo que no tenga la forma esperada (almacén manipulado o de otra versión). */
export function parseHistory(raw: string | null): HistoryEntry[] {
  if (!raw) return [];
  try {
    const j = JSON.parse(raw) as unknown;
    if (!Array.isArray(j)) return [];
    return j.filter((e): e is HistoryEntry => !!e && typeof e === 'object'
      && typeof (e as HistoryEntry).id === 'string' && typeof (e as HistoryEntry).name === 'string'
      && typeof (e as HistoryEntry).size === 'number' && typeof (e as HistoryEntry).sha256 === 'string'
      && OUTCOMES.includes((e as HistoryEntry).outcome)).slice(0, HISTORY_MAX);
  } catch { return []; }
}

export function toHistory(r: ResurrectionRun): HistoryEntry {
  const rep = r.report;
  return {
    id: r.id, at: r.startedAt, name: r.name, format: rep?.format ?? r.identification?.id ?? 'desconocido', size: r.size, sha256: rep?.sha256 ?? '',
    integrity: rep?.integrity ?? 'no-analizado', outcome: r.outcome, verifiedItems: rep?.items.filter(i => i.verified).length ?? 0,
    repaired: !!rep?.repaired, validated: r.stages.find(s => s.id === 'validacion')?.state === 'ok',
    intactBytesPct: r.recoverability.intactBytesPct, synthetic: r.synthetic, ms: r.totalMs,
  };
}

export interface Stats {
  total: number; real: number; synthetic: number; bytes: number;
  byOutcome: Record<Outcome, number>; byFormat: Array<[string, number]>;
  validatedRepairs: number; verifiedItems: number; lastAt: string | null;
}
/** Estadísticas calculadas del historial; nada se estima ni se rellena. */
export function computeStats(h: HistoryEntry[]): Stats {
  const byOutcome = Object.fromEntries(OUTCOMES.map(o => [o, 0])) as Record<Outcome, number>;
  const fm = new Map<string, number>(); let bytes = 0, validatedRepairs = 0, verifiedItems = 0, synthetic = 0;
  for (const e of h) {
    byOutcome[e.outcome]++; fm.set(e.format, (fm.get(e.format) ?? 0) + 1); bytes += e.size; verifiedItems += e.verifiedItems;
    if (e.repaired && e.validated) validatedRepairs++; if (e.synthetic) synthetic++;
  }
  return { total: h.length, real: h.length - synthetic, synthetic, bytes, byOutcome, byFormat: [...fm.entries()].sort((a, b) => b[1] - a[1]),
    validatedRepairs, verifiedItems, lastAt: h[0]?.at ?? null };
}

// ─── Almacén ────────────────────────────────────────────────────────────────
let state: SessionState = { runs: [], sources: {}, carves: [], active: null, busy: false, history: [], storage: 'ok' };
const EMPTY: SessionState = state;
const subs = new Set<() => void>();
let loaded = false;
const set = (patch: Partial<SessionState>) => { state = { ...state, ...patch }; subs.forEach(f => f()); };
export const getSession = () => state;
export const getServerSession = () => EMPTY;
export const subscribeSession = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };

/** Lee el historial guardado (una vez, tras montar). */
export function loadHistory() {
  if (loaded || typeof window === 'undefined') return;
  loaded = true;
  try { set({ history: parseHistory(window.localStorage.getItem(HISTORY_KEY)), storage: 'ok' }); }
  catch { set({ storage: 'no-disponible' }); }
}
function persist(history: HistoryEntry[]) {
  if (typeof window === 'undefined') return;
  try { window.localStorage.setItem(HISTORY_KEY, JSON.stringify(history)); if (state.storage !== 'ok') set({ storage: 'ok' }); }
  catch { set({ storage: 'error' }); }
}

export const setBusy = (busy: boolean) => set({ busy });
export const setActive = (active: string | null) => set({ active });
/** Actualización en vivo de una ejecución (cada etapa emite su estado real). */
export function upsertRun(r: ResurrectionRun) {
  const i = state.runs.findIndex(x => x.id === r.id);
  const runs = i < 0 ? [r, ...state.runs] : state.runs.map(x => (x.id === r.id ? r : x));
  set({ runs, active: state.active ?? r.id });
}
/** Al terminar: se fija el resultado y se añade al historial (solo metadatos). */
export function finishRun(r: ResurrectionRun) {
  upsertRun(r);
  const history = [toHistory(r), ...state.history.filter(h => h.id !== r.id)].slice(0, HISTORY_MAX);
  set({ history }); persist(history);
}
export const addCarves = (c: SessionState['carves']) => set({ carves: [...c, ...state.carves] });
/** Bytes originales en memoria (para la vista previa y el comparador); nunca se persisten. */
export const addSource = (id: string, bytes: Uint8Array) => set({ sources: { ...state.sources, [id]: bytes } });
export const clearSession = () => set({ runs: [], sources: {}, carves: [], active: null });
export function clearHistory() { set({ history: [] }); persist([]); }
/** Solo pruebas. */
export function _resetSession() { state = EMPTY; loaded = false; }
