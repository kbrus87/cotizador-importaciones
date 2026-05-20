import React, { useEffect, useMemo, useState } from "react";
import "./App.css";
import {
  CheckCircle2,
  Copy,
  Database,
  Download,
  FileUp,
  Plus,
  Printer,
  Save,
  Search,
  Trash2,
  X,
} from "lucide-react";

type Currency = "USD" | "ARS";

type QuoteItem = {
  id: string;
  item: string;
  tipo: string;
  descripcion: string;
  peso: number | string;
  cantidad: number | string;
  precioExw: number | string;
  derechoImportacionPct: number | string;
  tasaEstadisticaPct: number | string;
  ivaPct: number | string;
  ivaAdicionalPct: number | string;
  gananciasPct: number | string;
  iibbPct: number | string;
};

type Quote = {
  id: string;
  nombre: string;
  proveedor: string;
  origen: string;
  destino: string;
  volumen: number | string;
  pesoTotalPacking: number | string;
  savedAt: string;
  logoDataUrl: string;
  monedaBase: "USD";
  monedaVisual: Currency;
  tipoCambio: number | string;
  fleteTotal: number | string;
  seguroTotal: number | string;
  fecha: string;
  observaciones: string;
  items: QuoteItem[];
};

type WorkspaceFile = {
  app: "import-quote-calculator";
  version: number;
  exportedAt: string;
  quote: Quote;
  productDb: QuoteItem[];
};

type ItemCalc = {
  cantidad: number;
  exwUnitario: number;
  exwTotal: number;
  flete: number;
  seguro: number;
  cif: number;
  derechoImportacion: number;
  tasaEstadistica: number;
  baseIva: number;
  iva: number;
  ivaAdicional: number;
  ganancias: number;
  iibb: number;
  total: number;
  unitario: number;
};

const STORAGE_KEY = "importQuoteProductDb.v1";
const LOGO_STORAGE_KEY = "importQuoteLogo.v1";
const APP_NOTES = `Base de cálculo: CIF = EXW + flete internacional + seguro.
Derecho de importación y tasa estadística sobre CIF.
Base IVA = CIF + Derecho de Importación + Tasa Estadística
IVA, IVA adicional, Ganancias e IIBB sobre Base IVA`;

function getStoredLogo(): string {
  if (typeof window === "undefined") return "";

  try {
    return localStorage.getItem(LOGO_STORAGE_KEY) || "";
  } catch {
    return "";
  }
}

function formatSavedAt(savedAt: string): string {
  if (!savedAt) return "";

  const parsed = new Date(savedAt);
  if (Number.isNaN(parsed.getTime())) return savedAt;

  return new Intl.DateTimeFormat("es-AR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(parsed);
}

function fileSafeSegment(value: string, fallback: string): string {
  const cleaned = value
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "")
    .replace(/\s+/g, " ");

  return cleaned || fallback;
}

const money = (n: number | string | undefined | null) =>
  new Intl.NumberFormat("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(Number(n)) ? Number(n) : 0);

const numberValue = (v: unknown): number => {
  if (v === "" || v === null || v === undefined) return 0;
  return Number(String(v).replace(",", ".")) || 0;
};

const pct = (v: unknown) => numberValue(v) / 100;

const uid = () => crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`;

const emptyItem = (): QuoteItem => ({
  id: uid(),
  item: "",
  tipo: "",
  descripcion: "",
  peso: 0,
  cantidad: 1,
  precioExw: 0,
  derechoImportacionPct: 0,
  tasaEstadisticaPct: 0,
  ivaPct: 21,
  ivaAdicionalPct: 20,
  gananciasPct: 6,
  iibbPct: 2.5,
});

const defaultQuote = (): Quote => ({
  id: uid(),
  nombre: "Nueva cotización",
  proveedor: "",
  origen: "China",
  destino: "Argentina",
  volumen: 0,
  pesoTotalPacking: 0,
  savedAt: "",
  logoDataUrl: getStoredLogo(),
  monedaBase: "USD",
  monedaVisual: "USD",
  tipoCambio: 1000,
  fleteTotal: 0,
  seguroTotal: 0,
  fecha: new Date().toISOString().slice(0, 10),
  observaciones: "",
  items: [emptyItem()],
});

const makeWorkspace = (quote: Quote, productDb: QuoteItem[]): WorkspaceFile => ({
  app: "import-quote-calculator",
  version: 1,
  exportedAt: new Date().toISOString(),
  quote,
  productDb,
});

function normalizeItem(row: Partial<QuoteItem>): QuoteItem {
  return {
    id: row.id || uid(),
    item: row.item || "",
    tipo: row.tipo || "",
    descripcion: row.descripcion || "",
    peso: row.peso ?? 0,
    cantidad: row.cantidad ?? 1,
    precioExw: row.precioExw ?? 0,
    derechoImportacionPct: row.derechoImportacionPct ?? 0,
    tasaEstadisticaPct: row.tasaEstadisticaPct ?? 0,
    ivaPct: row.ivaPct ?? 21,
    ivaAdicionalPct: row.ivaAdicionalPct ?? 20,
    gananciasPct: row.gananciasPct ?? 6,
    iibbPct: row.iibbPct ?? 2.5,
  };
}

function normalizeQuote(data: Partial<Quote>): Quote {
  const base = defaultQuote();
  const legacyItems = Array.isArray(data.items) ? (data.items as Array<Partial<QuoteItem> & { flete?: unknown; seguro?: unknown }>) : [];
  const inferredFleteTotal =
    data.fleteTotal !== undefined ? data.fleteTotal : legacyItems.reduce((sum, row) => sum + numberValue(row.flete), 0);
  const inferredSeguroTotal =
    data.seguroTotal !== undefined ? data.seguroTotal : legacyItems.reduce((sum, row) => sum + numberValue(row.seguro), 0);

  return {
    ...base,
    ...data,
    id: data.id || uid(),
    volumen: data.volumen ?? 0,
    pesoTotalPacking: data.pesoTotalPacking ?? 0,
    savedAt: typeof data.savedAt === "string" ? data.savedAt : "",
    logoDataUrl: data.logoDataUrl || base.logoDataUrl,
    observaciones: typeof data.observaciones === "string" ? data.observaciones : "",
    monedaBase: "USD",
    monedaVisual: data.monedaVisual || "USD",
    tipoCambio: data.tipoCambio || 1000,
    fleteTotal: inferredFleteTotal,
    seguroTotal: inferredSeguroTotal,
    items: Array.isArray(data.items) && data.items.length > 0 ? data.items.map(normalizeItem) : [emptyItem()],
  };
}

function displayCurrency(quote: Quote): Currency {
  return quote.monedaVisual || "USD";
}

function convertMoney(valueUsd: number, quote: Quote): number {
  const rate = Math.max(numberValue(quote.tipoCambio), 0);
  return displayCurrency(quote) === "ARS" ? valueUsd * rate : valueUsd;
}

function shown(valueUsd: number, quote: Quote): string {
  return money(convertMoney(valueUsd, quote));
}

function calcItem(row: QuoteItem, flete: number, seguro: number): ItemCalc {
  const cantidad = numberValue(row.cantidad);
  const exwUnitario = numberValue(row.precioExw);

  const exwTotal = cantidad * exwUnitario;
  const cif = exwTotal + flete + seguro;
  const derechoImportacion = cif * pct(row.derechoImportacionPct);
  const tasaEstadistica = cif * pct(row.tasaEstadisticaPct);
  const baseIva = cif + derechoImportacion + tasaEstadistica;

  const iva = baseIva * pct(row.ivaPct);
  const ivaAdicional = baseIva * pct(row.ivaAdicionalPct);
  const ganancias = baseIva * pct(row.gananciasPct);
  const iibb = baseIva * pct(row.iibbPct);

  const total = baseIva + iva + ivaAdicional + ganancias + iibb;
  const unitario = cantidad > 0 ? total / cantidad : 0;

  return {
    cantidad,
    exwUnitario,
    exwTotal,
    flete,
    seguro,
    cif,
    derechoImportacion,
    tasaEstadistica,
    baseIva,
    iva,
    ivaAdicional,
    ganancias,
    iibb,
    total,
    unitario,
  };
}

function calcQuoteItems(quote: Quote): ItemCalc[] {
  const itemCount = quote.items.length || 1;
  const exwTotals = quote.items.map((row) => numberValue(row.cantidad) * numberValue(row.precioExw));
  const grandExwTotal = exwTotals.reduce((sum, value) => sum + value, 0);
  const totalFlete = numberValue(quote.fleteTotal);
  const totalSeguro = numberValue(quote.seguroTotal);

  return quote.items.map((row, index) => {
    const ratio = grandExwTotal > 0 ? exwTotals[index] / grandExwTotal : 1 / itemCount;
    return calcItem(row, totalFlete * ratio, totalSeguro * ratio);
  });
}

function downloadFile(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function csvEscape(value: unknown) {
  const s = String(value ?? "");
  if (/[";\n\r]/.test(s)) return `"${s.replaceAll('"', '""')}"`;
  return s;
}

