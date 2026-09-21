# Bilge Defter — Derin İnceleme Raporu

21 Eylül 2026. `D:\Projelerim\bilge-defter` klasöründeki v27 paketinin tam kod incelemesi.
611 satır index.html, 4 workspace JS, SW/PWA, 20 verify script, deploy/nginx
konfigürasyonları ve tüm sürüm raporları okundu. Paket bütünlüğü doğrulandı
(SHA256 218/218 OK).

## Durum özeti

v27 (takvim/çalışma planı). Mimari sağlam: atomik kayıt, sekme çakışması koruması,
sürümlü yedek (1–7), savunmacı deploy script'leri, SHA256 doğrulamalı PWA önbelleği.
Yerel kopya yayın paketiyle birebir eşleşiyor. Aşağıdakiler gerçek bulgulardır.

## Yanlış / hatalı

1. **Basınç verisi ölü kod** — index.html:312 basıncı (`e.pressure`) noktaya yazıyor
   ama index.html:296 drawStroke sabit `s.width` çiziyor. Veri toplanıp hiç
   kullanılmıyor; basınçlı fırça yok.
2. **iOS Safari indirme riski (hedef cihaz iPad!)** — index.html:539 exportNotebook
   dinamik `<a>` elementini DOM'a eklemeden `a.click()` çağırıyor. iPad Safari'de bu
   desen `download` özniteliğini güvenilmez yapar. PDF indirme anchor'ı DOM'da
   (sorun yok) ama JSON yedek anchor'ı değil. Düzeltme: `document.body.append(a);
   a.click(); a.remove()`.
3. **Üretimde "Test" adı** — index.html:11 `<title>Bilge Defter Test</title>` +
   manifest.webmanifest:2 `"name":"Bilge Defter Test"`. Davetli üretim adresinde
   (defter.bilgearena.com) ana ekran uygulaması "Bilge Defter Test" olarak kuruluyor.
4. **EXIF yönelimi işlenmiyor** — media-workspace.js:135-137 telefon JPEG'i doğrudan
   `drawImage` ile tuvale alıyor. Kod tabanında EXIF işleme yalnız PDF.js vendor'ında
   var. Modern tarayıcılar çoğunlukla uygular ama iPad Safari davranışı fiziksel
   doğrulama istiyor; `createImageBitmap(..., {imageOrientation:'from-image'})` ile
   garanti altına alınmalı.
5. **sw.js VERSION sabiti elle** — sw.js:2 `VERSION='v27'`. Her sürümde iki yerde
   (sw.js + offline-assets.json) elle bump gerekiyor. Fail-safe (yanlışsa eski paket
   kalır) ama unutulursa "yeni sürüm hazır" akışı sessizce bozulur.
6. **Planner açılışta hep bugüne döner** — planner-workspace.js:35 her açılışta
   `plannerTodayDate()`. Kullanıcının son baktığı ay/gün kayboluyor.
7. **PDF okları PDF olmayan sayfaya gidebilir** — pdf-workspace.js:108 navigatePdf
   hedefin PDF sayfası olduğunu kontrol etmiyor. PDF defterine normal sayfa
   eklerseniz oklar onu açar ama etiket "PDF n/N" kalır.
8. **iOS'ta storage.persist desteklenmiyor** — pwa.js "Kalıcı depolama izni var"
   mesajı iOS'ta asla çıkmaz; 7 gün kullanılmazsa eviction riski kullanıcıya
   platforma özel söylenmiyor.
9. **Performans: tüm defter her kayıtta serileşiyor** — dbPut bütün state'i JSON'a
   çeviriyor; çizimde 500ms'de bir checkpoint. 24MB görsel sınırına yakın
   defterlerde iPad'de takılma riski (planlarda "uzun ders performansı" açık iş
   olarak zaten var).
10. **no-store + 213 dosya** — invited-nginx.conf:9 her yanıta `private, no-store`.
    v22 cache olayının bilinçli sonucu ama her SW güncelleme denetimi tüm paketi
    yeniden indirir.

## Eksik (belgelenmiş açık işler)

- **Sıradaki dilim:** haftalık tekrarlanan dersler + haftalık plan görünümü
  (V27 raporu zaten belirlemiş)
- Bildirimler (Notification API) — planner'da "yoktur" diye yazıyor
- Hesap/eşitleme/bağımsız yedekleme
- AI, Türkçe/tıbbi sözlük, el yazısı tanıma
- Özgün PDF/vektör saklama (şu an 1000px raster), notlu PDF'te aranabilir metin
- Pinch-zoom (yalnız düğme zoom var), basınçlı fırça
- Planner PDF dışa aktarma
- **Kritik:** fiziksel tablet kabulü (iPad kalem, Android, uzun ders) — 27 sürümdür
  hâlâ bekliyor; tüm testler otomatik tarayıcı testi

## Eklenmesi gereken öneriler (öncelik sırası)

1. iPad kabulü için #2 (indirme), #4 (EXIF) ve #8'i düzelt — hedef cihazda kırılır
2. Üretim manifest adını ayır ("Bilge Defter" / build parametresi)
3. v28 diliminde: haftalık tekrar + hafta görünümü + bildirim altyapısı birlikte
   tasarla
4. Basınç verisini kullan ya da kaldır; kullanılacaksa v28'e basınçlı fırça
5. navigatePdf hedef kontrolü, planner son tarihi hatırlama (küçük, hızlı kazanç)
6. Yerel metin arama (yazılan metin + sayfa adları) — el yazısı tanımadan bağımsız
   yapılabilir
