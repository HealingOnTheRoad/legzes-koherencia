# Heart Coherence – PWA prototípus v0.2

Mobilra optimalizált, GitHub Pages-en publikálható, telepíthető webalkalmazás-prototípus.

## Mi került a v0.2-be?

- 5,5 mp belégzés + 5,5 mp kilégzés alapritmus, finom generált gonghangokkal és növekvő/csökkenő köranimációval.
- Külön állítható belégzési és kilégzési idő (3–8 mp-es kezelőfelületi tartományban); a teljes ciklust a program 4,5–6,5 légzés/perc közötti tartományban tartja.
- A kamera képkockáiból vett vöröscsatorna-arány és tényleges képkockaidő használata; a korábbi fix 100 ms-os csúcsidő-korrekció kikerült.
- Lassú alapvonal-követés, simítás, lokális csúcspont- és prominenciaalapú pulzusjelölt-felismerés.
- Technikai jelminőség-becslés képkockasebesség, időzítési ingadozás, telítettség, fényesség és pulzusjel-amplitúdó alapján.
- Interbeat interval (IBI) szűrés: fiziológiai tartományon kívüli és lokális kiugró értékek elutasítása; a kieső intervallumokat nem interpolálja.
- RMSSD és SDNN számítása kizárólag megfelelő hosszúságú, elfogadható minőségű mérési ablakból; az RMSSD nem számol különbséget egy kiszűrt intervallumon át.
- A HRV-szerű mutatók mellett látható mérési megbízhatósági állapot, elfogadott/kiszűrt intervallumszám és becsült mintavételi frekvencia.
- PWA manifest, SVG ikon, service worker és offline gyorsítótár.

## Mérési logika és korlátok

### PPG és pulzusfelismerés

A telefon kamerája és vakujának fénye az ujjbegyen áthaladó fény változását rögzíti. A prototípus a vörös csatorna összesített arányából képzett jelet elemzi, és a szisztolés fényelnyelési változást pozitív irányú jelcsúcsként keresi. A jel feldolgozása a videóképkockák időbélyegével történik, nem feltételezett állandó képkockasebességgel.

A jelminőségi pontszám **heurisztikus technikai indikátor**, nem validált mérőszám. A PPG-csúcsdetektor és az intervallumszűrő kísérleti algoritmus; mozgás, ujjnyomás, hideg kéz, automatikus expozíció, kamera-feldolgozás és vaku-támogatás hiánya továbbra is torzíthatja a jelet.

### HRV vagy PRV?

A telefonkamerából kapott ütésközökből számított RMSSD/SDNN valójában **PPG-alapú pulzusvariabilitás-becslés (PRV)**. Ez nem azonos az EKG-ból származó normál szívütésközökkel (NN/HRV), és nem szabad klinikai HRV-mérésként értelmezni. A prototípus körülbelül 60 másodperces ablakot, legalább 30 elfogadott intervallumot, legalább 80%-os intervallum-elfogadási arányt, legalább 12 FPS-t és legalább 60/100 technikai jelminőségi pontszámot követel meg a HRV/PRV értékek megjelenítéséhez. Ez egy óvatos prototípus-kapu, nem klinikai validáció.

Az SDNN és különösen a rövid ablakból számolt HRV-mutatók érzékenyek a mérési hosszra és a hibás ütésekre; többperces, stabil mérés megbízhatóbb. A kijelzett értékek tájékoztató jellegű becslések, nem diagnosztikai adatok.

### Légzés és adaptáció

A kívánt hibrid stratégia megmarad:

1. 5,5 + 5,5 másodperces induló kalibrálás.
2. Szakaszos egyéni rezonanciateszt, amely külön vizsgálja a belégzés és a kilégzés hosszát.
3. A kedvező kombináció adaptív finomhangolása.

A 4,5–6,5 légzés/perc célzóna teljes ciklushossza kb. 13,33–9,23 másodperc. A két fázis ettől függetlenül állítható, de a teljes ciklusnak ebben a tartományban kell maradnia. A v0.2-ben a kézi állítás működik; az automatikus tesztelési és adaptációs algoritmus még nincs implementálva.

A légzésfázist jelenleg a program által vezetett animáció ismeri. A telefonos PPG önmagában nem méri közvetlenül a tényleges mellkasi légzőmozgást. A valódi légzés–pulzus koherenciaelemzéshez később külön, megbízható légzésjel vagy megfelelően validált légzésfázis-becslés, valamint frekvencia- és fázisviszony-elemzés szükséges. Emiatt a program jelenleg **nem jelenít meg koherencia-pontszámot**.

## Tesztelés

A PPG-magmodulhoz tartozó automatikus tesztek Node.js-szel futtathatók:

```bash
node --test ppg-core.test.mjs
```

A tesztek ellenőrzik:
- egy nagy lokális IBI-kiugrás kiszűrését;
- az RMSSD egymást követő, valóban szomszédos intervallumokból történő számítását;
- egy szintetikus, 60 BPM-es PPG-jel csúcsfelismerését és HRV/PRV-kapu teljesülését;
- telített kamerajel esetén a HRV/PRV-kimenet blokkolását.

A szintetikus teszt a matematikai feldolgozást ellenőrzi, nem bizonyítja a valós telefonkamerákon való klinikai vagy eszközfüggetlen pontosságot.

## GitHub Pages telepítés

1. Hozz létre egy új GitHub repository-t.
2. Töltsd fel a projekt összes fájlját a repository gyökerébe.
3. Settings → Pages → Deploy from a branch → `main` → `/ (root)`.
4. Nyisd meg a GitHub Pages által adott HTTPS címet telefonon.
5. Android/Chrome: menü → „Alkalmazás telepítése” vagy „Hozzáadás a kezdőképernyőhöz”. iPhone/Safari: Megosztás → „Főképernyőhöz adás”.

A kamera használatához HTTPS és felhasználói engedély kell. A vaku (torch) támogatása böngésző- és készülékfüggő; iOS-en előfordulhat, hogy a böngésző nem teszi elérhetővé.

## Következő fejlesztési lépések

1. Valós készülékes teszt több Android/iOS böngészőn; jelminőségi küszöbök finomítása.
2. PPG-jel szűrésének és csúcsdetektorának további validálása, lehetőleg referencia-pulzusmérővel összevetve.
3. Többperces PRV-mérési ablak és megbízhatósági/artefaktum-jelentés.
4. Légzési fázis és pulzusválasz szinkronizációjának elemzése; csak megalapozott mérés után koherenciaérték.
5. Szakaszos, független belégzés/kilégzés rezonanciateszt, majd óvatos adaptív finomhangolás.

## Adatvédelem és biztonság

A kamera képe és a pulzusminták helyben, a böngészőben kerülnek feldolgozásra; a prototípus nem küldi ezeket szerverre. Nem orvosi eszköz. Ha a lassú légzés szédülést, légszomjat vagy kellemetlenséget okoz, állítsd le a gyakorlatot és térj vissza a természetes légzésedhez.
