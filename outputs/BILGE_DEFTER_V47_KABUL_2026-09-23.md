# Bilge Defter v47 — yerel kabul, ikinci tur

23 Eylül 2026. Çalışma dizini `D:\Projelerim\bilge-defter`. Bu rapor canlı yayın bildirimi değildir.

## Sonuç

**35 kontrol geçti, 0 başarısız.** Üretilen son v47 adayında 226/226 varlık SHA-256 eşleşti. Önceki çevrim dışı test engeli, testin asenkron koşulu erken tamamlamasından kaynaklanıyordu; `navigator.serviceWorker.ready` doğrudan beklenince tam kurulum ve çevrim dışı açılış geçti.

- `work/verify-safety-repairs.cjs`: **29/29**. Kayıt, eşitleme yarışları, PDF sığdırma, gerçek arayüz düğmeleri, OCR önizleme/iptal, taslak ve güncelleme koruması; gerçek Chromium service worker kurulumu; internet kapalıyken sentetik notla yeniden açılma; 390 px ayarlar paneli.
- `work/verify-v47-update.cjs`: **6/6**. Gerçek yerel v46/v47 paket hashleri; kasıtlı bozuk v47 dosyasının reddi ve yarım önbelleğin silinmesi; sağlam adayın beklemesi; ikinci pencerede bitmemiş metin taslağı varken açık güncelleme isteğinin ertelenmesi; diğer pencere kapatılınca v46'dan v47'ye geçiş ve tüm sentetik defter JSON'unun eşit kalması; güncellenmiş sürümün çevrim dışı yeniden açılması.
- Sentetik ikinci pencere taslağı test sonunda açıkça iptal edilip pencere kapatıldı. Test, taslağın işletim sistemi zorla kapatıldığında kurtarılmasını iddia etmez.
- Her iki grupta yakalanan sayfa JavaScript hatası yok. Masaüstü güncelleme sonrası görüntüsü ve 390 px ayarlar görüntüsü görsel olarak da incelendi; başlık, yazı alanı, araçlar ve panel okunur/sınırlar içinde.

## Ek düzeltme

Eski service worker `SKIP_WAITING` isteğini başka pencereler açıkken de uygulayabiliyordu. Yeni v47 bekleyen worker, kendi kapsamındaki açık pencereleri kontrol eder; birden çok pencere varsa etkinleşmeyi erteler ve isteği gönderen pencereye `UPDATE_DEFERRED` bildirir. v47 arayüzü diğer Bilge Defter pencerelerini kaydedip kapatma yönlendirmesini gösterir.

v46 arayüzünde bu yeni mesaj dinleyicisi yoktur; yeni worker yine de etkinleşmeyi durdurur fakat açıklama görünmeyebilir. Eski pencereler tamamen kapatılıp uygulama açılınca normal geçiş yolu kullanılabilir. Kontrol ve etkinleşme arasındaki çok dar zaman aralığında yeni pencere açılması, işletim sistemi kapanması ve gerçek cihazlar arası yaşam döngüleri ayrıca stres testi gerektirir.

## Aday ve yeniden çalıştırma

- Kaynak: `work/bilge-defter-test`
- Üretilen paket: `work/bilge-defter-invited-v47`
- Paket SHA256SUMS dosyasının özeti: `d0242fc790a9223a70be192a8fc05fd32f0187db5ffa7acdbdddb55de53b0a11`
- Çalıştırma: aday dizini `BILGE_TEST_ROOT` olarak verilerek `node work/verify-safety-repairs.cjs`; ayrıca `node work/verify-v47-update.cjs`.
- Testler yalnız loopback adresi ve geçici Chromium profilleri kullanır. Eşitleme/OCR çağrıları sahte uçlara ve sentetik verilerle yapılır. Kurulu kullanıcı uygulaması, gerçek notlar, canlı sunucu, DNS ve erişim politikaları değiştirilmedi.
- Görüntüler: `outputs/bilge-defter-v47-upgraded-offline.png`, `outputs/bilge-defter-v47-mobile-local.png`.

## Sunucu kaynağı araştırması — uygulanmadı

Yönergedeki kanonik `turer73/Codex-server` deposu mevcut GitHub oturumunda **404** döndü. Bu yokluk kanıtı değildir; ad değişikliği veya erişim sınırı olabilir. `D:\Projelerim\claude-server` ve `D:\Projelerim\claude-server-panel` depolarının uzak kaynağı `turer73/claude-server`; kontrol edilen yerel dosyalar ve erişilebilir uzak HEAD ağacında Bilge Defter sunucu modülü bulunmadı. Kullanıcıdan güncel depo veya yerel klasör istendi.

Atomik sürüm karşılaştırma/yazma (`cas-v1`, güçlü ETag, If-Match/If-None-Match) sunucu tarafında bu turda uygulanmadı ve canlıda ölçülmedi. Yeni aday bu destek doğrulanmadan otomatik eşitlemeyi veya sunucuya manuel gönderimi açmaz. Yerel not alma ve JSON yedekleme çalışır. Sadece istemci testlerinin geçmesi sunucu güvenliğinin kanıtı değildir.

## Yayın öncesi kalanlar

1. Doğru sunucu kaynak/erişimi; mevcut yedek ve kimlik kodu incelemesi; ayrıca onaylanmış kapsamda atomik sürüm sözleşmesi ve gerçek iki cihaz testi.
2. Takipsiz bağımlılıkların/lisansların temiz klondan üretilebilirliği; tüm tarihsel regresyon gruplarının yeni arayüze uyarlanarak çalıştırılması.
3. iPad/Android gerçek kalem, avuç içi, kamera, kurulu PWA, kullanıcı verisi yedekten dönüş kabulü.
4. El yazısı alan seçimi ve nokta/zaman veri modeli; ardından ayrıca onaylanan sağlayıcı, maliyet ve örneklerle kalite pilotu.

Commit, push ve canlı dağıtım yapılmadı. Bu çalışma yerel adayın belirli kabul koşullarını tamamlar; bütün ürün veya canlı eşitleme hazır ilan edilmez.
