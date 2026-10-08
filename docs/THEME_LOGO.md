# Temaya bağlı uygulama logosu

7 Ekim 2026 yerel aday. Canlı yayın değildir.

## Görünüm sözleşmesi

Uygulama içindeki logo **üst çerçeve temasının** rengini (`--bd-frame`) kullanır.
Buton temasının ayrı ana rengi veya fosforlu kalem rengi esas alınmaz. Ayarlar
panelindeki Orman, Gece, Grafit, Mürdüm, Kum ve özel çerçeve rengi değişiklikleri
logoya aynı anda yansır; bunun için ikinci bir tercih veya depolama anahtarı yoktur.

Logo şekli mevcut `icons/brand-mono-v51.png` dosyasının alfa maskesidir. Masaüstü
ve tablette yazılı logo, dar ekranda defter simgesi gösterilir. Dar ekran ve
karşılama paneli maskesi, özgün 2172×724 dosyada (74,80,540,540) alanını gösterir;
yanındaki B harfi kırpmaya girmez. PNG dosyaları yeniden üretilmez veya değiştirilmez.

Logo renginin açık veya koyu temada kaybolmaması için yüzey rengi mevcut
`BilgeButtonTheme.autoInk` işleviyle siyah/beyaz olarak seçilir. Bu yalnız logo
zeminini etkiler; çerçeve, butonlar, kâğıt, mürekkep ve kayıtlı notlar değişmez.
Normal görünümde logonun tam renkli iç pikselleri ile yüzeyi en az 4,5:1
kontrastlıdır; antialias kenar pikselleri bu iddiaya dahil değildir.

`mask-image` ve WebKit karşılığı birlikte kullanılır. Maske desteklenmezse özgün
görsel açık zeminde gösterilir. Zorlanmış sistem renklerinde de aynı orijinal
görsel kullanılır; logo kartı açık zemini korur, kontrol ve butonların sistem
renklerine müdahale edilmez. Başlıkta yalnız görünen logo `role=img` ile
"Bilge Defter" adını taşır; iç fallback görsel dekoratiftir. Karşılama panelindeki
simge, yanındaki uygulama adı nedeniyle dekoratiftir.

Ana ekran/PWA simgesi, giriş sayfası ve tarayıcı favicon'u bu değişikliğin
kapsamında değildir. Yeni CDN, ikon dosyası veya bağımlılık eklenmez.

## Doğrulama

Hedefli otomasyon: `node work/verify-theme-logo.cjs`.
İzole Chromium/WebKit profilleri ve sentetik hesap kullanılır; gerçek hesap ve
notlar okunmaz. Kanıtlar `outputs/theme-logo/` altındadır.

Sonuç: **15/15 geçti** (Chromium 8, WebKit 7); kaynak ve test dosyası hash'leri
raporla eşleşti, kaynak sapması yok. Beş hazır tema, özel açık/koyu renkler,
yeniden açılış, gerçek logo pikselleri, 390/820/1180 yerleşimleri, karşılama
logosu ve Chromium zorlanmış renk geri dönüşü kontrol edildi. Maske desteği
olmayan eski tarayıcıda gerçek cihaz testi yapılmadı; o yol kaynakta incelendi.

İlk 14/15 sonucu `initial-input-report.json` olarak korundu. WebKit renk girdisi
testi, seçim tamamlanmadan ölçüyordu; gerçek odak kaybı ile seçim tamamlandıktan
sonra geçti. Uygulama bu test hatası için değiştirilmedi. Ayrı kök smoke denemesi
de buton/diyalogla eşleşen genel seçici nedeniyle yarıda kaldı; son hedefli süit
buton seçicisini kullanır. Bağımsız Mürdüm masaüstü/mobil ekran kontrolü geçti.

Önceki fosforlu/ikon süiti 18/18 ve tablet regresyon çalıştırıcısı tekrar geçti.
243 çevrimdışı dosya hash'i doğrulandı; önizlemeden alınan UI betiği yerel kaynakla
eşleşti. Mevcut sürüm etiketi v77 olarak kaldı; yeni canlı sürüm iddiası yoktur.

Önizleme: http://127.0.0.1:8780/?preview=notebook

Açık kullanıcı sekmesi otomatik yenilenmez; kayıt tamamlandıktan sonra yenilenir.
Bu yerel görsel çalışma fiziksel iPad kabulü, commit, push veya yayın değildir.
Önceki `SLIDE_FLOW.md` Retina kalite sınırı değişmeden kalır.
