# Bilge Defter v50 — görsel ve kod denetimi

23 Eylül 2026. **Yerel adaydır; canlıya yayınlanmadı.** Kullanıcının dört tablet ekran görüntüsü esas alındı. Gerçek notlar, hesaplar, Cloudflare kuralları ve çalışan servisler değiştirilmedi. Ücretli hizmet veya yeni OCR sağlayıcısı eklenmedi.

## Sonuç

**169 / 169 otomatik kontrol geçti.** 228 çevrim dışı varlığın özeti eşleşti; uygulamaya ait 18 JavaScript/HTML içi betik sözdizimi kontrolünden geçti. Python bağımlılıklarında tutarsızlık bulunmadı (`pip check`). Bu son kontrol güvenlik açığı veritabanı taraması değildir.

| Denetim | Geçen | Kanıt |
| --- | ---: | --- |
| Sunucu: kimlik, yetki, kapasite, yedek sürüm koşulu, izin eşitleme, OCR sınırları | 72 | `v50/backend.log` |
| Tablet yerleşimi, odak, OCR, metin/görsel, sözlük, PDF, kullanıcı metni güvenliği | 31 | `v50/tablet.log` |
| Veri koruma, kayıt hataları, eşitleme çakışmaları, PWA | 29 | `v50/safety.log` |
| Gerçek yerel API ile hesap izolasyonu/onay/askı/çıkış | 13 | `v50/accounts.log` |
| Elle öğrenci ekleme, tekrar kayıt, yönetici yetkisi, liste indirme | 8 | `v50/roster.log` |
| Altı tema, eski tercih aktarımı, dar ekran, klavye, arayüz geri dönüşü | 10 | `v50/ui-theme.log` |
| Gerçek service worker ile v49 → v50 geçişi | 6 | `v50/update-chain.log` |

Toplamlar aynı testin tekrar koşulmasını ikinci kez saymaz. Ana kayıt: `v50/audit-results.json`. Yeniden çalıştırma: proje kökünden `node work/audit-v50.cjs`.

## Kullanıcının bildirdiği sorunlar

1. **Defterler penceresi:** İçerik boyunda açılır; yeterli alan yoksa gövdesi kayar, kapatma ve yazmaya dönme düğmeleri erişilebilir kalır. Dokunmayla açılan başlıkta mavi odak çerçevesi gizlenir. Klavye ile gezinirken odak işareti korunur.
2. **Ayarlar düğmesi:** 701–1399 CSS piksel aralığında gezinme ve kalem araçları ayrı satırlarda. Düğmenin sağ kenarına gerçekten tıklanabildiği ve doğru pencerenin açıldığı test edildi. 1400 ve üzeri genişlikte ortak satır korunur; dar telefon düzeni altta araçlarla devam eder.
3. **Takvim çakışması:** Tarih kontrolüne belirli bir esnek genişlik, yerel tarih/saat alanlarına taşma sınırı verildi. Dar ekranda düzenleme alanları tek sütun. Tarih/düğme dikdörtgenleri kesişmiyor; ders kaydı yeniden açılışta korunuyor.
4. **Hatalı el yazısı tanıma:** Tüm uzun sayfayı küçültmek yerine yukarıdan aşağıya otomatik ayrılmış yazı bölümleri seçilebiliyor. Yalnız tanıma kopyası siyah-beyaz/koyu hazırlanıyor. Kalem basıncı ve silgi sırası korunuyor; fosforlu bantlar dışarıda. Asıl çizimler değişmiyor. Bölüm değişince eski sonuç iptal oluyor. Gönderim yalnız açık kullanıcı eylemiyle mevcut sunucuya yapılıyor.

**OCR kalite sınırı açık:** Bölümleme, arada büyük dikey boşluk bulunan yazıları ayırır; serbest dikdörtgen/lasso seçimi değildir. Aynı satırdaki sütunları otomatik ayırmaz. Çok uzun tek bölüm hâlâ küçülebilir ve arayüz bunu söyler. Tesseract motoru değiştirilmedi. Ekrandaki anatomi notunun doğru tanındığı iddia edilmiyor; gerçek Türkçe el yazısı başarı oranı ölçülmedi.

Tesseract'ın kendi açıklaması motorun basılı metne odaklandığını ve el yazısında iyi sonuç beklenmemesi gerektiğini belirtir: [resmî SSS](https://tesseract-ocr.github.io/tessdoc/FAQ.html#can-i-use-tesseract-for-handwriting-recognition). Kontrast/ölçekleme ve bölümleme yönü: [resmî görüntü hazırlama rehberi](https://tesseract-ocr.github.io/tessdoc/ImproveQuality.html).

## Denetimde bulunan ek kusurlar

### Yerel adayda düzeltildi

