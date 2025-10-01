export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { wysokosc, dlugosc, narozniki, kolor } = req.body;

  const gidMap = { "1": "0", "1.2": "1288678779", "1.5": "1115203468" };
  const gid = gidMap[wysokosc];
  if (!gid) return res.status(400).json({ error: "Nieprawidłowa wysokość" });

  const sheetId = process.env.SHEET_ID;
  const url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:json&gid=${gid}`;

  try {
    const response = await fetch(url);
    const text = await response.text();
    const json = JSON.parse(text.substr(47).slice(0, -2));

    let produkty = json.table.rows.map(r => ({
      ref: r.c[0]?.v || "",
      nazwa: r.c[1]?.v || "",
      cena: r.c[4] ? parseFloat(r.c[4].v) : 0
    }));

    // ---- FUNKCJE POMOCNICZE ----
    const isBad = v => v === "brak danych" || v === null;
    const fmt = v => {
      if (v === "brak danych" || v === null) return "brak danych";
      if (typeof v === "number") {
        return Number.isInteger(v) ? String(v) : String(Math.round(v * 100) / 100);
      }
      return String(v);
    };

    function wyszukajProdukt(keyword, qty, kolor) {
      const znalezione = produkty.filter(p =>
        p.nazwa && p.nazwa.toUpperCase().includes(keyword.toUpperCase()) &&
        (!kolor || p.nazwa.toUpperCase().includes(kolor.toUpperCase()))
      );

      if (znalezione.length === 0) {
        return { ref: "", nazwa: keyword + " (brak w arkuszu)", cena: 0, qty: qty, wartosc: 0 };
      } else if (znalezione.length === 1) {
        return {
          ref: znalezione[0].ref,
          nazwa: znalezione[0].nazwa,
          cena: znalezione[0].cena,
          qty: qty,
          wartosc: parseFloat(znalezione[0].cena) * (parseFloat(qty) || 0)
        };
      } else {
        // jeśli wiele – zwracamy pierwszy (tu można rozwinąć na wybór)
        return {
          ref: znalezione[0].ref,
          nazwa: znalezione[0].nazwa,
          cena: znalezione[0].cena,
          qty: qty,
          wartosc: parseFloat(znalezione[0].cena) * (parseFloat(qty) || 0)
        };
      }
    }

    // ---- OBLICZENIA ----
    const B4 = parseFloat(dlugosc) || 0;
    const B5 = parseInt(narozniki) || 0;

    let D4;
    if (B4 <= 25) D4 = 2;
    else if (B4 <= 50) D4 = 4;
    else if (B4 <= 75) D4 = 6;
    else if (B4 <= 100) D4 = 8;
    else D4 = "brak danych";

    let D9 = B4 * 3;
    let E9 = (B4 * 5) / 10;

    let F4;
    if (B4 <= 25) F4 = 0;
    else if (B4 <= 50) F4 = 1;
    else if (B4 <= 75) F4 = 2;
    else if (B4 <= 100) F4 = 3;
    else F4 = "brak danych";

    let E6 = isBad(F4) ? "brak danych" : (B5 + F4);
    let F6 = isBad(D4) ? "brak danych" : (B5 * 2) + D4;
    let G4 = Math.ceil(B4 / 2.5) + 1;
    let H4 = isBad(F4) ? "brak danych" : 6 + (F4 * 6);
    let G6 = isBad(H4) ? "brak danych" : (B5 * 6) + H4;
    let H6 = (isBad(E6) || isBad(G4)) ? "brak danych" : (G4 - E6 - 2);
    let H7 = isBad(H6) ? "brak danych" : (H6 * 3);

    let B8 = (isBad(G4) || isBad(F6)) ? "brak danych" : (G4 + F6);
    let B9 = Math.max(1, Math.ceil(D9 / 50));
    let B10 = (E9 <= 50) ? 1 : 2;
    let B11 = G6;
    let B12 = F6;
    let B13 = isBad(H7) ? "brak danych" : Math.ceil(H7 / 12);
    let B14 = (isBad(B12) || isBad(B11)) ? "brak danych" : (B12 + B11);
    let B15 = isBad(B11) ? "brak danych" : Math.ceil(B11 / 2);
    let B16 = B12;
    let Siatka = Math.ceil(B4 / 10);

    // ---- PRODUKTY ----
    const results = [];
    results.push(wyszukajProdukt("Siatka", fmt(Siatka), kolor));
    results.push(wyszukajProdukt("SŁUPEK", fmt(B8), kolor));
    results.push(wyszukajProdukt("DRUT NACIĄGOWY", fmt(B9), kolor));
    results.push(wyszukajProdukt("DRUT WIĄZAŁKOWY", fmt(B10), kolor));
    results.push(wyszukajProdukt("NAPINACZ", fmt(B11), kolor));
    results.push(wyszukajProdukt("NASADKA", fmt(B12), kolor));
    results.push(wyszukajProdukt("PRZELOT", fmt(B13), kolor));
    results.push(wyszukajProdukt("OBEJMA", fmt(B14), kolor));
    results.push(wyszukajProdukt("ŚRUBA", fmt(B15), kolor));
    results.push(wyszukajProdukt("PRĘT", fmt(B16), kolor));

    // ---- SUMA ----
    let suma = results.reduce((acc, p) => acc + (p.wartosc || 0), 0);

    res.status(200).json({ produkty: results, suma: suma.toFixed(2) });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Błąd obliczeń" });
  }
}
