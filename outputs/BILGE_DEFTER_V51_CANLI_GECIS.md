# Bilge Defter v51 — canlı yayın kaydı

23 Eylül 2026, 23:24 İstanbul. Kullanıcının yayın onayıyla **https://defter.bilgearena.com/** v51 arayüzüne geçirildi.

## Yayımlananlar

Sade giriş kartı, önbelleksiz `auth-continue.html` / `auth-continue.js` dönüş akışı, Türkçe bağlantı/oturum uyarıları, kullanıcı logoları ve yeni PWA/Apple/sekme ikonu. Mevcut Access korumasına istisna eklenmedi.

Yalnız web konteyneri değişti. Hesap sunucusu v50 koduyla aynı konteyner ve aynı başlangıç zamanı ile çalışıyor. Veritabanı, üye listesi, korumalı anahtarlar, DNS ve giriş politikası değiştirilmedi. Yeni veritabanı veya şema geçişi yok. Bilge Arena ve ortak sunucu yeniden başlatılmadı. Özel Tailscale adresi v46 olarak korundu.

## Doğrulanan sonuçlar

- Yayından önce tekrar **183/183** test: 169 regresyon + 14 giriş/logo. Gerçek yerel service worker ile v50→v51 güncellemesi ve kayıt korunması test edildi.
- Önizlemede ve canlı origin üzerinde **235/235 HTTP dosya hash'i** eşleşti. Yeni giriş dönüş dosyaları dahil tüm cevaplarda `no-store` doğrulandı.
- Çevrim dışı paket 232 varlık; giriş dönüş dosyaları çevrim dışı pakete alınmadı.
- Yönetim ve şifreli yedek uçları kimliksiz isteği 401 ile reddetti; beş özel yol 404 döndürdü.
- Nginx yapılandırma testi başarılı.
- Dış HTTPS üzerinden altı yol (ana sayfa, iki giriş dönüş dosyası, sürüm, uygulama ikonu, kimlik API'si) kimliksiz istekleri doğru Cloudflare Access alanına 302 ile yönlendirdi.
- Temiz Chromium, yeni `auth-continue.html` yolundan gerçek e-posta giriş formuna ulaştı. OTP gönderilmedi; hesap açılmadı ve kullanıcı notları okunmadı.
- API konteyneri ve başlangıç zamanı değişmedi. Tünel de aynı konteyner ve başlangıç zamanı ile çalışıyor. Ortak sunucu PID 2699214, izlenen kaynak hash'i ve özel yayın yolu değişmedi.

## Kimlikler / geri dönüş

- Yayın yolu: `/opt/bilge-defter-classroom-v51/ui`.
- UI SHA256SUMS SHA256: `d8dced929378581fa199786342ee21dcb3a7e26dd9454083c8564ccda8386fb4`.
- Aktarılan UI arşivi SHA256: `a44f3c17a6c98c43458bd21c8629db33b5a92396ff81626db0101354a35df201`.
- Yeni Nginx yapılandırma SHA256: `505cd65af68387806b9a70121117e2bd71183e81d2952b403d5de58cbe55771a`.
- Yeni web konteyneri: `3aa4d821659e6e17672e910b923b7a085dc0b3fb523a5136ce206ab6d51069f1`.
- Değişmeyen API: `faa96ab52e4d82f119d279d0bee536432448e01c38687ff743bd2d23840b4625`; başlangıç `2026-09-23T19:24:15.128690167Z`.
- Önceki v50 web: `bilge-defter-invited-web-rollback-v51`, ID `0470f4380eaeee664cfceb6a4e421b40b7ec4db21411b028e5891bd1ed83a711`, durdurulmuş halde korundu. Önceki geri dönüşler silinmedi.
- Yeni önizleme konteyneri yayın sonunda durduruldu. Canlı localhost portu 18790 değişmedi.

Geri dönüş gerekirse önce durumu tekrar doğrulayın; yeni webi durdurup ayrı isimle koruyun, `bilge-defter-invited-web-rollback-v51` konteynerini eski adına döndürüp başlatın ve `/opt/bilge-defter-invited/current` işaretini `/opt/bilge-defter-classroom-v50/ui` yoluna çevirin. Hesap sunucusuna ve DB'ye müdahale gerekmez.

## Sınırlar ve kullanım

Gerçek kullanıcının OTP sonrası dönüşü, iPad/Safari ve kurulu işletim sistemi ikonunun yenilenmesi henüz bu sürümde doğrulanmadı. Yerel taklit Access testi gerçek e-posta tesliminin kanıtı değildir. Kurulu uygulama kaldırılmamalı, tarayıcı verisi silinmemelidir. Gerekirse aynı tarayıcı/profilde `https://defter.bilgearena.com/auth-continue.html` açılarak giriş yenilenebilir; sonrasında uygulama hesabı tekrar doğrular.

Uygulamada Güncellemeyi denetle; paket hazır ve kayıt tamamlandıktan sonra tüm Bilge Defter pencere/sekme örneklerini kapatıp yeniden aç. v51 görülmeli. Eski masaüstü simgesinin anında değişmesi garanti edilmez.

Kaynak çalışma ağacındaki mevcut değişiklikler korundu; commit/push veya temiz-klon yayını yapılmadı. Paket ve yapılandırma sabit hash'lerle doğrulandı. Yayın betiği başarısızlıkta otomatik v50 geri dönüşünü içeriyor; bu yayında geri dönüş gerekmedi. Tarayıcı becerisinin CLI aracı kurulu olmadığından mevcut Chromium test altyapısı kullanıldı; merkezi hafıza becerisi kapsam/sonuç kaydını sağladı.

Kanıtlar: `outputs/v51-release/preview-receipt.json`, `origin-receipt.json`, `access-gates.json`, `browser-gate.json`, `public-login-gate.png`; yerel testler `outputs/v51/`.
