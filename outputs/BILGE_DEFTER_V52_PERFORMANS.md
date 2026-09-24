# Bilge Defter v52 — kalem performansı ve yayın

24 Eylül 2026 18:29 İstanbul. Kullanıcının açık hazırlama/yayın onayıyla yalnız https://defter.bilgearena.com/ web paketi v52'ye geçirildi.

## Değişiklik

- Her kalem örneği hâlâ nokta/basınç verisini ve kayıt revizyonunu ilerletiyor. Araç çubuğu artık aynı kirli kayıt durumunu her hareket için tekrar çizmez; temizden kaydedilmemiş duruma geçişte güncellenir.
- Eşitleme arayüzü zaten kirli olan durumu tekrar tekrar yazmaz. Eşitleme protokolü değişmedi.
- Kısa çizgilerin kayıtları 300 ms yazma duraklamasında birleştirilir. Bağımsız 5 saniyelik ara kayıt korunur; yeni hareket bu üst sınır zamanlayıcısını ertelemez. Diğer işlemler, açık kayıt isteği ve sayfa gizlenmesi beklemeden kayıt denemesini başlatır.
- Kalem kaldırılınca yapılan tam çizim yenilemesi bu sürümde korunmuştur; fosforlu/silgi görünümü ve son nokta davranışı değiştirilmedi. Veri biçimi ve IndexedDB karşılaştırmalı çakışma kontrolü değişmedi.
- Bedel: kısa çizgiden hemen sonra kayıt için en çok 300 ms beklenir; bu sırada arayüz kaydedildi demez. İşletim sisteminin uygulamayı aniden öldürmesine karşı mutlak kayıt garantisi verilmez.

## Kanıt

- 192 kontrol başarılı: 169 mevcut regresyon, 14 giriş/logo, 9 yeni kalem/kayıt kontrolü. 232 çevrim dışı dosyanın hash'i ve 18 betiğin sözdizimi ayrıca doğrulandı.
- İzole Chromium, 1180x820, CPU 4x yavaşlatma, sentetik 120 hareket: v51 121 araç yenilemesi / 148.7 ms; v52 2 yenileme / 4.4 ms. Her iki sürüm 121 nokta, 121 revizyon, 121 çizim parçası üretti. Bu süreler toplam gecikme veya gerçek iPad hız artışı değildir.
- Sekiz hızlı kısa çizgi bir yerel yazımda saklandı ve yeniden açılışta sekizi de bulundu.
- Uzun çizgide ara kayıt, sonradan eklenen noktalar/basınç, sayfa gizlenmesi, kota hatası ve yeniden deneme, iki sekmeli çakışma, açık kayıt ve pointercancel test edildi.
- Gerçek yerel service worker ile v51 -> v52 güncelleme ve notların korunması geçti. Gerçek cihaz testi yapılmadı.
- Testte PointerEvent basıncı Float32 hassasiyeti nedeniyle 0.8 yerine 0.8000000119 geldi. Test 1e-6 toleransa düzeltildi; ürün kodu bu nedenle değiştirilmedi.
- Önizleme ve canlı origin: 235/235 dosya HTTP hash'i eşleşti; iki API kimliksiz isteği 401 ile reddetti; beş özel yol 404; nginx testi başarılı.
- Dış HTTPS üzerinden altı yol aynı Cloudflare Access alanına 302 yönlendiriyor. Politika atlatılmadı; OTP gönderilmedi ve gerçek notlar okunmadı.

## Yayın kimliği ve kapsam

- UI: `/opt/bilge-defter-classroom-v52/ui`.
- SHA256SUMS özeti: `ac4216857e0fa5a04c31e6d10394c28d68cb87e594b40870a6fbb67582b956f9`.
- UI arşivi: `7396b50e0b0713a567546dde270506c21563c231ce0532c64fd5e9a6e276af21`.
- Yapılandırma değişmedi: `505cd65af68387806b9a70121117e2bd71183e81d2952b403d5de58cbe55771a`.
- Yeni web: `fb0defd5cae5e6bf99413cc886e931efbed93d2a9efc8b0d73bd610f44255955`; başlangıç `2026-09-24T15:29:44.787147443Z`.
- Geri dönüş: durdurulmuş `bilge-defter-invited-web-rollback-v52`, v51 kimliği `3aa4d821659e6e17672e910b923b7a085dc0b3fb523a5136ce206ab6d51069f1`. v51 dosyaları korunuyor. Yayın betiği etkinleştirme hatasında v51'e otomatik döner; bu yayında gerekmedi.
- API kimliği ve başlangıcı değişmedi: `faa96ab52e4d82f119d279d0bee536432448e01c38687ff743bd2d23840b4625`, `2026-09-23T19:24:15.128690167Z`.
- Veritabanı, üyeler, sırlar, Cloudflare Access/DNS, özel v46 adresi, Bilge Arena, tünel ve ortak sunucu korunmuştur. Ortak servis PID 2699214 ve izlenen kod hash'i yayın öncesi/sonrası aynı. Yeni önizleme durduruldu.
- Kaynak mevcut kirli master çalışma ağacı üzerinde, HEAD `90b6841db7069fc455f8958b7aed5689acba3015`. Commit/push yapılmadı. v51-v52 paket farkı yalnız index.html, sync-workspace.js, sw.js, release.json ve offline-assets.json; SHA256SUMS yeniden üretildi.

## Kullanıcı kabul testi

Güncellemeyi denetle; paket hazır ve kayıt tamamlandıktan sonra tüm Bilge Defter pencere/sekmesini kapatıp yeniden aç. Sürüm v52 olmalı. Tarayıcı verisi silinmemeli ve uygulama kaldırılmamalı.

iPad'de boş sayfada ve eski dolu sayfada 1-2 dakika kalemle yazın; hızlı harfler, avuç teması, silgi ve fosforlu deneyin. Kaydedildi durumundan sonra kapatıp yeniden açarak son satırı kontrol edin. Gerçek iPad akıcılığı kullanıcı testine açıktır; kalan takılma varsa dolu sayfada tam çizim ve kayıt boyutu ayrıca ölçülmelidir.

Kanıt dosyaları: `outputs/v52/audit-results.json`, `performance-results.json`, `login-results.json`, `ink-after-save.png`; `outputs/v52-release/preview-receipt.json`, `origin-receipt.json`, `access-gates.json`.

Tarayıcı kontrol becerisi doğrulama akışını yönlendirdi; CLI bulunmadığı için mevcut Playwright/Chromium kullanıldı. Merkezi hafıza becerisi kapsam/sonuç kaydını sağladı. Dosya erişim aracının sandbox hatası kapsamlı izinli apply_patch çağrısıyla aşıldı.
