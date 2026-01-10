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

// Você pode editar/expandir isso depois:
const DEFAULT_CARDS = ["Nubank", "Inter", "C6", "Itaú", "Santander", "Outro"];

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

/* ===================== TABS ===================== */

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

  // ===== NOVO: cartão/pessoa =====
  const [isCardPurchase, setIsCardPurchase] = useState(false);
  const [cardName, setCardName] = useState(DEFAULT_CARDS[0]);
  const [personName, setPersonName] = useState("");

  // Parcelamento
  const [isInstallment, setIsInstallment] = useState(false);
  const [installments, setInstallments] = useState(2);
  const [installmentStartPaid, setInstallmentStartPaid] = useState(false);

  // Gráficos: categoria selecionada
  const [selectedCategory, setSelectedCategory] = useState(null);

  // Aba Cartões
  const [selectedCardTab, setSelectedCardTab] = useState(""); // nome do cartão
  const [personFilter, setPersonFilter] = useState(""); // filtro por pessoa dentro de cartão

  const dueDatePreview = useMemo(() => {
    const d = safeDate(year, monthIndex, Number(dueDay));
    return d;
  }, [year, monthIndex, dueDay]);

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

  // Itens do mês (base)
  const itemsThisMonthBase = useMemo(() => {
    return items.filter((it) => {
      const d = new Date(it.dueDate);
      return d.getFullYear() === year && d.getMonth() === monthIndex;
    });
  }, [items, year, monthIndex]);

  // Itens do mês (com filtros)
  const itemsThisMonth = useMemo(() => {
    let list = [...itemsThisMonthBase].sort(
      (a, b) => new Date(a.dueDate) - new Date(b.dueDate)
    );

    if (onlyOpenInstallments) {
      list = list.filter((it) => it.installment && !it.paid);
    }

    return list;
  }, [itemsThisMonthBase, onlyOpenInstallments]);

  // Totais do mês (sempre com base SEM filtro)
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

  // Pagas x Em aberto (do mês, só despesas)
  const paidOpenStats = useMemo(() => {
    const expenses = itemsThisMonthBase.filter((x) => x.type === "expense");
    const paid = expenses.filter((x) => !!x.paid).length;
    const open = expenses.filter((x) => !x.paid).length;
    return { paid, open, total: expenses.length };
  }, [itemsThisMonthBase]);

  /* ===================== DATASETS GRÁFICOS ===================== */

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

    // Normaliza pessoa: se não preencher, fica ""
    const pName = (personName || "").trim();
    const cName = isCardPurchase ? (cardName || "").trim() : "";

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

        // ===== NOVO =====
        isCardPurchase: Boolean(isCardPurchase),
        cardName: cName,
        personName: pName, // opcional
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

          // ===== NOVO =====
          isCardPurchase: Boolean(isCardPurchase),
          cardName: cName,
          personName: pName, // opcional
        });
      }
    }

    // reset form
    setAmount("");
    setNote("");
    setIsInstallment(false);
    setInstallments(2);
    setInstallmentStartPaid(false);

    // reset cartão/pessoa
    setIsCardPurchase(false);
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
    await Promise.all(
      groupItems.map((it) =>
        deleteDoc(doc(db, "users", userUid, "transactions", it.id))
      )
    );
  }

  async function markInstallmentGroupPaid(groupId) {
    if (!userUid) return;
    const groupItems = items.filter((it) => it.installment?.groupId === groupId);
    await Promise.all(
      groupItems.map((it) =>
        updateDoc(doc(db, "users", userUid, "transactions", it.id), { paid: true })
      )
    );
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

  /* ===================== ABA CARTÕES (NOVO) ===================== */

  // cartões presentes no Firestore (do usuário)
  const cardsFound = useMemo(() => {
    const s = new Set();
    for (const it of items) {
      if (it.isCardPurchase && it.cardName) s.add(it.cardName);
    }
    // se não tiver nenhum, pelo menos mostra os padrões
    const arr = Array.from(s);
    if (arr.length === 0) return DEFAULT_CARDS;
    return arr.sort((a, b) => a.localeCompare(b));
  }, [items]);

  // garante ter um cartão selecionado ao entrar na aba
  useEffect(() => {
    if (activeTab !== TAB.CARTOES) return;
    if (!selectedCardTab) {
      setSelectedCardTab(cardsFound[0] || "");
    }
  }, [activeTab, selectedCardTab, cardsFound]);

  // itens do mês por cartão selecionado
  const cardItemsThisMonth = useMemo(() => {
    if (!selectedCardTab) return [];
    let list = itemsThisMonthBase.filter(
      (it) => it.isCardPurchase && (it.cardName || "") === selectedCardTab
    );

    // filtro opcional por pessoa (se preencher)
    const pf = (personFilter || "").trim().toLowerCase();
    if (pf) {
      list = list.filter((it) => (it.personName || "").toLowerCase().includes(pf));
    }

    return list.sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));
  }, [itemsThisMonthBase, selectedCardTab, personFilter]);

  // “quem me deve” por cartão (somente despesas em aberto do mês filtrado)
  const owedByPersonThisMonth = useMemo(() => {
    // regra: conta “deve” quando:
    // - isCardPurchase = true
    // - personName preenchido
    // - type expense
    // - NOT paid
    const map = new Map();
    for (const it of cardItemsThisMonth) {
      if (it.type !== "expense") continue;
      if (it.paid) continue;
      const p = (it.personName || "").trim();
      if (!p) continue; // vazio = meu, não entra como dívida
      const v = Number(it.amount || 0);
      map.set(p, (map.get(p) || 0) + v);
    }
    return Array.from(map.entries())
      .map(([name, value]) => ({ name, value: Number(value.toFixed(2)) }))
      .sort((a, b) => b.value - a.value);
  }, [cardItemsThisMonth]);

  // total do cartão no mês (tudo)
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
          text: `Este mês: ${BRL.format(cat.value)} | média dos últimos 2 meses: ${BRL.format(
            prevAvgPerMonth
          )}. Tente limitar para ~ ${BRL.format(target)}.`,
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
            <select
              value={monthIndex}
              onChange={(e) => setMonthIndex(Number(e.target.value))}
              style={styles.sideSelect}
            >
              {[
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
              ].map((m, idx) => (
                <option key={m} value={idx}>
                  {m}
                </option>
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
                <option key={y} value={y}>
                  {y}
                </option>
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
                          <option key={c} value={c}>
                            {c}
                          </option>
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
                          <option key={d} value={d}>
                            {d}
                          </option>
                        ))}
                      </select>
                      <div style={styles.hint}>
                        Venc.: {pad2(dueDatePreview.getDate())}/{pad2(dueDatePreview.getMonth() + 1)}/
                        {dueDatePreview.getFullYear()}
                      </div>
                    </div>
                  </div>

                  {/* ===== NOVO BLOCO CARTÃO/PESSOA ===== */}
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
                          <label style={styles.label}>Cartão</label>
                          <select value={cardName} onChange={(e) => setCardName(e.target.value)} style={styles.select}>
                            {cardsFound.map((c) => (
                              <option key={c} value={c}>
                                {c}
                              </option>
                            ))}
                          </select>
                          <div style={styles.hint}>Isso alimenta automaticamente a aba “Cartões”.</div>
                        </div>

                        <div style={styles.field}>
                          <label style={styles.label}>Pessoa (opcional)</label>
                          <input
                            value={personName}
                            onChange={(e) => setPersonName(e.target.value)}
                            placeholder="Se vazio, é meu"
                            style={styles.input}
                          />
                          <div style={styles.hint}>Se preencher, vira “dívida” e aparece nos filtros.</div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Parcelamento */}
                  <div style={styles.installmentBox}>
                    <label style={styles.checkboxRow}>
                      <input type="checkbox" checked={isInstallment} onChange={(e) => setIsInstallment(e.target.checked)} />
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
                    <button type="submit" style={styles.buttonPrimary}>
                      Adicionar
                    </button>
                  </div>
                </form>
              </section>

              <section style={styles.card}>
                <h2 style={styles.h2}>Lançamentos do mês</h2>

                {itemsThisMonth.length === 0 ? (
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

                    {itemsThisMonth.map((it) => {
                      const d = new Date(it.dueDate);
                      const venc = `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`;
                      const parcelaTxt = it.installment ? `${it.installment.index}/${it.installment.total}` : "-";

                      const cardTxt = it.isCardPurchase
                        ? `${it.cardName || "Cartão"}${it.personName ? ` • ${it.personName}` : ""}`
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

          {/* ===================== ABA CARTÕES (NOVO) ===================== */}
          {activeTab === TAB.CARTOES && (
            <>
              <section style={styles.card}>
                <h2 style={styles.h2}>Cartões</h2>

                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
                  {cardsFound.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => {
                        setSelectedCardTab(c);
                        setPersonFilter("");
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

                <div style={{ marginTop: 12 }}>
                  <div style={styles.sideLabel}>Filtrar por pessoa</div>
                  <input
                    value={personFilter}
                    onChange={(e) => setPersonFilter(e.target.value)}
                    placeholder="Digite o nome (ex: Maria)"
                    style={styles.input}
                  />
                  <div style={styles.hint}>
                    Mostra compras no cartão do mês. Se a pessoa estiver preenchida, aparece como dívida.
                  </div>
                </div>
              </section>

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
                          gridTemplateColumns: "120px 1.4fr 120px 150px 120px",
                        }}
                      >
                        <div>Venc.</div>
                        <div>Descrição</div>
                        <div>Valor</div>
                        <div>Pessoa</div>
                        <div>Status</div>
                      </div>

                      {cardItemsThisMonth.map((it) => {
                        const d = new Date(it.dueDate);
                        const venc = `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`;
                        return (
                          <div
                            key={it.id}
                            style={{
                              ...styles.row,
                              gridTemplateColumns: "120px 1.4fr 120px 150px 120px",
                            }}
                          >
                            <div>{venc}</div>
                            <div style={{ fontWeight: 800 }}>{it.note || "(sem descrição)"}</div>
                            <div style={{ fontWeight: 1000 }}>{BRL.format(Number(it.amount || 0))}</div>
                            <div>{(it.personName || "").trim() ? it.personName : "Meu"}</div>
                            <div>{it.paid ? "Pago" : "Em aberto"}</div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </section>
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
                              <Cell key={idx} />
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
                              <Cell key={idx} />
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
                    <div
                      style={{
                        ...styles.row,
                        ...styles.rowHeader,
                        gridTemplateColumns: "140px 1.6fr 140px 140px 140px",
                      }}
                    >
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
                        <div
                          key={it.id}
                          style={{
                            ...styles.row,
                            gridTemplateColumns: "140px 1.6fr 140px 140px 140px",
                          }}
                        >
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
                        <Bar dataKey="value" />
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

                  <div style={styles.hint}>
                    (Heurística: compara com os 2 meses anteriores e sugere meta de redução)
                  </div>
                </div>
              </section>

              <section style={styles.card}>
                <h2 style={styles.h2}>Lista de gastos (top categorias)</h2>

                {insights.topCats.length === 0 ? (
                  <div style={styles.empty}>Sem dados para listar.</div>
                ) : (
                  <div style={styles.table}>
                    <div
                      style={{
                        ...styles.row,
                        ...styles.rowHeader,
                        gridTemplateColumns: "1.2fr 200px 240px",
                      }}
                    >
                      <div>Categoria</div>
                      <div>Total</div>
                      <div>Ação</div>
                    </div>

                    {insights.topCats.slice(0, 10).map((c) => (
                      <div
                        key={c.name}
                        style={{
                          ...styles.row,
                          gridTemplateColumns: "1.2fr 200px 240px",
                        }}
                      >
                        <div style={{ fontWeight: 800 }}>{c.name}</div>
                        <div style={{ fontWeight: 900 }}>{BRL.format(c.value)}</div>
                        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                          <button
                            type="button"
                            style={styles.smallBtn}
                            onClick={() => {
                              setSelectedCategory(c.name);
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
  page: {
    minHeight: "100vh",
    background: "#0b1220",
    padding: 16,
  },

  shell: {
    display: "grid",
    gridTemplateColumns: "280px 1fr",
    gap: 14,
    alignItems: "start",
  },

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
  sideTitle: {
    fontWeight: 1000,
    color: "#e2e8f0",
    letterSpacing: 0.2,
    fontSize: 16,
  },
  sideGroup: {
    display: "grid",
    gap: 8,
  },
  sideLabel: {
    color: "#94a3b8",
    fontSize: 12,
    fontWeight: 800,
  },
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
  sideCheckRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    color: "#e2e8f0",
    fontSize: 13,
    fontWeight: 700,
  },
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

  main: {
    background: "#f6f7fb",
    borderRadius: 14,
    padding: 16,
    minHeight: "calc(100vh - 32px)",
  },

  topHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 12,
  },
  brand: {
    display: "flex",
    alignItems: "center",
    gap: 12,
  },
  brandIcon: {
    fontSize: 26,
  },
  title: {
    margin: 0,
    fontSize: 30,
    letterSpacing: -0.4,
    color: "#0b1b2b",
    fontWeight: 1000,
  },
  subTitle: {
    marginTop: 4,
    color: "#64748b",
    fontSize: 13,
    fontWeight: 700,
  },
  topActions: {
    display: "flex",
    gap: 10,
    alignItems: "center",
    justifyContent: "flex-end",
    flexWrap: "wrap",
  },
  btnSoft: {
    height: 40,
    padding: "0 12px",
    borderRadius: 12,
    border: "1px solid #dbe3f0",
    background: "#fff",
    fontWeight: 900,
    cursor: "pointer",
  },

  cardsRow: {
    display: "grid",
    gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
    gap: 12,
    marginBottom: 12,
  },
  cardSmall: {
    background: "#fff",
    border: "1px solid #e6eaf2",
    borderRadius: 14,
    padding: 12,
    boxShadow: "0 6px 22px rgba(9,30,66,0.05)",
    display: "grid",
    gap: 6,
  },
  cardLabel: {
    fontSize: 12,
    color: "#64748b",
    fontWeight: 900,
  },
  cardValue: {
    fontSize: 20,
    color: "#0b1b2b",
    fontWeight: 1000,
  },
  cardHint: {
    fontSize: 12,
    color: "#94a3b8",
    fontWeight: 700,
  },

  grid2: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: 12,
    marginBottom: 12,
  },

  card: {
    background: "#fff",
    border: "1px solid #e6eaf2",
    borderRadius: 16,
    padding: 16,
    boxShadow: "0 6px 22px rgba(9,30,66,0.06)",
    marginBottom: 12,
  },
  h2: {
    margin: "2px 0 12px 0",
    fontSize: 16,
    color: "#0b1b2b",
    fontWeight: 1000,
  },

  chartWrap: {
    width: "100%",
    height: 320,
  },

  form: {
    display: "grid",
    gap: 14,
  },
  grid: {
    display: "grid",
    gap: 12,
    gridTemplateColumns: "repeat(5, minmax(0, 1fr))",
  },
  field: {
    display: "grid",
    gap: 6,
  },
  label: {
    fontSize: 12,
    color: "#4a5568",
    fontWeight: 900,
  },
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
  hint: {
    fontSize: 12,
    color: "#718096",
    fontWeight: 700,
  },

  installmentBox: {
    border: "1px dashed #dbe3f0",
    borderRadius: 14,
    padding: 12,
    display: "grid",
    gap: 12,
    background: "#fbfcff",
  },
  installmentGrid: {
    display: "grid",
    gap: 12,
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  },
  checkboxRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    fontSize: 14,
    color: "#2d3748",
    fontWeight: 800,
  },
  checkboxRowSmall: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    fontSize: 12,
    color: "#2d3748",
    whiteSpace: "nowrap",
    fontWeight: 800,
  },

  actionsRow: {
    display: "flex",
    justifyContent: "flex-end",
  },
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

  table: {
    display: "grid",
    gap: 8,
  },
  row: {
    display: "grid",
    gridTemplateColumns: "110px 1.4fr 110px 120px 120px 90px 140px 1fr",
    gap: 10,
    alignItems: "center",
    padding: "10px 10px",
    border: "1px solid #eef2f8",
    borderRadius: 12,
  },
  rowHeader: {
    background: "#f8fafc",
    fontSize: 12,
    color: "#475569",
    fontWeight: 1000,
  },
  rowActions: {
    display: "flex",
    gap: 8,
    justifyContent: "flex-end",
    flexWrap: "wrap",
  },
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
  dangerBtn: {
    borderColor: "#fecaca",
    color: "#b91c1c",
  },
  empty: {
    color: "#64748b",
    padding: 10,
    fontWeight: 800,
  },

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