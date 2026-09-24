# Bilge Defter v50 — davetli yayın

23 Eylül 2026. Kullanıcının v50 yayın onayıyla https://defter.bilgearena.com/ adresi v50'ye geçirildi.

## Kapsam ve sonuç

- Arayüz ve bağımsız hesap sunucusu v50. Ayarlar taşması, defter penceresi boşluğu, takvim ölçüleri, OCR bölge/kontrast önizlemesi ve kaynak sınırları, sözlük geri dönüş açıklaması yayımlandı.
- Eski v49 hesap ve web konteynerleri durdurulmuş geri dönüş kopyaları olarak tutuldu. Önceki v46 geri dönüşleri silinmedi.
- Canlı veritabanı ve korumalı kimlik dosyaları aynı v49 klasörlerinden bağlandı. Ortam ayarları birebir aynı. Şema geçişi, hesap sıfırlama, Cloudflare politika/DNS/token değişikliği yapılmadı.
- Bilge Arena, ortak linux-ai-server ve özel Tailscale v46 yayını değiştirilmedi. Ortak sunucu PID 2699214 ve izlenen kaynak hash'i aynı.
- v50 önizlemesi ayrı boş veri klasörüyle ve sır dosyası bağlanmadan sınandı; yayın sonrası iki önizleme konteyneri durduruldu.

## Kanıtlar

- Yeniden çalıştırılan yerel paket denetimi: 169/169. Ayrı Linux Docker derlemesinde aynı 72 backend testi de geçti; bunlar 169'a tekrar eklenmedi.
- Önizleme ve canlı origin üzerinden 229/229 HTTP dosya hash'i eşleşti. 228 çevrim dışı varlık, 18 betik sözdizimi kontrolü geçti.
- Yönetim ve yedek uçları kimliksiz isteği 401 ile reddetti; 5 özel yol 404 döndürdü.
- Üretim konteynerindeki gerçek uygulama kaynakları, paketlenen kaynak hash'leriyle eşleşti. Sağlık yanıtı v50.
- Veritabanı quick_check: ok. Dört tablo satır sayıları geçiş öncesi yedekle aynı: üyeler 2, üye denetimi 2, erişim durumu 1, şifreli yedekler 0. Not içerikleri okunmadı.
- Geçişten önce web/API durdurularak SQLite backup alındı; bağımsız bellekte geri yükleme bütünlüğü doğrulandı. Sunucuda /opt/bilge-defter-classroom-v50/before-v50.sqlite, izin 0600. Kullanıcının cihazındaki yerel notların yerine geçmez.
- Windows HTTPS kontrolü 302 ile doğru Cloudflare Access alanına yönlendi. Temiz Chromium gerçek e-posta alanını gösterdi; OTP gönderilmedi.

## Paket kimlikleri

- UI SHA256SUMS SHA256: 6f76ccc48d888acb5aa096d983f1c76b0304e521b188bbabc4c97c68e4dd63e6
- Üretim API imajı: sha256:9c7b3e941788b7068b48173a29687da41429b227fc5a0dddd4cd7be4106dbf93
- UI yolu: /opt/bilge-defter-classroom-v50/ui
- Canlı veri: /opt/bilge-defter-classroom-v49/data/bilge-defter.sqlite
- Kaynak 15 dosyalık açık izin listesiyle arşivlendi. Çalışma ağacı önceden değişiklikler içeriyordu; temiz Git klonundan üretildiği iddia edilmez. Commit/push yapılmadı.
- Ayrıntılı makine kayıtları: outputs/v50-release/package-receipt.json, publication-receipt.json, public-email-gate.json ve linux-build-verify.log.

## Sınırlar ve düzeltilen deneme hataları

Fiziksel iPad/Safari, kalem/avuç, kullanıcının kurulu PWA profili ve gerçek OTP akışı bu yayında sınanmadı. El yazısı doğruluğu, tam sunucu sözlüğü ve 50 kişilik yük kabulü tamamlandı sayılmaz.

Dosya aracının sandbox sorunu aynı apply_patch aracının izinli çağrısıyla aşıldı. Önizleme klasörü için install sayısal kullanıcıyı kabul etmedi; mevcut sunucuda çalışan ayrı chown adımı kullanıldı. Kontrol betiği ilk denemede açık kimlik-durumu yoluna yanlışlıkla 401 bekledi; gerçek korumalı yedek yoluyla değiştirildi. Ek sağlık sorgusunda tırnak kaçışı hatası düzeltildi. Mount karşılaştırması yazımsal Mode yerine kaynak/hedef/RW değerleriyle yapıldı. Linux'tan dış HTTPS istemcisi 403 aldı; Windows ve temiz Chromium gerçek giriş kapısını doğruladı. Bu denemeler notlara veya erişim politikasına değişiklik yapmadı.

## Geri dönüş ve kullanıcı güncellemesi

Geri dönüş konteynerleri: bilge-defter-accounts-rollback-v50 ve bilge-defter-invited-web-rollback-v50. İhtiyaç halinde önce güncel durum tekrar doğrulanmalı; yeni web/API durdurulmalı, isimleri korunarak ayrılmalı, bu iki v49 konteyneri eski adlarına getirilip önce API sonra web başlatılmalı ve invited/current v49/ui yoluna çevrilmelidir. Aynı canlı veritabanı korunur; yedek otomatik geri yüklenmez, yeni yazıları kaybetme riski ayrıca değerlendirilir.

Kullanıcı: Uygulamada güncellemeyi denetle, yeni paket hazır olmasını bekle; kayıt tamamlandıktan sonra tüm Bilge Defter sekme ve pencerelerini kapatıp aç. Üstte v50 görülmeli. Tarayıcı verilerini silme.
