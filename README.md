# Heart Coherence PWA v0.3

Mobilra optimalizált, GitHub Pages-re publikálható kísérleti prototípus.

## Újdonságok
- Kameraalapú PPG mintavételezés RGB aránnyal, detrendeléssel és adaptív csúcsküszöbbel.
- Refrakter periódus, élettani IBI-tartomány és lokális mediánhoz viszonyított artefaktum-szűrés.
- Jelminőségi becslés, RMSSD/SDNN és pulzus kijelzése.
- 3×3-as, véletlenszerű sorrendű, szakaszos rezonanciakeresés: belégzés és kilégzés külön változik.
- Koordináta-jellegű adaptív finomhangolás: egyszerre külön-külön módosítja a belégzést vagy kilégzést.
- Kísérleti légzés–IBI harmonikus illesztés: RSA amplitúdó, R² és fáziszárási proxy.
- PWA telepíthetőség, helyi feldolgozás.

## GitHub Pages
1. Töltsd fel a ZIP tartalmát egy GitHub repository gyökerébe.
2. Settings → Pages → Deploy from a branch → `main` → `/ (root)`.
3. Nyisd meg a GitHub Pages HTTPS URL-t mobilon.
4. Android Chrome: menü → Alkalmazás telepítése / Hozzáadás a kezdőképernyőhöz.
   iOS Safari: Megosztás → Főképernyőhöz adás.

## Használat
1. Kamera indítása, ujjbegy finoman a hátsó kamera/vaku fölé.
2. Stabil kéztartás, nyugodt testhelyzet; várd meg, amíg az IBI-adatok gyűlnek.
3. Indítsd el a vezetett légzést.
4. A rezonanciateszt 9 kombinációt vizsgál, egyenként 10 mp beállási + a beállított mérési idő (alapból 60 mp) szakasszal.
5. A legígéretesebb kombinációt kiválasztja, az adaptív finomhangolás pedig külön-külön próbálja a belégzés és kilégzés ±0,2 mp változtatását.

## Fontos tudományos és technikai korlátok
- A telefonos kamera PPG nem EKG. Az RMSSD/SDNN itt PRV-becslés, és mozgás, ujjnyomás, fény, kamera-expozíció, frame rate, bőrtulajdonságok és készülékfüggő feldolgozás torzíthatja.
- A jelminőségi mutató heurisztikus, nem klinikailag validált.
- A teszt rövid szakaszai egyéni feltérképezésre alkalmas prototípusok, nem validált rezonanciafrekvencia-vizsgálatok.
- A légzés fázisát a program vezérlési ütemezéséből becsüljük. A felhasználó tényleges légzését nem mérjük. Mellkasi/orráramlás-érzékelő nélkül a légzés–pulzus koherencia csak a vezetett ütemhez viszonyított kapcsolatbecslés.
- Az RSA illesztés szinusz/koszinusz regressziót használ az IBI és a programozott légzési fázis között. Az R² és fáziszárási proxy nem orvosi koherenciaindex.
- Az adaptív pontszám egy kísérleti célfüggvény (jelminőség × illeszkedés × RSA amplitúdó). Nem bizonyítja, hogy az adott légzés a fiziológiai szempontból optimális.
- A kamera vaku/torch vezérlése nem minden mobilböngészőben érhető el. HTTPS szükséges.
- A PWA nem tárolja tartósan az egészségügyi adatokat; az eredmények a munkamenetben élnek.

## További fejlesztés előtt szükséges
1. Több telefonon, ismert referenciamérővel végzett validáció.
2. PPG jel szűrésének és peak detectorének tesztelése rögzített adatsorokon.
3. Tényleges légzésérzékelő vagy legalább felhasználói légzés-visszajelzés.
4. Rezonancia- és adaptív protokoll tudományos validálása, pihenőidőkkel és komfortellenőrzéssel.
5. Hosszabb ablakok és bizonytalansági intervallumok az autonóm mutatókhoz.

Ez a szoftver wellness/kutatási prototípus, nem diagnosztikai vagy terápiás eszköz. Ne erőltesd a légzést; szédülés, zsibbadás, légszomj vagy rosszullét esetén állj le.
