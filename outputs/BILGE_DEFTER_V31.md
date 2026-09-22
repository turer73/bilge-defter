# Bilge Defter v31 — planlayıcı hatırlatma (uygulama açıkken) ve izin akışı

21 Eylül 2026. Takvim diliminin üçüncü bölümü: kayıt bazlı hatırlatma. Dürüst sınır
açıkça belgelenir: uygulama kapalıyken bildirim gönderilmez; sunucu/push bağlantısı
yoktur; iOS sistem bildirimini desteklemediği için uygulama içi hatırlatma kullanılır.

## Kullanım

- Formda "Hatırlatma" işareti yalnız saat girildiğinde açılır. Saat yoksa kutu kapalıdır.
- Kayıt saati geldiğinde (90 saniyelik pencere) uygulama içi hatırlatma balonu çıkar;
  cihaz sistem bildirimini destekliyor ve izin verildiyse sistem bildirimi de gösterilir.
  Bildirim kayıt kimliği + gün etiketi taşır; aynı dakikada tekrar gönderilmez.
- Tekrarlanan kayıtlarda her görünüm ayrı hatırlatır; tamamlanan veya atlanan gün
  hatırlatmaz.
- Takvim penceresinde izin durumu satırı vardır: açık / izin iste / reddedildi /
  desteklenmiyor. "Bildirim izni ver" yalnız izin istenebilir durumda görünür.

## Dürüst sınırlar

- Zamanlayıcı yalnız uygulama açıkken çalışır; uygulama kapatılırsa veya sekme
  askıya alınırsa hatırlatma gönderilmez. Sunucu bildirimi (Push) ve arka plan
  eşitlemesi yoktur; bu, hesap/eşitleme dilimine kadar açık iş olarak kalır.
- iOS Safari sistem bildirimini desteklemez (PWA push altyapısı yok); bu cihazlarda
  yalnız uygulama içi balon gösterilir. Android/Chrome izin verildiğinde sistem
  bildirimi kullanır.
- Hatırlatma zamanı cihazın yerel saatinden hesaplanır; sunucu saati kullanılmaz.

## Kayıt ve yedek güvenliği

- `remind` alanı booleandır ve isteğe bağlıdır; tekrar ve gün durumlarıyla birlikte
  yedeğe dahildir. Şema sürümü değişmedi (veri 6 / yedek 8): eski uygulamalar alanı
  zararsız korur, yeni veriyi reddetmez. `remind: 'true'` gibi bozuk biçim fail-closed
  reddedilir.

## Doğrulama

- 20 uygulama paketi, 228 kontrol: genel 24 (güvensiz LAN origin), kayıt güvenliği 7,
  yedek önizleme 8, temizleme kurtarma 7, çöp kutusu 9, defterler 8, kâğıt/silgi 7,
  sonsuz kaydırma 5, medya 13, medya yerleşim 15, medya döndürme 15, ilk yerleşim 13,
  PDF 13, PDF yakınlaştırma 8, PDF dışa aktarma 10, planlayıcı 20, planlayıcı tekrar 17,
  planlayıcı hatırlatma 11, PWA 8, görünüm 8. Ayrıca güncelleme zinciri ve statik
  denetim fixture'ları geçti.
- Hatırlatma paketi: izin durumları (açık/izin/red/desteklenmiyor), saat şartı, 90 s
  pencere, tekrar engeli, gün etiketi, done/skip sırasında sessizlik, gelecek/saatsiz/
  kapalı kayıtlarda sessizlik, form kalıcılığı, yedek gidiş-dönüşü, fail-closed alan
  doğrulaması sınandı.
- Canlı özel HTTPS: release.json v31, rozet v31; planner-workspace.js hatırlatma ve
  izin kodunu içeriyor. Davetli adreste Cloudflare Access kapısı ayakta.
- Fiziksel iPad/Android kabulü ve kullanıcının kurulu uygulama geçişi bekliyor.
  Gerçek cihazda bildirim izni ve balon davranışı ayrıca kabul edilmelidir.

## Yayın

Her iki ayrı adreste aynı 216 dosyalık v31 çevrim dışı paket var:

- https://defter.bilgearena.com/
- https://klipper-2.tail1ade8e.ts.net:8443/

Release dizinleri: `/opt/bilge-defter-test/releases/20260921-v31-reminders` ve
`/opt/bilge-defter-invited/releases/20260921-v31-reminders`.

Yeni konteynerler: private `b27ee221c0d538aa0838edc711977621d90524c72387015d6789f0dac7beb9fb`,
davetli `51f772353775a6eedd22ef313da4d88d141bdbda5033d50fb18a629c0f8c2135`.
Önceki çalışan konteynerler `rollback-before-v31` adıyla durdurulmuş halde saklandı.

SHA256SUMS özeti: `49272e9b139326a08e7e211cd2899a41f1484fac5ed33940295c755ca7f4e1e1`.

Yayın öncesi önceki dizin, dosya özeti, konteyner kimliği ve imaj doğrulandı; sunulan
dosyalar paketle karşılaştırıldı; diğer konteyner kimlikleri değişmedi. Bilge Arena,
DNS, Access/cache ve Tailscale ayarlarına dokunulmadı.

Güncelleme için Kurulum ve çevrim dışı ekranından Güncellemeyi yükle ile tek tıkla
geçin. Başlıkta v31 görünmeli.

## Sonraki dilim

Sunucu bağlantılı bildirim (Push) ancak hesap/eşitleme dilimiyle anlamlı olur.
Önerilen sıra: hesap + cihazlar arası eşitleme, ardından push bildirimi.
