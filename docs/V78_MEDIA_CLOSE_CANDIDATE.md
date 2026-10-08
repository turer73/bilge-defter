# v78 — medya kapanışındaki ara geometri çizimi

## Kapsam ve yetki

8 Ekim 2026, kullanıcı “devam”: eski boyutta gereksiz çizim için ayrı aday.
CLAIM #102367, ayrı müdahale probu dosyası için ek #102368.
Başlangıç yerel commit'i `0b054ef838018c33ec890a48a6f1aa0fdf6dafcf`.

Yalnız tanı betikleri, belge, gerekirse test-only CI bağlantısı ve git dışında
paket kopyaları. Uygulama kaynakları, yayımlanabilir paket, özgün kabul testi,
eşikler, notlar ve canlı yayın değişmez. Root test/Git/CI sahibi; inceleyiciler
aynı testleri tekrar çalıştırmaz. Önceki reddedilen aday ve kanıtlar korunur.

## Kaynakta doğrulanan sıra

`cancelMediaMode()` seçim/taslak durumunu kapatıp `drawAll()` çağırıyor.
Yerleşim araçları ve `.workspace.layout-active` sınıfı ise çizimin sonunda
`refreshMediaSelection()` ile değişiyor. V2 host sınıfı ayrıca bir
`MutationObserver` ile sonraki mikro görevde eşleniyor; hostun araç/alt
çubuklarının yüksekliği bu sınıfa bağlı. Bu yüzden yalnız son ekran görüntüsü
veya yalnız light-DOM sınıfını erkene almak tek son-geometri çizimini kanıtlamaz.

Bu sıra ve gereksiz iş, Linux antialiasing sapmasının kesin nedeni olarak
sunulmuyor. Önceki dört-piksel deneyinin ve reddedilen RAF adayının sınırları
`V78_INK_STAGE_DIAGNOSTIC.md` ve `V78_INK_RESIZE_CANDIDATE.md` belgelerindedir.

## Ayrı paket adayı

Yalnız kopyadaki `media-workspace.js` değişir. PPTX sürekli görünümünde:

1. Mevcut seçim/taslak kapatma semantiği korunur.
2. `refreshMediaSelection()` ile yerel yerleşim kapanır. Gerçek sahip
   `bilge-defter-ui` hostu varsa aynı sınıf durumu senkron eşlenir.
3. Mevcut `resize()` çağrılır. Bu işlev boyut veya dönüşüm değiştiğinde zaten
   çizdiği için, yalnız hiçbir değişiklik olmadığında ayrıca `drawAll()` yapılır.

Başka defter/PDF modları eski yolu korur. Yeni zamanlayıcı, RAF, piksel okuma,
scratch tutma, CPU/GPU ipucu veya karo stratejisi eklenmez. Beklenen kazanç,
medya kapanışındaki ara geometri çizimini kaldırmaktır; kalem gecikmesi veya
fiziksel iPad performansı henüz ölçülmüş değildir.

## Ayrı doğrulama yolları

- `diagnose-media-close.cjs`: sabit 246 varlıktan baseline ve candidate üretir;
  özgün `verify-slide-flow.cjs` doğrudan `BILGE_TEST_ROOT` ile iki pakete karşı
  koşar. Runner veya kalite oracle'ı kopyalanıp değiştirilmez. Saf helper testleri
  sıralama/draw-once davranışını ölçer; gerçek DOM/çizim kanıtı yerine geçmez.
- `probe-media-close.cjs`: açıkça ayrı, sentetik bir müdahale probudur. Her çizim
  girişinde workspace/host sınıfları, bar görünürlüğü, CSS ve bitmap boyutlarını
  kaydeder. Kapanışın eşzamanlı çizimini iki RAF sonrası boyutla karşılaştırır.
  Aynı boyutta kapanışı, taslaktan vazgeçmeyi ve eklemeyi ayrıca denetler.
  Bu probun sonucu özgün kabul testinin yerine geçmez.
- Önce yerel hedef senaryolar ve müdahale probu; geçerlerse Linux'ta değişmemiş
  54 DPR2 senaryosu. Normal zorunlu paket testi ayrı kalır; aday yeşil olsa bile
  normal paketin başarısızlığı yeşile çevrilmez.

