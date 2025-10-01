import fetch from "node-fetch";

/**
 * /api/kalkulator
 * - GET ?mode=login&pass=...   -> { ok: true/false }
 * - POST (JSON) { dlugosc, narozniki, wysokosc, kolor } -> { ok:true, html: "<tr>...</tr>" }
 */

const DEFAULT_LOGIN = process.env.LOGIN_CODE || "lm-10";
const DEFAULT_SHEET_ID = process.env.SHEET_ID || "1ady3fw4DZBHYeJ0yumcUGCUcX4Qp1w2tA79n2-9DvJQ";
const DEFAULT_GID_MAP = (() => {
  try {
    return process.env.GID_MAP ? JSON.parse(process.env.GID_MAP) : { "1": "0", "1.2": "1288678779", "1.5": "1115203468" };
  } catch (e) {
    return { "1": "0", "1.2": "1288678779", "1.5": "1115203468" };
  }
})();

function safeParseFloat(v) {
  if (v === null || v === undefined) return NaN;
  return parseFloat(String(v).replace(",", "."));
}

function fmtNum(v, digits = 2) {
  if (v === null || v === undefined || isNaN(v)) return "";
  return Number.isInteger(v) ? String(v) : v.toFixed(digits);
}

export default async function handler(req, res) {
  try {
    // --- LOGIN (GET) ---
    if (req.method === "GET" && req.query && req.query.mode === "login") {
      const pass = req.query.pass || "";
      const ok = pass === (process.env.LOGIN_CODE || DEFAULT_LOGIN);
      res.setHeader("Content-Type", "application/json");
      return res.status(200).json({ ok });
    }

    // --- ONLY POST for calc ---
    if (req.method !== "POST") {
      res.setHeader("Content-Type", "application/json");
      return res.status(405).json({ ok: false, error: "Only POST for calculation" });
    }

    // body should be already parsed by Vercel (JSON)
    const body = req.body || {};
    const dlugosc = Number(body.dlugosc ?? body.B4 ?? 0);
    const narozniki = Number(body.narozniki ?? body.B5 ?? 0);
    const wysokosc = String(body.wysokosc ?? "");
    const kolor = String(body.kolor ?? "").trim();

    if (!wysokosc || !kolor) {
      return res.status(400).json({ ok: false, error: "Brakuje parametrów: wysokosc i/lub kolor" });
    }

    const B4 = Number(dlugosc) || 0;
    const B5 = Math.max(0, parseInt(narozniki) || 0);

    // --------- formuły (identyczne do frontendu) ----------
    let D4;
    if (B4 <= 25) D4 = 2;
    else if (B4 <= 50) D4 = 4;
    else if (B4 <= 75) D4 = 6;
    else if (B4 <= 100) D4 = 8;
    else D4 = null;

    let D9 = B4 * 3;
    let E9 = (B4 * 5) / 10;

    let F4;
    if (B4 <= 25) F4 = 0;
    else if (B4 <= 50) F4 = 1;
    else if (B4 <= 75) F4 = 2;
    else if (B4 <= 100) F4 = 3;
    else F4 = null;

    let E6 = (F4 === null) ? null : (B5 + F4);
    let F6 = (D4 === null) ? null : (B5 * 2) + D4;
    let G4 = Math.ceil(B4 / 2.5) + 1;
    let H4 = (F4 === null) ? null : 6 + (F4 * 6);
    let G6 = (H4 === null) ? null : (B5 * 6) + H4;
    let H6 = (E6 === null || G4 === null) ? null : (G4 - E6 - 2);
    let H7 = (H6 === null) ? null : (H6 * 3);

    let B8 = (G4 === null || F6 === null) ? null : (G4 + F6);
    let B9 = Math.max(1, Math.ceil(D9 / 50));
    let B10 = (E9 <= 50) ? 1 : 2;
    let B11 = G6;
    let B12 = F6;
    let B13 = (H7 === null) ? null : Math.ceil(H7 / 12);
    let B14 = (B12 === null || B11 === null) ? null : (B12 + B11);
    let B15 = (B11 === null) ? null : Math.ceil(B11 / 2);
    let B16 = B12;
    let Siatka = Math.ceil(B4 / 10);

    // --------- pobieranie cennika z Google Sheets ----------
    const sheetId = process.env.SHEET_ID || DEFAULT_SHEET_ID;
    const gidMap = (process.env.GID_MAP ? (() => {
      try { return JSON.parse(process.env.GID_MAP); } catch(e) { return DEFAULT_GID_MAP; }
    })() : DEFAULT_GID_MAP);

    const gid = gidMap[wysokosc] || gidMap[String(wysokosc)] || null;

    let produkty = [];
    if (gid) {
      const url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:json&gid=${encodeURIComponent(gid)}`;
      const fetchRes = await fetch(url, { redirect: "follow" });
      if (!fetchRes.ok) {
        // nie przerywamy — zwrócimy obliczenia ale bez produktów
        console.warn("Google Sheets fetch status:", fetchRes.status);
      } else {
        const text = await fetchRes.text();
        // bezpieczne wydobycie JSON z wrappera google.visualization.Query.setResponse(...)
        const firstBrace = text.indexOf("{");
        const lastBrace = text.lastIndexOf("}");
        if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
          const jsonText = text.slice(firstBrace, lastBrace + 1);
          const parsed = JSON.parse(jsonText);
          produkty = (parsed.table && parsed.table.rows ? parsed.table.rows.map(r => ({
            ref: r.c && r.c[0] ? r.c[0].v : "",
            nazwa: r.c && r.c[1] ? r.c[1].v : "",
            cena: r.c && r.c[4] ? safeParseFloat(r.c[4].v) : NaN
          })) : []);
        }
      }
    }

    // ---------- funkcja pomocnicza generująca wiersz(y) ----------
    let total = 0;
    function szukaj(nazwa, qty) {
      const keyword = String(nazwa || "").toUpperCase();
      const kolorU = String(kolor || "").toUpperCase();
      const znalezione = produkty.filter(p => p.nazwa && p.nazwa.toUpperCase().includes(keyword) && (!kolorU || p.nazwa.toUpperCase().includes(kolorU)));

      if (!znalezione || znalezione.length === 0) {
        return `<tr><td></td><td>${nazwa} (brak w arkuszu)</td><td></td><td>${fmtNum(qty,0)}</td><td>0.00</td></tr>`;
      } else if (znalezione.length === 1) {
        const w = znalezione[0];
        const cena = isNaN(Number(w.cena)) ? 0 : Number(w.cena);
        const wartosc = (isNaN(cena) ? 0 : cena) * (isNaN(qty) ? 0 : Number(qty));
        total += wartosc;
        return `<tr><td>${w.ref}</td><td>${w.nazwa}</td><td>${fmtNum(cena,2)}</td><td>${fmtNum(qty,0)}</td><td>${fmtNum(wartosc,2)}</td></tr>`;
      } else {
        // wiele wyników -> informacja (w razie potrzeby można rozszerzyć o <select>)
        // Tutaj zwracamy listę możliwych opcji jako podwiersze (użytkownik może potem wybrać)
        const optionsHtml = znalezione.map(w => {
          const cena = isNaN(Number(w.cena)) ? 0 : Number(w.cena);
          const wartosc = cena * (isNaN(qty) ? 0 : Number(qty));
          return `<div>${w.ref} — ${w.nazwa} — ${fmtNum(cena,2)} — ilość: ${fmtNum(qty,0)} — wartość: ${fmtNum(wartosc,2)}</div>`;
        }).join("");
        return `<tr><td></td><td>Wybierz rodzaj dla ${nazwa}</td><td colspan="3">${optionsHtml}</td></tr>`;
      }
    }

    // generuj html tabeli (bez tagu <table> — frontend wstawia do swojej tabeli)
    let html = "";
    html += `<tr class="header-row"><th>Referencja</th><th>Nazwa</th><th>Cena</th><th>Ilość</th><th>Wartość</th></tr>\n`;
    html += szukaj("Siatka", Siatka) + "\n";
    html += szukaj("SŁUPEK", B8) + "\n";
    html += szukaj("DRUT NACIĄGOWY", B9) + "\n";
    html += szukaj("DRUT WIĄZAŁKOWY", B10) + "\n";
    html += szukaj("NAPINACZ", B11) + "\n";
    html += szukaj("NASADKA", B12) + "\n";
    html += szukaj("PRZELOT", B13) + "\n";
    html += szukaj("OBEJMA", B14) + "\n";
    html += szukaj("ŚRUBA", B15) + "\n";
    html += szukaj("PRĘT", B16) + "\n";
    html += `<tr class="sum-row"><td colspan="4">SUMA</td><td id="suma">${fmtNum(total,2)}</td></tr>\n`;

    res.setHeader("Content-Type", "application/json");
    return res.status(200).json({ ok: true, html });
  } catch (err) {
    console.error("API kalkulator error:", err);
    res.setHeader("Content-Type", "application/json");
    return res.status(500).json({ ok: false, error: String(err) });
  }
}