- **OCR kaynak tüketimi:** Önceden 2 MB dosya sınırı vardı ama piksel boyutu ve eşzamanlı işlem sınırı yoktu. PNG başlığı/CRC, geçerli base64, en fazla 2000 × 2000 piksel, işçi başına iki tanıma, 30 saniye süre, tek OCR CPU iş parçacığı ve 10.000 karakter yanıt sınırı eklendi. Kapasite doluysa 429; hata/zaman aşımında işlem yuvası geri bırakılır. Bu, mevcut tek işçili dağıtıma göre sınırdır; çok işçili dağıtımda toplam çarpılır.
- **Yanlış gizlilik/çevrim dışı beyanı:** Tanıtımdaki “%100 çevrim dışı” ve “tüm notlar yalnız cihazda” ifadeleri gerçek hesap/eşitleme/tanıma davranışıyla uyumlu hale getirildi. Sınıf sürümünde yeni açılış internetle doğrulama ister. Açık oturumda yerel kayıt sürer.
- **Takvim açıklaması:** Planın defter yedeğine ve şifreli eşitleme kopyasına dahil olduğu; hatırlatmanın yalnız uygulama açıkken çalıştığı açıklandı.
- **Sözlükte geciken sonuç:** Sorgu temizlendiğinde veya pencere kapandığında eski yanıt gösterilmiyor. Sözlük istekleri hesap bağlı yol üzerinden, süre sınırıyla gider. Bulunamayan sunucu hizmeti, tam sözlükmiş gibi sunulmuyor; cihazdaki sınırlı alt küme açıkça belirtiliyor.
- **Testlerin yanlış sürümü doğrulama riski:** Bazı eski testler v46/v48/v49 klasörlerine sabitlenmişti. Yeni denetim çalıştırıcısı güncel v50 hedefini zorunlu seçer; geçmiş ekran görüntülerinin üzerine yazmaz. Eski testlerde yalnız paket/sürüm/çıktı yolları uyarlanır, kontroller zayıflatılmaz.

### Açık zorunlu işler / yayın öncesi sınırlar

1. **El yazısı kalitesi:** Türkçe ders notlarından izinli bir örnek seti, doğru metin karşılığı ve hata ölçümü gerekir. Kontrast testi, tanıma doğruluğu testi değildir. Motor seçimi bu ölçüme dayanmalı; mevcut özelliğin “deneysel” uyarısı korunmalı.
2. **Tam sözlük hizmeti:** Ayrı sınıf sunucusunda `/dictionaries` ve arama yolları yok. Yerel alt küme çalışıyor; tam TDK araması bu turda kurulmadı. Ortak sunucuya yetkisiz geçiş açılmadı. Kaynak/lisans ve güvenli servis entegrasyonu ayrı iş kalemi.
3. **Kaynakların Git kaydı:** `server-candidate/` ve `work/bilge-defter-test/ui-v2/` halen izlenmeyen dosyalar içeriyor. Mevcut karışık çalışma ağacı korunmuştur. Yeni sürüm bir değişiklik paketi/commit ile kaydedilmeli, temiz klondan üretim doğrulanmalı. Commit/push yapılmadı.
4. **Gerçek kabul:** Fiziksel tablette Safari, avuç içi/kalem, yerel tarih kontrolü ve kurulu PWA güncellemesi bu turda test edilmedi. Chromium testlerini Safari kabulü diye sunmuyoruz.
5. **Sınıf işletimi:** Gerçek öğrenciye e-posta teslimi, gerçek yönetici onayı/izin yayılımı, iki gerçek cihaz ve 50 kişinin eşzamanlı kullanım testi yapılmadı. Bağımsız otomatik sunucu yedeği/saklama/geri dönüş işletimi bu turda kurulmadı.

## Görsel kanıt

Test boyutları: 375×812, 768×1024, 820×1180, 1024×768, 1180×820, 1440×900. Altı tema ayrıca denetlendi; 320/390 genişlikler eski güncel-hedefli tema regresyonunda kapsandı.

- `v50/toolbar-1180.png`: Ayarlar ve kalem araçları ayrı satır, kırpılma yok.
- `v50/library-820.png`: İçeriğe göre boyutlanan defter penceresi.
- `v50/planner-overview.png`: Tarih ve yeni ders düğmesi çakışmıyor.
- `v50/toolbar-375.png`: Dar ekranda görünür menüler ve altta yazı araçları.
- `v50/ocr-region.png`: Koyu bölüm önizlemesi; sentetik çizgi, el yazısı başarı kanıtı değildir.
- `v50/pdf-export.png`: Gerçek PDF motoruyla sentetik içeriğin içe/dışa aktarılması.

Görseller tarayıcıdan üretilip incelendi. Kullanıcının tabletindeki kurulu profil değiştirilmedi.

## Teknik teslim ve geri dönüş sınırı

- İstemci aday: `work/bilge-defter-invited-v50`.
- Sunucu aday kaynağı: mevcut `server-candidate/v49` dizini içinde yeni v50 sağlık sürümü ve OCR korumaları. Dizin adının v49 olması canlıdaki v49'un değiştirildiği anlamına gelmez.
- Paket SHA256SUMS özeti: `6f76ccc48d888acb5aa096d983f1c76b0304e521b188bbabc4c97c68e4dd63e6`.
- Veri biçimi ve hesap veritabanı adı değiştirilmedi. JSON, yerel not ve şifreli yedek göçü yok.
- Yerel v49 → v50 güncelleme: bozuk paket reddi, ikinci pencerede taslak varken bekleme ve sağlam kayıt korunması geçti. Çevrim dışı motor testi ayrı sentetik profil içindir; sınıf hesabının internetsiz yeni açılışını doğrulamaz.
- Normal dosya düzenleme aracı Windows sandbox hatası verdi; aynı `apply_patch` mekanizması izinli komut yoluyla uygulandı. İlk testlerde gizli düğme/çift seçici ve eksik sentetik silgi rengi düzeltildi. İlk yerleşim denetimi pencerenin hâlâ gereksiz büyüdüğünü buldu; flex gövde düzeltmesinden sonra son paket geçti.
- Canlı yayın, DNS, Cloudflare izni, anahtar, Bilge Arena veya ortak sunucu değişikliği yapılmadı. Yayın için ayrı v50 kurulum/geri dönüş ve fiziksel cihaz kabulü gerekir.

Bu rapor güncel uygulamanın kritik akışlarına yönelik kod incelemesi ve otomatik/görsel denetimdir; tüm üçüncü taraf kaynakların satır satır incelemesi, sızma testi veya sınıf kullanım garantisi değildir.
