import React, { useEffect, useMemo, useState } from "react";
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
  serverTimestamp,
  where,
  getDocs,
} from "firebase/firestore";

import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";

/* ===================== HELPERS ===================== */

const BRL = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

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

const CARD_SUGGESTIONS = [
  "Nubank",
  "Inter",
  "C6",
  "Itaú",
  "Santander",
  "Banco do Brasil",
  "Caixa",
];

// Paleta fixa para itens (cores diferentes por item)
const CHART_COLORS = [
  "#2563eb",
  "#16a34a",
  "#f59e0b",
  "#dc2626",
  "#7c3aed",
  "#0891b2",
  "#ea580c",
  "#0f766e",
  "#be185d",
  "#4b5563",
  "#84cc16",
  "#9333ea",
  "#0ea5e9",
  "#22c55e",
  "#f97316",
  "#ef4444",
];

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

const TAB = {
  LANCAMENTOS: "lancamentos",
  PESSOAS: "pessoas",
  RECORRENTES: "recorrentes",
  CARTOES: "cartoes",
  GRAFICOS: "graficos",
  RESUMO: "resumo",
};

async function handleLogout() {
  try {
    await signOut(auth);
  } catch (e) {
    console.error(e);
    alert("Não foi possível sair. Tente novamente.");
  }
}

/* ===================== LEGEND CLICÁVEL ===================== */
function ClickableLegend({ payload, onItemClick }) {
  if (!payload || !payload.length) return null;

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 10, justifyContent: "center", marginTop: 8 }}>
      {payload.map((entry) => (
        <button
          key={entry.value}
          type="button"
          onClick={() => onItemClick?.(entry.value)}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            border: "1px solid #e2e8f0",
            background: "#fff",
            borderRadius: 999,
            padding: "6px 10px",
            cursor: "pointer",
            fontWeight: 900,
            fontSize: 12,
          }}
          title="Clique para ver detalhamento"
        >
          <span
            style={{
              width: 10,
              height: 10,
              borderRadius: 3,
              background: entry.color,
              display: "inline-block",
            }}
          />
          <span style={{ color: "#334155" }}>{entry.value}</span>
        </button>
      ))}
    </div>
  );
}

