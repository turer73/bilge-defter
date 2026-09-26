# v61 — kayıtta yalnız değişen sayfa metne çevrilir

Kullanıcı 26 Eylül 2026'da "tüm defter yerine yalnız değişen sayfa" üzerinden kayıt için
çalışmayı istedi (claim 101529).

## Karar: depolama biçimi değişmez

IndexedDB'de defteri sayfa sayfa ayrı kayıtlara bölmek veri göçü gerektirir ve v60'a
geri dönüşü veri açısından tehlikeli yapardı (eski sürüm yeni biçimi okuyamaz). Bunun
yerine kayıt metni sayfa parçalarından kurulur: değişmeyen sayfaların daha önce üretilmiş
`JSON`'u yeniden kullanılır, yalnız değişen sayfa yeniden metne çevrilir. Diske yazılan
kayıt `JSON.stringify(defter)` ile bayt bayt aynıdır; v60/v59'a geri dönüş güvenlidir.

## Değişiklikler (`index.html`, `sync-workspace.js`)

- Sayfa önbelleği bir imzayla geçersiz olur: `markChanged` ile artan sayfa sayacı, çizgi
  sayısı, son çizginin nokta sayısı, sayfanın diğer alanları ve PDF nesnesinin kimliği ile
  görüntü uzunluğu. Başka bir sayfanın adı, rengi, PDF'i veya çizgi sayısı değişince de
  yakalanır.
- Önbellekli kayıtta sayfa ve PDF doğrulama sonuçları aynı imzayla hatırlanır; PDF
  görüntüsünü her kayıtta baştan tarayan düzenli ifade tekrarlanmaz. Tam kayıtta
  doğrulama eskisi gibi baştan sona çalışır.
- Güvenlik ağı: imzanın göremeyeceği yerinde bir değişiklik (ör. başka sayfadaki bir
  çizginin rengi) sayfadan çıkarken ve kullanıcı dururken önbellek tam metinle
  karşılaştırılarak bulunur ve bütün defter yazılır. Kaçırmalar sayılır ve konsola yazılır.
- Eşitleme: 5 saniyelik denetim ve gönderim de aynı birleştirmeyi kullanır; metin
  `JSON.stringify` ile aynıdır.

## Düz sayfada yakınlaştırma (`pdf-workspace.js`, `index.html`, `ui-v2-bridge.js`)

Kullanıcı 27 Eylül 2026'da alt çubuktaki − %100 + düğmelerinin düz sayfada da çalışmasını
istedi. Önceden bu düğmeler yalnız PDF sayfalarında açıktı.

- Düz sayfada da %100–%300 arası, 25 puanlık adımlarla büyütür; %100 düğmesi sayfa
  genişliğine döndürür. Yakınlaştırma görünür merkez çevresindedir. Büyütülmüş sayfa iki
  parmakla (veya Shift + tekerlekle) sağa/sola kaydırılır ve sayfa genişliğinde durur.
- Kalem PDF'teki gibi çalışır: büyütülmüşken çizilen çizgi ekranda seçilen kalınlıkta
  görünür, %100'de daha ince durur.
- Kâğıt çizgileri, kareler ve noktalar artık mürekkeple birlikte ölçeklenir (sayfa
  birimiyle 32). Bu, genişliğe sığdırma nedeniyle küçültülmüş sayfalarda da çizgi ile
  yazıyı hizalar; önceden çizgiler 32 ekran pikselinde sabit kalıyordu.
- **Yakınlaştırma düz sayfada kaydedilmez**, yalnız bu oturum boyunca her sayfa için
  hatırlanır; yeniden açılınca sayfa %100'de açılır. PDF'in alanları (`pdfZoom`, `viewX`)
  düz sayfada kullanılamaz: v60'ın `validPdfView` denetimi düz sayfada bu alanları görünce
  bütün defteri geçersiz sayar, bu da v60'a geri dönüşü bozardı. Yeni adlı bir alan v60'ta
  yok sayılır ve kalıcı yapılabilirdi, ama bu sürümün ilkesi kayıt biçimini değiştirmemek;
  gerekirse ayrı bir sürümde doğrulaması ve testiyle eklenir. PDF yakınlaştırması ve konumu
  eskisi gibi kaydedilir.
