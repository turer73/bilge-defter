# Bilge Defter v30 — haftalık tekrar ve haftalık görünüm

21 Eylül 2026. Takvim diliminin ikinci bölümü: haftalık tekrarlanan dersler ve
haftalık plan görünümü. Bildirim, eşitleme ve AI bu sürümde yoktur.

## Kullanım

Araçlar → Çalışma Planı → Takvim / çalışma planı.

- Formda "Haftalık tekrar" işaretlenir ve "her N hafta" girilir (1–52). Tekrar,
  seçilen tarihten başlar; aynı güne N haftada bir düşer. Form, seçilen tarihin
  gün adını gösterir.
- Takvimde tekrarın her görünümü ayrı bir kayıttır: "Tamamlandı" yalnız o günü
  işaretler, diğer günler etkilenmez. "Bu günü atla" tek görünümü pas geçer;
  "Atlamayı kaldır" geri alır.
- Düzenle seriyi günceller (başlık, saat, süre, N, defter, not). "Seriyi sil"
  tüm seriyi Silinenler'e taşır; geri getirme tekrarı ve gün durumlarını korur.
- Tekrar kaldırılırsa kayıt tek seferlik olur ve gün durumları silinir.
- Haftalık görünüm düğmesi yedi gün sütununu gösterir: gün başlığı, tamamlanan/toplam,
  planlanan dakika ve ilk kayıtlar. Sütuna dokunmak o günü seçer; ‹ › hafta hafta
  gezinir. Aylık görünüm düğmesi geri döner.

## Kapsam ve sınırlar

- 1900–2100 tarihleri; N = 1–52 hafta; kayıt başına en fazla 500 gün durumu;
  aktif + silinen plan toplamı 1000.
- Gün durumları (tamamlandı/atlandı) yalnız o güne aittir; silinen güne ait kayıt
  saklanır ama gösterilmez. Tekrar kuralı seri düzenlemesiyle değişir; geçmiş gün
  durumları eşleşen yeni günlerde geçerli olur.
- Haftalık görünüm ayrı bir veri üretmez; aylık görünümle aynı kayıtları gösterir.
- Bildirim yoktur; tekrar yalnız uygulama açıldığında hesaplanır.

## Kayıt ve yedek güvenliği

- İlk tekrar kaydı veri sürümü 6, planlayıcı sürümü 2 ve JSON yedek biçimi 8 yapar.
  Tekrar içermeyen defterler sürüm 5 / yedek 7 olarak kalır; geri dönüş veri kaybı
  olmadan mümkündür. Tekrar kaldırılırsa sürüm otomatik 5'e döner.
- v29 ve öncesi uygulamalar sürüm 6 / yedek 8 verisini fail-closed reddeder; sessiz
  veri kaybı yoktur. Eski yedekler (1–7) v30'da okunmaya devam eder.
- Yedek yükleme defter, Çöp Kutusu ve takvimi birlikte değiştirir; yükleme öncesi
  kurtarma kopyası tekrarları ve gün durumlarını içerir.

## Düzeltilen kusurlar

- build-invited.cjs release.json'u hash'lerden sonra yazıyordu; her sürüm bump'ında
  offline paket önceki release.json'un baytlarını onaylıyor ve SW kurulumu bütünlük
  kontrolünde sessizce düşüyordu. Sıra düzeltildi (release.json önce yazılır).
- plannerOccurrenceDone tekrar olmayan kayıtlarda item.done yerine yalnız gün
  durumuna baktığından gün özeti "0 tamamlandı" gösteriyordu; düzeltildi.
- Gün listesi saat, eşitlikte isim sırasına göre yeniden sıralanır (v27 davranışı).

## Doğrulama

- 19 uygulama paketi, 217 kontrol: genel 24 (güvensiz LAN origin), kayıt güvenliği 7,
  yedek önizleme 8, temizleme kurtarma 7, çöp kutusu 9, defterler 8, kâğıt/silgi 7,
  sonsuz kaydırma 5, medya 13, medya yerleşim 15, medya döndürme 15, ilk yerleşim 13,
  PDF 13, PDF yakınlaştırma 8, PDF dışa aktarma 10, planlayıcı 20, planlayıcı tekrar 17,
  PWA 8, görünüm 8. Ayrıca güncelleme zinciri ve statik denetim fixture'ları geçti.
- Tekrar paketi: sıra/sayaç, gün bazlı tamamlanma, atlama, atlamayı kaldırma, N değişimi,
  tekrar kaldırma, seri silme/geri getirme, haftalık görünüm tarihleri ve gezinme,
  bozuk tekrar/sayaç/şema reddi (pozitif kontroller dahil), DST geçişi, yedek 8 gidiş-dönüş.
- Canlı özel HTTPS: release.json v30, rozet v30, appVersion v30, sw.js v30, offline-assets
  v30 ve BOM'suz doğrulandı; planner-workspace.js tekrar işlevini içeriyor. Davetli adreste
  Cloudflare Access kapısı ayakta; girişli içerik denetimi kullanıcı kabulüne bırakıldı.
- Fiziksel iPad/Android kabulü ve kullanıcının kurulu uygulama geçişi bekliyor.

## Yayın

Her iki ayrı adreste aynı 216 dosyalık v30 çevrim dışı paket var:

- https://defter.bilgearena.com/
- https://klipper-2.tail1ade8e.ts.net:8443/

Release dizinleri: `/opt/bilge-defter-test/releases/20260921-v30-repeat-week` ve
`/opt/bilge-defter-invited/releases/20260921-v30-repeat-week`.

Yeni konteynerler: private `655b3b95db151b9b14f912595ec78bccc1fad90d65abec68d17e21dfc4576c09`,
davetli `d9f2ab4eabd53d7fb7253ce7e7ce93d859e652b73e52a2b3215be43e0dc36d71`.
Önceki çalışan konteynerler `rollback-before-v30` adıyla durdurulmuş halde saklandı.

SHA256SUMS özeti: `4de1800d0bdbd671961fb3e1895560c423d0f05d0a3e5acaf8bcc9967a30d92f`.

Yayın öncesi önceki dizin, dosya özeti, konteyner kimliği ve imaj doğrulandı; sunulan
dosyalar paketle karşılaştırıldı; diğer konteyner kimlikleri değişmedi. Nginx yapılandırması
`private, no-store, no-transform` olarak devam ediyor. Bilge Arena, DNS, Access/cache ve
Tailscale ayarlarına dokunulmadı.

Güncelleme için kayıt tamamlandı bilgisini bekleyin, JSON yedeği alın; Kurulum ve çevrim dışı
ekranından Güncellemeyi yükle ile tek tıkla geçin. Başlıkta v30 görünmeli.

## Sonraki dilim

Bildirim altyapısı ve tekrarın üçüncü bölümü (ör. iki haftada bir yerine belirli aralık
dışı desenler) veya hesap/eşitleme dilimi. Öncelik kullanıcı kabulüne göre belirlenir.
