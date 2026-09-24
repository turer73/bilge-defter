# Bilge Defter — yerel v47 adayı

## İkinci tur güncellemesi

Önceki çevrim dışı test engeli aşıldı: 29 hedefli/çevrim dışı + 6 güncelleme kontrolü = **35/35 geçti**. Çok pencere güncelleme koruması eklendi. Yeni aday SHA256SUMS özeti `d0242fc790a9223a70be192a8fc05fd32f0187db5ffa7acdbdddb55de53b0a11`. Aşağıdaki ilk tur sonuçları tarihsel kanıt olarak korunmuştur; güncel kabul raporu `BILGE_DEFTER_V47_KABUL_2026-09-23.md` dosyasındadır. Canlı yayın ve fiziksel tablet kabulü hâlâ yapılmadı; sunucu sürüm koruması için doğru kaynak erişimi bekleniyor.

23 Eylül 2026. Klasör: `D:\Projelerim\bilge-defter`. Başlangıç HEAD: `90b6841`; master üzerinde önceden var olan V2.1 değişiklikleri korunarak ilerlenmiştir. Commit/push/deploy yapılmadı. Kullanıcının kurulu uygulaması veya gerçek notları değiştirilmedi.

## Yapılanlar

1. `index.html`: geçersiz defterin kayda yazılması engellendi. Not değişikliğiyle aynı IndexedDB işlemi içinde kalıcı eşitleme değişiklik işareti yazılıyor. Gönderim onayı yalnız gerçekten gönderilen defterle eşleşirse temiz kabul ediliyor.
2. `sync-workspace.js`: yeniden açılışta çevrim dışı değişiklik unutulmuyor; ağ ve giriş hatası boş sunucu sayılmıyor; aynı sekmedeki işlemler çakışmıyor. Şifre çözülürken not değişirse sunucu kopyası otomatik uygulanmıyor. Sunucu koruması yoksa gönderim kapalıdır; bu bilinçli güvenlik sınırıdır. Önceden kurulu eski istemciler bu yerel değişiklikten etkilenmez.
3. `ui-v2/ui-v2-bridge.js`: metin, kamera, görsel, PDF, dışa aktarma ve yerleşim düğmeleri mevcut editör girişlerine bağlandı. Sayfa seçimi yanlışlıkla menü açmıyor; geçersiz kimlik reddediliyor. PDF sığdırma motorun konum sınırlarını uygulayan işlevini kullanıyor. Geri dönüş bilgisi gerçek IndexedDB kaydından geliyor.
4. `ui-v2/bilge-defter-ui.js`: PDF sınırları %100–%300; silgi kalınlığı 64'e kadar; henüz işlevi olmayan dokunma kilidi ve basınç aç/kapa düğmeleri devre dışı ve açıklamalı. Basınç zaten uyumlu kalemlerde motor tarafından otomatik işlenir.
5. `pwa.js`: açık taslak/kayıt sorunu güncelleme etkinleştirmesini durdurur. Etkinleşme beklenirken yeni düzenleme başladıysa sayfa zorla yeniden yüklenmez. Bu, başka sekmelerin tüm yaşam döngülerinin doğrulandığı anlamına gelmez.
6. `ocr-workspace.js`: pencereyi açmak istek göndermez. Önizleme, gerçek çizim motoruyla ve silgi sırası korunarak yerelde hazırlanır. Uzun içerik 2000 piksel sınırına bütünüyle sığdırılır; kırpılmaz, fakat küçük yazı kalitesi düşebilir. Ayrı Tanımayı başlat eylemi mevcut özel sunucu uç noktasını çağırır. Pencere kapatma isteği iptal eder; eski sonuç başka sayfaya eklenmez. Sonuç ilk yerleşimde düzenlenir, özgün çizimler silinmez.

## İlk tur doğrulaması ve sınırları — güncel sonuçlar yukarıda

