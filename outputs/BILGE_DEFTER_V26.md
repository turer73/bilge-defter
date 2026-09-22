# Bilge Defter v26 — ilk eklemede yerleşim

21 Eylül 2026. Kullanıcının isteğiyle yeni metin/görsel ekleme ve yerleşimi tek akışta birleştirildi.

## Kullanım

- Metin ekle: ayrı pencere açılmaz. Sayfa üzerindeki taslak seçili gelir; üstteki alana metni yazın. Yazı boyutu, renk, genişlik ve açı aynı ekrandadır.
- Görsel ekle: dosya seçilince doğrudan sayfada seçili taslak açılır. Genişlik ve açı ilk yerleşimde ayarlanır.
- Öğenin içinden sürükleyerek taşıyın; ↘ ile boyutlandırın; ↻ ile döndürün. 90° ve açı sıfırlama düğmeleri de kullanılabilir.
- Bitti: bütün ilk yerleşimi tek ekleme/kayıt adımı olarak tamamlar. Sonraki bir Geri al bu eklemeyi kaldırır.
- Vazgeç veya Escape: yeni eklemeyi iptal eder, mevcut notlar değişmez. Taslak içindeki Geri al yalnız taslak düzenlemelerini geri getirir.
- Öğeyi düzenle artık ilk eklemenin zorunlu adımı değildir; önceden kaydedilmiş nesneleri değiştirmek için korunmuştur.

## Kayıt sınırı

Bitti'den önce yeni nesne yalnız önizlemedir: sayfa verisine, diske ve yedeğe eklenmez. Taslak açıkken sayfa değiştirme ve diğer değiştirici işlemler engellenir. Pencereyi kapatma/yenilemede tarayıcının desteklediği kaydedilmemiş değişiklik uyarısı istenir; cihaz/tarayıcı kapanmasına karşı taslak otomatik kurtarma iddiası yoktur. Kalıcı olması için Bitti kullanılmalıdır.

Tamamlandıktan sonraki disk hatasında mevcut disk kaydı korunur, yeni nesne bellekte kalır ve yeniden kayıt kurtarması kullanılabilir. Başka sekmenin kaydı eski taslak tarafından ezilemez. Veri/yedek biçimi v25 ile aynıdır: açı bulunan nesneler veri 4 / yedek 6 kullanır; v24 ve öncesine uyumlu değildir.

## Doğrulama

- 180 yerel kontrol: 167 mevcut regresyon ve 13 ilk-yerleşim kontrolü.
- Canlı özel HTTPS: ilk yerleşim 13, metin/görsel 13, yerleşim 15, döndürme 15, PWA 6 = 62.
- Davetli adreste 15 erişim kapısı kontrolü; yetkisiz ve sahte oturum uygulamayı açamıyor. E-posta gönderilmedi, izinli kullanıcı oturumu araçla açılmadı.
- Doğrudan taslak, boş/geçersiz metin engeli, yazı boyutu/açı önizlemesi, kaydetmeden taşıma/boyutlandırma/döndürme, tek ekleme geri alma, vazgeçme/Escape, gerçek PNG seçimi, gerçek tarayıcı dokunma olayları, çevrim dışı kullanım, JSON yedeği ve eski sekme çakışması sınandı.
- Tarayıcı doğrulama becerisinin yönlendirmesiyle 390 px ve masaüstü ekran görüntüleri incelendi; dar ekran metin alanının genişliği düzeltildi. PDF becerisinin yönlendirmesiyle çıktı pypdf strict ve Poppler ile ayrıca kontrol edildi.
- Gerçek fiziksel tablet kalemi/ekran klavyesi ve kullanıcının kurulu v26 kabulü henüz doğrulanmadı.

## Yayın

Her iki ayrı adreste aynı 212 dosyalık v26 paketi:

- https://defter.bilgearena.com/
- https://klipper-2.tail1ade8e.ts.net:8443/

Release dizinleri: `/opt/bilge-defter-test/releases/20260921-v26-first-placement` ve `/opt/bilge-defter-invited/releases/20260921-v26-first-placement`.

Private konteyner: `0ab79df3e0c03335f5e70e95a5a002c76e4e79000ee8afd4d1138ed119425f26`.

Davetli konteyner: `3debeb6ef00b321e443e974409711ba9c72597306b56f644c33305385f229227`.

SHA256SUMS özeti: `31ad26d3644a3b0afa7b8068f6544e0c45780343a1f7cca10ab8ce8d1ff41722`.

Her değişiklik öncesi v25 dizini, dosya özeti ve konteyner kimliği doğrulandı. Sonrasında sunulan dosyalar paketle karşılaştırıldı. v25 dizinleri ve rollback-before-v26 konteynerleri tutuldu; v25 kaydedilmiş veri biçimine uyumludur. Diğer çalışan konteyner kimlikleri her iki yayında değişmedi. Bilge Arena, DNS, Access/cache ve Tailscale değiştirilmedi.

Güncellemede yeni paket hazır olduğunda kayıtlarınızı tamamlayıp tüm Defter sekme/uygulama pencerelerini kapatın; yeniden açılışta v26 görünmelidir. Tarayıcı verilerini silmeyin. Takvim/elle çalışma planı bu dilimde eklenmedi.