Her iki paket/kayıt `diagnosticOnly=true`, `releaseEligible=false` taşır.
Aday manifesti kasıtlı olarak eski tutulur; test paketi yayımlanamaz.
Sonuçlar yeni `outputs/media-close-candidate/` dizinlerinde korunur.

## Sabit kimlikler

| Kaynak | SHA256 |
| --- | --- |
| `pdf-workspace.js` | `3b3fcdedfd40ba4656b7c8dca2ece1eeb605f54229326b3d91b03351cb11007e` |
| `media-workspace.js` | `f25586bc8d2aa2abd6bade5a5304ff31b72c8bc427a55f9afefae6ee2fb5af31` |
| `SHA256SUMS` | `6f172d47680d93b9d39e316a1f1512ee0e0c2e4645b95af9aab33890b34890f9` |
| `verify-slide-flow.cjs` | `f2cb459827c1d725d6df1f22c6ff12047a02d415a7d26b8eb65f3eaa769de8d0` |

## Yerel ölçüm — 8 Ekim 2026

Windows Chromium + WebKit, DPR2; özgün runner ve eşikler değişmedi:

| Kontrol | Baseline | Aday |
| --- | --- | --- |
| Fiziksel bitmap değişimi / aynı görevde warm cache | 2/2 | 2/2 |
| Warm ink: çizim, silgi, medya undo ve zoom kalitesi | 2/2 | 2/2 |
| Ayrı yerleşim / iptal / ekle / kayıt / undo probu | 8/8 | 8/8 |

Saf helper kontrolleri 10/10. Tüm paket drift listeleri boş.
Ek olarak adayın özgün DPR2 paketinin tamamı yerelde **54/54** geçti
(`20261008201446685`); bu koşuda baseline tekrar çalıştırılmadı.
Yerleşim probunda iki motorda da baseline önce `2260×1482`, sonra
`1676×1318` bitmap'te çiziyor (1 senkron + 1 sonraki çizim). Aday yalnız
`1676×1318` son geometride senkron çiziyor; izlenen iki RAF penceresinde
başka çizim yok. Zaten kapalı panelde aynı boyut korununca da tek çizim var.

Gerçek `undoMedia()` geçmişi yeniden yüklemeden önce ayrıca doğrulandı:
bir çağrı, `true` sonuç ve boşalan history. İkinci eklemenin kalıcı kaydı,
yeniden açılması ve normal son-çizgi geri alması ayrı kontrol edildi;
oturumluk medya geçmişinin yeniden açılışta korunduğu iddia edilmiyor.
PPTX, sıradan defter ve PDF durumlarında diğer sayfaların çizgileri korundu.

Kanıt dizinleri (git dışında korunur):

- `outputs/media-close-candidate/20261008201110507/results.json`: bitmap testi.
- `outputs/media-close-candidate/20261008201127848/results.json`: warm ink ve
  ayrı probun sonuçları; altındaki `probe/` ham geometri ve yaşam döngüsü raporları.
- `outputs/media-close-candidate/20261008201446685/results.json`: yalnız aday,
  değiştirilmemiş runner ile tam 54 DPR2 senaryosu.
- Aday `media-workspace.js` SHA256:
  `9612d25809892cbc0911ad48d3556d1f24746d677081dd4ab07509ef8f995b2b`.

Windows'ta özgün hata üremedi; bu sonuç **Linux raster hatası düzeldi** demek
değildir. Sıradaki tek Linux CI karşılaştırması, normal zorunlu DPR2 testi
başarısız olursa failure-only adımda adayın değişmemiş 54 testini ve ayrı
yaşam döngüsü probunu çalıştırır. Normal testin başarısızlığı korunur.
Artifakta yalnız raporlar, sentetik probe ve PNG'ler eklenir; paketler eklenmez.

Linux sonucu bu commit hazırlanırken henüz yoktur. Uygulama yaması,
merge veya yayın onayı yoktur. Fiziksel iPad/Pencil kabulü ayrıca açıktır.
