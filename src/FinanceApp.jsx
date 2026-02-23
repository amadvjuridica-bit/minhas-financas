import React, { useState, useEffect, useMemo, useRef } from "react";
import { auth, db } from "./firebase";
import { signOut } from "firebase/auth";

import {
  collection,
  addDoc,
  query,
  orderBy,
  updateDoc,
  doc,
  onSnapshot,
  deleteDoc,
  getDocs,
  where,
  limit,
} from "firebase/firestore";

import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend } from "recharts";

// ✅ Export
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

/* ===================== HELPERS ===================== */

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

const DEFAULT_CATEGORIES = [
  "Cartão",
  "Alimentação",
  "Mercado",
  "Transporte",
  "Moradia",
  "Contas",
  "Saúde",
  "Lazer",
  "Educação",
  "Outros",
];

const CARD_SUGGESTIONS = ["Nubank", "Inter", "C6", "Itaú", "Santander", "Banco do Brasil", "Caixa"];

function pad2(n) {
  return String(n).padStart(2, "0");
}
function daysInMonth(year, monthIndex0) {
  return new Date(year, monthIndex0 + 1, 0).getDate();
}
function safeDate(year, monthIndex0, day) {
  const dim = daysInMonth(year, monthIndex0);
  const d = Math.min(Math.max(1, day), dim);
  return new Date(year, monthIndex0, d);
}
function ymd(dateObj) {
  const y = dateObj.getFullYear();
  const m = pad2(dateObj.getMonth() + 1);
  const d = pad2(dateObj.getDate());
  return `${y}-${m}-${d}`;
}
function uid() {
  return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
}
function displayPersonName(p) {
  const s = (p || "").trim();
  return s ? s : "Meu";
}
function toVencBR(dueDateStr) {
  const d = new Date(dueDateStr);
  if (Number.isNaN(d.getTime())) return "—";
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`;
}
function toBRFromYMD(ymdStr) {
  const s = String(ymdStr || "").trim();
  if (!s) return "—";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return "—";
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`;
}
function toNumberSafe(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
function normalizeStr(s) {
  return String(s ?? "").trim().toLowerCase();
}
function compareValues(a, b, dir = "asc") {
  const aBlank = a === null || a === undefined || a === "" || a === "—";
  const bBlank = b === null || b === undefined || b === "" || b === "—";
  if (aBlank && bBlank) return 0;
  if (aBlank) return 1;
  if (bBlank) return -1;

  const aDate = a instanceof Date ? a : /^\d{4}-\d{2}-\d{2}/.test(String(a)) ? new Date(a) : null;
  const bDate = b instanceof Date ? b : /^\d{4}-\d{2}-\d{2}/.test(String(b)) ? new Date(b) : null;
  if (aDate && bDate && !Number.isNaN(aDate.getTime()) && !Number.isNaN(bDate.getTime())) {
    const diff = aDate.getTime() - bDate.getTime();
    return dir === "asc" ? diff : -diff;
  }

  const aNum = typeof a === "number" ? a : Number(String(a).replace(/[^\d.-]/g, ""));
  const bNum = typeof b === "number" ? b : Number(String(b).replace(/[^\d.-]/g, ""));
  if (Number.isFinite(aNum) && Number.isFinite(bNum)) {
    const diff = aNum - bNum;
    return dir === "asc" ? diff : -diff;
  }

  const diff = String(a).localeCompare(String(b), "pt-BR");
  return dir === "asc" ? diff : -diff;
}

async function handleLogout() {
  try {
    await signOut(auth);
  } catch (e) {
    console.error(e);
    alert("Não foi possível sair. Tente novamente.");
  }
}

function pctFmt(x) {
  if (x === null || x === undefined || !Number.isFinite(x)) return "—";
  return `${(x * 100).toFixed(1).replace(".", ",")}%`;
}
function deltaTone(delta) {
  if (!Number.isFinite(delta) || delta === 0) return { color: "#64748B" }; // cinza
  return delta > 0 ? { color: "#DC2626", fontWeight: 900 } : { color: "#1D4ED8", fontWeight: 900 };
}

/** ✅ parse de input BR: aceita "1234,56" ou "1.234,56" ou "1234.56" */
function parseBRLInput(raw) {
  const s0 = String(raw ?? "").trim();
  if (!s0) return { ok: false, value: 0 };
  const s = s0.replace(/\s/g, "");
  // se tem vírgula, considera vírgula como decimal e remove pontos de milhar
  if (s.includes(",")) {
    const cleaned = s.replace(/\./g, "").replace(",", ".");
    const n = Number(cleaned);
    if (!Number.isFinite(n)) return { ok: false, value: 0 };
    return { ok: true, value: Number(n.toFixed(2)) };
  }
  // sem vírgula: remove separadores estranhos, deixa ponto como decimal
  const cleaned = s.replace(/[^\d.-]/g, "");
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return { ok: false, value: 0 };
  return { ok: true, value: Number(n.toFixed(2)) };
}

/* ===================== CHART COLORS ===================== */

const CHART_COLORS = ["#1D4ED8", "#0EA5E9", "#16A34A", "#F59E0B", "#DC2626", "#7C3AED", "#0F766E", "#334155"];
function colorForIndex(i) {
  return CHART_COLORS[i % CHART_COLORS.length];
}

const TAB = {
  LANCAMENTOS: "lancamentos",
  CARTOES: "cartoes",
  GRAFICOS: "graficos",
  RESUMO: "resumo",
  RECORRENTES: "recorrentes",
  PESSOAS: "pessoas",
};

/* ===================== COMPONENTE ===================== */

export default function FinanceApp() {
  const user = auth.currentUser;
  const userEmail = user?.email || "";
  const userUid = user?.uid || "";

  const [items, setItems] = useState([]);

  const [activeTab, setActiveTab] = useState(TAB.LANCAMENTOS);

  const now = new Date();
  const [monthIndex, setMonthIndex] = useState(now.getMonth());
  const [year, setYear] = useState(now.getFullYear());

  const monthNames = useMemo(
    () => [
      "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
      "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
    ],
    []
  );

  const monthLabel = useMemo(() => monthNames[monthIndex], [monthIndex, monthNames]);

  const [isMobile, setIsMobile] = useState(false);
  const [sideOpen, setSideOpen] = useState(true);

  useEffect(() => {
    function onResize() {
      const mobile = window.innerWidth < 1100;
      setIsMobile(mobile);
      setSideOpen(!mobile);
    }
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const [onlyOpenInstallments, setOnlyOpenInstallments] = useState(false);

  // Form
  const [type, setType] = useState("expense");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("Cartão");
  const [note, setNote] = useState("");
  const [dueDay, setDueDay] = useState(10);

  // Cartão / pessoa
  const [isCardPurchase, setIsCardPurchase] = useState(false);
  const [cardName, setCardName] = useState("");
  const [personName, setPersonName] = useState("");

  // Parcelamento
  const [isInstallment, setIsInstallment] = useState(false);
  const [installments, setInstallments] = useState(2);
  const [installmentStartPaid, setInstallmentStartPaid] = useState(false);

  // Data compra
  const [purchaseDate, setPurchaseDate] = useState(() => ymd(new Date()));

  // Aba Cartões
  const [selectedCardTab, setSelectedCardTab] = useState("");
  const [personFilter, setPersonFilter] = useState("");

  // Gráficos
  const [selectedCategory, setSelectedCategory] = useState(null);

  // Sort
  const [sortLanc, setSortLanc] = useState({ key: "dueDate", dir: "asc" });
  const [sortCards, setSortCards] = useState({ key: "dueDate", dir: "asc" });

  const dueDatePreview = useMemo(
    () => safeDate(year, monthIndex, Number(dueDay)),
    [year, monthIndex, dueDay]
  );

  const daysOptions = useMemo(() => {
    const dim = daysInMonth(year, monthIndex);
    return Array.from({ length: dim }, (_, i) => i + 1);
  }, [year, monthIndex]);

  /* ===================== FIRESTORE REALTIME (transactions) ===================== */

  useEffect(() => {
    if (!userUid) return;
    const colRef = collection(db, "users", userUid, "transactions");
    const q = query(colRef, orderBy("dueDate", "asc"));

    const unsub = onSnapshot(
      q,
      (snap) => {
        const data = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setItems(data);
      },
      (err) => console.error("Firestore onSnapshot error:", err)
    );

    return () => unsub();
  }, [userUid]);

  /* ===================== PESSOAS (Cadastro) ===================== */

  const [people, setPeople] = useState([]);
  const [newPerson, setNewPerson] = useState("");

  useEffect(() => {
    if (!userUid) return;
    const colRef = collection(db, "users", userUid, "people");
    const q = query(colRef, orderBy("name", "asc"));

    const unsub = onSnapshot(
      q,
      (snap) => {
        const data = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setPeople(data);
      },
      (err) => console.error("People onSnapshot error:", err)
    );

    return () => unsub();
  }, [userUid]);

  async function addPerson() {
    const name = (newPerson || "").trim();
    if (!name) return;

    // evita duplicado simples
    const exists = people.some((p) => normalizeStr(p.name) === normalizeStr(name));
    if (exists) {
      alert("Essa pessoa já existe.");
      return;
    }

    await addDoc(collection(db, "users", userUid, "people"), {
      name,
      createdAt: new Date().toISOString(),
    });

    setNewPerson("");
  }

  async function removePerson(id) {
    await deleteDoc(doc(db, "users", userUid, "people", id));
  }

  const peopleSuggestions = useMemo(() => {
    const base = people.map((p) => (p.name || "").trim()).filter(Boolean);
    // mantém também o que já existe nos lançamentos
    const fromItems = items
      .map((it) => (it.personName || "").trim())
      .filter((x) => x);
    const s = new Set([...base, ...fromItems]);
    return Array.from(s).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [people, items]);

  /* ===================== RECORRENTES ===================== */

  const [recurrents, setRecurrents] = useState([]);
  const [recType, setRecType] = useState("expense");
  const [recAmount, setRecAmount] = useState("");
  const [recCategory, setRecCategory] = useState("Contas");
  const [recNote, setRecNote] = useState("");
  const [recDueDay, setRecDueDay] = useState(10);
  const [recIsCard, setRecIsCard] = useState(false);
  const [recCardName, setRecCardName] = useState("");
  const [recPersonName, setRecPersonName] = useState("");

  useEffect(() => {
    if (!userUid) return;
    const colRef = collection(db, "users", userUid, "recurrents");
    const q = query(colRef, orderBy("dueDay", "asc"));

    const unsub = onSnapshot(
      q,
      (snap) => {
        const data = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setRecurrents(data);
      },
      (err) => console.error("Recurrents onSnapshot error:", err)
    );

    return () => unsub();
  }, [userUid]);

  async function addRecurrent(e) {
    e?.preventDefault?.();

    // ✅ Agora pode cadastrar vazio/zerado (rascunho)
    const raw = String(recAmount ?? "").trim();
    const amountValue = raw === "" ? 0 : Number(Number(raw.replace(",", ".")).toFixed(2));

    // Se digitou algo, valida; se deixou vazio, segue como 0
    if (raw !== "" && (!Number.isFinite(amountValue) || amountValue <= 0)) {
      alert("Informe um valor válido.");
      return;
    }

    const cName = recIsCard ? (recCardName || "").trim() : "";
    if (recIsCard && !cName) {
      alert("Digite o banco do cartão.");
      return;
    }

    await addDoc(collection(db, "users", userUid, "recurrents"), {
      type: recType,
      amount: amountValue, // ✅ pode ser 0 (rascunho)
      category: recCategory,
      note: recNote?.trim() || "",
      dueDay: Number(recDueDay),
      isCardPurchase: Boolean(recIsCard),
      cardName: cName,
      personName: (recPersonName || "").trim(),
      active: true,
      createdAt: new Date().toISOString(),
    });

    setRecAmount("");
    setRecNote("");
    setRecDueDay(10);
    setRecIsCard(false);
    setRecCardName("");
    setRecPersonName("");
  }

  async function toggleRecurrentActive(id, current) {
    await updateDoc(doc(db, "users", userUid, "recurrents", id), { active: !current });
  }

  async function removeRecurrent(id) {
    await deleteDoc(doc(db, "users", userUid, "recurrents", id));
  }

  async function addDocItem(payload) {
    if (!userUid) return;
    const colRef = collection(db, "users", userUid, "transactions");
    await addDoc(colRef, payload);
  }

  // ✅ Sincroniza recorrentes para o mês atual (cria rascunho mesmo com valor 0)
  async function syncRecurrentsForThisMonth({ silent = false } = {}) {
    if (!userUid) return 0;

    const baseDueDate = (dueDayNum) => ymd(safeDate(year, monthIndex, Number(dueDayNum)));

    // Para não duplicar: se já existir transaction com recurrentId + dueDate do mês atual, não cria
    const txCol = collection(db, "users", userUid, "transactions");

    let created = 0;

    for (const r of recurrents) {
      if (!r.active) continue;

      const dueDateStr = baseDueDate(r.dueDay);
      const recurrentId = r.id;

      // checa se já existe
      const qx = query(
        txCol,
        where("recurrentId", "==", recurrentId),
        where("dueDate", "==", dueDateStr),
        limit(1)
      );
      const snap = await getDocs(qx);
      if (!snap.empty) continue;

      await addDocItem({
        type: r.type,
        amount: Number(Number(r.amount || 0).toFixed(2)), // ✅ mesmo que seja 0
        category: r.category || "Outros",
        note: r.note || "",
        dueDate: dueDateStr,
        paid: false,
        installment: null,
        createdAt: new Date().toISOString(),
        userEmail,
        isCardPurchase: Boolean(r.isCardPurchase),
        cardName: (r.cardName || "").trim(),
        personName: (r.personName || "").trim(),
        purchaseDate: null,
        recurrentId,
      });

      created += 1;
    }

    if (!silent) {
      alert(created > 0 ? `Recorrentes sincronizados: ${created}` : "Nada para sincronizar (já estava tudo criado).");
    }

    return created;
  }

  // ✅ Auto-sincroniza ao trocar mês/ano (para “aparecer em todos os meses”)
  const lastAutoSyncKeyRef = useRef("");
  const autoSyncingRef = useRef(false);

  useEffect(() => {
    if (!userUid) return;
    if (!Array.isArray(recurrents)) return;

    const key = `${userUid}__${year}__${monthIndex}__${recurrents.length}`;
    if (lastAutoSyncKeyRef.current === key) return;
    if (autoSyncingRef.current) return;

    // Só tenta se já carregou recorrentes (mesmo que 0, ok — não cria nada)
    autoSyncingRef.current = true;

    (async () => {
      try {
        await syncRecurrentsForThisMonth({ silent: true });
        lastAutoSyncKeyRef.current = key;
      } catch (e) {
        console.error("Auto-sync recorrentes erro:", e);
      } finally {
        autoSyncingRef.current = false;
      }
    })();
  }, [userUid, year, monthIndex, recurrents]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ===================== FILTROS BASE ===================== */

  const itemsThisMonthBase = useMemo(() => {
    return items.filter((it) => {
      const d = new Date(it.dueDate);
      return d.getFullYear() === year && d.getMonth() === monthIndex;
    });
  }, [items, year, monthIndex]);

  const itemsThisMonth = useMemo(() => {
    let list = [...itemsThisMonthBase].sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));
    if (onlyOpenInstallments) list = list.filter((it) => it.installment && !it.paid);
    return list;
  }, [itemsThisMonthBase, onlyOpenInstallments]);

  const totals = useMemo(() => {
    let income = 0;
    let expense = 0;
    for (const it of itemsThisMonthBase) {
      const val = Number(it.amount || 0);
      if (it.type === "income") income += val;
      else expense += val;
    }
    return { income, expense, balance: income - expense };
  }, [itemsThisMonthBase]);

  const paidOpenStats = useMemo(() => {
    const expenses = itemsThisMonthBase.filter((x) => x.type === "expense");
    const paid = expenses.filter((x) => !!x.paid).length;
    const open = expenses.filter((x) => !x.paid).length;
    return { paid, open, total: expenses.length };
  }, [itemsThisMonthBase]);

  /* ===================== RESUMO: HISTÓRICO ANUAL ===================== */

  const annualHistory = useMemo(() => {
    function sumMonthExpenses(targetYear, targetMonth0) {
      let totalExpense = 0;
      let ownerExpense = 0;

      for (const it of items) {
        const d = new Date(it.dueDate);
        if (Number.isNaN(d.getTime())) continue;
        if (d.getFullYear() !== targetYear || d.getMonth() !== targetMonth0) continue;
        if (it.type !== "expense") continue;

        const v = Number(it.amount || 0);
        totalExpense += v;

        const isCard = !!it.isCardPurchase;
        const p = (it.personName || "").trim();
        const isOwner = !isCard ? true : p === "";
        if (isOwner) ownerExpense += v;
      }

      return {
        totalExpense: Number(totalExpense.toFixed(2)),
        ownerExpense: Number(ownerExpense.toFixed(2)),
      };
    }

    const rows = [];
    let prev = sumMonthExpenses(year - 1, 11);

    for (let m = 0; m < 12; m++) {
      const cur = sumMonthExpenses(year, m);

      const deltaTotal = Number((cur.totalExpense - prev.totalExpense).toFixed(2));
      const deltaOwner = Number((cur.ownerExpense - prev.ownerExpense).toFixed(2));

      const pctTotal = prev.totalExpense > 0 ? deltaTotal / prev.totalExpense : null;
      const pctOwner = prev.ownerExpense > 0 ? deltaOwner / prev.ownerExpense : null;

      rows.push({
        monthIndex: m,
        monthName: monthNames[m],
        totalExpense: cur.totalExpense,
        deltaTotal,
        pctTotal,
        ownerExpense: cur.ownerExpense,
        deltaOwner,
        pctOwner,
      });

      prev = cur;
    }

    return rows;
  }, [items, year, monthNames]);

  /* ===================== LANCAMENTOS: AGRUPAR CARTÃO + SOMAR ===================== */

  const groupedForLancamentos = useMemo(() => {
    const groups = new Map();
    const singles = [];

    for (const it of itemsThisMonth) {
      const isCard = !!it.isCardPurchase;
      if (!isCard) {
        singles.push({ __kind: "single", ...it });
        continue;
      }

      const c = (it.cardName || "").trim() || "—";
      const pDisplay = displayPersonName(it.personName);
      const t = it.type || "expense";
      const key = `${c}__${pDisplay}__${t}`;

      if (!groups.has(key)) {
        groups.set(key, {
          __kind: "group",
          id: key,
          type: t,
          category: "Cartão",
          cardName: c,
          personDisplay: pDisplay,
          amount: 0,
          count: 0,
          paidAll: true,
          paidNone: true,
        });
      }

      const g = groups.get(key);
      const v = Number(it.amount || 0);
      g.amount += v;
      g.count += 1;

      if (it.paid) g.paidNone = false;
      else g.paidAll = false;
    }

    const grouped = Array.from(groups.values()).map((g) => ({ ...g, amount: Number(g.amount.toFixed(2)) }));
    return [...singles, ...grouped];
  }, [itemsThisMonth]);

  const sortedLancamentos = useMemo(() => {
    const { key, dir } = sortLanc;

    function getSortVal(row) {
      if (row.__kind === "single") {
        if (key === "dueDate") return row.dueDate || "";
        if (key === "note") return row.note || "";
        if (key === "type") return row.type === "income" ? "Receita" : "Despesa";
        if (key === "category") return row.category || "";
        if (key === "amount") return toNumberSafe(row.amount);
        if (key === "installment") return row.installment ? row.installment.index : "";
        if (key === "card") return row.isCardPurchase ? `${row.cardName || ""} • ${displayPersonName(row.personName)}` : "";
        if (key === "status") return row.type === "income" ? "" : row.paid ? "Pago" : "Em aberto";
        return row[key] ?? "";
      }

      if (key === "dueDate") return "";
      if (key === "note") return `${row.cardName} • ${row.personDisplay}`;
      if (key === "type") return row.type === "income" ? "Receita" : "Despesa";
      if (key === "category") return "Cartão";
      if (key === "amount") return toNumberSafe(row.amount);
      if (key === "installment") return "";
      if (key === "card") return `${row.cardName} • ${row.personDisplay}`;
      if (key === "status") return row.type === "income" ? "" : row.paidAll ? "Pago" : row.paidNone ? "Em aberto" : "Parcial";
      return row[key] ?? "";
    }

    return [...groupedForLancamentos].sort((a, b) => compareValues(getSortVal(a), getSortVal(b), dir));
  }, [groupedForLancamentos, sortLanc]);

  /* ===================== GRÁFICOS ===================== */

  const expensesThisMonth = useMemo(
    () => itemsThisMonthBase.filter((it) => it.type === "expense"),
    [itemsThisMonthBase]
  );

  const expenseByCategory = useMemo(() => {
    const map = new Map();
    for (const it of expensesThisMonth) {
      const key = it.category || "Outros";
      const val = Number(it.amount || 0);
      map.set(key, (map.get(key) || 0) + val);
    }
    return Array.from(map.entries())
      .map(([name, value]) => ({ name, value: Number(value.toFixed(2)) }))
      .sort((a, b) => b.value - a.value);
  }, [expensesThisMonth]);

  const paidOpenPie = useMemo(
    () => [{ name: "Pagas", value: paidOpenStats.paid }, { name: "Em aberto", value: paidOpenStats.open }],
    [paidOpenStats]
  );

  const allCardExpensesThisMonth = useMemo(
    () => itemsThisMonthBase.filter((it) => it.isCardPurchase && it.type === "expense"),
    [itemsThisMonthBase]
  );

  const expenseByCard = useMemo(() => {
    const map = new Map();
    for (const it of allCardExpensesThisMonth) {
      const c = (it.cardName || "").trim() || "—";
      map.set(c, (map.get(c) || 0) + Number(it.amount || 0));
    }
    return Array.from(map.entries())
      .map(([name, value]) => ({ name, value: Number(value.toFixed(2)) }))
      .sort((a, b) => b.value - a.value);
  }, [allCardExpensesThisMonth]);

  const expenseByPerson = useMemo(() => {
    const map = new Map();
    for (const it of allCardExpensesThisMonth) {
      const p = displayPersonName(it.personName);
      map.set(p, (map.get(p) || 0) + Number(it.amount || 0));
    }
    return Array.from(map.entries())
      .map(([name, value]) => ({ name, value: Number(value.toFixed(2)) }))
      .sort((a, b) => b.value - a.value);
  }, [allCardExpensesThisMonth]);

  const selectedCategoryItems = useMemo(() => {
    if (!selectedCategory) return [];
    return expensesThisMonth
      .filter((it) => (it.category || "Outros") === selectedCategory)
      .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));
  }, [expensesThisMonth, selectedCategory]);

  /* ===================== ACTIONS (transactions) ===================== */

  async function handleAdd(e) {
    e.preventDefault();

    const val = Number(String(amount).replace(",", "."));
    if (!val || val <= 0) {
      alert("Informe um valor válido.");
      return;
    }

    const baseDue = safeDate(year, monthIndex, Number(dueDay));

    const pName = (personName || "").trim();
    const cName = isCardPurchase ? (cardName || "").trim() : "";

    if (isCardPurchase && !cName) {
      alert("Digite o nome do banco do cartão (ex: Nubank, Inter, Itaú).");
      return;
    }

    const needsPurchaseDate = Boolean(isCardPurchase || isInstallment);
    const pDate = needsPurchaseDate ? String(purchaseDate || "").trim() : "";
    if (needsPurchaseDate && !pDate) {
      alert("Informe a data da compra.");
      return;
    }

    if (!isInstallment) {
      await addDocItem({
        type,
        amount: Number(val.toFixed(2)),
        category,
        note: note?.trim() || "",
        dueDate: ymd(baseDue),
        paid: false,
        installment: null,
        createdAt: new Date().toISOString(),
        userEmail,
        isCardPurchase: Boolean(isCardPurchase),
        cardName: cName,
        personName: pName,
        purchaseDate: needsPurchaseDate ? pDate : null,
        recurrentId: null,
      });
    } else {
      const total = Math.max(2, Math.min(48, Number(installments || 2)));
      const groupId = uid();
      const perInstallment = Number((val / total).toFixed(2));

      for (let i = 0; i < total; i++) {
        const d = safeDate(year, monthIndex + i, Number(dueDay));
        await addDocItem({
          type,
          amount: perInstallment,
          category,
          note: note?.trim() || "",
          dueDate: ymd(d),
          paid: i === 0 ? Boolean(installmentStartPaid) : false,
          installment: { groupId, index: i + 1, total },
          createdAt: new Date().toISOString(),
          userEmail,
          isCardPurchase: Boolean(isCardPurchase),
          cardName: cName,
          personName: pName,
          purchaseDate: pDate || null,
          recurrentId: null,
        });
      }
    }

    setAmount("");
    setNote("");
    setIsInstallment(false);
    setInstallments(2);
    setInstallmentStartPaid(false);

    setIsCardPurchase(false);
    setCardName("");
    setPersonName("");
  }

  async function togglePaid(itemId, currentPaid) {
    if (!userUid) return;
    const ref = doc(db, "users", userUid, "transactions", itemId);
    await updateDoc(ref, { paid: !currentPaid });
  }

  async function removeItem(itemId) {
    if (!userUid) return;
    const ref = doc(db, "users", userUid, "transactions", itemId);
    await deleteDoc(ref);
  }

  // ✅ Edição “rápida” inline do VALOR (clica no valor -> vira campo)
  const [editingAmountId, setEditingAmountId] = useState(null);
  const [editingAmountRaw, setEditingAmountRaw] = useState("");
  const [editingAmountBusy, setEditingAmountBusy] = useState(false);
  const editingAmountInputRef = useRef(null);

  useEffect(() => {
    if (!editingAmountId) return;
    // foco no input assim que abre
    const t = setTimeout(() => {
      try {
        editingAmountInputRef.current?.focus?.();
        editingAmountInputRef.current?.select?.();
      } catch (e) {
        // ignore
      }
    }, 0);
    return () => clearTimeout(t);
  }, [editingAmountId]);

  function startEditAmount(it) {
    if (!it?.id) return;
    // se já está editando outro, troca
    setEditingAmountId(it.id);
    // mostra no padrão BR (com vírgula) pra digitar rápido
    const cur = Number(it.amount || 0);
    const raw = String(cur.toFixed(2)).replace(".", ",");
    setEditingAmountRaw(raw);
  }

  function cancelEditAmount() {
    setEditingAmountId(null);
    setEditingAmountRaw("");
  }

  async function commitEditAmount(it) {
    if (!userUid) return;
    if (!it?.id) return;
    if (editingAmountBusy) return;

    const raw = String(editingAmountRaw ?? "").trim();
    // vazio = cancela (não altera)
    if (raw === "") {
      cancelEditAmount();
      return;
    }

    const parsed = parseBRLInput(raw);
    if (!parsed.ok || parsed.value < 0) {
      alert("Valor inválido. Ex.: 150,00");
      return;
    }

    // se não mudou, fecha
    const cur = Number(it.amount || 0);
    if (Number(cur.toFixed(2)) === Number(parsed.value.toFixed(2))) {
      cancelEditAmount();
      return;
    }

    setEditingAmountBusy(true);
    try {
      const ref = doc(db, "users", userUid, "transactions", it.id);
      await updateDoc(ref, { amount: Number(parsed.value.toFixed(2)) });
      cancelEditAmount();
    } catch (e) {
      console.error("Erro ao atualizar valor:", e);
      alert("Não foi possível salvar o valor. Abra o console (F12) para ver o motivo.");
    } finally {
      setEditingAmountBusy(false);
    }
  }

  async function markAllInstallmentsThisMonthPaid() {
    if (!userUid) return;
    const list = itemsThisMonthBase.filter((it) => it.installment && !it.paid);
    if (list.length === 0) return;
    await Promise.all(
      list.map((it) =>
        updateDoc(doc(db, "users", userUid, "transactions", it.id), { paid: true })
      )
    );
  }

  async function setGroupPaidByCardPerson({ cardName, personDisplay, paid }) {
    if (!userUid) return;

    const c = (cardName || "").trim();
    const p = (personDisplay || "").trim();

    const groupItems = itemsThisMonthBase.filter((it) => {
      if (!it.isCardPurchase) return false;
      if (((it.cardName || "").trim()) !== c) return false;

      const itPerson = (it.personName || "").trim();
      if (p === "Meu") return itPerson === "";
      return itPerson === p;
    });

    if (groupItems.length === 0) return;

    await Promise.all(
      groupItems.map((it) =>
        updateDoc(doc(db, "users", userUid, "transactions", it.id), { paid: !!paid })
      )
    );
  }

  /* ===================== ABA CARTOES ===================== */

  const cardsFound = useMemo(() => {
    const s = new Set();
    for (const it of items) {
      if (it.isCardPurchase && (it.cardName || "").trim()) s.add(it.cardName.trim());
    }
    return Array.from(s).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [items]);

  const cardsSuggestions = useMemo(() => {
    const s = new Set([...(CARD_SUGGESTIONS || [])]);
    for (const c of cardsFound) s.add(c);
    return Array.from(s).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [cardsFound]);

  useEffect(() => {
    if (activeTab !== TAB.CARTOES) return;
    if (!selectedCardTab && cardsFound.length > 0) setSelectedCardTab(cardsFound[0]);
  }, [activeTab, selectedCardTab, cardsFound]);

  const cardItemsThisMonthBase = useMemo(() => {
    if (!selectedCardTab) return [];
    let list = itemsThisMonthBase.filter(
      (it) => it.isCardPurchase && (it.cardName || "").trim() === selectedCardTab
    );

    const pfRaw = normalizeStr(personFilter);
    if (pfRaw) {
      if (pfRaw === "meu") list = list.filter((it) => !(it.personName || "").trim());
      else list = list.filter((it) => normalizeStr(it.personName).includes(pfRaw));
    }

    return list;
  }, [itemsThisMonthBase, selectedCardTab, personFilter]);

  const cardItemsThisMonth = useMemo(() => {
    const { key, dir } = sortCards;

    function getSortVal(row) {
      if (key === "dueDate") return row.dueDate || "";
      if (key === "purchaseDate") return row.purchaseDate || "";
      if (key === "note") return row.note || "";
      if (key === "amount") return toNumberSafe(row.amount);
      if (key === "installment") return row.installment ? row.installment.index : "";
      if (key === "person") return displayPersonName(row.personName);
      if (key === "status") return row.paid ? "Pago" : "Em aberto";
      return row[key] ?? "";
    }

    return [...cardItemsThisMonthBase].sort((a, b) => compareValues(getSortVal(a), getSortVal(b), dir));
  }, [cardItemsThisMonthBase, sortCards]);

  const cardDueDayByCard = useMemo(() => {
    const map = new Map();
    for (const it of itemsThisMonthBase) {
      if (!it.isCardPurchase) continue;
      const c = (it.cardName || "").trim();
      if (!c) continue;

      const d = new Date(it.dueDate);
      if (Number.isNaN(d.getTime())) continue;

      const day = d.getDate();
      if (!map.has(c)) map.set(c, new Map());
      const inner = map.get(c);
      inner.set(day, (inner.get(day) || 0) + 1);
    }

    const result = new Map();
    for (const [c, inner] of map.entries()) {
      let bestDay = null;
      let bestCount = -1;
      for (const [day, count] of inner.entries()) {
        if (count > bestCount) {
          bestCount = count;
          bestDay = day;
        }
      }
      if (bestDay != null) result.set(c, bestDay);
    }
    return result;
  }, [itemsThisMonthBase]);

  const selectedCardDueDay = useMemo(() => {
    if (!selectedCardTab) return null;
    return cardDueDayByCard.get(selectedCardTab) ?? null;
  }, [selectedCardTab, cardDueDayByCard]);

  const cardInvoiceTotals = useMemo(() => {
    let total = 0;
    let paid = 0;
    let open = 0;
    for (const it of cardItemsThisMonthBase) {
      if (it.type !== "expense") continue;
      const v = Number(it.amount || 0);
      total += v;
      if (it.paid) paid += v;
      else open += v;
    }
    return { total: Number(total.toFixed(2)), paid: Number(paid.toFixed(2)), open: Number(open.toFixed(2)) };
  }, [cardItemsThisMonthBase]);

  const allCardsTotals = useMemo(() => {
    let total = 0;
    let paid = 0;
    let open = 0;

    for (const it of allCardExpensesThisMonth) {
      const v = Number(it.amount || 0);
      total += v;
      if (it.paid) paid += v;
      else open += v;
    }

    return {
      total: Number(total.toFixed(2)),
      paid: Number(paid.toFixed(2)),
      open: Number(open.toFixed(2)),
    };
  }, [allCardExpensesThisMonth]);

  const allCardsTotalsByPerson = useMemo(() => {
    const map = new Map();
    for (const it of allCardExpensesThisMonth) {
      const p = displayPersonName(it.personName);
      const v = Number(it.amount || 0);
      map.set(p, (map.get(p) || 0) + v);
    }

    return Array.from(map.entries())
      .map(([person, value]) => ({ person, value: Number(value.toFixed(2)) }))
      .sort((a, b) => b.value - a.value);
  }, [allCardExpensesThisMonth]);

  const allCardsTotalsByCardMap = useMemo(() => {
    const map = new Map();
    for (const it of allCardExpensesThisMonth) {
      const c = (it.cardName || "").trim() || "—";
      const v = Number(it.amount || 0);
      map.set(c, (map.get(c) || 0) + v);
    }
    return map;
  }, [allCardExpensesThisMonth]);

  const selectedCardTotalsByPerson = useMemo(() => {
    const map = new Map();
    for (const it of cardItemsThisMonthBase) {
      if (it.type !== "expense") continue;
      const p = displayPersonName(it.personName);
      const v = Number(it.amount || 0);
      map.set(p, (map.get(p) || 0) + v);
    }

    return Array.from(map.entries())
      .map(([person, value]) => ({ person, value: Number(value.toFixed(2)) }))
      .sort((a, b) => b.value - a.value);
  }, [cardItemsThisMonthBase]);

  /* ===================== EXPORT ===================== */

  function downloadXLSX(rows, filenameBase) {
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Dados");
    XLSX.writeFile(wb, `${filenameBase}.xlsx`);
  }

  function downloadPDF({ title, subtitle, columns, body, filenameBase }) {
    try {
      const pdf = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
      const pageWidth = pdf.internal.pageSize.getWidth();

      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(14);
      pdf.text(title, 40, 34);

      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(10);
      pdf.text(subtitle, 40, 52);

      autoTable(pdf, {
        head: [columns],
        body,
        startY: 66,
        theme: "grid",
        tableWidth: pageWidth - 80,
        styles: {
          font: "helvetica",
          fontSize: 8.5,
          cellPadding: 4,
          overflow: "linebreak",
          valign: "middle",
        },
        headStyles: {
          fillColor: [246, 248, 252],
          textColor: [30, 41, 59],
          fontStyle: "bold",
        },
        alternateRowStyles: { fillColor: [251, 252, 255] },
        margin: { left: 40, right: 40 },
      });

      pdf.save(`${filenameBase}.pdf`);
    } catch (err) {
      console.error("Erro ao gerar PDF:", err);
      alert("Erro ao gerar PDF. Abra o console (F12) para ver o motivo.");
    }
  }

  function exportLancamentosXLSX() {
    const rows = sortedLancamentos.map((it) => {
      const isSingle = it.__kind === "single";
      const venc = isSingle ? toVencBR(it.dueDate) : "—";
      const tipo = (isSingle ? it.type : it.type) === "income" ? "Receita" : "Despesa";
      const cat = isSingle ? (it.category || "—") : "Cartão";
      const valor = toNumberSafe(it.amount);
      const parcela = isSingle ? (it.installment ? `${it.installment.index}/${it.installment.total}` : "—") : "—";
      const cartao = isSingle
        ? (it.isCardPurchase ? `${(it.cardName || "").trim() || "—"} • ${displayPersonName(it.personName)}` : "—")
        : `${it.cardName} • ${it.personDisplay} (${it.count} itens)`;

      const status =
        tipo === "Receita"
          ? "—"
          : isSingle
            ? (it.paid ? "Pago" : "Em aberto")
            : it.paidAll
              ? "Pago"
              : it.paidNone
                ? "Em aberto"
                : "Parcial";

      return {
        Vencimento: venc,
        Descricao: isSingle ? (it.note || "(sem descrição)") : `${it.cardName} • ${it.personDisplay} (${it.count} itens)`,
        Tipo: tipo,
        Categoria: cat,
        Valor: valor,
        Parcela: parcela,
        Cartao: cartao,
        Status: status,
      };
    });

    downloadXLSX(rows, `lancamentos_${year}-${pad2(monthIndex + 1)}`);
  }

  function exportLancamentosPDF() {
    const title = "Lançamentos do mês";
    const subtitle = `${monthLabel} / ${year}`;
    const columns = ["Venc.", "Descrição", "Tipo", "Cat.", "Valor", "Parc.", "Cartão", "Status"];
    const body = sortedLancamentos.map((it) => {
      const isSingle = it.__kind === "single";
      const venc = isSingle ? toVencBR(it.dueDate) : "—";
      const desc = isSingle ? (it.note || "(sem descrição)") : `${it.cardName} • ${it.personDisplay} (${it.count} itens)`;
      const tipo = (it.type === "income") ? "Receita" : "Despesa";
      const cat = isSingle ? (it.category || "—") : "Cartão";
      const valor = BRL.format(toNumberSafe(it.amount));
      const parc = isSingle ? (it.installment ? `${it.installment.index}/${it.installment.total}` : "—") : "—";
      const cartao = isSingle
        ? (it.isCardPurchase ? `${(it.cardName || "").trim() || "—"} • ${displayPersonName(it.personName)}` : "—")
        : `${it.cardName} • ${it.personDisplay}`;
      const status =
        tipo === "Receita"
          ? "—"
          : isSingle
            ? (it.paid ? "Pago" : "Em aberto")
            : it.paidAll
              ? "Pago"
              : it.paidNone
                ? "Em aberto"
                : "Parcial";

      return [venc, desc, tipo, cat, valor, parc, cartao, status];
    });

    downloadPDF({
      title,
      subtitle,
      columns,
      body,
      filenameBase: `lancamentos_${year}-${pad2(monthIndex + 1)}_A4`,
    });
  }

  function exportCartoesXLSX() {
    const rows = cardItemsThisMonth.map((it) => {
      const venc = toVencBR(it.dueDate);
      const compra = toBRFromYMD(it.purchaseDate);
      const desc = it.note || "(sem descrição)";
      const valor = toNumberSafe(it.amount);
      const parc = it.installment ? `${it.installment.index}/${it.installment.total}` : "—";
      const pessoa = displayPersonName(it.personName);
      const status = it.paid ? "Pago" : "Em aberto";

      return {
        Cartao: selectedCardTab,
        Vencimento: venc,
        Compra: compra,
        Descricao: desc,
        Valor: valor,
        Parcela: parc,
        Pessoa: pessoa,
        Status: status,
      };
    });

    downloadXLSX(rows, `cartao_${normalizeStr(selectedCardTab || "cartao")}_${year}-${pad2(monthIndex + 1)}`);
  }

  function exportCartoesPDF() {
    const title = `Cartão — ${selectedCardTab || ""}`;
    const subtitle = `${monthLabel} / ${year}${selectedCardDueDay ? ` • Venc. ${pad2(selectedCardDueDay)}` : ""}`;

    const columns = ["Venc.", "Compra", "Descrição", "Valor", "Parc.", "Pessoa", "Status"];
    const body = cardItemsThisMonth.map((it) => {
      const venc = toVencBR(it.dueDate);
      const compra = toBRFromYMD(it.purchaseDate);
      const desc = it.note || "(sem descrição)";
      const valor = BRL.format(toNumberSafe(it.amount));
      const parc = it.installment ? `${it.installment.index}/${it.installment.total}` : "—";
      const pessoa = displayPersonName(it.personName);
      const status = it.paid ? "Pago" : "Em aberto";
      return [venc, compra, desc, valor, parc, pessoa, status];
    });

    downloadPDF({
      title,
      subtitle,
      columns,
      body,
      filenameBase: `cartao_${normalizeStr(selectedCardTab || "cartao")}_${year}-${pad2(monthIndex + 1)}_A4`,
    });
  }

  /* ===================== UI HELPERS ===================== */

  function goTab(t) {
    setActiveTab(t);
    if (isMobile) setSideOpen(false);
  }

  function StatusPill({ kind, children }) {
    const cls =
      kind === "paid"
        ? "pill pill--paid"
        : kind === "open"
          ? "pill pill--open"
          : kind === "partial"
            ? "pill pill--partial"
            : "pill";
    return <span className={cls}>{children}</span>;
  }

  function ActionBtn({ icon, label, onClick, title, tone = "neutral" }) {
    const cls = tone === "danger" ? "act act--danger" : tone === "primary" ? "act act--primary" : "act";
    return (
      <button type="button" className={cls} onClick={onClick} title={title || label} aria-label={label}>
        <span className="act__icon">{icon}</span>
        {!isMobile && <span className="act__label">{label}</span>}
      </button>
    );
  }

  function SortHeader({ table, colKey, label, alignRight = false }) {
    const state = table === "lanc" ? sortLanc : sortCards;
    const active = state.key === colKey;
    const arrow = active ? (state.dir === "asc" ? "▲" : "▼") : "";

    function onClick() {
      if (table === "lanc") {
        setSortLanc((s) => (s.key === colKey ? { key: colKey, dir: s.dir === "asc" ? "desc" : "asc" } : { key: colKey, dir: "asc" }));
      } else {
        setSortCards((s) => (s.key === colKey ? { key: colKey, dir: s.dir === "asc" ? "desc" : "asc" } : { key: colKey, dir: "asc" }));
      }
    }

    return (
      <button
        type="button"
        className="thBtn"
        onClick={onClick}
        title="Ordenar"
        style={{ justifyContent: alignRight ? "flex-end" : "flex-start" }}
      >
        <span>{label}</span>
        <span className="thArrow">{arrow}</span>
      </button>
    );
  }

  const showPurchaseDateField = Boolean(isCardPurchase || isInstallment);

  /* ===================== UI ===================== */

  return (
    <div className="app">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');

        :root{
          --nav:#0F172A;
          --nav2:#101B33;
          --surface:#FFFFFF;
          --bg:#F3F5F8;
          --line:#D9DEE8;
          --line2:#E7EBF3;
          --text:#0B1B2B;
          --muted:#556679;
          --primary:#1D4ED8;
          --good:#16A34A;
          --warn:#F59E0B;
          --bad:#DC2626;

          --r:10px;
          --r2:12px;
          --shadow: 0 6px 16px rgba(15,23,42,.08);
          --shadow2: 0 2px 10px rgba(15,23,42,.06);
        }

        *{ box-sizing:border-box; }
        body{ font-family:Inter,system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif; }
        .app{
          min-height:100vh;
          padding:10px;
          background: var(--bg);
          color: var(--text);
          font-variant-numeric: tabular-nums;
        }

        .shell{ display:grid; gap:10px; align-items:start; }
        .main{ min-height: calc(100vh - 20px); }

        .sidebar{
          background: linear-gradient(180deg, var(--nav), var(--nav2));
          border:1px solid rgba(255,255,255,.10);
          border-radius: var(--r2);
          padding:8px;
          height: calc(100vh - 20px);
          box-shadow: var(--shadow);
          display:grid;
          grid-auto-rows: min-content;
          gap:8px;
          overflow:hidden;
        }

        .brandRow{
          display:flex; align-items:center; justify-content:space-between; gap:8px;
          padding-bottom:6px;
          border-bottom:1px solid rgba(255,255,255,.10);
        }
        .brandLeft{ display:flex; align-items:center; gap:8px; min-width:0; }
        .brandMark{
          width:8px; height:8px; border-radius:2px;
          background: var(--primary);
          box-shadow: 0 0 0 3px rgba(29,78,216,.16);
          flex:0 0 auto;
        }
        .brandTitle{
          font-size:12px;
          font-weight:900;
          color:#E7ECF5;
          white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
          line-height: 1.1;
        }
        .brandSub{
          margin-top:1px;
          font-size:10px;
          font-weight:600;
          color: rgba(231,236,245,.70);
          line-height: 1.1;
        }
        .iconBtn{
          height:28px; width:28px;
          border-radius:8px;
          border:1px solid rgba(255,255,255,.14);
          background: rgba(255,255,255,.06);
          color:#E7ECF5;
          cursor:pointer;
          font-weight:900;
        }

        .sideLabel{
          font-size:10px;
          font-weight:900;
          color: rgba(231,236,245,.75);
          text-transform:uppercase;
          letter-spacing:.35px;
          margin: 2px 2px 0 2px;
        }

        .sideRow2{ display:grid; grid-template-columns: 1fr .9fr; gap:6px; }
        .sideSelect{
          height:32px;
          border-radius:8px;
          border:1px solid rgba(255,255,255,.14);
          background: rgba(11,18,32,.78);
          color:#E7ECF5;
          font-size:11px;
          padding:0 9px;
          outline:none;
        }

        .sideCheck{
          display:flex; align-items:center; gap:8px;
          color:#E7ECF5;
          font-size:11px;
          font-weight:600;
          padding: 4px 2px;
        }

        .navList{ display:grid; gap:6px; }
        .navBtn, .navBtnActive{
          height:32px;
          border-radius:8px;
          border:1px solid rgba(255,255,255,.12);
          background: rgba(255,255,255,.04);
          color:#E7ECF5;
          font-weight:900;
          cursor:pointer;
          text-align:left;
          padding:0 10px;
          font-size:11px;
          display:flex;
          align-items:center;
          justify-content:space-between;
          gap:8px;
        }
        .navBtnActive{
          border-color: rgba(29,78,216,.55);
          background: rgba(29,78,216,.18);
        }

        .sideFooter{
          margin-top:auto;
          border-top:1px solid rgba(255,255,255,.10);
          padding-top:8px;
          display:grid;
          gap:6px;
          color:#E7ECF5;
        }
        .mutedSmall{ font-size:10px; color: rgba(231,236,245,.70); font-weight:600; }

        .btnGhost{
          height:30px;
          border-radius:8px;
          border:1px solid rgba(255,255,255,.14);
          background: rgba(255,255,255,.06);
          color:#E7ECF5;
          font-weight:900;
          cursor:pointer;
          font-size:11px;
        }

        .topbar{
          background: var(--surface);
          border:1px solid var(--line);
          border-radius: var(--r2);
          padding:10px 12px;
          display:flex;
          align-items:center;
          justify-content:space-between;
          gap:12px;
          box-shadow: var(--shadow2);
          margin-bottom: 10px;
        }
        .topLeft{ display:flex; align-items:center; gap:10px; }
        .hamb{
          height:34px; width:44px;
          border-radius:8px;
          border:1px solid var(--line);
          background:#fff;
          cursor:pointer;
          font-weight:900;
        }
        .title{ font-size:14px; font-weight:900; }
        .subtitle{ margin-top:2px; font-size:11px; font-weight:600; color: var(--muted); }
        .topActions{ display:flex; gap:8px; flex-wrap:wrap; justify-content:flex-end; align-items:center; }

        .btn{
          height:34px;
          padding:0 12px;
          border-radius:8px;
          border:1px solid var(--line);
          background:#fff;
          color: var(--text);
          font-weight:900;
          cursor:pointer;
          font-size:12px;
        }
        .btnPrimary{
          height:36px;
          padding:0 14px;
          border-radius:8px;
          border:1px solid rgba(0,0,0,.10);
          background: var(--primary);
          color:#fff;
          font-weight:900;
          cursor:pointer;
          font-size:12px;
        }

        .kpis{
          display:grid;
          gap:10px;
          margin-bottom:10px;
        }
        .kpi{
          background: var(--surface);
          border:1px solid var(--line);
          border-radius: var(--r2);
          padding:12px;
          display:grid;
          gap:6px;
          box-shadow: var(--shadow2);
        }
        .kpiLabel{
          font-size:10px;
          font-weight:900;
          color: var(--muted);
          text-transform:uppercase;
          letter-spacing:.35px;
        }
        .kpiValue{
          font-size:18px;
          font-weight:900;
        }

        .card{
          background: var(--surface);
          border:1px solid var(--line);
          border-radius: var(--r2);
          padding:12px;
          box-shadow: var(--shadow2);
          margin-bottom:10px;
        }
        .cardHead{
          display:flex;
          align-items:flex-end;
          justify-content:space-between;
          gap:12px;
          margin-bottom:10px;
        }
        .cardTitle{ font-size:13px; font-weight:900; }
        .cardSub{ font-size:11px; font-weight:600; color: var(--muted); margin-top:3px; }
        .helpLine{
          font-size:11px;
          color: var(--muted);
          font-weight:600;
          margin-top:6px;
        }

        .form{ display:grid; gap:10px; }
        .grid{ display:grid; gap:10px; }
        .field{ display:grid; gap:6px; }
        .label{
          font-size:10px;
          font-weight:900;
          color: var(--muted);
          text-transform:uppercase;
          letter-spacing:.35px;
        }
        .input, .select{
          height:36px;
          border-radius:8px;
          border:1px solid var(--line);
          padding:0 10px;
          outline:none;
          font-size:12px;
          background:#fff;
          width:100%;
        }
        .hint{ font-size:11px; color: var(--muted); font-weight:600; }

        .box{
          border:1px solid var(--line2);
          border-radius: var(--r2);
          padding:10px;
          background: #FAFBFD;
          display:grid;
          gap:10px;
        }
        .checkRow{
          display:flex; align-items:center; gap:10px;
          font-size:12px;
          font-weight:900;
        }

        .table{ display:grid; gap:6px; }
        .row{
          display:grid;
          align-items:center;
          gap:8px;
          padding:7px 8px;
          border:1px solid var(--line2);
          border-radius: 10px;
          background:#fff;
          font-size:12px;
        }
        .rowHeader{
          background: #F6F8FC;
          border-color: var(--line);
          font-weight:900;
          font-size:11px;
          color: #3F4E63;
        }
        .rowAlt{ background:#FBFCFF; }
        .row:hover{ border-color: #CBD5E1; }

        .clip{
          overflow:hidden;
          text-overflow:ellipsis;
          white-space:nowrap;
        }

        .pill{
          display:inline-flex;
          align-items:center;
          gap:8px;
          padding:7px 12px;
          border-radius:999px;
          font-size:12px;
          font-weight:900;
          border:1px solid rgba(15,23,42,.12);
          background:#fff;
          line-height: 1;
          min-width: 100px;
          justify-content: center;
          letter-spacing: .1px;
        }
        .pill:before{
          content:"";
          width:7px; height:7px;
          border-radius:99px;
          background:#94A3B8;
        }
        .pill--paid{ border-color: rgba(22,163,74,.18); background: rgba(22,163,74,.06); }
        .pill--paid:before{ background: var(--good); }
        .pill--open{ border-color: rgba(220,38,38,.14); background: rgba(220,38,38,.05); }
        .pill--open:before{ background: var(--bad); }
        .pill--partial{ border-color: rgba(245,158,11,.18); background: rgba(245,158,11,.06); }
        .pill--partial:before{ background: var(--warn); }

        .act{
          height:30px;
          border-radius:8px;
          border:1px solid var(--line);
          background:#fff;
          cursor:pointer;
          font-weight:900;
          font-size:11px;
          display:inline-flex;
          align-items:center;
          gap:8px;
          padding:0 10px;
        }
        .act__icon{ width:16px; text-align:center; }
        .act__label{ white-space:nowrap; }
        .act--primary{ border-color: rgba(29,78,216,.35); background: rgba(29,78,216,.06); }
        .act--danger{ border-color: rgba(220,38,38,.25); background: rgba(220,38,38,.05); }
        .act:hover{ border-color:#cbd5e1; }

        .pills{ display:flex; gap:8px; flex-wrap:wrap; margin-bottom:10px; }
        .pillBtn{
          height:30px;
          padding:0 12px;
          border-radius:999px;
          border:1px solid var(--line);
          background:#fff;
          cursor:pointer;
          font-weight:900;
          font-size:11px;
          display:inline-flex;
          align-items:center;
          gap:10px;
        }
        .pillBtnActive{
          border-color: rgba(29,78,216,.45);
          background: rgba(29,78,216,.08);
        }

        .empty{ color: var(--muted); padding:10px; font-weight:700; font-size:12px; }

        .statusActionsCell{
          display:flex;
          gap:10px;
          justify-content:flex-end;
          align-items:center;
          flex-wrap:nowrap;
          min-width: 0;
        }

        .thBtn{
          width:100%;
          display:flex;
          align-items:center;
          gap:8px;
          background:transparent;
          border:0;
          padding:0;
          cursor:pointer;
          font-weight:900;
          color:#3F4E63;
          text-align:left;
        }
        .thArrow{
          font-size:10px;
          opacity:.85;
        }

        .toolbar{
          display:flex;
          gap:8px;
          align-items:center;
          justify-content:flex-end;
          flex-wrap:wrap;
        }

        /* ✅ inline edit do valor */
        .amtCell{
          font-weight:900;
          display:flex;
          justify-content:flex-start;
          align-items:center;
          gap:8px;
          min-width: 0;
        }
        .amtClickable{
          cursor:pointer;
          border-radius:8px;
          padding:6px 8px;
          border:1px solid transparent;
          background: transparent;
          display:inline-flex;
          align-items:center;
          gap:8px;
        }
        .amtClickable:hover{
          border-color: rgba(29,78,216,.25);
          background: rgba(29,78,216,.05);
        }
        .amtInput{
          height:30px;
          border-radius:8px;
          border:1px solid rgba(29,78,216,.35);
          padding:0 10px;
          font-size:12px;
          width: 110px;
          outline:none;
          font-weight:900;
        }
        .amtHint{
          font-size:10px;
          color: var(--muted);
          font-weight:800;
          white-space:nowrap;
        }
      `}</style>

      <div className="shell" style={{ gridTemplateColumns: isMobile ? "1fr" : "250px 1fr" }}>
        {/* Sidebar */}
        <aside
          className="sidebar"
          style={{
            position: isMobile ? "fixed" : "sticky",
            top: 10,
            left: 10,
            zIndex: 50,
            transform: isMobile ? (sideOpen ? "translateX(0)" : "translateX(-110%)") : "none",
            width: isMobile ? "86vw" : "auto",
          }}
        >
          <div className="brandRow">
            <div className="brandLeft">
              <div className="brandMark" />
              <div style={{ display: "grid", gap: 1, minWidth: 0 }}>
                <div className="brandTitle">Minhas Finanças</div>
                <div className="brandSub">
                  {monthLabel} / {year}
                </div>
              </div>
            </div>

            <button type="button" className="iconBtn" onClick={() => setSideOpen((v) => !v)} title="Recolher/Expandir">
              {sideOpen ? "⟨" : "⟩"}
            </button>
          </div>

          <div className="sideLabel">Período</div>
          <div className="sideRow2">
            <select value={monthIndex} onChange={(e) => setMonthIndex(Number(e.target.value))} className="sideSelect">
              {monthNames.map((m, idx) => (
                <option key={m} value={idx}>{m}</option>
              ))}
            </select>

            <select value={year} onChange={(e) => setYear(Number(e.target.value))} className="sideSelect">
              {Array.from({ length: 11 }, (_, i) => now.getFullYear() - 5 + i).map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>

          <label className="sideCheck" title="Mostra apenas parcelas pendentes">
            <input
              type="checkbox"
              checked={onlyOpenInstallments}
              onChange={(e) => setOnlyOpenInstallments(e.target.checked)}
            />
            <span>Só parcelas em aberto</span>
          </label>

          <div className="sideLabel">Navegação</div>
          <div className="navList">
            <button className={activeTab === TAB.LANCAMENTOS ? "navBtnActive" : "navBtn"} onClick={() => goTab(TAB.LANCAMENTOS)} type="button">
              <span>Lançamentos</span>
            </button>

            <button className={activeTab === TAB.CARTOES ? "navBtnActive" : "navBtn"} onClick={() => goTab(TAB.CARTOES)} type="button">
              <span>Cartões</span>
            </button>

            <button className={activeTab === TAB.GRAFICOS ? "navBtnActive" : "navBtn"} onClick={() => goTab(TAB.GRAFICOS)} type="button">
              <span>Gráficos</span>
            </button>

            <button className={activeTab === TAB.RESUMO ? "navBtnActive" : "navBtn"} onClick={() => goTab(TAB.RESUMO)} type="button">
              <span>Resumo</span>
            </button>

            <button className={activeTab === TAB.RECORRENTES ? "navBtnActive" : "navBtn"} onClick={() => goTab(TAB.RECORRENTES)} type="button">
              <span>Recorrentes</span>
            </button>

            <button className={activeTab === TAB.PESSOAS ? "navBtnActive" : "navBtn"} onClick={() => goTab(TAB.PESSOAS)} type="button">
              <span>Cadastro</span>
            </button>
          </div>

          <div className="sideFooter">
            <div style={{ fontWeight: 900, fontSize: 11 }}>Usuário</div>
            <div className="mutedSmall">{userEmail || "-"}</div>
            <button type="button" className="btnGhost" onClick={handleLogout}>
              Sair
            </button>
          </div>
        </aside>

        {isMobile && sideOpen && (
          <div
            onClick={() => setSideOpen(false)}
            style={{ position: "fixed", inset: 0, background: "rgba(15, 23, 42, 0.50)", zIndex: 40 }}
          />
        )}

        {/* Main */}
        <main className="main">
          <header className="topbar">
            <div className="topLeft">
              {isMobile && (
                <button type="button" className="hamb" onClick={() => setSideOpen(true)}>
                  ☰
                </button>
              )}
              <div>
                <div className="title">Painel Financeiro</div>
                <div className="subtitle">{monthLabel} / {year}</div>
              </div>
            </div>

            <div className="topActions">
              {activeTab === TAB.LANCAMENTOS && (
                <button type="button" className="btn" onClick={markAllInstallmentsThisMonthPaid}>
                  Marcar parcelas do mês como pagas
                </button>
              )}
              <button type="button" className="btn" onClick={handleLogout}>
                Sair
              </button>
            </div>
          </header>

          <section className="kpis" style={{ gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4, minmax(0, 1fr))" }}>
            <div className="kpi">
              <div className="kpiLabel">Receitas</div>
              <div className="kpiValue">{BRL.format(totals.income)}</div>
            </div>
            <div className="kpi">
              <div className="kpiLabel">Despesas</div>
              <div className="kpiValue">{BRL.format(totals.expense)}</div>
            </div>
            <div className="kpi">
              <div className="kpiLabel">Saldo</div>
              <div className="kpiValue">{BRL.format(totals.balance)}</div>
            </div>
            <div className="kpi">
              <div className="kpiLabel">Pagas / Em aberto</div>
              <div className="kpiValue">{paidOpenStats.paid} / {paidOpenStats.open}</div>
              <div className="cardSub">(despesas do mês)</div>
            </div>
          </section>

          {/* ===================== ABA LANCAMENTOS ===================== */}
          {activeTab === TAB.LANCAMENTOS && (
            <>
              <section className="card">
                <div className="cardHead">
                  <div>
                    <div className="cardTitle">Novo lançamento</div>
                    <div className="cardSub">Preencha e clique em “Adicionar”. Se for cartão/parcelado, marque abaixo.</div>
                  </div>
                </div>

                <form onSubmit={handleAdd} className="form">
                  <div className="grid" style={{ gridTemplateColumns: isMobile ? "1fr" : "repeat(5, minmax(0, 1fr))" }}>
                    <div className="field">
                      <label className="label">Tipo</label>
                      <select value={type} onChange={(e) => setType(e.target.value)} className="select">
                        <option value="expense">Despesa</option>
                        <option value="income">Receita</option>
                      </select>
                    </div>

                    <div className="field">
                      <label className="label">Valor (R$)</label>
                      <input
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        placeholder="Ex: 150,00"
                        className="input"
                        inputMode="decimal"
                        required
                      />
                    </div>

                    <div className="field">
                      <label className="label">Categoria</label>
                      <select value={category} onChange={(e) => setCategory(e.target.value)} className="select">
                        {DEFAULT_CATEGORIES.map((c) => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>
                    </div>

                    <div className="field">
                      <label className="label">Descrição</label>
                      <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ex: Mercado, OAB..." className="input" />
                    </div>

                    <div className="field">
                      <label className="label">Vencimento (dia)</label>
                      <select value={dueDay} onChange={(e) => setDueDay(Number(e.target.value))} className="select">
                        {daysOptions.map((d) => (
                          <option key={d} value={d}>{d}</option>
                        ))}
                      </select>
                      <div className="hint">
                        Venc.: {pad2(dueDatePreview.getDate())}/{pad2(dueDatePreview.getMonth() + 1)}/{dueDatePreview.getFullYear()}
                      </div>
                    </div>
                  </div>

                  <div className="box">
                    <label className="checkRow">
                      <input type="checkbox" checked={isCardPurchase} onChange={(e) => setIsCardPurchase(e.target.checked)} />
                      <span>Compra no cartão</span>
                    </label>

                    {isCardPurchase && (
                      <div className="grid" style={{ gridTemplateColumns: isMobile ? "1fr" : "repeat(2, minmax(0, 1fr))" }}>
                        <div className="field">
                          <label className="label">Banco do cartão</label>
                          <input
                            value={cardName}
                            onChange={(e) => setCardName(e.target.value)}
                            placeholder="Ex: Nubank, Inter, Itaú..."
                            className="input"
                            list="card-suggestions"
                            required
                          />
                          <datalist id="card-suggestions">
                            {cardsSuggestions.map((c) => (
                              <option key={c} value={c} />
                            ))}
                          </datalist>
                          <div className="hint">Cria/usa a subaba em “Cartões”.</div>
                        </div>

                        <div className="field">
                          <label className="label">Pessoa (opcional)</label>
                          <input
                            value={personName}
                            onChange={(e) => setPersonName(e.target.value)}
                            placeholder="Se vazio, é Meu"
                            className="input"
                            list="people-suggestions"
                          />
                          <datalist id="people-suggestions">
                            {peopleSuggestions.map((p) => (
                              <option key={p} value={p} />
                            ))}
                          </datalist>
                          <div className="hint">Vazio = “Meu”. Preencher = filtra por pessoa.</div>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="box">
                    <label className="checkRow">
                      <input type="checkbox" checked={isInstallment} onChange={(e) => setIsInstallment(e.target.checked)} />
                      <span>Compra parcelada</span>
                    </label>

                    {isInstallment && (
                      <div className="grid" style={{ gridTemplateColumns: isMobile ? "1fr" : "repeat(2, minmax(0, 1fr))" }}>
                        <div className="field">
                          <label className="label">Quantidade de parcelas</label>
                          <input type="number" min={2} max={48} value={installments} onChange={(e) => setInstallments(Number(e.target.value))} className="input" required />
                          <div className="hint">Ex.: 10 = 10 parcelas (mês atual + próximos).</div>
                        </div>

                        <div className="field">
                          <label className="label">1ª parcela já está paga?</label>
                          <label className="checkRow">
                            <input type="checkbox" checked={installmentStartPaid} onChange={(e) => setInstallmentStartPaid(e.target.checked)} />
                            <span>Sim</span>
                          </label>
                        </div>
                      </div>
                    )}

                    {showPurchaseDateField && (
                      <div className="grid" style={{ gridTemplateColumns: isMobile ? "1fr" : "minmax(220px, 320px) 1fr" }}>
                        <div className="field">
                          <label className="label">Data da compra</label>
                          <input type="date" value={purchaseDate} onChange={(e) => setPurchaseDate(e.target.value)} className="input" required />
                          <div className="hint">Vai aparecer como coluna “Compra” na aba Cartões.</div>
                        </div>
                        <div />
                      </div>
                    )}
                  </div>

                  <div style={{ display: "flex", justifyContent: "flex-end" }}>
                    <button type="submit" className="btnPrimary">Adicionar</button>
                  </div>
                </form>
              </section>

              <section className="card">
                <div className="cardHead">
                  <div>
                    <div className="cardTitle">Lançamentos do mês</div>
                    <div className="cardSub">Clique no cabeçalho para ordenar. Exporta Excel/PDF do mês filtrado.</div>
                    <div className="helpLine">
                      Dica: clique diretamente no <b>valor</b> para editar rápido (Enter salva, Esc cancela).
                    </div>
                  </div>

                  <div className="toolbar">
                    <button type="button" className="btn" onClick={exportLancamentosXLSX} title="Baixar Excel (.xlsx)">
                      Baixar Excel
                    </button>
                    <button type="button" className="btn" onClick={exportLancamentosPDF} title="Baixar PDF A4 (landscape)">
                      Baixar PDF (A4)
                    </button>
                  </div>
                </div>

                {sortedLancamentos.length === 0 ? (
                  <div className="empty">Nenhum lançamento neste mês (com os filtros atuais).</div>
                ) : (
                  <div className="table">
                    <div
                      className="row rowHeader"
                      style={{
                        gridTemplateColumns: isMobile
                          ? "92px 1fr 110px 230px"
                          : "92px 1.7fr 78px 95px 115px 70px 160px 260px",
                      }}
                    >
                      <SortHeader table="lanc" colKey="dueDate" label="Venc." />
                      <SortHeader table="lanc" colKey="note" label="Descrição" />
                      {isMobile ? null : <SortHeader table="lanc" colKey="type" label="Tipo" />}
                      {isMobile ? null : <SortHeader table="lanc" colKey="category" label="Cat." />}
                      <SortHeader table="lanc" colKey="amount" label="Valor" />
                      {isMobile ? null : <SortHeader table="lanc" colKey="installment" label="Parc." />}
                      {isMobile ? null : <SortHeader table="lanc" colKey="card" label="Cartão" />}
                      <div style={{ textAlign: "right" }}>
                        <SortHeader table="lanc" colKey="status" label="Status / Ações" alignRight />
                      </div>
                    </div>

                    {sortedLancamentos.map((it, idx) => {
                      const alt = idx % 2 === 1 ? "rowAlt" : "";

                      if (it.__kind === "single") {
                        const venc = toVencBR(it.dueDate);
                        const parcelaTxt = it.installment ? `${it.installment.index}/${it.installment.total}` : "—";
                        const cardTxt = it.isCardPurchase
                          ? `${(it.cardName || "").trim() || "—"} • ${displayPersonName(it.personName)}`
                          : "—";
                        const isIncome = it.type === "income";
                        const isEditingThis = editingAmountId === it.id;

                        return (
                          <div
                            key={it.id}
                            className={`row ${alt}`}
                            style={{
                              gridTemplateColumns: isMobile
                                ? "92px 1fr 110px 230px"
                                : "92px 1.7fr 78px 95px 115px 70px 160px 260px",
                            }}
                          >
                            <div>{venc}</div>
                            <div className="clip" style={{ fontWeight: 900 }} title={it.note || ""}>
                              {it.note || "(sem descrição)"}
                            </div>

                            {isMobile ? null : <div>{isIncome ? "Rec." : "Desp."}</div>}
                            {isMobile ? null : <div className="clip" title={it.category}>{it.category}</div>}

                            {/* ✅ valor clicável / editável inline */}
                            <div className="amtCell">
                              {isEditingThis ? (
                                <>
                                  <input
                                    ref={editingAmountInputRef}
                                    className="amtInput"
                                    value={editingAmountRaw}
                                    onChange={(e) => setEditingAmountRaw(e.target.value)}
                                    inputMode="decimal"
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter") commitEditAmount(it);
                                      if (e.key === "Escape") cancelEditAmount();
                                    }}
                                    onBlur={() => commitEditAmount(it)}
                                    disabled={editingAmountBusy}
                                    aria-label="Editar valor"
                                  />
                                  {!isMobile && <span className="amtHint">Enter salva • Esc cancela</span>}
                                </>
                              ) : (
                                <button
                                  type="button"
                                  className="amtClickable"
                                  title="Clique para editar o valor"
                                  onClick={() => startEditAmount(it)}
                                >
                                  <span>{BRL.format(Number(it.amount || 0))}</span>
                                </button>
                              )}
                            </div>

                            {isMobile ? null : <div>{parcelaTxt}</div>}
                            {isMobile ? null : <div className="clip" title={cardTxt}>{cardTxt}</div>}

                            <div className="statusActionsCell">
                              {isIncome ? (
                                <StatusPill>—</StatusPill>
                              ) : it.paid ? (
                                <StatusPill kind="paid">Pago</StatusPill>
                              ) : (
                                <StatusPill kind="open">Em aberto</StatusPill>
                              )}

                              {/* Mantive apenas ações essenciais (sem prompt) */}
                              {!isIncome &&
                                (it.paid ? (
                                  <ActionBtn icon="↺" label="Desfazer" title="Voltar para Em aberto" onClick={() => togglePaid(it.id, it.paid)} />
                                ) : (
                                  <ActionBtn icon="✓" label="Marcar pago" tone="primary" title="Marcar como Pago" onClick={() => togglePaid(it.id, it.paid)} />
                                ))}

                              <ActionBtn icon="🗑" label="Excluir" tone="danger" title="Excluir lançamento" onClick={() => removeItem(it.id)} />
                            </div>
                          </div>
                        );
                      }

                      const isIncomeGroup = it.type === "income";
                      const checked = !!it.paidAll;
                      const labelTxt = it.paidAll ? "Pago" : it.paidNone ? "Em aberto" : "Parcial";

                      return (
                        <div
                          key={it.id}
                          className={`row ${alt}`}
                          style={{
                            gridTemplateColumns: isMobile
                              ? "92px 1fr 110px 230px"
                              : "92px 1.7fr 78px 95px 115px 70px 160px 260px",
                          }}
                        >
                          <div style={{ color: "#556679", fontWeight: 900 }}>—</div>

                          <div className="clip" style={{ fontWeight: 900 }} title={`${it.cardName} • ${it.personDisplay}`}>
                            {it.cardName} • {it.personDisplay}{" "}
                            <span style={{ color: "#556679", fontWeight: 700 }}>({it.count} itens)</span>
                          </div>

                          {isMobile ? null : <div>{isIncomeGroup ? "Rec." : "Desp."}</div>}
                          {isMobile ? null : <div>Cartão</div>}

                          <div style={{ fontWeight: 900 }}>{BRL.format(Number(it.amount || 0))}</div>
                          {isMobile ? null : <div>—</div>}
                          {isMobile ? null : <div className="clip" title={`${it.cardName} • ${it.personDisplay}`}>{it.cardName} • {it.personDisplay}</div>}

                          <div className="statusActionsCell">
                            {isIncomeGroup ? (
                              <StatusPill>—</StatusPill>
                            ) : labelTxt === "Pago" ? (
                              <StatusPill kind="paid">Pago</StatusPill>
                            ) : labelTxt === "Parcial" ? (
                              <StatusPill kind="partial">Parcial</StatusPill>
                            ) : (
                              <StatusPill kind="open">Em aberto</StatusPill>
                            )}

                            {!isIncomeGroup &&
                              (checked ? (
                                <ActionBtn
                                  icon="↺"
                                  label="Desfazer"
                                  title="Voltar para Em aberto (grupo)"
                                  onClick={() =>
                                    setGroupPaidByCardPerson({
                                      cardName: it.cardName,
                                      personDisplay: it.personDisplay,
                                      paid: !checked,
                                    })
                                  }
                                />
                              ) : (
                                <ActionBtn
                                  icon="✓"
                                  label="Marcar pago"
                                  tone="primary"
                                  title="Marcar como Pago (grupo)"
                                  onClick={() =>
                                    setGroupPaidByCardPerson({
                                      cardName: it.cardName,
                                      personDisplay: it.personDisplay,
                                      paid: !checked,
                                    })
                                  }
                                />
                              ))}

                            <ActionBtn
                              icon="👁"
                              label="Detalhes"
                              tone="primary"
                              title="Ver itens detalhados na aba Cartões"
                              onClick={() => {
                                setSelectedCardTab(it.cardName);
                                setPersonFilter(it.personDisplay === "Meu" ? "meu" : it.personDisplay);
                                goTab(TAB.CARTOES);
                              }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            </>
          )}

          {/* ===================== ABA CARTOES ===================== */}
          {activeTab === TAB.CARTOES && (
            <>
              <section className="card">
                <div className="cardHead" style={{ alignItems: "flex-start" }}>
                  <div>
                    <div className="cardTitle">Cartões</div>
                    <div className="cardSub">Tabela do cartão mostra a coluna “Compra” + filtros por pessoa.</div>
                  </div>
                </div>

                <section
                  className="kpis"
                  style={{
                    gridTemplateColumns: isMobile ? "1fr" : "repeat(4, minmax(0, 1fr))",
                    marginTop: 10,
                  }}
                >
                  <div className="kpi">
                    <div className="kpiLabel">Cartões — Total geral (mês)</div>
                    <div className="kpiValue">{BRL.format(allCardsTotals.total)}</div>
                  </div>

                  <div className="kpi">
                    <div className="kpiLabel">Cartões — Em aberto</div>
                    <div className="kpiValue">{BRL.format(allCardsTotals.open)}</div>
                  </div>

                  <div className="kpi">
                    <div className="kpiLabel">Cartões — Pago</div>
                    <div className="kpiValue">{BRL.format(allCardsTotals.paid)}</div>
                  </div>

                  <div className="kpi">
                    <div className="kpiLabel">Despesa por pessoa</div>
                    <div style={{ display: "grid", gap: 4 }}>
                      {allCardsTotalsByPerson.map((r) => (
                        <div key={r.person} style={{ display: "flex", justifyContent: "space-between" }}>
                          <span style={{ fontWeight: 900 }}>{r.person}</span>
                          <span style={{ fontWeight: 900 }}>{BRL.format(r.value)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </section>

                {cardsFound.length === 0 ? (
                  <div className="empty">Nenhum cartão cadastrado ainda.</div>
                ) : (
                  <>
                    <div className="pills" style={{ marginTop: 10 }}>
                      {cardsFound.map((c) => {
                        const day = cardDueDayByCard.get(c) ?? null;
                        const totalCard = allCardsTotalsByCardMap.get(c) || 0;
                        const label = day ? `${c} (venc. ${pad2(day)})` : c;

                        return (
                          <button
                            key={c}
                            type="button"
                            onClick={() => setSelectedCardTab(c)}
                            className={selectedCardTab === c ? "pillBtn pillBtnActive" : "pillBtn"}
                            title="Selecionar cartão"
                          >
                            <span>{label}</span>
                            <span style={{ fontWeight: 900 }}>{BRL.format(totalCard)}</span>
                          </button>
                        );
                      })}
                    </div>

                    <section className="kpis" style={{ gridTemplateColumns: isMobile ? "1fr" : "repeat(3, minmax(0, 1fr))" }}>
                      <div className="kpi">
                        <div className="kpiLabel">
                          Fatura — Total{selectedCardDueDay ? ` (venc. ${pad2(selectedCardDueDay)})` : ""}
                        </div>
                        <div className="kpiValue">{BRL.format(cardInvoiceTotals.total)}</div>
                      </div>
                      <div className="kpi">
                        <div className="kpiLabel">Fatura — Em aberto</div>
                        <div className="kpiValue">{BRL.format(cardInvoiceTotals.open)}</div>
                      </div>
                      <div className="kpi">
                        <div className="kpiLabel">Fatura — Pago</div>
                        <div className="kpiValue">{BRL.format(cardInvoiceTotals.paid)}</div>
                      </div>
                    </section>

                    <div style={{ marginTop: 10 }}>
                      <div className="label">Filtrar por pessoa</div>
                      <input
                        value={personFilter}
                        onChange={(e) => setPersonFilter(e.target.value)}
                        placeholder='Digite o nome (ex: Matheus) ou "meu"'
                        className="input"
                      />
                      <div className="hint">
                        Dica: digite <b>meu</b> para compras onde a pessoa ficou vazia.
                      </div>
                    </div>
                  </>
                )}
              </section>

              <div className="card" style={{ marginTop: 10 }}>
                <div className="cardHead">
                  <div>
                    <div className="cardTitle">Totais por pessoa — {selectedCardTab}</div>
                    <div className="cardSub">Somatório das despesas deste cartão</div>
                  </div>
                </div>

                {selectedCardTotalsByPerson.length === 0 ? (
                  <div className="empty">Sem despesas neste cartão.</div>
                ) : (
                  <div className="table">
                    <div className="row rowHeader" style={{ gridTemplateColumns: "1fr 200px" }}>
                      <div>Pessoa</div>
                      <div style={{ textAlign: "right" }}>Total</div>
                    </div>

                    {selectedCardTotalsByPerson.map((r, idx) => {
                      const alt = idx % 2 === 1 ? "rowAlt" : "";
                      return (
                        <div key={r.person} className={`row ${alt}`} style={{ gridTemplateColumns: "1fr 200px" }}>
                          <div style={{ fontWeight: 900 }}>{r.person}</div>
                          <div style={{ textAlign: "right", fontWeight: 900 }}>
                            {BRL.format(r.value)}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {cardsFound.length > 0 && (
                <section className="card">
                  <div className="cardHead">
                    <div>
                      <div className="cardTitle">
                        Lançamentos do cartão — {selectedCardTab}
                        {selectedCardDueDay ? ` (venc. dia ${pad2(selectedCardDueDay)})` : ""}
                      </div>
                      <div className="cardSub">Item por item (inclui coluna “Compra”). Dica: clique no valor para editar.</div>
                    </div>

                    <div className="toolbar">
                      <button type="button" className="btn" onClick={exportCartoesXLSX} disabled={!selectedCardTab}>
                        Baixar Excel
                      </button>
                      <button type="button" className="btn" onClick={exportCartoesPDF} disabled={!selectedCardTab}>
                        Baixar PDF (A4)
                      </button>
                    </div>
                  </div>

                  {cardItemsThisMonth.length === 0 ? (
                    <div className="empty">Nenhuma compra registrada neste cartão (no mês filtrado).</div>
                  ) : (
                    <div className="table">
                      <div
                        className="row rowHeader"
                        style={{
                          gridTemplateColumns: isMobile
                            ? "120px 1fr 260px"
                            : "120px 110px 1.6fr 120px 90px 140px 300px",
                        }}
                      >
                        <SortHeader table="card" colKey="dueDate" label="Venc." />
                        {isMobile ? null : <SortHeader table="card" colKey="purchaseDate" label="Compra" />}
                        <SortHeader table="card" colKey="note" label="Descrição" />
                        <SortHeader table="card" colKey="amount" label="Valor" />
                        {isMobile ? null : <SortHeader table="card" colKey="installment" label="Parc." />}
                        {isMobile ? null : <SortHeader table="card" colKey="person" label="Pessoa" />}
                        <div style={{ textAlign: "right" }}>
                          <SortHeader table="card" colKey="status" label="Status / Ações" alignRight />
                        </div>
                      </div>

                      {cardItemsThisMonth.map((it, idx) => {
                        const venc = toVencBR(it.dueDate);
                        const compra = toBRFromYMD(it.purchaseDate);
                        const parcelaTxt = it.installment ? `${it.installment.index}/${it.installment.total}` : "—";
                        const pessoaTxt = displayPersonName(it.personName);
                        const alt = idx % 2 === 1 ? "rowAlt" : "";
                        const isEditingThis = editingAmountId === it.id;

                        return (
                          <div
                            key={it.id}
                            className={`row ${alt}`}
                            style={{
                              gridTemplateColumns: isMobile
                                ? "120px 1fr 260px"
                                : "120px 110px 1.6fr 120px 90px 140px 300px",
                            }}
                          >
                            <div>{venc}</div>

                            {isMobile ? null : (
                              <div className="clip" title={compra} style={{ color: "#556679", fontWeight: 800 }}>
                                {compra}
                              </div>
                            )}

                            <div className="clip" style={{ fontWeight: 900 }} title={it.note || ""}>
                              {it.note || "(sem descrição)"}
                            </div>

                            {/* ✅ valor clicável / editável inline */}
                            <div className="amtCell">
                              {isEditingThis ? (
                                <input
                                  ref={editingAmountInputRef}
                                  className="amtInput"
                                  value={editingAmountRaw}
                                  onChange={(e) => setEditingAmountRaw(e.target.value)}
                                  inputMode="decimal"
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") commitEditAmount(it);
                                    if (e.key === "Escape") cancelEditAmount();
                                  }}
                                  onBlur={() => commitEditAmount(it)}
                                  disabled={editingAmountBusy}
                                  aria-label="Editar valor"
                                />
                              ) : (
                                <button
                                  type="button"
                                  className="amtClickable"
                                  title="Clique para editar o valor"
                                  onClick={() => startEditAmount(it)}
                                >
                                  <span>{BRL.format(Number(it.amount || 0))}</span>
                                </button>
                              )}
                            </div>

                            {isMobile ? null : <div>{parcelaTxt}</div>}
                            {isMobile ? null : <div className="clip" title={pessoaTxt}>{pessoaTxt}</div>}

                            <div className="statusActionsCell">
                              {it.paid ? <span className="pill pill--paid">Pago</span> : <span className="pill pill--open">Em aberto</span>}

                              {it.paid ? (
                                <ActionBtn icon="↺" label="Desfazer" title="Voltar para Em aberto" onClick={() => togglePaid(it.id, it.paid)} />
                              ) : (
                                <ActionBtn icon="✓" label="Marcar pago" tone="primary" title="Marcar como Pago" onClick={() => togglePaid(it.id, it.paid)} />
                              )}

                              <ActionBtn icon="🗑" label="Excluir" tone="danger" title="Excluir" onClick={() => removeItem(it.id)} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </section>
              )}
            </>
          )}

          {/* ===================== ABA GRAFICOS (MELHORADA) ===================== */}
          {activeTab === TAB.GRAFICOS && (
            <>
              <section
                style={{
                  display: "grid",
                  gridTemplateColumns: isMobile ? "1fr" : "repeat(2, minmax(0, 1fr))",
                  gap: 10,
                  marginBottom: 10,
                }}
              >
                <div className="card">
                  <div className="cardHead">
                    <div>
                      <div className="cardTitle">Gastos por categoria</div>
                      <div className="cardSub">Base: despesas do mês (aba Lançamentos).</div>
                    </div>
                  </div>

                  {expenseByCategory.length === 0 ? (
                    <div className="empty">Sem despesas no mês.</div>
                  ) : (
                    <div style={{ width: "100%", height: 320 }}>
                      <ResponsiveContainer width="100%" height={320}>
                        <PieChart>
                          <Pie
                            data={expenseByCategory}
                            dataKey="value"
                            nameKey="name"
                            onClick={(data) => setSelectedCategory(data?.name || null)}
                            innerRadius={76}
                            outerRadius={118}
                          >
                            {expenseByCategory.map((_, idx) => (
                              <Cell key={idx} fill={colorForIndex(idx)} />
                            ))}
                          </Pie>
                          <Tooltip formatter={(v) => BRL.format(Number(v || 0))} />
                          <Legend />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </div>

                <div className="card">
                  <div className="cardHead">
                    <div>
                      <div className="cardTitle">Pagas x Em aberto</div>
                      <div className="cardSub">Distribuição das despesas do mês.</div>
                    </div>
                  </div>

                  {paidOpenStats.total === 0 ? (
                    <div className="empty">Sem despesas no mês.</div>
                  ) : (
                    <div style={{ width: "100%", height: 320 }}>
                      <ResponsiveContainer width="100%" height={320}>
                        <PieChart>
                          <Pie data={paidOpenPie} dataKey="value" nameKey="name" outerRadius={118}>
                            {paidOpenPie.map((_, idx) => (
                              <Cell key={idx} fill={colorForIndex(idx)} />
                            ))}
                          </Pie>
                          <Tooltip />
                          <Legend />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </div>

                <div className="card">
                  <div className="cardHead">
                    <div>
                      <div className="cardTitle">Gastos por cartão</div>
                      <div className="cardSub">Somatório das despesas com isCardPurchase no mês.</div>
                    </div>
                  </div>

                  {expenseByCard.length === 0 ? (
                    <div className="empty">Sem compras no cartão no mês.</div>
                  ) : (
                    <div style={{ width: "100%", height: 320 }}>
                      <ResponsiveContainer width="100%" height={320}>
                        <PieChart>
                          <Pie data={expenseByCard} dataKey="value" nameKey="name" innerRadius={76} outerRadius={118}>
                            {expenseByCard.map((_, idx) => (
                              <Cell key={idx} fill={colorForIndex(idx)} />
                            ))}
                          </Pie>
                          <Tooltip formatter={(v) => BRL.format(Number(v || 0))} />
                          <Legend />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </div>

                <div className="card">
                  <div className="cardHead">
                    <div>
                      <div className="cardTitle">Gastos por pessoa (cartões)</div>
                      <div className="cardSub">Quem utiliza seus cartões no mês.</div>
                    </div>
                  </div>

                  {expenseByPerson.length === 0 ? (
                    <div className="empty">Sem compras no cartão no mês.</div>
                  ) : (
                    <div style={{ width: "100%", height: 320 }}>
                      <ResponsiveContainer width="100%" height={320}>
                        <PieChart>
                          <Pie data={expenseByPerson} dataKey="value" nameKey="name" innerRadius={76} outerRadius={118}>
                            {expenseByPerson.map((_, idx) => (
                              <Cell key={idx} fill={colorForIndex(idx)} />
                            ))}
                          </Pie>
                          <Tooltip formatter={(v) => BRL.format(Number(v || 0))} />
                          <Legend />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </div>
              </section>

              <section className="card">
                <div className="cardHead">
                  <div>
                    <div className="cardTitle">Detalhamento por categoria</div>
                    <div className="cardSub">{selectedCategory ? `Categoria: ${selectedCategory}` : "Clique numa categoria no gráfico"}</div>
                  </div>
                </div>

                {!selectedCategory ? (
                  <div className="empty">Selecione uma categoria no gráfico.</div>
                ) : selectedCategoryItems.length === 0 ? (
                  <div className="empty">Sem itens nessa categoria no mês.</div>
                ) : (
                  <div className="table">
                    <div className="row rowHeader" style={{ gridTemplateColumns: isMobile ? "120px 1fr 160px" : "140px 2fr 200px 200px" }}>
                      <div>Venc.</div>
                      <div>Descrição</div>
                      {isMobile ? null : <div>Categoria</div>}
                      <div>Valor</div>
                    </div>

                    {selectedCategoryItems.map((it, idx) => {
                      const venc = toVencBR(it.dueDate);
                      const alt = idx % 2 === 1 ? "rowAlt" : "";
                      return (
                        <div key={it.id} className={`row ${alt}`} style={{ gridTemplateColumns: isMobile ? "120px 1fr 160px" : "140px 2fr 200px 200px" }}>
                          <div>{venc}</div>
                          <div className="clip" style={{ fontWeight: 900 }} title={it.note || ""}>
                            {it.note || "(sem descrição)"}
                          </div>
                          {isMobile ? null : <div className="clip" title={it.category}>{it.category}</div>}
                          <div style={{ fontWeight: 900 }}>{BRL.format(Number(it.amount || 0))}</div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            </>
          )}

          {/* ===================== ABA RESUMO ===================== */}
          {activeTab === TAB.RESUMO && (
            <section className="card">
              <div className="cardHead">
                <div>
                  <div className="cardTitle">Resumo — Histórico anual</div>
                  <div className="cardSub">
                    Ano: <b>{year}</b> • Evolução compara <b>mês anterior</b> vs <b>mês atual</b>.
                    Δ positivo = <span style={{ color: "#DC2626", fontWeight: 900 }}>vermelho</span> (gastou mais) •
                    Δ negativo = <span style={{ color: "#1D4ED8", fontWeight: 900 }}>azul</span> (gastou menos)
                  </div>
                </div>
              </div>

              {annualHistory.every((r) => r.totalExpense === 0 && r.ownerExpense === 0) ? (
                <div className="empty">Sem despesas registradas para este ano ainda.</div>
              ) : (
                <div className="table">
                  <div
                    className="row rowHeader"
                    style={{
                      gridTemplateColumns: isMobile
                        ? "1.2fr 1fr 1fr"
                        : "1.2fr 1.2fr 1fr 1fr 1.2fr 1fr 1fr",
                    }}
                  >
                    <div>Mês</div>
                    <div style={{ textAlign: "right" }}>Total gasto</div>
                    <div style={{ textAlign: "right" }}>Δ (R$)</div>
                    <div style={{ textAlign: "right" }}>Δ%</div>
                    {isMobile ? null : <div style={{ textAlign: "right" }}>Total dono (Meu)</div>}
                    {isMobile ? null : <div style={{ textAlign: "right" }}>Δ (R$)</div>}
                    {isMobile ? null : <div style={{ textAlign: "right" }}>Δ%</div>}
                  </div>

                  {annualHistory.map((r, idx) => {
                    const alt = idx % 2 === 1 ? "rowAlt" : "";
                    return (
                      <div
                        key={`${year}-${r.monthIndex}`}
                        className={`row ${alt}`}
                        style={{
                          gridTemplateColumns: isMobile
                            ? "1.2fr 1fr 1fr"
                            : "1.2fr 1.2fr 1fr 1fr 1.2fr 1fr 1fr",
                        }}
                      >
                        <div style={{ fontWeight: 900 }}>{r.monthName}</div>

                        <div style={{ textAlign: "right", fontWeight: 900 }}>
                          {BRL.format(r.totalExpense)}
                        </div>

                        <div style={{ textAlign: "right", ...deltaTone(r.deltaTotal) }}>
                          {r.monthIndex === 0 ? "—" : BRL.format(r.deltaTotal)}
                        </div>

                        <div style={{ textAlign: "right", ...deltaTone(r.deltaTotal) }}>
                          {r.monthIndex === 0 ? "—" : pctFmt(r.pctTotal)}
                        </div>

                        {isMobile ? null : (
                          <div style={{ textAlign: "right", fontWeight: 900 }}>
                            {BRL.format(r.ownerExpense)}
                          </div>
                        )}

                        {isMobile ? null : (
                          <div style={{ textAlign: "right", ...deltaTone(r.deltaOwner) }}>
                            {r.monthIndex === 0 ? "—" : BRL.format(r.deltaOwner)}
                          </div>
                        )}

                        {isMobile ? null : (
                          <div style={{ textAlign: "right", ...deltaTone(r.deltaOwner) }}>
                            {r.monthIndex === 0 ? "—" : pctFmt(r.pctOwner)}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          )}

          {/* ===================== ABA RECORRENTES ===================== */}
          {activeTab === TAB.RECORRENTES && (
            <>
              <section className="card">
                <div className="cardHead">
                  <div>
                    <div className="cardTitle">Recorrentes</div>
                    <div className="cardSub">
                      Cadastre itens fixos. Eles aparecem em todos os meses como lançamento do mês (pode ser rascunho R$ 0,00) para você editar.
                    </div>
                  </div>
                  <div className="toolbar">
                    <button type="button" className="btn" onClick={() => syncRecurrentsForThisMonth({ silent: false })}>
                      Sincronizar recorrentes deste mês
                    </button>
                  </div>
                </div>

                <form onSubmit={addRecurrent} className="form">
                  <div className="grid" style={{ gridTemplateColumns: isMobile ? "1fr" : "repeat(5, minmax(0, 1fr))" }}>
                    <div className="field">
                      <label className="label">Tipo</label>
                      <select value={recType} onChange={(e) => setRecType(e.target.value)} className="select">
                        <option value="expense">Despesa</option>
                        <option value="income">Receita</option>
                      </select>
                    </div>

                    <div className="field">
                      <label className="label">Valor sugerido (R$)</label>
                      <input
                        value={recAmount}
                        onChange={(e) => setRecAmount(e.target.value)}
                        className="input"
                        placeholder="Ex: 250,00"
                      />
                      <div className="hint">Se deixar vazio, salva como rascunho (R$ 0,00) para editar depois.</div>
                    </div>

                    <div className="field">
                      <label className="label">Categoria</label>
                      <select value={recCategory} onChange={(e) => setRecCategory(e.target.value)} className="select">
                        {DEFAULT_CATEGORIES.map((c) => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>
                    </div>

                    <div className="field">
                      <label className="label">Descrição</label>
                      <input value={recNote} onChange={(e) => setRecNote(e.target.value)} className="input" placeholder="Ex: Internet, Condomínio..." />
                    </div>

                    <div className="field">
                      <label className="label">Vencimento (dia)</label>
                      <select value={recDueDay} onChange={(e) => setRecDueDay(Number(e.target.value))} className="select">
                        {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                          <option key={d} value={d}>{d}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="box">
                    <label className="checkRow">
                      <input type="checkbox" checked={recIsCard} onChange={(e) => setRecIsCard(e.target.checked)} />
                      <span>Recorrente no cartão</span>
                    </label>

                    {recIsCard && (
                      <div className="grid" style={{ gridTemplateColumns: isMobile ? "1fr" : "repeat(2, minmax(0, 1fr))" }}>
                        <div className="field">
                          <label className="label">Banco do cartão</label>
                          <input value={recCardName} onChange={(e) => setRecCardName(e.target.value)} className="input" list="card-suggestions" required />
                        </div>
                        <div className="field">
                          <label className="label">Pessoa (opcional)</label>
                          <input value={recPersonName} onChange={(e) => setRecPersonName(e.target.value)} className="input" list="people-suggestions" placeholder="Se vazio, é Meu" />
                        </div>
                      </div>
                    )}
                  </div>

                  <div style={{ display: "flex", justifyContent: "flex-end" }}>
                    <button type="submit" className="btnPrimary">Adicionar recorrente</button>
                  </div>
                </form>
              </section>

              <section className="card">
                <div className="cardHead">
                  <div>
                    <div className="cardTitle">Lista de recorrentes</div>
                    <div className="cardSub">Ative/desative e exclua quando quiser.</div>
                  </div>
                </div>

                {recurrents.length === 0 ? (
                  <div className="empty">Nenhum recorrente cadastrado.</div>
                ) : (
                  <div className="table">
                    <div className="row rowHeader" style={{ gridTemplateColumns: isMobile ? "1fr 120px" : "1fr 120px 120px 220px" }}>
                      <div>Recorrente</div>
                      <div style={{ textAlign: "right" }}>Valor</div>
                      {isMobile ? null : <div>Venc.</div>}
                      {isMobile ? null : <div style={{ textAlign: "right" }}>Ações</div>}
                    </div>

                    {recurrents.map((r, idx) => {
                      const alt = idx % 2 === 1 ? "rowAlt" : "";
                      const label = `${r.type === "income" ? "Receita" : "Despesa"} • ${r.category || "—"} • ${r.note || "(sem descrição)"}${r.isCardPurchase ? ` • ${r.cardName || "—"} • ${displayPersonName(r.personName)}` : ""}`;
                      const valorTxt = Number(r.amount || 0) === 0 ? "Rascunho" : BRL.format(Number(r.amount || 0));

                      return (
                        <div key={r.id} className={`row ${alt}`} style={{ gridTemplateColumns: isMobile ? "1fr 120px" : "1fr 120px 120px 220px" }}>
                          <div className="clip" title={label} style={{ fontWeight: 900 }}>
                            {label}
                            {!r.active && <span style={{ marginLeft: 8, color: "#DC2626", fontWeight: 900 }}>(inativo)</span>}
                          </div>
                          <div style={{ textAlign: "right", fontWeight: 900 }}>{valorTxt}</div>
                          {isMobile ? null : <div>{pad2(Number(r.dueDay || 1))}</div>}
                          {isMobile ? null : (
                            <div className="statusActionsCell">
                              <ActionBtn
                                icon={r.active ? "⏸" : "▶"}
                                label={r.active ? "Desativar" : "Ativar"}
                                title="Ativar/desativar"
                                onClick={() => toggleRecurrentActive(r.id, r.active)}
                              />
                              <ActionBtn icon="🗑" label="Excluir" tone="danger" title="Excluir recorrente" onClick={() => removeRecurrent(r.id)} />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            </>
          )}

          {/* ===================== ABA PESSOAS (CADASTRO) ===================== */}
          {activeTab === TAB.PESSOAS && (
            <>
              <section className="card">
                <div className="cardHead">
                  <div>
                    <div className="cardTitle">Cadastro — Pessoas</div>
                    <div className="cardSub">Cadastre nomes para aparecerem como sugestão em “Pessoa” (Cartões).</div>
                  </div>
                </div>

                <div className="grid" style={{ gridTemplateColumns: isMobile ? "1fr" : "1fr 220px" }}>
                  <div className="field">
                    <label className="label">Nome</label>
                    <input value={newPerson} onChange={(e) => setNewPerson(e.target.value)} className="input" placeholder="Ex: Matheus" />
                    <div className="hint">Depois de cadastrado, aparece no autocomplete ao lançar compras no cartão.</div>
                  </div>
                  <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "flex-end" }}>
                    <button type="button" className="btnPrimary" onClick={addPerson}>Adicionar</button>
                  </div>
                </div>
              </section>

              <section className="card">
                <div className="cardHead">
                  <div>
                    <div className="cardTitle">Lista de pessoas</div>
                    <div className="cardSub">Use para padronizar quem usa seus cartões.</div>
                  </div>
                </div>

                {people.length === 0 ? (
                  <div className="empty">Nenhuma pessoa cadastrada.</div>
                ) : (
                  <div className="table">
                    <div className="row rowHeader" style={{ gridTemplateColumns: "1fr 200px" }}>
                      <div>Nome</div>
                      <div style={{ textAlign: "right" }}>Ações</div>
                    </div>
                    {people.map((p, idx) => {
                      const alt = idx % 2 === 1 ? "rowAlt" : "";
                      return (
                        <div key={p.id} className={`row ${alt}`} style={{ gridTemplateColumns: "1fr 200px" }}>
                          <div style={{ fontWeight: 900 }}>{p.name}</div>
                          <div className="statusActionsCell">
                            <ActionBtn icon="🗑" label="Excluir" tone="danger" title="Excluir pessoa" onClick={() => removePerson(p.id)} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            </>
          )}
        </main>
      </div>
    </div>
  );
}