- `work/verify-safety-repairs.cjs`: üretilmiş `work/bilge-defter-invited-v47` üzerinde **25/25** hedefli kontrol geçti. Sentetik defterler, geçici profiller, sahte eşitleme/OCR uçları kullanıldı. Üçüncü taraf sağlayıcıya veya canlı OCR'ye veri gönderilmedi.
- Kontroller: gerçek arayüzde çizim/geri al, silgi sınırı, tek aşama metin yerleştirme, doğru komut hedefleri, PDF diyalogu, sığdırma/kayıt/yeniden açılış, geçersiz kayıt engeli, gerçek geri dönüş göstergesi; çevrim dışı düzenleme sonrası eşitleme çakışması; gönderim/çekim sırasında düzenleme; 503 ve 412; tekilleştirilmiş zamanlayıcı; tanıma önizleme/silgi/uzun sayfa/iptal; güncelleme taslak koruması.
- **226/226** çevrim dışı varlık SHA-256 eşleşti. Paket `SHA256SUMS` özeti: `6c9cedd5a1c30206bb57f19b9d8f1f2e5ef7aaaecdbc944ca02d3a2eadcb88d9`.
- Gerçek service worker kurulum kontrolü başarısız sayıldı: son gözlemde durum `installing`, önbellek 220/226 idi; ilk iki koşuda 187 ve 218 görüldü. Test asenkron bekleme koşulunu erken tamamlıyordu. Son değişiklik `navigator.serviceWorker.ready` yaşam döngüsü sözünü doğrudan bekler; **bu değişiklik sonrasında çevrim dışı test yeniden çalıştırılmadı**. Paket sağlamlığı ile etkin çevrim dışı kurulum ayrı kabul koşullarıdır.
- Tarayıcı doğrulama becerisinin iki tekrar sınırı nedeniyle bu alt kontrol bu turda durduruldu. Bekleyen kontroller: gerçek çevrim dışı yeniden açılış, dar ekranın son görüntüsü, eski paketten v47'ye geçiş, çok pencere güncellemesi. `outputs/bilge-defter-v47-local.png` yerel masaüstü görüntüsüdür; görüntü dosyası araç erişim hatası nedeniyle ayrıca görsel olarak incelenmedi.
- Bütün eski test grupları yeniden çalıştırılmadı. Fiziksel iPad/Android kalem, avuç içi, kamera ve iki cihaz eşitlemesi bu turda test edilmedi. MyScript/ML Kit tanıma başarısı ölçülmedi.
- 226 varlıktan bir kısmı (önceki incelemede 210) Git takibinde değildi; bu turdaki oluşturma mevcut diskteki dosyalara dayanır. Temiz klondan üretilebilirlik henüz sağlanmadı. Önceden var olan değişiklikler geri alınmadı veya otomatik sahnelenmedi.

## Sunucuda gerekli sürüm sözleşmesi — henüz uygulanmadı

Bu, istemcinin yeni gereksinimidir; çalışan sunucu hakkında doğrulanmış özellik değildir.

- `GET /api/v1/bilge-defter/backup`: destek varsa `X-Bilge-Sync-Protocol: cas-v1`; mevcut kayıtta güçlü, her içerik değişiminde yenilenen `ETag: "opaque-revision"`. Gerçek yokluk 404; ağ, yetki ve giriş hatası 404'e çevrilmemeli. İlk oluşturma için 404 yanıtında da protokol başlığı olmalı.
- `POST`: mevcut kayıtta `If-Match`, ilk oluşturmada `If-None-Match: *`. Veritabanı işlemi içinde karşılaştırma ve yazma atomik olmalı. Sürüm uyuşmazlığında 412/409 ve **hiçbir içerik değişikliği olmamalı**. Başarılı yanıt yeni güçlü ETag ve protokol başlığı taşımalı.
- Başlıkları istemciye eklemek tek başına yeterli değildir. Sunucu koşulsuz eski istemci yazılarını da reddetmeli; yoksa eski v46 cihaz yeni korumayı aşabilir. Bu uyumluluk kırılması yayın öncesi cihaz geçiş planına dahil edilmeli.
- Cloudflare/reverse proxy bu başlıkları korumalı; kullanıcı ayrımı mevcut doğrulanmış kimlik üzerinden sürmeli. İki cihaz aynı sürüme yazınca yalnız birinin kazanması gerçek sunucu testinde kanıtlanmalı. AES-GCM/PBKDF2 içerik şifreleme korunur; istemci parolası gönderilmez.
- JSON yedek alma, yerel not alma ve sunucudan kullanıcı onaylı yedek önizleme bu sürüm koşulundan bağımsızdır. Sunucuya manuel gönderim de korumasız yapılmaz.

## Sonraki dilim

1. Düzeltilmiş bekleme ile PWA testini tamamla; eski sürüm/çok pencere/kayıt hatası geçişlerini sınayarak yayın adayını kabul et.
2. Sunucu deposunda salt-okunur inceleme, ardından açık kapsamla atomik ETag sözleşmesi; canlı değişiklik ayrı onay gerektirir.
3. Bağımlılık/lisans dosyalarını temiz klondan üretilebilir hale getir ve eksik eski testleri V2 arayüzüne uyarla.
4. OCR pilotunun alan seçimi ve sağlayıcıdan bağımsız nokta/zaman verisini ekle. MyScript/ML Kit seçimi, anahtar, lisans, maliyet ve gerçek not aktarımı ayrı karar. 23 tasarım kabul senaryosu otomatik olarak tamamlandı sayılmaz.

Test komutları: `BILGE_TEST_ROOT` aday dizinine ayarlanarak `node work/verify-safety-repairs.cjs`. `BILGE_SKIP_OFFLINE=1` yalnız hedefli 25 kontrolü çalıştırır ve çevrim dışı testin çalıştırılmadığını çıktıda belirtir.
