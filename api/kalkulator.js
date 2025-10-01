import fetch from "node-fetch";

export default async function handler(req, res) {
  try {
    const { wysokosc, dlugosc, narozniki, kolor } = req.query;

    if (!wysokosc || !kolor || !dlugosc) {
      return res.status(400).json({
        ok: false,
        error: "Brak wymaganych parametrów: wysokosc, dlugosc i kolor"
      });
    }

    const B4 = parseFloat(dlugosc) || 0;   // długość ogrodzenia
    const B5 = parseInt(narozniki) || 0;   // liczba narożników

    // --- FORMUŁY Z FRONTENDU ---

    // D4
    let D4;
    if (B4 <= 25) D4 = 2;
    else if (B4 <= 50) D4 = 4;
    else if (B4 <= 75) D4 = 6;
    else if (B4 <= 100) D4 = 8;
    else D4 = null;

    // drut naciągowy (metry)
    let D9 = B4 * 3;

    // drut wiązałkowy (metry)
    let E9 = (B4 * 5) / 10;

    // F4
    let F4;
    if (B4 <= 25) F4 = 0;
    else if (B4 <= 50) F4 = 1;
    else if (B4 <= 75) F4 = 2;
    else if (B4 <= 100) F4 = 3;
    else F4 = null;

    // E6
    let E6 = (F4 != null) ? (B5 + F4) : null;

    // F6
    let F6 = (D4 != null) ? (B5 * 2 + D4) : null;

    // G4
    let G4 = Math.ceil(B4 / 2.5) + 1;

    // H4
    let H4 = (F4 != null) ? (6 + (F4 * 6)) : null;

    // G6
    let G6 = (H4 != null) ? (B5 * 6 + H4) : null;

    // H6
    let H6 = (E6 != null) ? (G4 - E6 - 2) : null;

    // H7
    let H7 = (H6 != null) ? (H6 * 3) : null;

    // Wyniki końcowe
    let B8 = (F6 != null) ? (G4 + F6) : null;               // słupki
    let B9 = Math.max(1, Math.ceil(D9 / 50));               // drut naciągowy rolki
    let B10 = (E9 <= 50 ? 1 : 2);                           // drut wiązałkowy rolki
    let B11 = G6;                                           // napinacz
    let B12 = F6;                                           // nasadka
    let B13 = (H7 != null) ? Math.ceil(H7 / 12) : null;     // przelot
    let B14 = (B12 != null && B11 != null) ? (B12 + B11) : null; // obejma
    let B15 = (B11 != null) ? Math.ceil(B11 / 2) : null;    // śruba
    let B16 = B12;                                          // pręt
    let Siatka = Math.ceil(B4 / 10);                        // siatka (rolki 10m)

    // --- POBIERANIE DANYCH Z ARKUSZA ---
    const gidMap = {
      "1": "0",
      "1.2": "1288678779",
      "1.5": "1115203468"
    };
    const sheetId = "1ady3fw4DZBHYeJ0yumcUGCUcX4Qp1w2tA79n2-9DvJQ";
    const gid = gidMap[wysokosc] || "0";

    const url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:json&gid=${gid}`;

    const response = await fetch(url);
    const text = await response.text();
    const json = JSON.parse(text.substring(47, text.length - 2));

    const rows = json.table.rows.map(r => ({
      ref: r.c[0]?.v || "",
      nazwa: r.c[1]?.v || "",
      cena: r.c[4]?.v || 0
    }));

    // filtrowanie wyników po kolorze
    const wyniki = rows.filter(r => r.nazwa && r.nazwa.toLowerCase().includes(kolor.toLowerCase()));

    // --- ZWRACANIE DO FRONTENDU ---
    res.status(200).json({
      ok: true,
      parametry: { wysokosc, dlugosc: B4, narozniki: B5, kolor },
      wyniki: {
        Siatka,
        Slupki: B8,
        DrutNaciagowy: B9,
        DrutWiazalkowy: B10,
        Napinacz: B11,
        Nasadka: B12,
        Przelot: B13,
        Obejma: B14,
        Sruba: B15,
        Pret: B16
      },
      produkty: wyniki
    });
  } catch (err) {
    console.error("Błąd API:", err);
    res.status(500).json({ ok: false, error: err.message });
  }
}
