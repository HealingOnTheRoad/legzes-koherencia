# Heart Coherence – PWA prototípus

Mobilra optimalizált, GitHub Pages-en publikálható kezdőverzió.

## Tartalom
- 5,5 mp belégzés + 5,5 mp kilégzés vezetése
- Finom, generált gonghangok
- Növekvő/csökkenő légzőkör
- Kamerás PPG-jel mintavételezési prototípus
- Előzetes BPM, IBI, RMSSD és SDNN becslés
- PWA manifest és service worker

## GitHub Pages telepítés
1. Hozz létre egy új GitHub repository-t.
2. Töltsd fel a fájlokat a repository gyökerébe.
3. Settings → Pages → Deploy from a branch → `main` → `/ (root)`.
4. Nyisd meg a GitHub Pages által adott HTTPS címet telefonon.
5. Android/Chrome: menü → „Alkalmazás telepítése” vagy „Hozzáadás a kezdőképernyőhöz”.
   iPhone/Safari: Megosztás → „Főképernyőhöz adás”.

## Fontos mérési korlátok
- A kamera/flash PPG működése készülék- és böngészőfüggő. A vaku bekapcsolása nem minden mobilböngészőben támogatott.
- A jelenlegi csúcsdetektor kísérleti. Mozgás, ujjnyomás, fényviszonyok és automatikus kamerafeldolgozás hamis vagy kihagyott ütéseket okozhat.
- Az RMSSD/SDNN csak megfelelően tisztított, normál ütésközökből értelmezhető. A prototípus jelenlegi értékei nem orvosi mérési eredmények.
- Ez a verzió még nem számít koherenciapontszámot, nem ellenőrzi a tényleges mellkasi légzést, és nem végez automatikus rezonancia-optimalizálást.
- A valódi adaptív algoritmushoz hosszabb mérési ablak, jelminőség-ellenőrzés, artefaktum-szűrés és validált légzés–pulzus elemzés szükséges.

## Következő fejlesztési lépések
1. Robusztusabb PPG csúcsdetektor és jelminőségi mutató.
2. Interbeat interval artefaktum-szűrés.
3. Légzési fázis és pulzusválasz szinkronizációja.
4. Szakaszos, független belégzés/kilégzés tesztelés.
5. Adaptív algoritmus, amely csak megbízható adatok alapján módosít.