- Sıkıştırma hareketiyle büyütme yalnız PDF'te kalır. Düz sayfada iki parmakla dikey
  kaydırma çok sık kullanılıyor ve parmak arası mesafedeki küçük değişim istenmeyen
  büyütme üretirdi.

Kütüphane, hesap servisi, veritabanları, nginx izin listesi, Access/DNS değişmez.

## Yerel doğrulama

- `npm test`: 14 suite geçti (170 s); v51, v52, v56, v57, v58, v59 ve v60 temel paketleri
  Git'ten sabit hash'lerle yeniden üretildi.
- `verify-v61-zoom.cjs`, Chromium ve WebKit, **14 kontrol**: düz sayfa %100'de − kapalı,
  + açık; dört + ile %200, mürekkep ölçeği ve çizgi aralığı iki katı; %200'de kalem çizgisi
  kalemin altına ve yarı mantıksal kalınlıkla düşüyor; yana kaydırma sayfa kenarında
  duruyor; kayıtta `pdfZoom`/`viewX` ya da başka görünüm alanı yok ve disk defterle aynı;
  yakınlaştırma sayfaya ait; yeniden açılışta %100; PDF yakınlaştırması kaydediliyor ve
  `setPdfZoom` düz sayfaya dokunmuyor.
- `verify-v61-save.cjs`, Chromium ve WebKit, **10 kontrol**: 8 tür düzenlemenin
  (kalem, başka sayfanın adı ve kâğıt rengi, PDF değişimi, başka sayfadan çizgi silme,
  sayfa sırası, çöpteki sayfa, etkin sayfa değişimi) her birinden sonra disk
  `JSON.stringify(defter)` ile aynı; eşitleme metni de aynı; imzanın kaçırdığı değişiklik
  çıkışta ve boşta denetimde yazılıyor.
- Sentetik defterde bir sayfa düzenlemesinin kaydı sayfayı en uzun ne kadar kilitliyor
  (tam kayıt → sayfa bazlı kayıt; her hücre ayrı koşular):

| Motor | 36 MB mürekkep | 36 MB PDF |
|---|---|---|
| Chromium | 100 → 31 ms; 139 → 44 ms | 212 → 19 ms; 221 → 26 ms; 250 → 26 ms |
| WebKit | 114 → 47 ms; 127 → 62 ms; 144 → 66 ms | 63 → 41 ms; 64 → 47 ms; 65 → 48 ms |

  v59'da aynı mürekkep defteri 218–293 ms kilitliyordu. Kalan süre artık metne çevirme
  değil, birleştirilmiş metnin belleğe kopyalanması ve worker'a aktarılmasıdır.
- Fiziksel iPad ve gerçek hesap testi yapılmadı.

## Yayın

Kullanıcı onayıyla 26 Eylül 2026 21:08 UTC civarında canlıya alındı (kaynak `0601191`,
paket `SHA256SUMS` 20bcf136…, payload 5e27eada…, nginx 3f3ef2ae… v60 ile aynı).

- `stage`: önizleme `127.0.0.1:18800`'de 238 HTTP hash, 235 çevrim dışı dosya, 14 yetkisiz
  istek reddi, 6 özel yol kapalı.
- `activate`: aynı dört sonuç canlı `127.0.0.1:18790`'da; kütüphane `v58/library` kodunda ve
  sağlıklı; hesaplar ve diğer servisler değişmedi (`live-proof.json`).
- Bağımsız kontrol: canlı `release.json` = v61; `index.html`, `pdf-workspace.js`,
  `ui-v2-bridge.js`, `sw.js` baytları Git'teki `0601191` ile aynı; `verify` yeniden geçti;
  `-preview-v61` kapalı, v60 web konteyneri `-rollback-v61` adıyla durdurulmuş saklanıyor.
- Fiziksel iPad ve gerçek hesapla kabul yapılmadı.

Geri dönüş (yalnız v61 etkin sürümken):

```sh
sudo python3 /opt/bilge-defter-classroom-v61/deploy-v61.py rollback
```