function quoteToCsv(quote: Quote) {
  const currency = displayCurrency(quote);
  const itemCalcs = calcQuoteItems(quote);
  const headers = [
    "Item",
    "Tipo",
    "Descripcion",
    "Peso",
    "Cantidad",
    `Precio EXW Unitario (${currency})`,
    `EXW Total (${currency})`,
    `Flete (${currency})`,
    `Seguro (${currency})`,
    `CIF (${currency})`,
    "% Derecho Importacion",
    `Derecho Importacion (${currency})`,
    "% Tasa Estadistica",
    `Tasa Estadistica (${currency})`,
    `Base IVA / Percepciones (${currency})`,
    "% IVA",
    `IVA (${currency})`,
    "% IVA Adicional",
    `IVA Adicional (${currency})`,
    "% Ganancias",
    `Ganancias (${currency})`,
    "% IIBB",
    `IIBB (${currency})`,
    `Total Item (${currency})`,
    `Costo Unitario Final (${currency})`,
  ];

  const rows = quote.items.map((row, index) => {
    const c = itemCalcs[index];
    return [
      row.item,
      row.tipo,
      row.descripcion,
      row.peso,
      row.cantidad,
      convertMoney(c.exwUnitario, quote),
      convertMoney(c.exwTotal, quote),
      convertMoney(c.flete, quote),
      convertMoney(c.seguro, quote),
      convertMoney(c.cif, quote),
      row.derechoImportacionPct,
      convertMoney(c.derechoImportacion, quote),
      row.tasaEstadisticaPct,
      convertMoney(c.tasaEstadistica, quote),
      convertMoney(c.baseIva, quote),
      row.ivaPct,
      convertMoney(c.iva, quote),
      row.ivaAdicionalPct,
      convertMoney(c.ivaAdicional, quote),
      row.gananciasPct,
      convertMoney(c.ganancias, quote),
      row.iibbPct,
      convertMoney(c.iibb, quote),
      convertMoney(c.total, quote),
      convertMoney(c.unitario, quote),
    ];
  });

  return [headers, ...rows].map((r) => r.map(csvEscape).join(";")).join("\n");
}

function importCsvProducts(text: string): QuoteItem[] {
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (!lines.length) return [];

  const splitLine = (line: string) => {
    const result: string[] = [];
    let current = "";
    let inside = false;

    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      const next = line[i + 1];

      if (ch === '"' && inside && next === '"') {
        current += '"';
        i++;
      } else if (ch === '"') {
        inside = !inside;
      } else if ((ch === ";" || ch === ",") && !inside) {
        result.push(current);
        current = "";
      } else {
        current += ch;
      }
    }

    result.push(current);
    return result;
  };

  const headers = splitLine(lines[0]).map((h) => h.trim().toLowerCase());

  return lines.slice(1).map((line) => {
    const cells = splitLine(line);
    const get = (...names: string[]) => {
      const idx = headers.findIndex((h) => names.includes(h));
      return idx >= 0 ? cells[idx] : "";
    };

    return normalizeItem({
      item: get("item", "nombre"),
      tipo: get("tipo", "type"),
      descripcion: get("descripcion", "descripción", "description"),
      peso: numberValue(get("peso", "kg", "peso kg")),
      precioExw: numberValue(get("precio exw", "precioexw", "exw", "precio exw unitario")),
      derechoImportacionPct: numberValue(
        get("% derecho importacion", "% derecho importación", "derecho importacion", "derecho importación")
      ),
      tasaEstadisticaPct: numberValue(
        get("% tasa estadistica", "% tasa estadística", "tasa estadistica", "tasa estadística")
      ),
      ivaPct: numberValue(get("% iva", "iva")) || 21,
      ivaAdicionalPct: numberValue(get("% iva adicional", "iva adicional", "iva ad")) || 20,
      gananciasPct: numberValue(get("% ganancias", "ganancias")) || 6,
      iibbPct: numberValue(get("% iibb", "iibb")) || 2.5,
    });
  });
}

