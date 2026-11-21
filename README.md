# Heart Coherence PWA v0.4

Mobilra optimalizált, GitHub Pages-re publikálható kísérleti légzés- és kamerás PPG-prototípus. Ez a kiadás kizárólag a v0.3 hat fájljából készült; a korábbi v0.2-es külön PPG-modult nem használja.

## v0.4 változások
- Javított légzésfázis-modell: a belégzés külön 0–π, a kilégzés külön π–2π fázistartományt kap, ezért eltérő hosszúságú be- és kilégzés is kezelhető.
- A rezonanciateszt és az adaptív próbák a tényleges vezetett ciklus kezdetéhez viszonyítják a fázist, nem a mérési ablak kezdetéhez.
- A sikeres kezdeti rezonanciateszt aktiválja az automatikus finomhangolást.
- Aktív légzés és aktív kameramérés mellett a rendszer 10 percenként újraértékeli a külön belégzési és kilégzési időtartamokat.
- A kiválasztott időtartamok helyben, a böngésző localStorage tárhelyén mentődnek és következő megnyitáskor visszatöltődnek.
- Frissült a service worker cache-azonosító, hogy a telepített PWA könnyebben átvegye az új fájlokat.

## GitHub Pages frissítés
1. A ZIP hat fájlját töltsd fel a repository gyökerébe, és írd felül a korábbi azonos nevű fájlokat.
2. GitHub → Settings → Pages: ellenőrizd, hogy a megfelelő branch és `/ (root)` van publikálva.
3. A telepített PWA-t teljesen zárd be, majd nyisd meg újra. Ha még a régi felület jelenik meg, töröld az oldal gyorsítótárazott adatait, vagy nyisd meg privát böngészőablakban.
4. Android Chrome: menü → Alkalmazás telepítése / Hozzáadás a kezdőképernyőhöz. iOS Safari: Megosztás → Főképernyőhöz adás.

## Használat
1. Indítsd el a kamerát, és helyezd az ujjbegyed finoman a hátsó kamera/vaku fölé.
2. Várd meg, hogy elegendő IBI-adat gyűljön össze, stabil kéztartással.
3. Indítsd el a 3×3-as, szakaszos rezonanciatesztet. A belégzés és kilégzés időtartama külön változik.
4. Sikeres teszt után a kiválasztott ritmus automatikusan mentődik, és az automatikus adaptáció bekapcsol.
5. A későbbi gyakorlások során, ha a légzés és a kameramérés is aktív, a program 10 percenként finomhangolási próbát végez. A próbák alatt a vezetett ritmus átmenetileg váltakozik.

## Fontos korlátok
- A telefonos kamera PPG nem EKG. Az RMSSD/SDNN itt pulzushullám-alapú PRV-becslés; mozgás, ujjnyomás, fény, expozíció, képkockasebesség és készülékfüggő feldolgozás torzíthatja.
- A jelminőségi mutató heurisztikus, nem klinikailag validált.
- A vezetett légzés fázisát a program ütemezéséből becsüljük; a felhasználó tényleges légzését nem mérjük.
- Az RSA amplitúdó, R² és fáziszárási proxy kísérleti mutatók, nem klinikai koherenciaindexek, és nem bizonyítják a fiziológiai rezonancia megtalálását.
- Az optimalizálás célfüggvénye heurisztikus, nem bizonyított egészségügyi optimum. Csak megfelelő jelminőségű szakaszok használhatók.
- A kamera vaku/torch vezérlése nem minden mobilböngészőben érhető el. HTTPS szükséges.
- A program wellness/kutatási prototípus, nem diagnosztikai vagy terápiás eszköz. Ne erőltesd a légzést; szédülés, zsibbadás, légszomj vagy rosszullét esetén állj le.

## Ellenőrzési állapot
A csomagkészítés során JavaScript-szintaxisellenőrzés és statikus tartalmi ellenőrzés fut. Valós telefonos PPG-mérés, eszközök közötti összehasonlítás és klinikai validáció nem történt.
