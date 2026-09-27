# Bilge Defter: güvenilir kullanım ve performans araştırması

Tarih: 27 Eylül 2026. Kullanıcı kararı: özellik sayısını artırmak yerine kullanıcı deneyimi ve güvenilirlik. Bu belge aynı gün yapılan salt-okunur denetimin arşividir; ilerideki canlı durumun kanıtı değildir.

## Kanıt ve sınırlar

- Denetim tabanı: `repair/v57-stability`, `e07d52b`; GitHub ile eşleşen temiz ağaç. Canlı v64 kaynağı `61b0eee`; paket SHA256SUMS özeti `7db781b5391eddd2aba12dfafb13c3a3a572737c62643e84d653d50832cb0fff`.
- Canlı bağımsız doğrulama: 238 HTTP dosyası, 235 çevrimdışı varlık, 14 kimliksiz erişim reddi ve 6 özel yol kontrolü başarılı. Bu tam güvenlik denetimi veya gerçek kullanıcı kabulü değildir.
- Web v64; hesap servisi v57 dizinindeki sözlük + v49 veri alanını kullanıyor; kütüphane kodu v58. Eski özel yayın kapalı. Başka servis değiştirilmedi.
- PR #3 taslak, master v52; otomatik GitHub kontrolü yoktu. Birleşebilir olması ürün kabulü anlamına gelmez.
- Mevcut Chromium/WebKit test görselleri incelendi; yeni gerçek iPad oturumu ölçülmedi. Önceki 19 regresyon paketi sonuçları yayın belgesindendi, bu araştırmada yeniden koşturulmadı.
- Sunucu anlık görünümü yaklaşık 21 GiB kullanılabilir RAM gösteriyordu. Bu 50 kişilik yük testi değildir; kalem takılmasına sunucu yükseltmesi gerektiğini göstermez.

## Kodda doğrulanan öncelikler

1. Eşitleme açık ve editör boşta olduğunda 5 saniyelik denetim tüm şifreli defteri indiriyor; GET koşullu değil. İstemci ayrıca tüm yerel JSON'u tekrar hashliyor. Öneri: kimlik doğrulama ve CAS korunarak ETag/304, aralığı artırma, sınırlı hash önbelleği.
2. PDF içe alma 20 MB/50 sayfa; sunucu şifreli yedeği 5 MiB. Bunlar aynı sınır değil. PDF rasterleştirme sonucu not dosyası büyüyebilir. Limit artırmadan önce açık boyut uyarısı; otomatik tekrar fırtınası engeli.
3. v60 kayıt işçisi ve v61 sayfa JSON önbelleği mevcut; fakat IndexedDB hâlâ bütün defteri tek `app` kaydı olarak yazar. Sayfa tabanlı veri deposuna geçilmiş değildir. Büyük değişiklik ancak ölçüm, göç/geri dönüş testiyle.
4. Tam yeniden çizim görünür çizgileri filtrelese de tüm sayfa çizgilerini dolaşır; PDF arka planı zaten ayrı canvas. Gerekirse sınırlı görünür alan önbelleği, mekânsal indeks; ilk adım yeniden yazım değil.
5. Açılış kayıt hatasında silerek yeni defter seçeneği güvenilirlik riski yaratır. Önce salt-okunur ham kurtarma kopyası, tekrar deneme; sessiz veya yönlendirilen silme yok.
6. Yaklaşık 1.8 MB ham sözlük JS açılışta yükleniyor. Bu sıkıştırılmış ağ boyutu veya ölçülmüş gecikme değildir. Tembel yükleme ancak çevrimdışı kabul testleriyle sonraki paket.
7. Kaydırma görünümü de eşitleme kirli işareti oluşturuyor. Görünümün cihaz özel ayrılması veri anlamını etkiler; ilk pakette değiştirilmez.
8. Plan ve fiziksel kabul belgesinde v52 döneminden kalan bilgiler var. OCR gerçek el yazısı kıyaslaması, sınıf ve bağımsız yedekten dönüş hâlâ açık.

