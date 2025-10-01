import fetch from "node-fetch";

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

export default async function handler(req, res) {
  try {
    // --- LOGIN ---
    if (req.method === "GET" && req.query && req.query.mode === "login") {
      const pass = req.query.pass || "";
      const ok = pass === (process.env.LOGIN_CODE || DEFAULT_LOGIN);
      return res.status(200).json({ ok });
    }

    if (req.method !== "POST") {
      return res.status(405).json({ ok: false, error: "Only POST for calculation" });
    }

    const body = req.body || {};
    const dlugosc = Number(body.dlugosc ?? body.B4 ?? 0);
    const narozniki = Number(body.narozniki ?? body.B5 ?? 0);
    const wysokosc = String(body.wysokosc ?? "");
    const kolor = String(body.kolor ?? "").trim();

    if (!wysokosc || !kolor) {
      return res.status(400).json({ ok: false, error: "Brakuje parametrów: wysokosc i/lub kolor" });
    }

    const B4 = dlugosc || 0;
    const B5 = Math.max(0, parseInt(narozniki) || 0);

    // --------- formuły ----------
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

    // --------- pobranie arkusza ----------
    const sheetId = process.env.SHEET_ID || DEFAULT_SHEET_ID;
    const gidMap = (process.env.GID_MAP ? (() => {
      try { return JSON.parse(process.env.GID_MAP); } catch(e) { return DEFAULT_GID_MAP; }
    })() : DEFAULT_GID_MAP);

    const gid = gidMap[wysokosc] || gidMap[String(wysokosc)] || null;

    let produkty = [];
    if (gid) {
      const url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:json&gid=${encodeURIComponent(gid)}`;
      const fetchRes = await fetch(url, { redirect: "follow" });
      if (fetchRes.ok) {
        const text = await fetchRes.text();
        const firstBrace = text.indexOf("{");
        const lastBrace = text.lastIndexOf("}");
        if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
          const jsonText = text.slice(firstBrace, lastBrace + 1);
          const parsed = JSON.parse(jsonText);
          produkty = (parsed.table?.rows || []).map(r => ({
            ref: r.c?.[0]?.v || "",
            nazwa: r.c?.[1]?.v || "",
            cena: safeParseFloat(r.c?.[4]?.v)
          }));
        }
      }
    }

    // --------- budowanie wyników ----------
    let total = 0;
    const rows = [];

    function dodaj(nazwa, qty) {
      const keyword = String(nazwa || "").toUpperCase();
      const kolorU = String(kolor || "").toUpperCase();
      const znalezione = produkty.filter(
        p => p.nazwa?.toUpperCase().includes(keyword) &&
             (!kolorU || p.nazwa.toUpperCase().includes(kolorU))
      );

      if (!znalezione.length) {
        rows.push({ ref: "", nazwa: `${nazwa} (brak w arkuszu)`, cena: 0, qty });
        return;
      }

      if (znalezione.length === 1) {
        const w = znalezione[0];
        const cena = isNaN(Number(w.cena)) ? 0 : Number(w.cena);
        const wartosc = cena * qty;
        total += wartosc;
        rows.push({ ref: w.ref, nazwa: w.nazwa, cena, qty });
      } else {
        // wiele opcji → wrzucamy tablicę wariantów
        const warianty = znalezione.map(w => {
          const cena = isNaN(Number(w.cena)) ? 0 : Number(w.cena);
          return { ref: w.ref, nazwa: w.nazwa, cena, qty };
        });
        rows.push(warianty);
      }
    }

    dodaj("Siatka", Siatka);
    dodaj("SŁUPEK", B8);
    dodaj("DRUT NACIĄGOWY", B9);
    dodaj("DRUT WIĄZAŁKOWY", B10);
    dodaj("NAPINACZ", B11);
    dodaj("NASADKA", B12);
    dodaj("PRZELOT", B13);
    dodaj("OBEJMA", B14);
    dodaj("ŚRUBA", B15);
    dodaj("PRĘT", B16);

    return res.status(200).json({ ok: true, rows, suma: total });
  } catch (err) {
    console.error("API kalkulator error:", err);
    return res.status(500).json({ ok: false, error: String(err) });
  }
}
