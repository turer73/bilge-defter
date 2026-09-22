# Bilge Defter v27 — takvim ve elle çalışma planı

21 Eylül 2026. Plandaki takvim/elle çalışma diliminin ilk kullanılabilir bölümü tamamlandı. AI, eşitleme, bildirim ve tekrarlanan ders bu sürümde yoktur.

## Kullanım

Araçlar → Çalışma Planı → Takvim / çalışma planı.

- Aylık takvimden gün seçin veya Güne git alanını kullanın. Bugün ve önceki/sonraki ay düğmeleri var.
- + Ders / çalışma ile başlık, tür, tarih, isteğe bağlı saat, planlanan süre, ilgili defter ve not girin. Kaydet ile tamamlayın.
- Bir gündeki kayıtlar saate göre sıralanır; gün toplamı planlanan dakika ve tamamlandı sayısını gösterir. Bu süre gerçek çalışma takibi değildir.
- Tamamlandı/Tamamlanmadı yap, Düzenle ve Deftere git desteklenir. Tarih düzenlemesi aynı kaydı başka güne taşır.
- Sil, kaydı takvimin Silinenler bölümüne taşır. Geri getir kimliği ve içeriği korur. Kalıcı sil ayrıca onay ister ve yedek yoksa geri alınamaz.
- Kaydetmeden kapanırken uyarı çıkar. Kaydedilmemiş form taslağı diskte tutulmaz; cihaz kapanmasına karşı taslak kurtarma iddiası yoktur.

Kapsam: 1900–2100 tarihleri, tek seferlik ders/çalışma kayıtları, 5–720 dakika arasında beş dakikalık süre adımları. Aktif ve silinenler birlikte en fazla 1000 kayıt. Takvim kayıtları cihazın yerel takvim tarihini kullanır; sunucu saatine veya UTC gününe çevrilmez. Silinmiş deftere ait bağlantı kayıt içeriğini silmez; o deftere geçiş kullanılamaz.

## Kayıt ve yedek güvenliği

Takvim yalnız bu tarayıcı/uygulama adresinde saklanır. İlk plan kaydı veri sürümü 5, JSON yedek biçimi 7 yapar. Takvimi açıp kapatmak tek başına veriyi dönüştürmez. Eski veriler ve yedekler okunur; v26 ve öncesi takvimli yeni veriyi okuyamaz. Eski uygulamanın planları sessizce düşürmesi önlenmiştir.

Aktif planlar ve silinen planlar normal JSON yedeğine dahildir. Yedek yükleme defterler, Çöp Kutusu ve takvimi birlikte değiştirir; birleştirme değildir. Takvimsiz eski yedek mevcut planları kaldırır. Bu durum önizlemede açıkça belirtilir. Yükleme öncesi kurtarma kopyası takvimi de içerir.

Mevcut atomik kayıt/sekme çakışması mekanizması kullanıldı. Disk hatasında önceki disk kaydı korunur; ekrandaki planlar yeniden kaydedilebilir veya yedeklenebilir. Başka sekmenin yeni kaydı eski sekmeden ezilemez. Hata ve yeniden deneme takvim içinde de görünür.

## Doğrulama

- 200 yerel kontrol: önceki 180 regresyon ve 20 takvim kontrolü geçti.
- Eski test sunucularının sabit izin listelerine yeni planner-workspace.js eklendi; yeni Çalışma Planı menü grubu beklentiye alındı. Etkilenen testler yeniden çalıştırılıp geçti.
- Canlı özel HTTPS: takvim 20, ilk yerleşim 13, PWA 6, kayıt güvenliği 7, yedek önizleme 8 = 54 kontrol.
- Davetli adreste yeni dosya dahil 16 erişim kapısı kontrolü geçti. E-posta gönderilmedi; izinli kullanıcı oturumu otomatik araçla açılmadı.
- Artık yıl, ay geçişi, negatif/pozitif saat dilimleri ve yaz saati geçiş tarihlerinde gün kaymaması; oluşturma, sıralama, tamamlanma, düzenleme, silme/geri getirme, kalıcı sil onayı, gerçek indirilen JSON yedeği, eski yedek uyarısı ve kurtarma, bozuk veri, kayıt sınırı, çevrim dışı kullanım, kayıt hatası, başka sekmeyle çakışma ve döndürülmüş metinle şema korunması sınandı.
- Tarayıcı doğrulama becerisinin yönlendirmesiyle 390 px takvim/form ve masaüstü görünümleri incelendi. Takvim düğmeleri en az 44 px yüksekliğe çıkarıldı.
- PDF becerisinin yönlendirmesiyle mevcut çıktı regresyonları, pypdf strict ve Poppler görsel denetimi geçti. Takvim PDF dışa aktarma bu sürümde yoktur.
- Gerçek fiziksel tablet/ekran klavyesi ve kullanıcının kurulu v27 kabulü ayrıca bekliyor. Yerel otomatik testler tüm cihazlarda kabul kanıtı değildir.

## Yayın

Her iki ayrı adreste aynı 213 dosyalık v27 çevrim dışı paket var:

- https://defter.bilgearena.com/
- https://klipper-2.tail1ade8e.ts.net:8443/

Release dizinleri: `/opt/bilge-defter-test/releases/20260921-v27-planner` ve `/opt/bilge-defter-invited/releases/20260921-v27-planner`.

Private konteyner: `e6f3946b469255cbfed8e5592a2ba7d3652fc5e98c54dafc227188d10a90148c`.

Davetli konteyner: `811674bb8b8d5630a315a327d2f1e40efaad6184e6620b1d548467959517d9e3`.

SHA256SUMS özeti: `edb0c091284726a1669bc0139f2f1e09c79eb0c00519c3764f572dec538836ed`.

Her yayın öncesi v26 dizini, dosya özeti, çalışan konteyner kimliği ve imajı doğrulandı. Yeni takvim dosyası yalnız Defter'in statik dosya izin listesine eklendi. Sunulan dosyalar paketle karşılaştırıldı. Diğer çalışan konteyner kimlikleri değişmedi; Bilge Arena, DNS, Access/cache ve Tailscale ayarlarına dokunulmadı.

Önceki v26 dizinleri ve rollback-before-v27 konteynerleri tutuldu. Sunucu dosyaları geri alınabilir; takvimli sürüm 5 istemci verisi v26 ile uyumlu değildir. Planlar oluşturulduktan sonra sorun halinde sürüm 5 okuyabilen düzeltme gerekir. Not veya planları silerek geri dönüş yapılmamalıdır.

Güncelleme hazır olduğunda kaydı tamamlayın, yedek alın, tüm Defter sekme/uygulama pencerelerini kapatıp yeniden açın. Başlıkta v27 görünmeli; tarayıcı verilerini silmeyin.

## Sonraki dilim

Haftalık tekrarlanan dersler ve haftalık plan görünümü. Tekrar düzenleme/silme kapsamı ve tek güne ait tamamlanma kayıtları ayrıca tasarlanıp doğrulanmalı. Bildirim, eşitleme ve AI daha sonraki kapsamdır.
