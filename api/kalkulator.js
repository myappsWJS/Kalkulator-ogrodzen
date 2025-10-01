import fetch from "node-fetch";

export default async function handler(req, res) {
  // --- login ---
  if(req.method === "GET" && req.query.mode === "login"){
    if(req.query.pass === "lm-10"){
      return res.json({ok:true});
    } else {
      return res.json({ok:false});
    }
  }

  if(req.method !== "POST") return res.status(405).end();

  const {dlugosc, narozniki, wysokosc, kolor} = req.body;

  if(!wysokosc || !kolor){
    return res.json({ok:false, error:"Brak wymaganych danych"});
  }

  // --- logika kalkulacji (tu przenosimy wszystkie Twoje wzory) ---
  let B4 = dlugosc;
  let B5 = narozniki;

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

  let E6 = (F4==null)? null : (B5 + F4);
  let F6 = (D4==null)? null : (B5 * 2) + D4;
  let G4 = Math.ceil(B4 / 2.5) + 1;
  let H4 = (F4==null)? null : 6 + (F4 * 6);
  let G6 = (H4==null)? null : (B5 * 6) + H4;
  let H6 = (E6==null||G4==null)? null : (G4 - E6 - 2);
  let H7 = (H6==null)? null : (H6 * 3);

  let B8 = (G4==null||F6==null)? null : (G4 + F6);
  let B9 = Math.max(1, Math.ceil(D9 / 50));
  let B10 = (E9 <= 50) ? 1 : 2;
  let B11 = G6;
  let B12 = F6;
  let B13 = (H7==null)? null : Math.ceil(H7 / 12);
  let B14 = (B12==null||B11==null)? null : (B12 + B11);
  let B15 = (B11==null)? null : Math.ceil(B11 / 2);
  let B16 = B12;
  let Siatka = Math.ceil(B4 / 10);

  // --- pobieranie cennika z Google Sheets ---
  const sheetId = "1ady3fw4DZBHYeJ0yumcUGCUcX4Qp1w2tA79n2-9DvJQ"; 
  const gidMap = { "1": "0", "1.2": "1288678779", "1.5": "1115203468" };
  const gid = gidMap[wysokosc];

  let produkty = [];
  if(gid){
    const url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?gid=${gid}`;
    const resp = await fetch(url);
    const txt = await resp.text();
    const json = JSON.parse(txt.replace(/^.*setResponse\(|\);$/g,""));
    produkty = json.table.rows.map(r => ({
      ref: r.c[0]?.v || "",
      nazwa: r.c[1]?.v || "",
      cena: r.c[4]?.v ? parseFloat(r.c[4].v) : 0
    }));
  }

  function szukaj(nazwa, qty){
    const wyniki = produkty.filter(p=>p.nazwa?.toUpperCase().includes(nazwa.toUpperCase()) && p.nazwa.toUpperCase().includes(kolor.toUpperCase()));
    if(wyniki.length===0) return `<tr><td></td><td>${nazwa} (brak)</td><td></td><td>${qty}</td><td>0</td></tr>`;
    if(wyniki.length===1){
      let w = wyniki[0];
      let wartosc = w.cena * qty;
      return `<tr><td>${w.ref}</td><td>${w.nazwa}</td><td>${w.cena.toFixed(2)}</td><td>${qty}</td><td>${wartosc.toFixed(2)}</td></tr>`;
    }
    return `<tr><td></td><td colspan="4">Wybierz rodzaj dla ${nazwa}</td></tr>`;
  }

  let html = `
  <tr class="header-row"><th>Referencja</th><th>Nazwa</th><th>Cena</th><th>Iloœæ</th><th>Wartoœæ</th></tr>
  ${szukaj("Siatka", Siatka)}
  ${szukaj("S£UPEK", B8)}
  ${szukaj("DRUT NACI¥GOWY", B9)}
  ${szukaj("DRUT WI¥ZA£KOWY", B10)}
  ${szukaj("NAPINACZ", B11)}
  ${szukaj("NASADKA", B12)}
  ${szukaj("PRZELOT", B13)}
  ${szukaj("OBEJMA", B14)}
  ${szukaj("ŒRUBA", B15)}
  ${szukaj("PRÊT", B16)}
  `;

  return res.json({ok:true, html});
}