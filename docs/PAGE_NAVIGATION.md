# PDF ve sunum sayfa paneli

## v79 kapsamı

- PDF/sunum arka planlı bir sayfada `Sayfalar · N / toplam` düğmesi.
- Açılıp kapanan numaralı liste; yalnız açık defterdeki PDF/sunum sayfaları.
- Numara defterdeki sıradır; dosyanın özgün sayfa numarası ve adı açıklamada
  ayrıca gösterilir. Sayfa kimliği numara değildir; silme/sıralama güvenlidir.
- Dokununca ilgili sayfanın başlangıcına gider, panel kapanır ve zoom korunur.
  Sürekli sunumun son sayfasında görünüm belgenin sonuna göre sınırlanır.
- Kaydırma sonunda aktif sayfa göstergesi güncellenir.
- Son sayfanın başı görünüm sınırına sıkışırsa, önceki sayfa da görünse bile
  açıkça seçilen numara kapatıp açmada korunur. Gerçek dikey kaydırma bu
  geçici seçim sabitlemesini kaldırır; kayıt biçimine yeni alan eklenmez.
- Panel tuvalin boyutunu değiştirmez; önizleme resmi/ek canvas oluşturmaz.
- Kalem/avuç, iki parmak kaydırma ve alt zoom kontrolleri ayrı işlerdir.
  Yazım, kaydırma, medya düzenleme veya hesap kilidi sırasında sayfa atlanmaz.
- Depolama şeması, not içeriği, 100 sayfa sınırı ve dosya boyutu değişmez.

## Kabul

`work/verify-page-navigation.cjs` sentetik notlar, Chromium ve WebKit ile
numara seçimi, aynı sayfaya dönüş, yüz sayfa, aktif gösterge, defter sınırı,
kilitli durumlar, kayıt/yeniden açma, ekran boyutları ve tuval boyutu korumasını
sınar. Gerçek cihaz kabulü yerine geçmez. Son sonuçlar kaynak hashleriyle
`outputs/page-navigation` altında tutulur.

`work/verify-v79-check.cjs` mevcut bütünleşme/geri dönüş testlerini korur;
yalnız güncel/önceki sürümü v79/v78 olarak taşır. Önceki gerçek v78 paketi
`ee44150a3fdb3e500d573756cb29adae73cd152e` kaynağından yeniden kurulur;
SHA256SUMS değeri `915df1b7afdc14f91ba3937a591ab764def3a0ce1118691dd4fb78fb0f9d2862`
olmalıdır. v78 kaydedilmiş 0.4 marker opaklığını desteklediği için geri dönüş
testi alfa 102 bekler; v77'nin eski alfa 64 beklentisi yeni tabana uygulanmaz.

## Fiziksel iPad

Kullanıcı, canlı v78'de kalem/avuç denemesinde kasma görmediğini bildirdi.
Bu, v79 panel ve kaydırma/zoom değişikliklerinin kabulü sayılmaz. v79 sonrası:

1. PDF ve sunumda ilk/orta/son numaraya dokunun; doğru sayfaya gitmeli.
2. İki parmakla kaydırın; seçili numara değişirken zoom yüzdesi sabit kalmalı.
3. Alt −/+ ve yüzde düğmesini deneyin; sonra kalemle yazmaya devam edin.
4. Kaydedildi bilgisinden sonra kapatıp açın; notlar korunmalı.

Canlı yayın durumu ve geri dönüş prosedürü `RELEASE_V79.md` içindedir.
