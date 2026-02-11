import React, { useState, useEffect, useMemo } from "react";
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
} from "firebase/firestore";

import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
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

/* ===================== CORES (GRÁFICOS) ===================== */

const CHART_COLORS = [
  "#2563eb",
  "#16a34a",
  "#dc2626",
  "#f59e0b",
  "#7c3aed",
  "#0ea5e9",
  "#ea580c",
  "#059669",
  "#db2777",
  "#334155",
  "#22c55e",
  "#e11d48",
  "#3b82f6",
  "#a855f7",
  "#14b8a6",
  "#f97316",
  "#ef4444",
  "#84cc16",
];

function colorForIndex(i) {
  return CHART_COLORS[i % CHART_COLORS.length];
}

const TAB = {
  LANCAMENTOS: "lancamentos",
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

/* ===================== COMPONENTE ===================== */

export default function FinanceApp() {
  const user = auth.currentUser;
  const userEmail = user?.email || "";
  const userUid = user?.uid || "";

  const [items, setItems] = useState([]);

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

  // Compra no cartão / pessoa
  const [isCardPurchase, setIsCardPurchase] = useState(false);
  const [cardName, setCardName] = useState("");
  const [personName, setPersonName] = useState("");

  // Parcelamento
  const [isInstallment, setIsInstallment] = useState(false);
  const [installments, setInstallments] = useState(2);
  const [installmentStartPaid, setInstallmentStartPaid] = useState(false);

  // Aba Cartões
  const [selectedCardTab, setSelectedCardTab] = useState("");
  const [personFilter, setPersonFilter] = useState("");

  // Gráficos
  const [selectedCategory, setSelectedCategory] = useState(null);

  const dueDatePreview = useMemo(
    () => safeDate(year, monthIndex, Number(dueDay)),
    [year, monthIndex, dueDay]
  );

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
      (err) => console.error("Firestore onSnapshot error:", err)
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
    let list = [...itemsThisMonthBase].sort(
      (a, b) => new Date(a.dueDate) - new Date(b.dueDate)
    );
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

  /* ===================== ✅ LANCAMENTOS: AGRUPAR CARTÃO + SOMAR ===================== */

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

    const grouped = Array.from(groups.values())
      .map((g) => ({ ...g, amount: Number(g.amount.toFixed(2)) }))
      .sort((a, b) => {
        const ac = String(a.cardName).localeCompare(String(b.cardName));
        if (ac !== 0) return ac;
        const ap = String(a.personDisplay).localeCompare(String(b.personDisplay));
        if (ap !== 0) return ap;
        return String(a.type).localeCompare(String(b.type));
      });

    return [...singles, ...grouped];
  }, [itemsThisMonth]);

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

  // Marcar/Desmarcar pago para um grupo (cartão + pessoa) no mês atual
  async function setGroupPaidByCardPerson({ cardName, personDisplay, paid }) {
    if (!userUid) return;

    const c = (cardName || "").trim();
    const p = (personDisplay || "").trim(); // "Meu" ou nome

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

  /* ===================== ABA CARTOES (DETALHADO) ===================== */

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
    let list = itemsThisMonthBase.filter(
      (it) => it.isCardPurchase && (it.cardName || "").trim() === selectedCardTab
    );

    const pfRaw = (personFilter || "").trim().toLowerCase();
    if (pfRaw) {
      if (pfRaw === "meu") {
        list = list.filter((it) => !(it.personName || "").trim());
      } else {
        list = list.filter((it) =>
          (it.personName || "").toLowerCase().includes(pfRaw)
        );
      }
    }

    return list.sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));
  }, [itemsThisMonthBase, selectedCardTab, personFilter]);

  // ✅ NOVO: vencimento (dia) por cartão (modo do dia no mês atual)
  const cardDueDayByCard = useMemo(() => {
    const map = new Map(); // cardName -> { day -> count }
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

    const result = new Map(); // cardName -> bestDay
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

  // ✅ NOVO: vencimento (dia) do cartão selecionado (para mostrar no header)
  const selectedCardDueDay = useMemo(() => {
    if (!selectedCardTab) return null;
    return cardDueDayByCard.get(selectedCardTab) ?? null;
  }, [selectedCardTab, cardDueDayByCard]);

  const cardInvoiceTotals = useMemo(() => {
    let total = 0;
    let paid = 0;
    let open = 0;

    for (const it of cardItemsThisMonth) {
      if (it.type !== "expense") continue;
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
  }, [cardItemsThisMonth]);

  /* ===================== UI ===================== */

  return (
    <div style={styles.page}>
      <div style={styles.shell}>
        {/* Sidebar */}
        <aside style={styles.sidebar}>
          <div style={styles.sideTitle}>Painel</div>

          <div style={styles.sideGroup}>
            <div style={styles.sideLabel}>Mês</div>
            <select
              value={monthIndex}
              onChange={(e) => setMonthIndex(Number(e.target.value))}
              style={styles.sideSelect}
            >
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
            <select
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              style={styles.sideSelect}
            >
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
                <div style={styles.subTitle}>
                  {monthLabel} / {year}
                </div>
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

              <button
                type="button"
                style={{ ...styles.btnSoft, marginLeft: 12 }}
                onClick={handleLogout}
              >
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
              <div style={styles.cardValue}>
                {paidOpenStats.paid} / {paidOpenStats.open}
              </div>
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

                  {/* Compra no cartão */}
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
                          <div style={styles.hint}>
                            Esse nome cria/usa a subaba na aba “Cartões”.
                          </div>
                        </div>

                        <div style={styles.field}>
                          <label style={styles.label}>Pessoa (opcional)</label>
                          <input
                            value={personName}
                            onChange={(e) => setPersonName(e.target.value)}
                            placeholder="Se vazio, é meu"
                            style={styles.input}
                          />
                          <div style={styles.hint}>
                            Se vazio = Meu (seu gasto). Se preencher = aparece nos filtros.
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Parcelamento */}
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
                          <div style={styles.hint}>
                            Ex.: 10 = cria 10 parcelas (mês atual + próximos meses)
                          </div>
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
                    <button type="submit" style={styles.buttonPrimary}>
                      Adicionar
                    </button>
                  </div>
                </form>
              </section>

              <section style={styles.card}>
                <h2 style={styles.h2}>Lançamentos do mês</h2>

                {groupedForLancamentos.length === 0 ? (
                  <div style={styles.empty}>Nenhum lançamento neste mês (com os filtros atuais).</div>
                ) : (
                  <div style={styles.table}>
                    <div style={{ ...styles.row, ...styles.rowHeader }}>
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

                    {groupedForLancamentos.map((it) => {
                      // ✅ Itens normais (não-cartão): item por item
                      if (it.__kind === "single") {
                        const venc = toVencBR(it.dueDate);

                        const parcelaTxt = it.installment
                          ? `${it.installment.index}/${it.installment.total}`
                          : "-";

                        const cardTxt = it.isCardPurchase
                          ? `${(it.cardName || "").trim() || "—"} • ${displayPersonName(it.personName)}`
                          : "-";

                        const isIncome = it.type === "income";

                        return (
                          <div key={it.id} style={styles.row}>
                            <div>{venc}</div>
                            <div style={{ fontWeight: 700 }}>{it.note || "(sem descrição)"}</div>
                            <div>{isIncome ? "Receita" : "Despesa"}</div>
                            <div>{it.category}</div>
                            <div style={{ fontWeight: 900 }}>{BRL.format(Number(it.amount || 0))}</div>
                            <div>{parcelaTxt}</div>
                            <div>{cardTxt}</div>

                            {/* ✅ REGRA: receita não mostra pago/não pago */}
                            <div>
                              {isIncome ? (
                                <span style={{ color: "#64748b", fontWeight: 700 }}>—</span>
                              ) : (
                                <label style={styles.checkboxRowSmall}>
                                  <input
                                    type="checkbox"
                                    checked={!!it.paid}
                                    onChange={() => togglePaid(it.id, it.paid)}
                                  />
                                  <span>{it.paid ? "Pago" : "Em aberto"}</span>
                                </label>
                              )}
                            </div>

                            <div style={styles.rowActions}>
                              <button type="button" style={styles.smallBtn} onClick={() => removeItem(it.id)}>
                                Excluir
                              </button>
                            </div>
                          </div>
                        );
                      }

                      // ✅ Grupos de cartão: SOMADOS (1 linha só) + checkbox pago (somente se for despesa)
                      const isIncomeGroup = it.type === "income";
                      const tipoTxt = isIncomeGroup ? "Receita" : "Despesa";

                      const checked = !!it.paidAll;
                      const labelTxt = it.paidAll ? "Pago" : it.paidNone ? "Em aberto" : "Parcial";

                      return (
                        <div
                          key={it.id}
                          style={{
                            ...styles.row,
                            background: "#f8fafc",
                            borderColor: "#e6eaf2",
                          }}
                        >
                          <div style={{ color: "#64748b", fontWeight: 700 }}>—</div>

                          <div style={{ fontWeight: 800 }}>
                            {it.cardName} • {it.personDisplay}{" "}
                            <span style={{ color: "#64748b", fontWeight: 700 }}>
                              ({it.count} itens)
                            </span>
                          </div>

                          <div>{tipoTxt}</div>
                          <div>Cartão</div>

                          <div style={{ fontWeight: 900 }}>
                            {BRL.format(Number(it.amount || 0))}
                          </div>

                          <div>—</div>
                          <div style={{ fontWeight: 700 }}>
                            {it.cardName} • {it.personDisplay}
                          </div>

                          {/* ✅ REGRA: receita não mostra pago/não pago */}
                          <div>
                            {isIncomeGroup ? (
                              <span style={{ color: "#64748b", fontWeight: 700 }}>—</span>
                            ) : (
                              <label style={styles.checkboxRowSmall}>
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() =>
                                    setGroupPaidByCardPerson({
                                      cardName: it.cardName,
                                      personDisplay: it.personDisplay,
                                      paid: !checked,
                                    })
                                  }
                                />
                                <span>{labelTxt}</span>
                              </label>
                            )}
                          </div>

                          <div style={styles.rowActions}>
                            <button
                              type="button"
                              style={styles.smallBtn}
                              onClick={() => {
                                setSelectedCardTab(it.cardName);
                                setPersonFilter(it.personDisplay === "Meu" ? "meu" : it.personDisplay);
                                setActiveTab(TAB.CARTOES);
                              }}
                              title="Ver itens detalhados na aba Cartões"
                            >
                              Ver detalhes
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                <div style={styles.hint}>
                  Compras no cartão aqui aparecem <b>somadas por cartão + pessoa</b>.
                  O detalhamento fica só na aba <b>Cartões</b>.
                </div>
              </section>
            </>
          )}

          {/* ===================== ABA CARTOES (DETALHADO ITEM POR ITEM) ===================== */}
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
                    {/* ✅ AGORA MOSTRA O VENCIMENTO NO NOME DO CARTÃO */}
                    <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
                      {cardsFound.map((c) => {
                        const day = cardDueDayByCard.get(c) ?? null;
                        const label = day ? `${c} (venc. ${pad2(day)})` : c;

                        return (
                          <button
                            key={c}
                            type="button"
                            onClick={() => {
                              setSelectedCardTab(c);
                              setPersonFilter("");
                            }}
                            style={selectedCardTab === c ? styles.pillActive : styles.pill}
                            title={day ? `Vencimento: dia ${pad2(day)}` : "Sem vencimento detectado no mês"}
                          >
                            {label}
                          </button>
                        );
                      })}
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 12 }}>
                      <div style={styles.cardSmall}>
                        <div style={styles.cardLabel}>
                          Fatura (mês) — Total{selectedCardDueDay ? ` (venc. ${pad2(selectedCardDueDay)})` : ""}
                        </div>
                        <div style={styles.cardValue}>{BRL.format(cardInvoiceTotals.total)}</div>
                      </div>
                      <div style={styles.cardSmall}>
                        <div style={styles.cardLabel}>Fatura (mês) — Em aberto</div>
                        <div style={styles.cardValue}>{BRL.format(cardInvoiceTotals.open)}</div>
                      </div>
                      <div style={styles.cardSmall}>
                        <div style={styles.cardLabel}>Fatura (mês) — Pago</div>
                        <div style={styles.cardValue}>{BRL.format(cardInvoiceTotals.paid)}</div>
                      </div>
                    </div>

                    <div style={{ marginTop: 12 }}>
                      <div style={styles.sideLabel}>Filtrar por pessoa</div>
                      <input
                        value={personFilter}
                        onChange={(e) => setPersonFilter(e.target.value)}
                        placeholder='Digite o nome (ex: Matheus) ou "meu"'
                        style={styles.input}
                      />
                      <div style={styles.hint}>
                        Dica: digite <b>meu</b> para ver somente compras onde a pessoa ficou vazia.
                      </div>
                    </div>
                  </>
                )}
              </section>

              {cardsFound.length > 0 && (
                <section style={styles.card}>
                  <h2 style={styles.h2}>
                    Lançamentos do cartão — {selectedCardTab}
                    {selectedCardDueDay ? ` (venc. dia ${pad2(selectedCardDueDay)})` : ""}
                  </h2>

                  {cardItemsThisMonth.length === 0 ? (
                    <div style={styles.empty}>Nenhuma compra registrada neste cartão (no mês filtrado).</div>
                  ) : (
                    <div style={styles.table}>
                      <div
                        style={{
                          ...styles.row,
                          ...styles.rowHeader,
                          gridTemplateColumns: "120px 1.6fr 110px 90px 140px 120px 120px",
                        }}
                      >
                        <div>Venc.</div>
                        <div>Descrição</div>
                        <div>Valor</div>
                        <div>Parcela</div>
                        <div>Pessoa</div>
                        <div>Status</div>
                        <div>Ações</div>
                      </div>

                      {cardItemsThisMonth.map((it) => {
                        const venc = toVencBR(it.dueDate);
                        const parcelaTxt = it.installment ? `${it.installment.index}/${it.installment.total}` : "-";
                        const pessoaTxt = displayPersonName(it.personName);

                        return (
                          <div
                            key={it.id}
                            style={{
                              ...styles.row,
                              gridTemplateColumns: "120px 1.6fr 110px 90px 140px 120px 120px",
                            }}
                          >
                            <div>{venc}</div>
                            <div style={{ fontWeight: 700 }}>{it.note || "(sem descrição)"}</div>
                            <div style={{ fontWeight: 900 }}>{BRL.format(Number(it.amount || 0))}</div>
                            <div>{parcelaTxt}</div>
                            <div>{pessoaTxt}</div>
                            <div>{it.paid ? "Pago" : "Em aberto"}</div>
                            <div style={styles.rowActions}>
                              <button
                                type="button"
                                style={styles.smallBtn}
                                onClick={() => togglePaid(it.id, it.paid)}
z
                              >
                                {it.paid ? "Desmarcar" : "Marcar pago"}
                              </button>
                              <button type="button" style={styles.smallBtn} onClick={() => removeItem(it.id)}>
                                Excluir
                              </button>
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
                            onClick={(data) => setSelectedCategory(data?.name || null)}
                            innerRadius={70}
                            outerRadius={110}
                          >
                            {expenseByCategory.map((_, idx) => (
                              <Cell key={idx} fill={colorForIndex(idx)} />
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
                              <Cell key={idx} fill={colorForIndex(idx)} />
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
                <h2 style={styles.h2}>Detalhamento {selectedCategory ? `— ${selectedCategory}` : ""}</h2>

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
                      const venc = toVencBR(it.dueDate);
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
            </>
          )}

          {/* ===================== ABA RESUMO ===================== */}
          {activeTab === TAB.RESUMO && (
            <section style={styles.card}>
              <h2 style={styles.h2}>Resumo & Economia</h2>
              <div style={styles.empty}>
                Mantido como está por enquanto. Se você quiser, eu monto os cards/gráficos de resumo aqui com as mesmas cores.
              </div>
            </section>
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
  buttonPrimary: { height: 42, padding: "0 16px", borderRadius: 12, border: 0, background: "#2563eb", color: "#fff", fontWeight: 1000, cursor: "pointer" },

  table: { display: "grid", gap: 8 },
  row: {
    display: "grid",
    gridTemplateColumns: "110px 1.4fr 110px 120px 120px 90px 160px 140px 1fr",
    gap: 10,
    alignItems: "center",
    padding: "10px 10px",
    border: "1px solid #eef2f8",
    borderRadius: 12,
    fontSize: 13,
    color: "#0f172a",
  },
  rowHeader: { background: "#f8fafc", fontSize: 12, color: "#475569", fontWeight: 1000 },
  rowActions: { display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" },
  smallBtn: { height: 34, padding: "0 10px", borderRadius: 10, border: "1px solid #dbe3f0", background: "#fff", cursor: "pointer", fontWeight: 900, fontSize: 12 },
  empty: { color: "#64748b", padding: 10, fontWeight: 800 },

  pill: { height: 34, padding: "0 12px", borderRadius: 999, border: "1px solid #dbe3f0", background: "#fff", cursor: "pointer", fontWeight: 900, fontSize: 12 },
  pillActive: { height: 34, padding: "0 12px", borderRadius: 999, border: "1px solid #1d4ed8", background: "#1d4ed8", color: "#fff", cursor: "pointer", fontWeight: 1000, fontSize: 12 },
};