function Button({
  children,
  onClick,
  type = "button",
  variant = "default",
  size = "md",
  title,
  className = "",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  type?: "button" | "submit";
  variant?: "default" | "outline" | "ghost";
  size?: "sm" | "md";
  title?: string;
  className?: string;
}) {
  const base =
    "ui-button inline-flex items-center justify-center rounded-md font-medium transition-colors disabled:opacity-50 disabled:pointer-events-none";
  const variants = {
    default: "bg-slate-900 text-white hover:bg-slate-700 border border-slate-900",
    outline: "bg-white text-slate-900 hover:bg-slate-100 border border-slate-300",
    ghost: "bg-transparent text-slate-700 hover:bg-slate-100 border border-transparent",
  };
  const sizes = {
    sm: "h-8 px-2 text-xs",
    md: "h-10 px-3 text-sm",
  };

  return (
    <button type={type} title={title} onClick={onClick} className={`${base} ${variants[variant]} ${sizes[size]} ${className}`}>
      {children}
    </button>
  );
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`ui-card rounded-2xl border bg-white shadow-sm ${className}`}>{children}</div>;
}

function CardContent({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`ui-card-content ${className}`}>{children}</div>;
}

export default function App() {
  const [quote, setQuote] = useState<Quote>(defaultQuote);
  const [productDb, setProductDb] = useState<QuoteItem[]>([]);
  const [search, setSearch] = useState("");
  const [showCurrencyDialog, setShowCurrencyDialog] = useState(false);
  const [showTipo, setShowTipo] = useState(true);
  const [showDescripcion, setShowDescripcion] = useState(true);
  const [showPeso, setShowPeso] = useState(false);
  const [saveToastTick, setSaveToastTick] = useState(0);
  const [showSaveToast, setShowSaveToast] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) setProductDb(JSON.parse(saved).map(normalizeItem));
    } catch {
      setProductDb([]);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(productDb));
  }, [productDb]);

  useEffect(() => {
    try {
      if (quote.logoDataUrl) localStorage.setItem(LOGO_STORAGE_KEY, quote.logoDataUrl);
      else localStorage.removeItem(LOGO_STORAGE_KEY);
    } catch {
      // Ignore localStorage write issues for the logo cache.
    }
  }, [quote.logoDataUrl]);

  useEffect(() => {
    if (!saveToastTick) return;

    setShowSaveToast(true);
    const timeoutId = window.setTimeout(() => setShowSaveToast(false), 1400);
    return () => window.clearTimeout(timeoutId);
  }, [saveToastTick]);

  const itemCalcs = useMemo(() => calcQuoteItems(quote), [quote]);

  const totals = useMemo(() => {
    return itemCalcs.reduce(
      (acc, c) => {
        acc.exwTotal += c.exwTotal;
        acc.flete += c.flete;
        acc.seguro += c.seguro;
        acc.cif += c.cif;
        acc.derechoImportacion += c.derechoImportacion;
        acc.tasaEstadistica += c.tasaEstadistica;
        acc.baseIva += c.baseIva;
        acc.iva += c.iva;
        acc.ivaAdicional += c.ivaAdicional;
        acc.ganancias += c.ganancias;
        acc.iibb += c.iibb;
        acc.total += c.total;
        return acc;
      },
      {
        exwTotal: 0,
        flete: 0,
        seguro: 0,
        cif: 0,
        derechoImportacion: 0,
        tasaEstadistica: 0,
        baseIva: 0,
        iva: 0,
        ivaAdicional: 0,
        ganancias: 0,
        iibb: 0,
        total: 0,
      }
    );
  }, [itemCalcs]);

  const updateQuote = (patch: Partial<Quote>) => setQuote((q) => ({ ...q, ...patch }));

  const markQuoteAsSaved = (baseQuote: Quote) => {
    const savedQuote = { ...baseQuote, savedAt: new Date().toISOString() };
    setQuote(savedQuote);
    return savedQuote;
  };

  const updateItem = (id: string, field: keyof QuoteItem, value: string) => {
    setQuote((q) => ({
      ...q,
      items: q.items.map((row) => (row.id === id ? { ...row, [field]: value } : row)),
    }));
  };

  const addRow = (base = emptyItem()) => {
    setQuote((q) => ({
      ...q,
      items: [...q.items, normalizeItem({ ...base, id: uid() })],
    }));
  };

  const removeRow = (id: string) => {
    setQuote((q) => ({
      ...q,
      items: q.items.length > 1 ? q.items.filter((r) => r.id !== id) : q.items,
    }));
  };

  const saveProduct = (row: QuoteItem) => {
    if (!row.item.trim()) {
      alert("El item necesita un nombre para guardarse en la base.");
      return;
    }

    setProductDb((db) => {
      const key = row.item.trim().toLowerCase();
      const clean = normalizeItem({
        ...row,
        id: uid(),
        cantidad: 1,
      });

      const exists = db.some((p) => p.item.trim().toLowerCase() === key);
      if (exists) return db.map((p) => (p.item.trim().toLowerCase() === key ? clean : p));
      return [...db, clean].sort((a, b) => a.item.localeCompare(b.item));
    });

    setSaveToastTick((tick) => tick + 1);
  };

  const loadQuoteFile = async (file?: File) => {
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (!Array.isArray(data.items)) throw new Error("Archivo inválido");
      setQuote(normalizeQuote(data));
    } catch (error) {
      alert(error instanceof Error ? error.message : "No se pudo abrir la cotización.");
    }
  };

  const loadProductsFile = async (file?: File) => {
    if (!file) return;
    try {
      const text = await file.text();
      let data: QuoteItem[] = [];
      if (file.name.toLowerCase().endsWith(".json")) data = JSON.parse(text);
      else data = importCsvProducts(text);
      if (!Array.isArray(data)) throw new Error("Archivo de base inválido");
      setProductDb(data.map(normalizeItem));
    } catch (error) {
      alert(error instanceof Error ? error.message : "No se pudo importar la base.");
    }
  };

  const loadWorkspaceFile = async (file?: File) => {
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text) as WorkspaceFile;
      if (data.app !== "import-quote-calculator" || !data.quote || !Array.isArray(data.productDb)) {
        throw new Error("Archivo de trabajo inválido");
      }
      setQuote(normalizeQuote({ ...data.quote, savedAt: data.quote.savedAt || data.exportedAt || "" }));
      setProductDb(data.productDb.map(normalizeItem));
    } catch (error) {
      alert(error instanceof Error ? error.message : "No se pudo abrir el archivo de trabajo.");
    }
  };

  const loadLogoFile = async (file?: File) => {
    if (!file) return;

    const isPng = file.type === "image/png" || file.name.toLowerCase().endsWith(".png");
    if (!isPng) {
      alert("El logo debe ser un archivo PNG.");
      return;
    }

    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
        reader.onerror = () => reject(new Error("No se pudo leer el archivo."));
        reader.readAsDataURL(file);
      });

      if (!dataUrl) throw new Error("No se pudo procesar el logo.");
      updateQuote({ logoDataUrl: dataUrl });
    } catch (error) {
      alert(error instanceof Error ? error.message : "No se pudo cargar el logo.");
    }
  };

  const filteredProducts = productDb.filter((p) => {
    const s = search.toLowerCase();
    return [p.item, p.tipo, p.descripcion].join(" ").toLowerCase().includes(s);
  });

  const currency = displayCurrency(quote);
  const headerTitle = quote.savedAt
    ? [quote.nombre.trim() || "Cotización", quote.proveedor.trim() || "Sin proveedor", formatSavedAt(quote.savedAt)]
        .filter(Boolean)
        .join(" - ")
    : "Calculadora de importación";
  const printReport = () => {
    const previousTitle = document.title;
    const printTitle = [
      fileSafeSegment(quote.nombre, "Cotizacion"),
      fileSafeSegment(quote.proveedor, "Sin proveedor"),
      formatSavedAt(quote.savedAt || quote.fecha) || quote.fecha || new Date().toISOString().slice(0, 10),
    ].join(" - ");

    document.title = printTitle;

    const restoreTitle = () => {
      document.title = previousTitle;
      window.removeEventListener("afterprint", restoreTitle);
    };

    window.addEventListener("afterprint", restoreTitle);
    window.print();

    window.setTimeout(() => {
      restoreTitle();
    }, 1000);
  };
  const leadingTotalColumns = 3 + (showTipo ? 1 : 0) + (showDescripcion ? 1 : 0) + (showPeso ? 1 : 0);
  const printLeadingTotalColumns = 3 + (showPeso ? 1 : 0);
  const metaLayoutClass = showTipo && showDescripcion ? "meta-all" : showTipo ? "meta-item-tipo" : showDescripcion ? "meta-item-desc" : "meta-item-only";

  return (
    <div className="quote-app min-h-screen bg-slate-50 p-4 text-slate-900 print:bg-white">
      <style>{`
        @media print {
          @page { size: A4 landscape; margin: 8mm; }
          .no-print { display: none !important; }
          .print-only { display: block !important; }
          tr.print-only { display: table-row !important; }
          td.print-only, th.print-only { display: table-cell !important; }
          body { background: white; }
          input, textarea, select { border: none !important; padding: 0 !important; background: transparent !important; appearance: none !important; }
          .print-card { box-shadow: none !important; border: none !important; }
          .scroll-table { overflow: visible !important; }
          table { font-size: 10px; }
        }
        .print-only { display: none; }
      `}</style>

      <div className="quote-shell mx-auto max-w-[1800px] space-y-4">
        <div className="quote-topbar no-print flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="quote-brand">
            <div className="quote-brand-logo-wrap">
              {quote.logoDataUrl ? (
                <img src={quote.logoDataUrl} alt="Logo de la cotizaciÃ³n" className="quote-brand-logo" />
              ) : (
                <div className="quote-brand-placeholder">Sin logo</div>
              )}
            </div>
            <div className="quote-brand-copy">
            <h1 className="text-2xl font-bold tracking-tight">{headerTitle}</h1>
            <p className="text-sm text-slate-600">
              Los valores base se guardan en USD. La conversión a ARS afecta solo visualización, CSV e impresión.
            </p>
            </div>
          </div>

          <div className="quote-toolbar no-print flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setShowCurrencyDialog(true)}>
              {currency} / TC {money(quote.tipoCambio)}
            </Button>
            <label className="inline-flex h-10 cursor-pointer items-center rounded-md border border-slate-300 bg-white px-3 text-sm font-medium hover:bg-slate-100">
              <FileUp className="mr-2 h-4 w-4" /> Cargar logo PNG
              <input type="file" accept=".png,image/png" className="hidden" onChange={(e) => loadLogoFile(e.target.files?.[0])} />
            </label>
            {quote.logoDataUrl && (
              <Button variant="outline" onClick={() => updateQuote({ logoDataUrl: "" })}>
                <Trash2 className="mr-2 h-4 w-4" /> Quitar logo
              </Button>
            )}
            <Button variant="outline" onClick={() => setQuote(defaultQuote())}>
              <Plus className="mr-2 h-4 w-4" /> Nueva
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                const savedQuote = markQuoteAsSaved(quote);
                downloadFile(`${savedQuote.nombre || "cotizacion"}.json`, JSON.stringify(savedQuote, null, 2), "application/json");
              }}
            >
              <Download className="mr-2 h-4 w-4" /> Guardar cotización
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                const savedQuote = markQuoteAsSaved(quote);
                downloadFile(
                  `${savedQuote.nombre || "cotizacion"}-con-db.json`,
                  JSON.stringify(makeWorkspace(savedQuote, productDb), null, 2),
                  "application/json"
                );
              }}
            >
              <Database className="mr-2 h-4 w-4" /> Guardar app + DB
            </Button>
            <label className="inline-flex h-10 cursor-pointer items-center rounded-md border border-slate-300 bg-white px-3 text-sm font-medium hover:bg-slate-100">
              <FileUp className="mr-2 h-4 w-4" /> Abrir cotización
              <input type="file" accept=".json" className="hidden" onChange={(e) => loadQuoteFile(e.target.files?.[0])} />
            </label>
            <label className="inline-flex h-10 cursor-pointer items-center rounded-md border border-slate-300 bg-white px-3 text-sm font-medium hover:bg-slate-100">
              <FileUp className="mr-2 h-4 w-4" /> Abrir app + DB
              <input type="file" accept=".json" className="hidden" onChange={(e) => loadWorkspaceFile(e.target.files?.[0])} />
            </label>
            <Button
              variant="outline"
              onClick={() => downloadFile(`${quote.nombre || "cotizacion"}.csv`, quoteToCsv(quote), "text/csv;charset=utf-8")}
            >
              <Download className="mr-2 h-4 w-4" /> Exportar CSV
            </Button>
            <Button onClick={printReport}>
              <Printer className="mr-2 h-4 w-4" /> Imprimir informe
            </Button>
          </div>
        </div>

        <div className="print-only">
          <Card className="report-meta-card print-card">
            <CardContent className="report-meta-content">
              <div className="report-header">
                <div className="report-header-brand">
                  <div className="report-header-logo-wrap">
                    {quote.logoDataUrl ? (
                      <img src={quote.logoDataUrl} alt="Logo de la cotizaciÃ³n" className="report-header-logo" />
                    ) : (
                      <div className="quote-brand-placeholder report-header-placeholder">Sin logo</div>
                    )}
                  </div>
                  <div>
                    <div className="report-eyebrow">Informe de cotizaciÃ³n</div>
                    <h2 className="report-title">{quote.nombre || "CotizaciÃ³n sin nombre"}</h2>
                  </div>
                </div>
                <div className="report-meta-date">
                  <span className="report-meta-label">Fecha</span>
                  <strong>{quote.fecha || "-"}</strong>
                </div>
              </div>

              <div className="report-meta-grid">
                <ReportField label="Nombre cotizaciÃ³n" value={quote.nombre} className="report-field-wide" />
                <ReportField label="Proveedor" value={quote.proveedor} />
                <ReportField label="Origen" value={quote.origen} />
                <ReportField label="Destino" value={quote.destino} />
                <ReportField label="Volumen" value={`${quote.volumen || 0} m³`} />
                <ReportField label="Peso total con packing" value={`${quote.pesoTotalPacking || 0} kg`} />
                <ReportField label="Moneda" value={quote.monedaVisual} />
                <ReportField label="Flete global" value={`${currency} ${shown(numberValue(quote.fleteTotal), quote)}`} />
                <ReportField label="Seguro global" value={`${currency} ${shown(numberValue(quote.seguroTotal), quote)}`} />
                <ReportField label="Tipo de cambio" value={`ARS ${money(quote.tipoCambio)}`} />
                {quote.observaciones.trim() && (
                  <ReportField label="Observaciones" value={quote.observaciones} className="report-field-notes" />
                )}
                <ReportField label="Notas" value={APP_NOTES} className="report-field-notes" />
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="quote-form-card print-card no-print">
          <CardContent className="quote-form-grid grid grid-cols-1 gap-3 p-4 md:grid-cols-6">
            <Field label="Nombre cotización" value={quote.nombre} onChange={(v) => updateQuote({ nombre: v })} className="md:col-span-2" />
            <Field label="Proveedor" value={quote.proveedor} onChange={(v) => updateQuote({ proveedor: v })} />
            <Field label="Origen" value={quote.origen} onChange={(v) => updateQuote({ origen: v })} />
            <Field label="Destino" value={quote.destino} onChange={(v) => updateQuote({ destino: v })} />
            <Field label="Volumen m³" type="number" value={quote.volumen} onChange={(v) => updateQuote({ volumen: v })} />
            <Field
              label="Peso total con packing kg"
              type="number"
              value={quote.pesoTotalPacking}
              onChange={(v) => updateQuote({ pesoTotalPacking: v })}
            />
            <div>
              <label className="text-xs font-semibold text-slate-500">Moneda visual</label>
              <select
                className="w-full rounded-md border px-2 py-1.5 text-sm"
                value={quote.monedaVisual}
                onChange={(e) => updateQuote({ monedaVisual: e.target.value as Currency })}
              >
                <option value="USD">USD</option>
                <option value="ARS">ARS</option>
              </select>
            </div>
            <Field label="Flete global USD" type="number" value={quote.fleteTotal} onChange={(v) => updateQuote({ fleteTotal: v })} />
            <Field label="Seguro global USD" type="number" value={quote.seguroTotal} onChange={(v) => updateQuote({ seguroTotal: v })} />
            <Field label="Fecha" type="date" value={quote.fecha} onChange={(v) => updateQuote({ fecha: v })} />
            <div className="notes-field md:col-span-6">
              <label className="text-xs font-semibold text-slate-500">Observaciones</label>
              <textarea
                className="notes-textarea min-h-16 w-full rounded-md border px-2 py-1 text-sm"
                value={quote.observaciones}
                onChange={(e) => updateQuote({ observaciones: e.target.value })}
              />
            </div>
            <div className="notes-field md:col-span-6">
              <label className="text-xs font-semibold text-slate-500">Notas</label>
              <textarea className="notes-textarea min-h-16 w-full rounded-md border px-2 py-1 text-sm" value={APP_NOTES} readOnly />
            </div>
          </CardContent>
        </Card>

        <div className="quote-main-grid grid grid-cols-1 gap-4 xl:grid-cols-[1fr_360px]">
          <Card className="quote-table-card print-card">
            <CardContent className="p-4">
              <div className="quote-section-head no-print mb-3 flex items-center justify-between">
                <h2 className="text-lg font-semibold">Renglones de productos</h2>
                <div className="quote-section-actions">
                  <Button variant={showTipo ? "outline" : "ghost"} size="sm" onClick={() => setShowTipo((v) => !v)}>
                    {showTipo ? "Ocultar tipo" : "Ver tipo"}
                  </Button>
                  <Button variant={showDescripcion ? "outline" : "ghost"} size="sm" onClick={() => setShowDescripcion((v) => !v)}>
                    {showDescripcion ? "Ocultar desc." : "Ver desc."}
                  </Button>
                  <Button variant={showPeso ? "outline" : "ghost"} size="sm" onClick={() => setShowPeso((v) => !v)}>
                    {showPeso ? "Ocultar peso" : "Ver peso"}
                  </Button>
                <Button onClick={() => addRow()}>
                  <Plus className="mr-2 h-4 w-4" /> Agregar renglón
                </Button>
              </div>
              </div>

              <div className="quote-table-wrap scroll-table overflow-x-auto">
                <table className={`quote-table w-full border-collapse text-sm ${metaLayoutClass}`}>
                  <thead>
                    <tr className="bg-slate-100 text-left">
                      <Th className="item-col">Item</Th>
                      {showTipo && <Th className="type-col print-meta-col">Tipo</Th>}
                      {showDescripcion && <Th className="desc-col print-meta-col">Descripci??n</Th>}
                      {showPeso && <Th className="weight-col">Peso kg</Th>}
                      <Th className="col-qty">Cant.</Th>
                      <Th className="col-money">EXW</Th>
                      <Th className="col-money">Flete</Th>
                      <Th className="col-money">Seguro</Th>
                      <Th className="col-money">CIF</Th>
                      <Th className="col-tax">DIE</Th>
                      <Th className="col-tax">TE</Th>
                      <Th className="col-money">Base IVA</Th>
                      <Th className="col-tax">IVA</Th>
                      <Th className="col-tax">IVA ad.</Th>
                      <Th className="col-tax">Gan.</Th>
                      <Th className="col-tax">IIBB</Th>
                      <Th className="col-total">Total {currency}</Th>
                      <Th className="col-total">Unit. final {currency}</Th>
                    </tr>
                  </thead>

                  <tbody>
                    {quote.items.map((row, index) => {
                      const c = itemCalcs[index];

                      return (
                        <tr key={row.id} className="group align-top hover:bg-slate-50">
                          <Td className="item-col">
                            <div className="item-cell">
                              <CellInput value={row.item} onChange={(v) => updateItem(row.id, "item", v)} className="w-40 no-print" />
                              <div className="print-only print-item-stack">
                                <strong className="print-item-title">{row.item || "-"}</strong>
                                {row.tipo && <span className="print-item-type">{row.tipo}</span>}
                                {row.descripcion && <span className="print-item-meta">{row.descripcion}</span>}
                              </div>
                              <div className="item-cell-actions no-print">
                                <Button size="sm" variant="outline" title="Guardar/sobrescribir este item en la base" onClick={() => saveProduct(row)}>
                                  <Save className="h-4 w-4" />
                                </Button>
                                <Button size="sm" variant="outline" title="Duplicar renglÃ³n" onClick={() => addRow(row)}>
                                  <Copy className="h-4 w-4" />
                                </Button>
                                <Button size="sm" variant="outline" title="Eliminar renglÃ³n" onClick={() => removeRow(row.id)}>
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>
                          </Td>
                          {showTipo && (
                            <Td className="type-col print-meta-col">
                              <CellInput value={row.tipo} onChange={(v) => updateItem(row.id, "tipo", v)} className="w-32" />
                            </Td>
                          )}
                          {showDescripcion && (
                            <Td className="desc-col print-meta-col">
                              <CellInput value={row.descripcion} onChange={(v) => updateItem(row.id, "descripcion", v)} className="w-72" />
                            </Td>
                          )}
                          {showPeso && (
                            <Td className="weight-col">
                              <CellInput type="number" value={row.peso} onChange={(v) => updateItem(row.id, "peso", v)} className="w-20" />
                            </Td>
                          )}
                          <Td className="col-qty">
                            <CellInput type="number" value={row.cantidad} onChange={(v) => updateItem(row.id, "cantidad", v)} className="w-20" />
                          </Td>
                          <Td className="col-money">
                            <CellInput type="number" value={row.precioExw} onChange={(v) => updateItem(row.id, "precioExw", v)} className="w-24" />
                          </Td>
                          <Td className="col-money font-medium">{shown(c.flete, quote)}</Td>
                          <Td className="col-money font-medium">{shown(c.seguro, quote)}</Td>
                          <Td className="col-money font-medium">{shown(c.cif, quote)}</Td>
                          <Td className="col-tax">
                            <TaxCell
                              pctValue={row.derechoImportacionPct}
                              amount={shown(c.derechoImportacion, quote)}
                              onChange={(v) => updateItem(row.id, "derechoImportacionPct", v)}
                            />
                          </Td>
                          <Td className="col-tax">
                            <TaxCell
                              pctValue={row.tasaEstadisticaPct}
                              amount={shown(c.tasaEstadistica, quote)}
                              onChange={(v) => updateItem(row.id, "tasaEstadisticaPct", v)}
                            />
                          </Td>
                          <Td className="col-money font-medium">{shown(c.baseIva, quote)}</Td>
                          <Td className="col-tax">
                            <TaxCell pctValue={row.ivaPct} amount={shown(c.iva, quote)} onChange={(v) => updateItem(row.id, "ivaPct", v)} />
                          </Td>
                          <Td className="col-tax">
                            <TaxCell
                              pctValue={row.ivaAdicionalPct}
                              amount={shown(c.ivaAdicional, quote)}
                              onChange={(v) => updateItem(row.id, "ivaAdicionalPct", v)}
                            />
                          </Td>
                          <Td className="col-tax">
                            <TaxCell
                              pctValue={row.gananciasPct}
                              amount={shown(c.ganancias, quote)}
                              onChange={(v) => updateItem(row.id, "gananciasPct", v)}
                            />
                          </Td>
                          <Td className="col-tax">
                            <TaxCell pctValue={row.iibbPct} amount={shown(c.iibb, quote)} onChange={(v) => updateItem(row.id, "iibbPct", v)} />
                          </Td>
                          <Td className="col-total font-bold">{shown(c.total, quote)}</Td>
                          <Td className="col-total font-bold">{shown(c.unitario, quote)}</Td>

                        </tr>
                      );
                    })}
                  </tbody>

                  <tfoot>
                    <tr className="bg-slate-100 font-bold no-print">
                      <Td colSpan={leadingTotalColumns}>Totales</Td>
                      <Td>{shown(totals.flete, quote)}</Td>
                      <Td>{shown(totals.seguro, quote)}</Td>
                      <Td>{shown(totals.cif, quote)}</Td>
                      <Td>{shown(totals.derechoImportacion, quote)}</Td>
                      <Td>{shown(totals.tasaEstadistica, quote)}</Td>
                      <Td>{shown(totals.baseIva, quote)}</Td>
                      <Td>{shown(totals.iva, quote)}</Td>
                      <Td>{shown(totals.ivaAdicional, quote)}</Td>
                      <Td>{shown(totals.ganancias, quote)}</Td>
                      <Td>{shown(totals.iibb, quote)}</Td>
                      <Td>{shown(totals.total, quote)}</Td>
                      <Td></Td>
                    </tr>
                    <tr className="bg-slate-100 font-bold print-only">
                      <Td colSpan={printLeadingTotalColumns}>Totales</Td>
                      <Td>{shown(totals.flete, quote)}</Td>
                      <Td>{shown(totals.seguro, quote)}</Td>
                      <Td>{shown(totals.cif, quote)}</Td>
                      <Td>{shown(totals.derechoImportacion, quote)}</Td>
                      <Td>{shown(totals.tasaEstadistica, quote)}</Td>
                      <Td>{shown(totals.baseIva, quote)}</Td>
                      <Td>{shown(totals.iva, quote)}</Td>
                      <Td>{shown(totals.ivaAdicional, quote)}</Td>
                      <Td>{shown(totals.ganancias, quote)}</Td>
                      <Td>{shown(totals.iibb, quote)}</Td>
                      <Td>{shown(totals.total, quote)}</Td>
                      <Td></Td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              <div className="quote-section-actions quote-section-actions-bottom no-print">
                <Button variant={showTipo ? "outline" : "ghost"} size="sm" onClick={() => setShowTipo((v) => !v)}>
                  {showTipo ? "Ocultar tipo" : "Ver tipo"}
                </Button>
                <Button variant={showDescripcion ? "outline" : "ghost"} size="sm" onClick={() => setShowDescripcion((v) => !v)}>
                  {showDescripcion ? "Ocultar desc." : "Ver desc."}
                </Button>
                <Button variant={showPeso ? "outline" : "ghost"} size="sm" onClick={() => setShowPeso((v) => !v)}>
                  {showPeso ? "Ocultar peso" : "Ver peso"}
                </Button>
                <Button onClick={() => addRow()}>
                  <Plus className="mr-2 h-4 w-4" /> Agregar renglón
                </Button>
              </div>
            </CardContent>
          </Card>

          <div className="print-only">
            <Card className="report-summary-card print-card">
              <CardContent className="report-summary-content">
                <div className="report-summary-block">
                  <div className="report-summary-head">
                    <h2 className="report-summary-title">Resumen</h2>
                    <span className="report-summary-currency">{currency}</span>
                  </div>
                  <div className="report-summary-grid">
                <Summary label="EXW total" value={shown(totals.exwTotal, quote)} moneda={currency} />
                <Summary label="Flete" value={shown(totals.flete, quote)} moneda={currency} />
                <Summary label="Seguro" value={shown(totals.seguro, quote)} moneda={currency} />
                <Summary label="CIF" value={shown(totals.cif, quote)} moneda={currency} />
                <Summary label="Derecho importaciÃ³n" value={shown(totals.derechoImportacion, quote)} moneda={currency} />
                <Summary label="Tasa estadÃ­stica" value={shown(totals.tasaEstadistica, quote)} moneda={currency} />
                <Summary label="Base IVA/percepciones" value={shown(totals.baseIva, quote)} moneda={currency} />
                <Summary label="IVA" value={shown(totals.iva, quote)} moneda={currency} />
                <Summary label="IVA adicional" value={shown(totals.ivaAdicional, quote)} moneda={currency} />
                <Summary label="Ganancias" value={shown(totals.ganancias, quote)} moneda={currency} />
                <Summary label="IIBB" value={shown(totals.iibb, quote)} moneda={currency} />
                <div className="report-total-pill">
                  <span>Total</span>
                  <strong>
                    {currency} {shown(totals.total, quote)}
                  </strong>
                </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <aside className="quote-sidebar no-print space-y-4">
            <Card className="quote-db-card">
              <CardContent className="space-y-3 p-4">
                <h2 className="flex items-center text-lg font-semibold">
                  <Database className="mr-2 h-5 w-5" /> Base de items
                </h2>
                <div className="relative">
                  <Search className="absolute left-2 top-2.5 h-4 w-4 text-slate-400" />
                  <input
                    className="w-full rounded-md border py-2 pl-8 pr-2 text-sm"
                    placeholder="Buscar item guardado..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => downloadFile("base-items-importacion.json", JSON.stringify(productDb, null, 2), "application/json")}
                  >
                    Exportar DB
                  </Button>
                  <label className="inline-flex h-8 cursor-pointer items-center rounded-md border border-slate-300 bg-white px-3 text-xs font-medium hover:bg-slate-100">
                    Importar DB
                    <input type="file" accept=".json,.csv" className="hidden" onChange={(e) => loadProductsFile(e.target.files?.[0])} />
                  </label>
                </div>
                <div className="product-list max-h-[520px] space-y-2 overflow-y-auto pr-1">
                  {filteredProducts.length === 0 ? (
                    <p className="text-sm text-slate-500">
                      No hay items guardados. Pasá el mouse sobre un renglón y usá el botón de guardar.
                    </p>
                  ) : (
                    filteredProducts.map((p) => (
                      <div key={p.id} className="product-card rounded-lg border bg-white p-2 hover:bg-slate-50">
                        <div className="text-sm font-semibold">{p.item}</div>
                        <div className="text-xs text-slate-500">{p.tipo}</div>
                        <div className="my-1 line-clamp-2 text-xs">{p.descripcion}</div>
                        <div className="flex items-center justify-between">
                          <span className="text-xs">EXW: USD {money(p.precioExw)}</span>
                          <div className="flex gap-1">
                            <Button size="sm" variant="outline" onClick={() => addRow(p)}>
                              Agregar
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => setProductDb((db) => db.filter((x) => x.id !== p.id))}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>

            <Card className="quote-summary-card">
              <CardContent className="space-y-2 p-4">
                <h2 className="text-lg font-semibold">Resumen</h2>
                <Summary label="EXW total" value={shown(totals.exwTotal, quote)} moneda={currency} />
                <Summary label="Flete" value={shown(totals.flete, quote)} moneda={currency} />
                <Summary label="Seguro" value={shown(totals.seguro, quote)} moneda={currency} />
                <Summary label="CIF" value={shown(totals.cif, quote)} moneda={currency} />
                <Summary label="Derecho importación" value={shown(totals.derechoImportacion, quote)} moneda={currency} />
                <Summary label="Tasa estadística" value={shown(totals.tasaEstadistica, quote)} moneda={currency} />
                <Summary label="Base IVA/percepciones" value={shown(totals.baseIva, quote)} moneda={currency} />
                <Summary label="IVA" value={shown(totals.iva, quote)} moneda={currency} />
                <Summary label="IVA adicional" value={shown(totals.ivaAdicional, quote)} moneda={currency} />
                <Summary label="Ganancias" value={shown(totals.ganancias, quote)} moneda={currency} />
                <Summary label="IIBB" value={shown(totals.iibb, quote)} moneda={currency} />
                <div className="flex justify-between border-t pt-2 text-lg font-bold">
                  <span>Total</span>
                  <span>
                    {currency} {shown(totals.total, quote)}
                  </span>
                </div>
              </CardContent>
            </Card>
          </aside>
        </div>
      </div>

      <div className={`save-toast no-print ${showSaveToast ? "is-visible" : ""}`} aria-live="polite" aria-hidden={!showSaveToast}>
        <CheckCircle2 className="h-4 w-4" />
        <span>Guardado</span>
      </div>

      {showCurrencyDialog && (
        <div className="currency-modal no-print fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <Card className="currency-dialog w-full max-w-md">
            <CardContent className="space-y-4 p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold">Conversión USD / ARS</h2>
                  <p className="text-sm text-slate-600">
                    Los precios se cargan y se guardan en USD. Este control solo cambia la moneda de visualización, CSV e impresión.
                  </p>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setShowCurrencyDialog(false)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>

              <Field
                label="Tipo de cambio ARS por 1 USD"
                type="number"
                value={quote.tipoCambio}
                onChange={(v) => updateQuote({ tipoCambio: v })}
              />

              <div>
                <label className="text-xs font-semibold text-slate-500">Ver importes en</label>
                <select
                  className="w-full rounded-md border px-2 py-1.5 text-sm"
                  value={quote.monedaVisual}
                  onChange={(e) => updateQuote({ monedaVisual: e.target.value as Currency })}
                >
                  <option value="USD">USD - Dólares</option>
                  <option value="ARS">ARS - Pesos argentinos</option>
                </select>
              </div>

              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => updateQuote({ monedaVisual: quote.monedaVisual === "USD" ? "ARS" : "USD" })}
                >
                  Cambiar a {quote.monedaVisual === "USD" ? "ARS" : "USD"}
                </Button>
                <Button onClick={() => setShowCurrencyDialog(false)}>Aceptar</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  className = "",
}: {
  label: string;
  value: string | number;
  onChange: (value: string) => void;
  type?: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="field-label text-xs font-semibold text-slate-500">{label}</label>
      <input
        type={type}
        step="any"
        className={`field-input w-full rounded-md border px-2 py-1.5 text-sm ${type === "number" ? "text-right" : ""}`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

function ReportField({
  label,
  value,
  className = "",
}: {
  label: string;
  value: string | number;
  className?: string;
}) {
  const hasValue = value !== "" && value !== null && value !== undefined;

  return (
    <div className={`report-field ${className}`.trim()}>
      <span className="report-field-label">{label}</span>
      <strong className="report-field-value">{hasValue ? value : "-"}</strong>
    </div>
  );
}

function CellInput({
  value,
  onChange,
  type = "text",
  className = "",
}: {
  value: string | number;
  onChange: (value: string) => void;
  type?: string;
  className?: string;
}) {
  return (
    <input
      type={type}
      step="any"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`cell-input rounded border bg-white px-1.5 py-1 text-xs ${type === "number" ? "text-right" : ""} ${className}`}
    />
  );
}

function TaxCell({
  pctValue,
  amount,
  onChange,
}: {
  pctValue: string | number;
  amount: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="tax-cell">
      <div className="tax-input-row no-print">
        <span className="tax-prefix">%</span>
        <CellInput type="number" value={pctValue} onChange={onChange} className="tax-input" />
      </div>
      <div className="tax-amount no-print">$ {amount}</div>
      <div className="print-only print-tax-cell">
        <span className="print-tax-pct">% {pctValue || 0}</span>
        <span className="print-tax-amount">$ {amount}</span>
      </div>
    </div>
  );
}

function Th({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <th className={`table-head-cell whitespace-nowrap border px-2 py-2 ${className}`}>{children}</th>;
}

function Td({
  children,
  colSpan,
  className = "",
}: {
  children?: React.ReactNode;
  colSpan?: number;
  className?: string;
}) {
  return (
    <td colSpan={colSpan} className={`table-body-cell whitespace-nowrap border px-2 py-2 ${className}`}>
      {children}
    </td>
  );
}

function Summary({ label, value, moneda }: { label: string; value: string; moneda: string }) {
  return (
    <div className="summary-row flex justify-between text-sm">
      <span className="summary-label text-slate-600">{label}</span>
      <span className="summary-value font-medium">
        {moneda} {value}
      </span>
    </div>
  );
}