## Rakiplerden alınacak dersler

Resmî ürün dokümanları özellik beyanıdır; cihazlarımızda hız, kalite veya öğrenme etkisi kanıtı değildir. Kodları kopyalanmadı.

| Ürün / kaynak | İlgili yaklaşım | Bilge Defter kararı |
|---|---|---|
| [Goodnotes](https://www.goodnotes.com/) ve [kalem sorun giderme](https://support.goodnotes.com/hc/en-us/articles/360001472956-Troubleshoot-Apple-Pencil-issues-in-Goodnotes) | Not/PDF bağlamı ve sistematik kalem kontrolü | Boş/dolu/PDF + avuç + uzun ders matrisi. Donanımı kanıtsız suçlama |
| [Notability – Apple Pencil](https://support.gingerlabs.com/hc/en-us/articles/218333197-Writing-with-Apple-Pencil) | Palm rejection, kalem/finger rolleri, silgiden otomatik dönüş | Tutarlı ve hatırlanan araç tercihleri. Native kalem yeteneğini tüm PWA cihazlarında vaat etme |
| [MyScript Notes](https://help.myscript.com/notes/overview/notes/) | Defter, serbest tahta ve PDF ayrımı; düzenleme/tanıma | Kullanıcının hangi modda olduğunu açık göster. Tanıma doğruluğunu gerçek örnek setiyle ölç |
| [LiquidText](https://www.liquidtext.net/) | Alıntı ile özgün kaynak bağını koruma | Kaydettiği parçadan kitabın doğru sayfasına dönüş, öncelikli kabul senaryosu |
| [MarginNote Card Axis](https://www.marginnote.com/en/features/card-axis/) | Aynı parçanın kaynak, kart ve ilişki görünümü | Önce kaynak bağlamını koru; kart/harita özelliklerini hemen ekleme |

## GitHub: uygulanabilirlik ve lisans

Lisanslar 27 Eylül incelemesinin anlık değerlendirmesidir. Entegrasyondan önce ilgili sürümün LICENSE dosyası yeniden incelenmeli. Hiçbir üçüncü taraf kod bu araştırmayla ürüne alınmadı.

| Proje | Öğrenilecek yaklaşım | Uyum / sınır |
|---|---|---|
| [Saber](https://github.com/saber-notes/saber) | Kalem, şifreli not ve cihazlar arası kullanım | Flutter, GPL-3.0; doğrudan PWA bileşeni değil |
| [Rnote](https://github.com/flxzt/rnote) | Görünür alan çizim önbelleği ve artımlı çizim | Rust/GTK, GPL-3.0; mimari ders, doğrudan taşıma değil |
| [Xournal++](https://github.com/xournalpp/xournalpp) | PDF açıklama, metin seçimi, dışa aktarma | C++/GTK masaüstü, GPL-2.0; iPad PWA alternatifi değil |
| [Excalidraw](https://github.com/excalidraw/excalidraw) | Statik sahne ile aktif çizim katmanının ayrılması | MIT; bütün defter motorunu değiştirmek için gerekçe değil |
| [perfect-freehand](https://github.com/steveruizok/perfect-freehand) | Basınç/yumuşatma ile çizgi geometrisi | MIT; palm rejection, kayıt ve eşitlemeyi çözmez. Performans kazanımı ölçülmeli |
| [tldraw lisansı](https://tldraw.dev/community/license) | Olgun tuval etkileşimleri | Varsayılan üretim kullanımı serbest açık kaynak lisansı değil; uygun lisans anahtarı şartları var. Ücretsiz varsayılmamalı |

Kod kanıtları: [Rnote render component](https://github.com/flxzt/rnote/blob/29ea24a1edcf7c9413b0896daf6663ea0f852254/crates/rnote-engine/src/store/render_comp.rs), [Excalidraw static scene](https://github.com/excalidraw/excalidraw/blob/84e3f5a40c5fac43cb8b28161b9c239d9e857061/packages/excalidraw/renderer/staticScene.ts). Rnote görünüm dışında tampon bırakmama ve arka plan render durumu; Excalidraw görünür öğeler ve kare ritmi temel alınabilir.

[Saber #1730](https://github.com/saber-notes/saber/issues/1730) kalem/parmak karışmasıyla yazının kesildiğine dair tek kullanıcı raporudur; yaygınlık veya aynı kök neden kanıtı değildir. Test senaryosu üretmek için değerlidir.

Platform kaynakları: [Canvas optimizasyonu](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API/Tutorial/Optimizing_canvas), [OffscreenCanvas](https://developer.mozilla.org/en-US/docs/Web/API/OffscreenCanvas), [tahmini kalem olayları](https://developer.mozilla.org/en-US/docs/Web/API/PointerEvent/getPredictedEvents). Tahmini noktalar kullanılırsa yalnız geçici çizimde; kalıcı gerçek çizgi verisine yazılmaz. Cihaz desteği kontrol edilir.

## Kullanım kararları

- Odak modu, temel araçlar ve geri al kolay erişilir kalmalı; yeni paneller eklemek yerine tekrarları azalt.
- Yerel kayıt, şifreli eşitleme ve indirilen bağımsız yedek ayrı durumlar olarak gösterilsin.
- Kalem/vurgulayıcı renk ve kalınlığı, silgi boyutu ve avuç tercihi cihaz/hesaba özel hatırlansın. Silgi seçili açılmasın; açılış kalem olsun.
- Sözlükte kısa sonuç öne çıksın; taslak/uzman incelemesi uyarısı saklanmadan ayrıntı aşamalı açılsın.
- Kütüphane alıntısı kaynağı/sayfasıyla gelsin; tablete uygun bölünmüş görünüm ancak mevcut akış düzeldikten sonra.
- Ücretli API, native uygulama, yeni AI veya kapsamlı yeniden yazım bu aşamanın konusu değil.

## Sıralama

**Paket 1 — güvenli temel:** koşullu eşitleme, boyut uyarısı, silmeyen kurtarma, araç tercihleri, isteğe bağlı yalnız cihaz içi süre raporu, güncel kabul planı ve otomatik test tanımı. Şema değişmez. Canlı yayın ayrı doğrulama/onaydır.

**Paket 2 — ders akışı:** sözlük/sayfa arama ve kaynak dönüşü, panel sadeleştirme; 3–5 öğrenciyle gözlem. Yeni özellik bütçesi yerine tıklama/geri dönüş/yanlışlık oranı ölçülür.

**Paket 3 — yalnız ölçüm gerekçesiyle:** sayfa/blob depolama, PDF orijinalini tek saklama, sınırlı çizim önbelleği. Göç öncesi/sonrası dosya bütünlüğü ve geri dönüş şart.

## Başarı tanımı

Fiziksel iPad'de 40 dakika boş/dolu/PDF sayfası, avuç teması, iki parmak kaydırma, yön değişimi ve tekrar kaleme dönüş. Kalem takılırsa el/kalem kaldırmadan kurtulma davranışı kaydedilir. Yerel kayıt, yeniden açılış, internet kesintisi, çakışma, güncelleme ve bağımsız yedekten dönüş ayrı testtir. Sentetik tarayıcı testi gerçek kalem gecikmesi değildir.

Önce temel ölçüm, sonra aynı cihaz/veriyle karşılaştırma: yeniden çizim/kayıt p50-p95, uzun görevler, kaybolan çizgi, beklenmeyen silme, kurtarma ihtiyacı, eşitleme ağ baytı. İşlem süreleri gerçek ekran-kalem gecikmesi gibi sunulmaz. Kritik veri kaybı veya erişim ihlali varken sınıf yaygınlaştırılmaz.