export default function FinanceApp() {
  const user = auth.currentUser;
  const userEmail = user?.email || "";
  const userUid = user?.uid || "";

  const [items, setItems] = useState([]);

  // Pessoas / Recorrentes
  const [people, setPeople] = useState([]);
  const [recurrings, setRecurrings] = useState([]);

  // Tabs
  const [activeTab, setActiveTab] = useState(TAB.LANCAMENTOS);

  // Filtro mês/ano
  const now = new Date();
  const [monthIndex, setMonthIndex] = useState(now.getMonth()); // 0..11
  const [year, setYear] = useState(now.getFullYear());

  const monthLabel = useMemo(() => {
    const months = [
      "Janeiro",
      "Fevereiro",
      "Março",
      "Abril",
      "Maio",
      "Junho",
      "Julho",
      "Agosto",
      "Setembro",
      "Outubro",
      "Novembro",
      "Dezembro",
    ];
    return months[monthIndex];
  }, [monthIndex]);

  // Filtros extras
  const [onlyOpenInstallments, setOnlyOpenInstallments] = useState(false);

  // Form (geral)
  const [type, setType] = useState("expense"); // expense | income
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("Cartão");
  const [note, setNote] = useState("");
  const [dueDay, setDueDay] = useState(10);

  // Cartão/Pessoa
  const [isCardPurchase, setIsCardPurchase] = useState(false);
  const [cardName, setCardName] = useState("");
  const [personName, setPersonName] = useState("");

  // Parcelamento
  const [isInstallment, setIsInstallment] = useState(false);
  const [installments, setInstallments] = useState(2);
  const [installmentStartPaid, setInstallmentStartPaid] = useState(false);

  // Gráficos: categoria / cartão selecionados
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [selectedCardChart, setSelectedCardChart] = useState(null);

  // Aba Cartões
  const [selectedCardTab, setSelectedCardTab] = useState("");
  const [personFilter, setPersonFilter] = useState("");
  const [onlyMine, setOnlyMine] = useState(false);

  // Aba Pessoas
  const [personInput, setPersonInput] = useState("");

  // Aba Recorrentes
  const [recName, setRecName] = useState("");
  const [recType, setRecType] = useState("expense");
  const [recAmount, setRecAmount] = useState("");
  const [recCategory, setRecCategory] = useState("Contas");
  const [recDueDay, setRecDueDay] = useState(10);
  const [recIsCard, setRecIsCard] = useState(false);
  const [recCardName, setRecCardName] = useState("");
  const [recPersonName, setRecPersonName] = useState("");
  const [recIsVariable, setRecIsVariable] = useState(false);

  const dueDatePreview = useMemo(() => safeDate(year, monthIndex, Number(dueDay)), [year, monthIndex, dueDay]);

  const daysOptions = useMemo(() => {
    const dim = daysInMonth(year, monthIndex);
    return Array.from({ length: dim }, (_, i) => i + 1);
  }, [year, monthIndex]);

  /* ===================== FIRESTORE REALTIME ===================== */

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
      (err) => console.error("Firestore transactions onSnapshot error:", err)
    );

    return () => unsub();
  }, [userUid]);

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
      (err) => console.error("Firestore people onSnapshot error:", err)
    );

    return () => unsub();
  }, [userUid]);

  useEffect(() => {
    if (!userUid) return;

    const colRef = collection(db, "users", userUid, "recurrings");
    const q = query(colRef, orderBy("name", "asc"));

    const unsub = onSnapshot(
      q,
      (snap) => {
        const data = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setRecurrings(data);
      },
      (err) => console.error("Firestore recurrings onSnapshot error:", err)
    );

    return () => unsub();
  }, [userUid]);

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

  /* ===================== DATASETS GRÁFICOS ===================== */

  const expensesThisMonth = useMemo(() => itemsThisMonthBase.filter((it) => it.type === "expense"), [itemsThisMonthBase]);

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

  const paidOpenPie = useMemo(() => {
    return [
      { name: "Pagas", value: paidOpenStats.paid },
      { name: "Em aberto", value: paidOpenStats.open },
    ];
  }, [paidOpenStats]);

  const selectedCategoryItems = useMemo(() => {
    if (!selectedCategory) return [];
    return expensesThisMonth
      .filter((it) => (it.category || "Outros") === selectedCategory)
      .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));
  }, [expensesThisMonth, selectedCategory]);

  // Gastos por cartão (por banco)
  const expenseByCard = useMemo(() => {
    const map = new Map();
    for (const it of expensesThisMonth) {
      if (!it.isCardPurchase) continue;
      const c = (it.cardName || "").trim() || "—";
      map.set(c, (map.get(c) || 0) + Number(it.amount || 0));
    }
    return Array.from(map.entries())
      .map(([name, value]) => ({ name, value: Number(value.toFixed(2)) }))
      .sort((a, b) => b.value - a.value);
  }, [expensesThisMonth]);

  const selectedCardItems = useMemo(() => {
    if (!selectedCardChart) return [];
    return expensesThisMonth
      .filter((it) => it.isCardPurchase && (((it.cardName || "").trim() || "—") === selectedCardChart))
      .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));
  }, [expensesThisMonth, selectedCardChart]);

  /* ===================== FIRESTORE ACTIONS ===================== */

  async function addDocItem(payload) {
    if (!userUid) return;
    const colRef = collection(db, "users", userUid, "transactions");
    await addDoc(colRef, payload);
  }

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

  async function removeInstallmentGroup(groupId) {
    if (!userUid) return;
    const groupItems = items.filter((it) => it.installment?.groupId === groupId);
    await Promise.all(groupItems.map((it) => deleteDoc(doc(db, "users", userUid, "transactions", it.id))));
  }

  async function markInstallmentGroupPaid(groupId) {
    if (!userUid) return;
    const groupItems = items.filter((it) => it.installment?.groupId === groupId);
    await Promise.all(
      groupItems.map((it) => updateDoc(doc(db, "users", userUid, "transactions", it.id), { paid: true }))
    );
  }

  async function markAllInstallmentsThisMonthPaid() {
    if (!userUid) return;
    const list = itemsThisMonthBase.filter((it) => it.installment && !it.paid);
    if (list.length === 0) return;
    await Promise.all(list.map((it) => updateDoc(doc(db, "users", userUid, "transactions", it.id), { paid: true })));
  }

  /* ===================== PESSOAS ===================== */

  async function addPerson() {
    const name = (personInput || "").trim();
    if (!userUid) {
      alert("Usuário não autenticado.");
      return;
    }
    if (!name) {
      alert("Digite um nome.");
      return;
    }

    try {
      const colRef = collection(db, "users", userUid, "people");
      await addDoc(colRef, { name, createdAt: serverTimestamp(), userEmail });
      setPersonInput("");
    } catch (err) {
      console.error("Erro ao salvar pessoa:", err);
      alert(`Não foi possível salvar a pessoa.\n\n${err?.code || ""} ${err?.message || ""}`);
    }
  }

  async function removePerson(personId) {
    if (!userUid) return;
    await deleteDoc(doc(db, "users", userUid, "people", personId));
  }

  const peopleSuggestions = useMemo(() => {
    return (people || [])
      .map((p) => (p.name || "").trim())
      .filter(Boolean);
  }, [people]);

  /* ===================== RECORRENTES ===================== */

  async function addRecurring(e) {
    e.preventDefault();

    const name = (recName || "").trim();
    if (!name) {
      alert("Digite o que é (ex: Internet, Netflix, Água, Luz).");
      return;
    }

    const val = recIsVariable ? 0 : Number(String(recAmount).replace(",", "."));
    if (!recIsVariable && (!val || val <= 0)) {
      alert("Informe um valor válido.");
      return;
    }

    const cName = recIsCard ? (recCardName || "").trim() : "";
    if (recIsCard && !cName) {
      alert("Digite o banco do cartão.");
      return;
    }

    try {
      const colRef = collection(db, "users", userUid, "recurrings");
      await addDoc(colRef, {
        name,
        type: recType,
        amount: Number((val || 0).toFixed(2)),
        category: recCategory,
        dueDay: Number(recDueDay || 10),
        isCardPurchase: Boolean(recIsCard),
        cardName: cName,
        personName: (recPersonName || "").trim(),
        isVariable: Boolean(recIsVariable),
        createdAt: serverTimestamp(),
        userEmail,
      });

      setRecName("");
      setRecAmount("");
      setRecCategory("Contas");
      setRecDueDay(10);
      setRecIsCard(false);
      setRecCardName("");
      setRecPersonName("");
      setRecIsVariable(false);
    } catch (err) {
      console.error("Erro ao salvar recorrente:", err);
      alert(`Não foi possível salvar o recorrente.\n\n${err?.code || ""} ${err?.message || ""}`);
    }
  }

  async function removeRecurring(recId) {
    if (!userUid) return;
    await deleteDoc(doc(db, "users", userUid, "recurrings", recId));
  }

  async function applyRecurringToThisMonth(rec) {
    if (!userUid) return;

    const day = Number(rec.dueDay || 10);
    const d = safeDate(year, monthIndex, day);
    const dueDate = ymd(d);

    let val = Number(rec.amount || 0);
    if (rec.isVariable) {
      const input = window.prompt(`Valor de "${rec.name}" para ${monthLabel}/${year}:`, "");
      const n = Number(String(input || "").replace(",", "."));
      if (!n || n <= 0) {
        alert("Valor inválido. Operação cancelada.");
        return;
      }
      val = n;
    }

    const colRef = collection(db, "users", userUid, "transactions");
    const q = query(colRef, where("recurringId", "==", rec.id), where("dueDate", "==", dueDate));

    const snap = await getDocs(q);
    if (!snap.empty) {
      alert("Esse recorrente já foi aplicado neste mês.");
      return;
    }

    await addDocItem({
      type: rec.type,
      amount: Number(val.toFixed(2)),
      category: rec.category || "Contas",
      note: rec.name,
      dueDate,
      paid: false,
      installment: null,
      createdAt: new Date().toISOString(),
      userEmail,
      isCardPurchase: Boolean(rec.isCardPurchase),
      cardName: (rec.cardName || "").trim(),
      personName: (rec.personName || "").trim(),
      recurringId: rec.id,
    });

    alert("Recorrente aplicado no mês atual.");
  }

  async function applyAllRecurringsToThisMonth() {
    if (!recurrings.length) return;
    for (const r of recurrings) {
      // eslint-disable-next-line no-await-in-loop
      await applyRecurringToThisMonth(r);
    }
  }

  /* ===================== ABA CARTÕES ===================== */

  const cardsFound = useMemo(() => {
    const s = new Set();
    for (const it of items) {
      if (it.isCardPurchase && (it.cardName || "").trim()) s.add(it.cardName.trim());
    }
    return Array.from(s).sort((a, b) => a.localeCompare(b));
  }, [items]);

  const cardsSuggestions = useMemo(() => {
    const s = new Set([...(CARD_SUGGESTIONS || [])]);
    for (const c of cardsFound) s.add(c);
    return Array.from(s).sort((a, b) => a.localeCompare(b));
  }, [cardsFound]);

  useEffect(() => {
    if (activeTab !== TAB.CARTOES) return;
    if (!selectedCardTab && cardsFound.length > 0) {
      setSelectedCardTab(cardsFound[0]);
    }
  }, [activeTab, selectedCardTab, cardsFound]);

  const cardItemsThisMonth = useMemo(() => {
    if (!selectedCardTab) return [];
    let list = itemsThisMonthBase.filter((it) => it.isCardPurchase && (it.cardName || "").trim() === selectedCardTab);

    // só meus (pessoa vazia)
    if (onlyMine) {
      list = list.filter((it) => !(it.personName || "").trim());
    }

    const pf = (personFilter || "").trim().toLowerCase();

    if (pf) {
      // se buscar "meu", incluir também vazios
      if (pf.includes("meu")) {
        list = list.filter((it) => {
          const p = (it.personName || "").trim().toLowerCase();
          return !p || p.includes(pf);
        });
      } else {
        list = list.filter((it) => (it.personName || "").toLowerCase().includes(pf));
      }
    }

    return list.sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));
  }, [itemsThisMonthBase, selectedCardTab, personFilter, onlyMine]);

  const owedByPersonThisMonth = useMemo(() => {
    const map = new Map();
    for (const it of cardItemsThisMonth) {
      if (it.type !== "expense") continue;
      if (it.paid) continue;
      const p = (it.personName || "").trim();
      if (!p) continue; // vazio = meu (não entra como "me deve")
      const v = Number(it.amount || 0);
      map.set(p, (map.get(p) || 0) + v);
    }
    return Array.from(map.entries())
      .map(([name, value]) => ({ name, value: Number(value.toFixed(2)) }))
      .sort((a, b) => b.value - a.value);
  }, [cardItemsThisMonth]);

  const cardTotalsThisMonth = useMemo(() => {
    let expense = 0;
    let income = 0;
    for (const it of cardItemsThisMonth) {
      const v = Number(it.amount || 0);
      if (it.type === "income") income += v;
      else expense += v;
    }
    return { income, expense, balance: income - expense };
  }, [cardItemsThisMonth]);

  /* ===================== ABA RESUMO & ECONOMIA ===================== */

  const lastMonthsWindow = useMemo(() => {
    const arr = [];
    for (let k = 0; k < 3; k++) {
      const d = new Date(year, monthIndex - k, 1);
      arr.push({ y: d.getFullYear(), m: d.getMonth() });
    }
    return arr;
  }, [year, monthIndex]);

  const insights = useMemo(() => {
    const currentByCat = new Map();
    for (const it of expensesThisMonth) {
      const key = it.category || "Outros";
      currentByCat.set(key, (currentByCat.get(key) || 0) + Number(it.amount || 0));
    }

    const prevMonths = lastMonthsWindow.slice(1);
    const prevByCatTotals = new Map();

    for (const it of items) {
      if (it.type !== "expense") continue;
      const d = new Date(it.dueDate);
      const hit = prevMonths.some((p) => p.y === d.getFullYear() && p.m === d.getMonth());
      if (!hit) continue;

      const key = it.category || "Outros";
      prevByCatTotals.set(key, (prevByCatTotals.get(key) || 0) + Number(it.amount || 0));
    }

    const topCats = Array.from(currentByCat.entries())
      .map(([name, value]) => ({ name, value: Number(value.toFixed(2)) }))
      .sort((a, b) => b.value - a.value);

    const suggestions = [];
    for (const cat of topCats.slice(0, 6)) {
      const prevTotal = prevByCatTotals.get(cat.name) || 0;
      const prevAvgPerMonth = prevTotal / Math.max(1, prevMonths.length);
      const increased = cat.value > prevAvgPerMonth * 1.2;

      if (increased) {
        const target = cat.value * 0.9;
        suggestions.push({
          title: `Você aumentou em ${cat.name}`,
          text: `Este mês: ${BRL.format(cat.value)} | média dos últimos 2 meses: ${BRL.format(prevAvgPerMonth)}. Tente limitar para ~ ${BRL.format(target)}.`,
        });
      }
    }

    if (suggestions.length === 0 && topCats.length) {
      const top1 = topCats[0];
      suggestions.push({
        title: `Seu maior gasto foi em ${top1.name}`,
        text: `Você gastou ${BRL.format(top1.value)} em ${top1.name}. Uma boa meta é reduzir 5–10% no próximo mês.`,
        });
    }

    return { topCats, suggestions };
  }, [items, expensesThisMonth, lastMonthsWindow]);

  /* ===================== UI ===================== */

  return (
    <div style={styles.page}>
      <div style={styles.shell}>
        {/* Sidebar */}
        <aside style={styles.sidebar}>
          <div style={styles.sideTitle}>Painel</div>

          <div style={styles.sideGroup}>
            <div style={styles.sideLabel}>Mês</div>
            <select value={monthIndex} onChange={(e) => setMonthIndex(Number(e.target.value))} style={styles.sideSelect}>
              {[
                "Janeiro","Fevereiro","Março","Abril","Maio","Junho",
                "Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"
              ].map((m, idx) => (
                <option key={m} value={idx}>{m}</option>
              ))}
            </select>
          </div>

          <div style={styles.sideGroup}>
            <div style={styles.sideLabel}>Ano</div>
            <select value={year} onChange={(e) => setYear(Number(e.target.value))} style={styles.sideSelect}>
              {Array.from({ length: 11 }, (_, i) => now.getFullYear() - 5 + i).map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>

          <div style={styles.sideGroup}>
            <label style={styles.sideCheckRow}>
              <input
                type="checkbox"
                checked={onlyOpenInstallments}
                onChange={(e) => setOnlyOpenInstallments(e.target.checked)}
              />
              <span>Só parcelas em aberto</span>
            </label>
          </div>

          <div style={styles.sideGroup}>
            <div style={styles.sideLabel}>Abas</div>

            <button
              style={activeTab === TAB.LANCAMENTOS ? styles.sideBtnActive : styles.sideBtn}
              onClick={() => setActiveTab(TAB.LANCAMENTOS)}
              type="button"
            >
              Lançamentos
            </button>

            <button
              style={activeTab === TAB.PESSOAS ? styles.sideBtnActive : styles.sideBtn}
              onClick={() => setActiveTab(TAB.PESSOAS)}
              type="button"
            >
              Pessoas
            </button>

            <button
              style={activeTab === TAB.RECORRENTES ? styles.sideBtnActive : styles.sideBtn}
              onClick={() => setActiveTab(TAB.RECORRENTES)}
              type="button"
            >
              Recorrentes
            </button>

            <button
              style={activeTab === TAB.CARTOES ? styles.sideBtnActive : styles.sideBtn}
              onClick={() => setActiveTab(TAB.CARTOES)}
              type="button"
            >
              Cartões
            </button>

            <button
              style={activeTab === TAB.GRAFICOS ? styles.sideBtnActive : styles.sideBtn}
              onClick={() => setActiveTab(TAB.GRAFICOS)}
              type="button"
            >
              Gráficos
            </button>

            <button
              style={activeTab === TAB.RESUMO ? styles.sideBtnActive : styles.sideBtn}
              onClick={() => setActiveTab(TAB.RESUMO)}
              type="button"
            >
              Resumo & Economia
            </button>
          </div>

          <div style={styles.sideFooter}>
            <div style={{ fontWeight: 800 }}>Usuário</div>
            <div style={{ fontSize: 12, color: "#cbd5e1" }}>{userEmail || "-"}</div>
          </div>
        </aside>

        {/* Main */}
        <main style={styles.main}>
          <header style={styles.topHeader}>
            <div style={styles.brand}>
              <span style={styles.brandIcon}>💰</span>
              <div>
                <h1 style={styles.title}>Minhas Finanças</h1>
                <div style={styles.subTitle}>{monthLabel} / {year}</div>
              </div>
            </div>

            <div style={styles.topActions}>
              {activeTab === TAB.LANCAMENTOS && (
                <button
                  type="button"
                  style={styles.btnSoft}
                  onClick={markAllInstallmentsThisMonthPaid}
                  title="Marca como pagas todas as parcelas do mês atual"
                >
                  Marcar parcelas do mês como pagas
                </button>
              )}

              <button type="button" style={{ ...styles.btnSoft, marginLeft: 12 }} onClick={handleLogout}>
                Sair
              </button>
            </div>
          </header>

          {/* Cards resumo */}
          <section style={styles.cardsRow}>
            <div style={styles.cardSmall}>
              <div style={styles.cardLabel}>Receitas (mês)</div>
              <div style={styles.cardValue}>{BRL.format(totals.income)}</div>
            </div>
            <div style={styles.cardSmall}>
              <div style={styles.cardLabel}>Despesas (mês)</div>
              <div style={styles.cardValue}>{BRL.format(totals.expense)}</div>
            </div>
            <div style={styles.cardSmall}>
              <div style={styles.cardLabel}>Saldo (mês)</div>
              <div style={styles.cardValue}>{BRL.format(totals.balance)}</div>
            </div>
            <div style={styles.cardSmall}>
              <div style={styles.cardLabel}>Pagas x Em aberto</div>
              <div style={styles.cardValue}>{paidOpenStats.paid} / {paidOpenStats.open}</div>
              <div style={styles.cardHint}>(despesas do mês)</div>
            </div>
          </section>

          {/* ===================== ABA LANCAMENTOS ===================== */}
          {activeTab === TAB.LANCAMENTOS && (
            <>
              <section style={styles.card}>
                <h2 style={styles.h2}>Novo lançamento</h2>

                <form onSubmit={handleAdd} style={styles.form}>
                  <div style={styles.grid}>
                    <div style={styles.field}>
                      <label style={styles.label}>Tipo</label>
                      <select value={type} onChange={(e) => setType(e.target.value)} style={styles.select}>
                        <option value="expense">Despesa</option>
                        <option value="income">Receita</option>
                      </select>
                    </div>

                    <div style={styles.field}>
                      <label style={styles.label}>Valor (R$)</label>
                      <input
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        placeholder="Ex: 150,00"
                        style={styles.input}
                        inputMode="decimal"
                        required
                      />
                    </div>

                    <div style={styles.field}>
                      <label style={styles.label}>Forma</label>
                      <select value={category} onChange={(e) => setCategory(e.target.value)} style={styles.select}>
                        {DEFAULT_CATEGORIES.map((c) => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>
                    </div>

                    <div style={styles.field}>
                      <label style={styles.label}>Descrição</label>
                      <input
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        placeholder="Ex: Mercado, OAB..."
                        style={styles.input}
                      />
                    </div>

                    <div style={styles.field}>
                      <label style={styles.label}>Vencimento (dia)</label>
                      <select value={dueDay} onChange={(e) => setDueDay(Number(e.target.value))} style={styles.select}>
                        {daysOptions.map((d) => (
                          <option key={d} value={d}>{d}</option>
                        ))}
                      </select>
                      <div style={styles.hint}>
                        Venc.: {pad2(dueDatePreview.getDate())}/{pad2(dueDatePreview.getMonth() + 1)}/{dueDatePreview.getFullYear()}
                      </div>
                    </div>
                  </div>

                  {/* CARTÃO / PESSOA */}
                  <div style={styles.installmentBox}>
                    <label style={styles.checkboxRow}>
                      <input
                        type="checkbox"
                        checked={isCardPurchase}
                        onChange={(e) => setIsCardPurchase(e.target.checked)}
                      />
                      <span style={{ fontWeight: 800 }}>Compra no cartão?</span>
                    </label>

                    {isCardPurchase && (
                      <div style={styles.installmentGrid}>
                        <div style={styles.field}>
                          <label style={styles.label}>Banco do cartão</label>
                          <input
                            value={cardName}
                            onChange={(e) => setCardName(e.target.value)}
                            placeholder="Ex: Nubank, Inter, Itaú..."
                            style={styles.input}
                            list="card-suggestions"
                            required
                          />
                          <datalist id="card-suggestions">
                            {cardsSuggestions.map((c) => (
                              <option key={c} value={c} />
                            ))}
                          </datalist>
                          <div style={styles.hint}>Você digita o banco e ele vira subaba na aba “Cartões”.</div>
                        </div>

                        <div style={styles.field}>
                          <label style={styles.label}>Pessoa (opcional)</label>
                          <input
                            value={personName}
                            onChange={(e) => setPersonName(e.target.value)}
                            placeholder="Se vazio, é meu"
                            style={styles.input}
                            list="people-suggestions"
                          />
                          <datalist id="people-suggestions">
                            {peopleSuggestions.map((p) => (
                              <option key={p} value={p} />
                            ))}
                          </datalist>
                          <div style={styles.hint}>Se vazio = Meu. Se preencher = aparece nos filtros e nas dívidas.</div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* PARCELAMENTO */}
                  <div style={styles.installmentBox}>
                    <label style={styles.checkboxRow}>
                      <input
                        type="checkbox"
                        checked={isInstallment}
                        onChange={(e) => setIsInstallment(e.target.checked)}
                      />
                      <span style={{ fontWeight: 800 }}>Compra parcelada</span>
                    </label>

                    {isInstallment && (
                      <div style={styles.installmentGrid}>
                        <div style={styles.field}>
                          <label style={styles.label}>Quantidade de parcelas</label>
                          <input
                            type="number"
                            min={2}
                            max={48}
                            value={installments}
                            onChange={(e) => setInstallments(Number(e.target.value))}
                            style={styles.input}
                            required
                          />
                          <div style={styles.hint}>Ex.: 10 = cria 10 parcelas (mês atual + próximos meses)</div>
                        </div>

                        <div style={styles.field}>
                          <label style={styles.label}>1ª parcela já está paga?</label>
                          <label style={styles.checkboxRow}>
                            <input
                              type="checkbox"
                              checked={installmentStartPaid}
                              onChange={(e) => setInstallmentStartPaid(e.target.checked)}
                            />
                            <span>Sim</span>
                          </label>
                        </div>
                      </div>
                    )}
                  </div>

                  <div style={styles.actionsRow}>
                    <button type="submit" style={styles.buttonPrimary}>Adicionar</button>
                  </div>
                </form>
              </section>

              <section style={styles.card}>
                <h2 style={styles.h2}>Lançamentos do mês</h2>

                {itemsThisMonth.length === 0 ? (
                  <div style={styles.empty}>Nenhum lançamento neste mês (com os filtros atuais).</div>
                ) : (
                  <div style={styles.table}>
                    <div style={{ ...styles.row, ...styles.rowHeader, gridTemplateColumns: "110px 1.4fr 110px 120px 120px 90px 160px 140px 1fr" }}>
                      <div>Venc.</div>
                      <div>Descrição</div>
                      <div>Tipo</div>
                      <div>Forma</div>
                      <div>Valor</div>
                      <div>Parcela</div>
                      <div>Cartão</div>
                      <div>Pago?</div>
                      <div>Ações</div>
                    </div>

                    {itemsThisMonth.map((it) => {
                      const d = new Date(it.dueDate);
                      const venc = `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`;
                      const parcelaTxt = it.installment ? `${it.installment.index}/${it.installment.total}` : "-";
                      const cardTxt = it.isCardPurchase
                        ? `${(it.cardName || "").trim() || "—"}${it.personName ? ` • ${it.personName}` : " • Meu"}`
                        : "-";

                      return (
                        <div
                          key={it.id}
                          style={{
                            ...styles.row,
                            gridTemplateColumns: "110px 1.4fr 110px 120px 120px 90px 160px 140px 1fr",
                          }}
                        >
                          <div>{venc}</div>
                          <div style={{ fontWeight: 700 }}>{it.note || "(sem descrição)"}</div>
                          <div>{it.type === "income" ? "Receita" : "Despesa"}</div>
                          <div>{it.category}</div>
                          <div style={{ fontWeight: 900 }}>{BRL.format(Number(it.amount || 0))}</div>
                          <div>{parcelaTxt}</div>
                          <div>{cardTxt}</div>

                          <div>
                            <label style={styles.checkboxRowSmall}>
                              <input type="checkbox" checked={!!it.paid} onChange={() => togglePaid(it.id, it.paid)} />
                              <span>{it.paid ? "Pago" : "Em aberto"}</span>
                            </label>
                          </div>

                          <div style={styles.rowActions}>
                            <button type="button" style={styles.smallBtn} onClick={() => removeItem(it.id)}>
                              Excluir
                            </button>

                            {it.installment?.groupId && (
                              <>
                                <button
                                  type="button"
                                  style={styles.smallBtn}
                                  onClick={() => markInstallmentGroupPaid(it.installment.groupId)}
                                  title="Marca todas as parcelas desse parcelamento como pagas"
                                >
                                  Marcar parcelamento pago
                                </button>
                                <button
                                  type="button"
                                  style={{ ...styles.smallBtn, ...styles.dangerBtn }}
                                  onClick={() => removeInstallmentGroup(it.installment.groupId)}
                                  title="Remove todas as parcelas desse parcelamento"
                                >
                                  Excluir parcelamento
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            </>
          )}

          {/* ===================== ABA PESSOAS ===================== */}
          {activeTab === TAB.PESSOAS && (
            <section style={styles.card}>
              <h2 style={styles.h2}>Pessoas</h2>

              <div style={{ display: "grid", gap: 10, maxWidth: 520 }}>
                <div style={{ display: "flex", gap: 10 }}>
                  <input
                    value={personInput}
                    onChange={(e) => setPersonInput(e.target.value)}
                    placeholder="Ex: Matheus"
                    style={styles.input}
                  />
                  <button type="button" style={styles.buttonPrimary} onClick={addPerson}>
                    Adicionar pessoa
                  </button>
                </div>
                <div style={styles.hint}>
                  Essas pessoas aparecem como sugestão (autocomplete) quando você for lançar compras no cartão.
                </div>
              </div>

              <div style={{ marginTop: 14 }}>
                {people.length === 0 ? (
                  <div style={styles.empty}>Nenhuma pessoa cadastrada ainda.</div>
                ) : (
                  <div style={styles.table}>
                    <div style={{ ...styles.row, ...styles.rowHeader, gridTemplateColumns: "1.4fr 180px" }}>
                      <div>Nome</div>
                      <div>Ações</div>
                    </div>

                    {people.map((p) => (
                      <div key={p.id} style={{ ...styles.row, gridTemplateColumns: "1.4fr 180px" }}>
                        <div style={{ fontWeight: 900 }}>{p.name}</div>
                        <div style={{ display: "flex", justifyContent: "flex-end" }}>
                          <button type="button" style={{ ...styles.smallBtn, ...styles.dangerBtn }} onClick={() => removePerson(p.id)}>
                            Excluir
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>
          )}

          {/* ===================== ABA RECORRENTES ===================== */}
          {activeTab === TAB.RECORRENTES && (
            <>
              <section style={styles.card}>
                <h2 style={styles.h2}>Gastos recorrentes</h2>

                <form onSubmit={addRecurring} style={{ display: "grid", gap: 12 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr", gap: 12 }}>
                    <div style={styles.field}>
                      <label style={styles.label}>O que é</label>
                      <input
                        value={recName}
                        onChange={(e) => setRecName(e.target.value)}
                        placeholder="Ex: Internet, Netflix, Água, Luz"
                        style={styles.input}
                        required
                      />
                    </div>

                    <div style={styles.field}>
                      <label style={styles.label}>Tipo</label>
                      <select value={recType} onChange={(e) => setRecType(e.target.value)} style={styles.select}>
                        <option value="expense">Despesa</option>
                        <option value="income">Receita</option>
                      </select>
                    </div>

                    <div style={styles.field}>
                      <label style={styles.label}>Categoria</label>
                      <select value={recCategory} onChange={(e) => setRecCategory(e.target.value)} style={styles.select}>
                        {DEFAULT_CATEGORIES.map((c) => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>
                    </div>

                    <div style={styles.field}>
                      <label style={styles.label}>Vencimento (dia)</label>
                      <select value={recDueDay} onChange={(e) => setRecDueDay(Number(e.target.value))} style={styles.select}>
                        {daysOptions.map((d) => (
                          <option key={d} value={d}>{d}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div style={styles.installmentBox}>
                    <label style={styles.sideCheckRow}>
                      <input type="checkbox" checked={recIsVariable} onChange={(e) => setRecIsVariable(e.target.checked)} />
                      <span><b>Valor variável</b> (ex: água/luz) — você informa o valor ao aplicar no mês</span>
                    </label>

                    {!recIsVariable && (
                      <div style={{ maxWidth: 260 }}>
                        <div style={styles.field}>
                          <label style={styles.label}>Valor (R$)</label>
                          <input
                            value={recAmount}
                            onChange={(e) => setRecAmount(e.target.value)}
                            placeholder="Ex: 129,90"
                            style={styles.input}
                            inputMode="decimal"
                            required
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  <div style={styles.installmentBox}>
                    <label style={styles.checkboxRow}>
                      <input type="checkbox" checked={recIsCard} onChange={(e) => setRecIsCard(e.target.checked)} />
                      <span style={{ fontWeight: 800 }}>Compra no cartão?</span>
                    </label>

                    {recIsCard && (
                      <div style={styles.installmentGrid}>
                        <div style={styles.field}>
                          <label style={styles.label}>Banco do cartão</label>
                          <input
                            value={recCardName}
                            onChange={(e) => setRecCardName(e.target.value)}
                            placeholder="Ex: Nubank, Inter, Itaú..."
                            style={styles.input}
                            list="card-suggestions"
                            required
                          />
                        </div>

                        <div style={styles.field}>
                          <label style={styles.label}>Pessoa (opcional)</label>
                          <input
                            value={recPersonName}
                            onChange={(e) => setRecPersonName(e.target.value)}
                            placeholder="Se vazio, é meu"
                            style={styles.input}
                            list="people-suggestions"
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  <div style={styles.actionsRow}>
                    <button type="submit" style={styles.buttonPrimary}>Salvar recorrente</button>
                  </div>
                </form>
              </section>

              <section style={styles.card}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                  <h2 style={styles.h2}>Recorrentes cadastrados</h2>
                  <button type="button" style={styles.btnSoft} onClick={applyAllRecurringsToThisMonth}>
                    Aplicar todos em {monthLabel}/{year}
                  </button>
                </div>

                {recurrings.length === 0 ? (
                  <div style={styles.empty}>Nenhum recorrente cadastrado ainda.</div>
                ) : (
                  <div style={styles.table}>
                    <div style={{ ...styles.row, ...styles.rowHeader, gridTemplateColumns: "1.6fr 140px 130px 120px 1fr" }}>
                      <div>Recorrente</div>
                      <div>Valor</div>
                      <div>Dia</div>
                      <div>Cartão</div>
                      <div>Ações</div>
                    </div>

                    {recurrings.map((r) => (
                      <div key={r.id} style={{ ...styles.row, gridTemplateColumns: "1.6fr 140px 130px 120px 1fr" }}>
                        <div style={{ fontWeight: 900 }}>
                          {r.name} {r.isVariable ? <span style={{ color: "#64748b" }}>(variável)</span> : null}
                        </div>
                        <div style={{ fontWeight: 1000 }}>
                          {r.isVariable ? "—" : BRL.format(Number(r.amount || 0))}
                        </div>
                        <div>Dia {Number(r.dueDay || 10)}</div>
                        <div>{r.isCardPurchase ? (r.cardName || "—") : "—"}</div>

                        <div style={styles.rowActions}>
                          <button type="button" style={styles.smallBtn} onClick={() => applyRecurringToThisMonth(r)}>
                            Aplicar no mês
                          </button>
                          <button type="button" style={{ ...styles.smallBtn, ...styles.dangerBtn }} onClick={() => removeRecurring(r.id)}>
                            Excluir
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </>
          )}

          {/* ===================== ABA CARTOES ===================== */}
          {activeTab === TAB.CARTOES && (
            <>
              <section style={styles.card}>
                <h2 style={styles.h2}>Cartões</h2>

                {cardsFound.length === 0 ? (
                  <div style={styles.empty}>
                    Nenhum cartão cadastrado ainda. Marque “Compra no cartão?” e digite o banco para criar a subaba.
                  </div>
                ) : (
                  <>
                    <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
                      {cardsFound.map((c) => (
                        <button
                          key={c}
                          type="button"
                          onClick={() => {
                            setSelectedCardTab(c);
                            setPersonFilter("");
                            setOnlyMine(false);
                          }}
                          style={selectedCardTab === c ? styles.pillActive : styles.pill}
                        >
                          {c}
                        </button>
                      ))}
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                      <div style={styles.cardSmall}>
                        <div style={styles.cardLabel}>Total despesas (cartão no mês)</div>
                        <div style={styles.cardValue}>{BRL.format(cardTotalsThisMonth.expense)}</div>
                      </div>
                      <div style={styles.cardSmall}>
                        <div style={styles.cardLabel}>Total receitas (cartão no mês)</div>
                        <div style={styles.cardValue}>{BRL.format(cardTotalsThisMonth.income)}</div>
                      </div>
                    </div>

                    <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
                      <div>
                        <div style={styles.sideLabel}>Filtrar por pessoa</div>
                        <input
                          value={personFilter}
                          onChange={(e) => setPersonFilter(e.target.value)}
                          placeholder='Digite o nome (ex: Maria) ou "meu"'
                          style={styles.input}
                        />
                        <div style={styles.hint}>
                          Se a pessoa estiver vazia = Meu. Se digitar “meu” também mostra os vazios.
                        </div>
                      </div>

                      <label style={styles.sideCheckRow}>
                        <input type="checkbox" checked={onlyMine} onChange={(e) => setOnlyMine(e.target.checked)} />
                        <span><b>Só meus</b> (pessoa vazia)</span>
                      </label>
                    </div>
                  </>
                )}
              </section>

              {cardsFound.length > 0 && (
                <section style={styles.grid2}>
                  <div style={styles.card}>
                    <h2 style={styles.h2}>Quem me deve (em aberto) — {selectedCardTab}</h2>

                    {owedByPersonThisMonth.length === 0 ? (
                      <div style={styles.empty}>Nenhuma dívida em aberto neste cartão (no mês filtrado).</div>
                    ) : (
                      <div style={styles.table}>
                        <div style={{ ...styles.row, ...styles.rowHeader, gridTemplateColumns: "1.2fr 220px" }}>
                          <div>Pessoa</div>
                          <div>Total em aberto</div>
                        </div>

                        {owedByPersonThisMonth.map((p) => (
                          <div key={p.name} style={{ ...styles.row, gridTemplateColumns: "1.2fr 220px" }}>
                            <div style={{ fontWeight: 900 }}>{p.name}</div>
                            <div style={{ fontWeight: 1000 }}>{BRL.format(p.value)}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div style={styles.card}>
                    <h2 style={styles.h2}>Lançamentos do cartão — {selectedCardTab}</h2>

                    {cardItemsThisMonth.length === 0 ? (
                      <div style={styles.empty}>Nenhuma compra registrada neste cartão (no mês filtrado).</div>
                    ) : (
                      <div style={styles.table}>
                        <div
                          style={{
                            ...styles.row,
                            ...styles.rowHeader,
                            gridTemplateColumns: "120px 1.4fr 120px 90px 150px 120px",
                          }}
                        >
                          <div>Venc.</div>
                          <div>Descrição</div>
                          <div>Valor</div>
                          <div>Parcela</div>
                          <div>Pessoa</div>
                          <div>Status</div>
                        </div>

                        {cardItemsThisMonth.map((it) => {
                          const d = new Date(it.dueDate);
                          const venc = `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`;
                          const parcelaTxt = it.installment ? `${it.installment.index}/${it.installment.total}` : "-";
                          const personLabel = (it.personName || "").trim() ? it.personName : "Meu";

                          return (
                            <div
                              key={it.id}
                              style={{
                                ...styles.row,
                                gridTemplateColumns: "120px 1.4fr 120px 90px 150px 120px",
                              }}
                            >
                              <div>{venc}</div>
                              <div style={{ fontWeight: 800 }}>{it.note || "(sem descrição)"}</div>
                              <div style={{ fontWeight: 1000 }}>{BRL.format(Number(it.amount || 0))}</div>
                              <div>{parcelaTxt}</div>
                              <div>{personLabel}</div>
                              <div>{it.paid ? "Pago" : "Em aberto"}</div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </section>
              )}
            </>
          )}

          {/* ===================== ABA GRAFICOS ===================== */}
          {activeTab === TAB.GRAFICOS && (
            <>
              <section style={styles.grid2}>
                <div style={styles.card}>
                  <h2 style={styles.h2}>Gastos por categoria (mês)</h2>
                  <div style={styles.chartWrap}>
                    {expenseByCategory.length === 0 ? (
                      <div style={styles.empty}>Sem despesas no mês.</div>
                    ) : (
                      <ResponsiveContainer width="100%" height={320}>
                        <PieChart>
                          <Pie
                            data={expenseByCategory}
                            dataKey="value"
                            nameKey="name"
                            onClick={(data) => {
                              setSelectedCategory(data?.name || null);
                              setSelectedCardChart(null);
                            }}
                            innerRadius={70}
                            outerRadius={110}
                          >
                            {expenseByCategory.map((_, idx) => (
                              <Cell key={idx} fill={CHART_COLORS[idx % CHART_COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip formatter={(v) => BRL.format(Number(v || 0))} />
                          <Legend />
                        </PieChart>
                      </ResponsiveContainer>
                    )}
                  </div>
                  <div style={styles.hint}>Clique em uma categoria para ver os gastos abaixo.</div>
                </div>

                <div style={styles.card}>
                  <h2 style={styles.h2}>Pagas x Em aberto (mês)</h2>
                  <div style={styles.chartWrap}>
                    {paidOpenStats.total === 0 ? (
                      <div style={styles.empty}>Sem despesas no mês.</div>
                    ) : (
                      <ResponsiveContainer width="100%" height={320}>
                        <PieChart>
                          <Pie data={paidOpenPie} dataKey="value" nameKey="name" outerRadius={110}>
                            {paidOpenPie.map((_, idx) => (
                              <Cell key={idx} fill={CHART_COLORS[(idx + 4) % CHART_COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip />
                          <Legend />
                        </PieChart>
                      </ResponsiveContainer>
                    )}
                  </div>
                </div>
              </section>

              <section style={styles.card}>
                <h2 style={styles.h2}>Gastos por cartão (mês)</h2>
                <div style={styles.chartWrap}>
                  {expenseByCard.length === 0 ? (
                    <div style={styles.empty}>Sem gastos no cartão neste mês.</div>
                  ) : (
                    <ResponsiveContainer width="100%" height={320}>
                      <PieChart>
                        <Pie
                          data={expenseByCard}
                          dataKey="value"
                          nameKey="name"
                          innerRadius={70}
                          outerRadius={110}
                          onClick={(data) => {
                            setSelectedCardChart(data?.name || null);
                            setSelectedCategory(null);
                          }}
                        >
                          {expenseByCard.map((_, idx) => (
                            <Cell key={idx} fill={CHART_COLORS[(idx + 8) % CHART_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(v) => BRL.format(Number(v || 0))} />

                        {/* Legenda clicável (resolve seu pedido de clicar na referência/legenda) */}
                        <Legend
                          content={
                            <ClickableLegend
                              onItemClick={(name) => {
                                setSelectedCardChart(name || null);
                                setSelectedCategory(null);
                              }}
                            />
                          }
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  )}
                </div>
                <div style={styles.hint}>Clique na fatia ou na legenda do cartão para ver o detalhamento abaixo.</div>
              </section>

              <section style={styles.card}>
                <h2 style={styles.h2}>Detalhamento {selectedCategory ? `— Categoria: ${selectedCategory}` : ""}</h2>

                {!selectedCategory ? (
                  <div style={styles.empty}>Selecione uma categoria no gráfico.</div>
                ) : selectedCategoryItems.length === 0 ? (
                  <div style={styles.empty}>Sem itens nessa categoria no mês.</div>
                ) : (
                  <div style={styles.table}>
                    <div style={{ ...styles.row, ...styles.rowHeader, gridTemplateColumns: "140px 1.6fr 140px 140px 140px" }}>
                      <div>Venc.</div>
                      <div>Descrição</div>
                      <div>Forma</div>
                      <div>Valor</div>
                      <div>Pago?</div>
                    </div>

                    {selectedCategoryItems.map((it) => {
                      const d = new Date(it.dueDate);
                      const venc = `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`;
                      return (
                        <div key={it.id} style={{ ...styles.row, gridTemplateColumns: "140px 1.6fr 140px 140px 140px" }}>
                          <div>{venc}</div>
                          <div style={{ fontWeight: 700 }}>{it.note || "(sem descrição)"}</div>
                          <div>{it.category}</div>
                          <div style={{ fontWeight: 900 }}>{BRL.format(Number(it.amount || 0))}</div>
                          <div>{it.paid ? "Pago" : "Em aberto"}</div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>

              <section style={styles.card}>
                <h2 style={styles.h2}>Detalhamento {selectedCardChart ? `— Cartão: ${selectedCardChart}` : ""}</h2>

                {!selectedCardChart ? (
                  <div style={styles.empty}>Selecione um cartão no gráfico “Gastos por cartão”.</div>
                ) : selectedCardItems.length === 0 ? (
                  <div style={styles.empty}>Sem itens desse cartão no mês.</div>
                ) : (
                  <div style={styles.table}>
                    <div style={{ ...styles.row, ...styles.rowHeader, gridTemplateColumns: "140px 1.6fr 140px 140px 180px" }}>
                      <div>Venc.</div>
                      <div>Descrição</div>
                      <div>Categoria</div>
                      <div>Valor</div>
                      <div>Pessoa</div>
                    </div>

                    {selectedCardItems.map((it) => {
                      const d = new Date(it.dueDate);
                      const venc = `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`;
                      const personLabel = (it.personName || "").trim() ? it.personName : "Meu";
                      return (
                        <div key={it.id} style={{ ...styles.row, gridTemplateColumns: "140px 1.6fr 140px 140px 180px" }}>
                          <div>{venc}</div>
                          <div style={{ fontWeight: 800 }}>{it.note || "(sem descrição)"}</div>
                          <div>{it.category || "—"}</div>
                          <div style={{ fontWeight: 1000 }}>{BRL.format(Number(it.amount || 0))}</div>
                          <div>{personLabel}</div>
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
            <>
              <section style={styles.grid2}>
                <div style={styles.card}>
                  <h2 style={styles.h2}>Resumo do mês (despesas)</h2>

                  {insights.topCats.length === 0 ? (
                    <div style={styles.empty}>Sem despesas no mês.</div>
                  ) : (
                    <ResponsiveContainer width="100%" height={320}>
                      <BarChart data={insights.topCats.slice(0, 8)}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="name" />
                        <YAxis />
                        <Tooltip formatter={(v) => BRL.format(Number(v || 0))} />
                        <Bar dataKey="value">
                          {insights.topCats.slice(0, 8).map((_, idx) => (
                            <Cell key={idx} fill={CHART_COLORS[idx % CHART_COLORS.length]} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  )}

                  <div style={styles.hint}>Mostrando as 8 categorias com mais gasto.</div>
                </div>

                <div style={styles.card}>
                  <h2 style={styles.h2}>Sugestões de economia</h2>

                  {insights.suggestions.length === 0 ? (
                    <div style={styles.empty}>Sem sugestões ainda.</div>
                  ) : (
                    <div style={{ display: "grid", gap: 10 }}>
                      {insights.suggestions.slice(0, 6).map((s, idx) => (
                        <div key={idx} style={styles.suggestionCard}>
                          <div style={{ fontWeight: 900, color: "#0b1b2b" }}>{s.title}</div>
                          <div style={{ color: "#475569", fontSize: 13, marginTop: 4 }}>{s.text}</div>
                        </div>
                      ))}
                    </div>
                  )}

                  <div style={styles.hint}>(Heurística: compara com os 2 meses anteriores e sugere meta de redução)</div>
                </div>
              </section>

              <section style={styles.card}>
                <h2 style={styles.h2}>Lista de gastos (top categorias)</h2>

                {insights.topCats.length === 0 ? (
                  <div style={styles.empty}>Sem dados para listar.</div>
                ) : (
                  <div style={styles.table}>
                    <div style={{ ...styles.row, ...styles.rowHeader, gridTemplateColumns: "1.2fr 200px 240px" }}>
                      <div>Categoria</div>
                      <div>Total</div>
                      <div>Ação</div>
                    </div>

                    {insights.topCats.slice(0, 10).map((c) => (
                      <div key={c.name} style={{ ...styles.row, gridTemplateColumns: "1.2fr 200px 240px" }}>
                        <div style={{ fontWeight: 800 }}>{c.name}</div>
                        <div style={{ fontWeight: 900 }}>{BRL.format(c.value)}</div>
                        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                          <button
                            type="button"
                            style={styles.smallBtn}
                            onClick={() => {
                              setSelectedCategory(c.name);
                              setSelectedCardChart(null);
                              setActiveTab(TAB.GRAFICOS);
                            }}
                          >
                            Ver no gráfico
                          </button>
                        </div>
                      </div>
                    ))}
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

/* ===================== STYLES ===================== */

const styles = {
  page: { minHeight: "100vh", background: "#0b1220", padding: 16 },
  shell: { display: "grid", gridTemplateColumns: "280px 1fr", gap: 14, alignItems: "start" },

  sidebar: {
    background: "#0f172a",
    border: "1px solid rgba(255,255,255,0.06)",
    borderRadius: 14,
    padding: 14,
    position: "sticky",
    top: 16,
    height: "calc(100vh - 32px)",
    display: "grid",
    gridAutoRows: "min-content",
    gap: 12,
  },
  sideTitle: { fontWeight: 1000, color: "#e2e8f0", letterSpacing: 0.2, fontSize: 16 },
  sideGroup: { display: "grid", gap: 8 },
  sideLabel: { color: "#94a3b8", fontSize: 12, fontWeight: 800 },
  sideSelect: {
    height: 40,
    borderRadius: 10,
    border: "1px solid rgba(255,255,255,0.10)",
    padding: "0 10px",
    outline: "none",
    fontSize: 14,
    background: "#0b1220",
    color: "#e2e8f0",
  },
  sideCheckRow: { display: "flex", alignItems: "center", gap: 10, color: "#e2e8f0", fontSize: 13, fontWeight: 700 },
  sideBtn: {
    height: 42,
    borderRadius: 10,
    border: "1px solid rgba(255,255,255,0.10)",
    background: "#0b1220",
    color: "#e2e8f0",
    fontWeight: 900,
    cursor: "pointer",
    textAlign: "left",
    padding: "0 12px",
  },
  sideBtnActive: {
    height: 42,
    borderRadius: 10,
    border: "1px solid rgba(255,255,255,0.18)",
    background: "#1d4ed8",
    color: "#fff",
    fontWeight: 1000,
    cursor: "pointer",
    textAlign: "left",
    padding: "0 12px",
  },
  sideFooter: {
    marginTop: "auto",
    borderTop: "1px solid rgba(255,255,255,0.08)",
    paddingTop: 12,
    color: "#e2e8f0",
    display: "grid",
    gap: 6,
  },

  main: { background: "#f6f7fb", borderRadius: 14, padding: 16, minHeight: "calc(100vh - 32px)" },

  topHeader: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 12 },
  brand: { display: "flex", alignItems: "center", gap: 12 },
  brandIcon: { fontSize: 26 },
  title: { margin: 0, fontSize: 30, letterSpacing: -0.4, color: "#0b1b2b", fontWeight: 1000 },
  subTitle: { marginTop: 4, color: "#64748b", fontSize: 13, fontWeight: 700 },
  topActions: { display: "flex", gap: 10, alignItems: "center", justifyContent: "flex-end", flexWrap: "wrap" },
  btnSoft: {
    height: 40,
    padding: "0 12px",
    borderRadius: 12,
    border: "1px solid #dbe3f0",
    background: "#fff",
    fontWeight: 900,
    cursor: "pointer",
  },

  cardsRow: { display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 12, marginBottom: 12 },
  cardSmall: {
    background: "#fff",
    border: "1px solid #e6eaf2",
    borderRadius: 14,
    padding: 12,
    boxShadow: "0 6px 22px rgba(9,30,66,0.05)",
    display: "grid",
    gap: 6,
  },
  cardLabel: { fontSize: 12, color: "#64748b", fontWeight: 900 },
  cardValue: { fontSize: 20, color: "#0b1b2b", fontWeight: 1000 },
  cardHint: { fontSize: 12, color: "#94a3b8", fontWeight: 700 },

  grid2: { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12, marginBottom: 12 },

  card: {
    background: "#fff",
    border: "1px solid #e6eaf2",
    borderRadius: 16,
    padding: 16,
    boxShadow: "0 6px 22px rgba(9,30,66,0.06)",
    marginBottom: 12,
  },
  h2: { margin: "2px 0 12px 0", fontSize: 16, color: "#0b1b2b", fontWeight: 1000 },

  chartWrap: { width: "100%", height: 320 },

  form: { display: "grid", gap: 14 },
  grid: { display: "grid", gap: 12, gridTemplateColumns: "repeat(5, minmax(0, 1fr))" },
  field: { display: "grid", gap: 6 },
  label: { fontSize: 12, color: "#4a5568", fontWeight: 900 },
  input: {
    height: 40,
    borderRadius: 10,
    border: "1px solid #dbe3f0",
    padding: "0 12px",
    outline: "none",
    fontSize: 14,
    width: "100%",
    boxSizing: "border-box",
  },
  select: {
    height: 40,
    borderRadius: 10,
    border: "1px solid #dbe3f0",
    padding: "0 10px",
    outline: "none",
    fontSize: 14,
    background: "#fff",
    width: "100%",
    boxSizing: "border-box",
  },
  hint: { fontSize: 12, color: "#718096", fontWeight: 700 },

  installmentBox: {
    border: "1px dashed #dbe3f0",
    borderRadius: 14,
    padding: 12,
    display: "grid",
    gap: 12,
    background: "#fbfcff",
  },
  installmentGrid: { display: "grid", gap: 12, gridTemplateColumns: "repeat(2, minmax(0, 1fr))" },
  checkboxRow: { display: "flex", alignItems: "center", gap: 10, fontSize: 14, color: "#2d3748", fontWeight: 800 },
  checkboxRowSmall: { display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "#2d3748", whiteSpace: "nowrap", fontWeight: 800 },

  actionsRow: { display: "flex", justifyContent: "flex-end" },
  buttonPrimary: {
    height: 42,
    padding: "0 16px",
    borderRadius: 12,
    border: 0,
    background: "#2563eb",
    color: "#fff",
    fontWeight: 1000,
    cursor: "pointer",
  },

  table: { display: "grid", gap: 8 },
  row: {
    display: "grid",
    gap: 10,
    alignItems: "center",
    padding: "10px 10px",
    border: "1px solid #eef2f8",
    borderRadius: 12,
  },
  rowHeader: { background: "#f8fafc", fontSize: 12, color: "#475569", fontWeight: 1000 },
  rowActions: { display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" },
  smallBtn: {
    height: 34,
    padding: "0 10px",
    borderRadius: 10,
    border: "1px solid #dbe3f0",
    background: "#fff",
    cursor: "pointer",
    fontWeight: 900,
    fontSize: 12,
  },
  dangerBtn: { borderColor: "#fecaca", color: "#b91c1c" },
  empty: { color: "#64748b", padding: 10, fontWeight: 800 },

  suggestionCard: {
    border: "1px solid #e6eaf2",
    background: "#fff",
    borderRadius: 14,
    padding: 12,
    boxShadow: "0 6px 18px rgba(9,30,66,0.04)",
  },

  pill: {
    height: 34,
    padding: "0 12px",
    borderRadius: 999,
    border: "1px solid #dbe3f0",
    background: "#fff",
    cursor: "pointer",
    fontWeight: 900,
    fontSize: 12,
  },
  pillActive: {
    height: 34,
    padding: "0 12px",
    borderRadius: 999,
    border: "1px solid #1d4ed8",
    background: "#1d4ed8",
    color: "#fff",
    cursor: "pointer",
    fontWeight: 1000,
    fontSize: 12,
  },
};
