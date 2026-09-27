# Güvenilir kullanım — ilk paket

27 Eylül 2026. Taban: `e07d52b`, `repair/v57-stability`. İlk yerel kanıtlar aşağıda tarihsel olarak korunmuştur. Kullanıcının yayın onayıyla aday **v65** olarak sürümlendi; güncel yayın ve doğrulama durumu [RELEASE_V65](RELEASE_V65.md) kaydındadır. Mevcut canlı v64 dosyaları üzerine yazılmaz; web ve hesap servisi birlikte doğrulanır.

## Hazırlanan değişiklikler

- Açılıştaki geri dönüş kopyası kontrolü bitmeden editör hazır ilan edilmiyor. Aynı kayıt durumu metni yeniden yazılmıyor; gereksiz MutationObserver/araç çubuğu yenilemesi azaltılıyor. Mevcut kaydırma eşiği gevşetilmedi.
- Hesap API'sinde, yetkilendirme sonrasında `If-None-Match` → `304`. Güncel revizyon tablosu olan yedekte aynı etiket için ciphertext sütunu okunmaz. Eski yedeklerde mevcut hash etiketiyle uyumluluk korunur. POST CAS kuralları, kullanıcı ayrımı, kota ve veri şeması değişmez.
- İstemci şifreli yanıtı yalnız oturumda tutar; 304'ü sadece bilinen aynı güçlü ETag ve `cas-v1` ile kabul eder. Eski API 200 döndürürse çalışmaya devam eder. Hesap kilitlenince önbellek/parola temizlenir.
- Boşta denetim 5 saniyelik zamanlayıcı üzerinde 60 saniyeye kadar geri çekilir (+ en çok 1 saniye dağıtım, zamanlayıcı yuvarlaması ayrıca vardır). Yeni yerel düzenleme sonraki denetimi yaklaştırır. Çizim/gizli pencere korumaları korunur. Görünür pencereye dönüş ayrıca denetim tetikler.
- Kayıt revizyonu değişmediyse aynı JSON'un SHA256'sını tekrar üretmez. Bu bütün defteri yazma maliyetini ortadan kaldırmaz. Sayfa/blob deposuna geçiş yapılmadı.
- Şifreleme öncesi UTF-8 baytı + 16 bayt AES-GCM etiketi 5 MiB ile karşılaştırılır. Fazla boyutta açıklayıcı yerel uyarı; aynı düzenleme için otomatik tekrar engellenir. Notlar/JSON yedeği etkilenmez. Boyut hesaplama büyük defterde yine maliyetlidir; ana veri mimarisi sonraki ölçüme bağlıdır.
- Açılışta bozuk kaydı silerek başlatma kaldırıldı. Salt-okunur `app` ve varsa `before-import` kurtarma dosyası + yeniden deneme. Kurtarma dosyası not içerebilir; normal içe aktarma dosyası değildir. Depolama tamamen erişilemiyorsa kurtarma garanti edilmez, hiçbir kayıt silinmez.
- Kalem/vurgulayıcı renk ve kalınlığı, silgi boyutu ve avuç tercihi IndexedDB hesap adıyla bölümlenmiş yerel tercihte tutulur. Seçili araç kalıcı değildir; uygulama kalemle açılır. Depolama izni yoksa tercih yazımı sessizce atlanır; not kaydı sistemi değiştirilmez.
- “Dosya ve yedek → Kayıt ve eşitleme”: mevcut yedek/eşitleme kontrolleri içe aktarma önizlemesinden bağımsız açılır. Bağımsız JSON yedeği ve isteğe bağlı yerel performans raporu burada.
- Ölçüm varsayılan kapalı; son 200 tam yeniden çizim/kayıt girişimi süresi ve kalem başlangıç/iptal sayıları. Koordinat, metin, görsel, hesap, URL, token, parola veya ağ gönderimi yok. Kayıt süresi başarısız girişimleri de içerebilir; bu gerçek kalem-ekran gecikmesi veya FPS ölçümü değildir. Sekme kapanınca biter, kullanıcı isterse JSON indirir.
- Araştırma, sıralı plan ve kabul kapıları güncellendi. `.github/workflows/reliability.yml`: yerel hazırlanmış asgari ayrı API ve iki tarayıcı güvenilirlik testi; yayın/secrets/self-hosted runner yok. GitHub'da henüz çalışmadı. Tarihsel tam regresyonun yerine geçmez.

## Doğrulama

- `npm run test:reliability`: Chromium + WebKit, 26 sentetik kontrol geçti. Gerçek yerel HTTP 304; yanlış ETag, eski sunucu, eşitleme geri çekilmesi, çizim sırasında istek yok, çatışma engeli, UTF-8 büyük yedek, silmeyen kurtarma, 390 px görünüm, tercihler, geciktirilmiş açılış ve gerçek dosya menüsü.
- `python -m pytest tests -q` (`server-candidate/v49`): 78 test geçti. Yetki/hesap ayrımı, eski kayıt, koşullu okuma, CAS yarışları, sözlük, OCR kaynak sınırları dahil; gerçek el yazısı doğruluğu testi değildir.
- Son `npm test` koşusu exit 0: mevcut 19 regresyon paketinin tamamı ve ardından yeni 26 güvenilirlik kontrolü geçti. Kalem/avuç, kaydırma, büyük defter kaydı, PDF, kütüphane, sözlük, giriş ve gerçek yerel service-worker güncellemesi dahil.
- WebKit durum ve kurtarma görselleri incelendi. Fiziksel iPad/Pencil ve sınıf kabulü **yapılmadı**.
- Yerel kanıt: `outputs/reliability-1/results.json`, aynı dizindeki ekranlar/sentetik raporlar; başarılı son koşu `outputs/reliability-regression-final.log` ve `outputs/v64/` regresyon çıktıları. Bunlar gerçek kullanıcı notu değildir.
- Kaynak paketindeki 239 SHA256 satırı dosyalarla eşleşti. SHA256SUMS özeti `d0299c70d405c2ae47e909d77980ec174b3b4b73f41c6edb5da4252b732887fb`; bu yerel adayın özeti, yayımlanmış v64'ün özeti değildir. `git diff --check` başarılı.

## Başarısız denemeler / sınırlar

- İlk tarayıcı testinin başlangıç betiği boş sekmede localStorage'a erişmeye çalıştı; yalnız test origin'inde çalışacak şekilde düzeltildi.
- WebKit ağ taklidi 304 yanıtı oluşturmayı desteklemedi; API testi gerçek yerel HTTP sunucusuna taşındı. Üretim bağlantısı kullanılmadı.
- İkinci tam koşu WebKit kaydırmada iki arayüz yenilemesi yakaladı. İzleme kaydı `saveEl` MutationObserver'ını gösterdi; açılışın son asenkron kontrolü sırasında `ready` erkenden açılıyordu. Açılış sırası ve aynı durum metnine gereksiz yazım düzeltildi. Kaydırma testi iki motorda art arda üç kez geçti; geciktirilmiş açılış için ayrıca negatif test eklendi. Başarısız koşu `outputs/reliability-regression.log` içinde korunuyor.
- Eski harici apply-patch çalıştırıcı yolu mevcut değildi; normal apply_patch aracıyla metin düzeltildi.
- Çalışma ağacı değişiklikleri kullanıcı onaylı ilk pakettir. Paylaşılan sunucu, canlı web/hesap/kütüphane, DNS, Access, öğrenci verisi, eski kirli PDF çalışma ağacı değiştirilmedi.

## Yayın öncesi kalanlar

1. Yerel diff bağımsız gözden geçirme, yeni sürüm numarası ve byte/hash doğrulaması.
2. Yetkili yayın kararı sonrası web + hesap adayının kontrollü kurulumu; koşullu GET'nin gerçek reverse proxy boyunca testi. Sunucu önce/istemci sonra güvenlidir; eski istemciyle API uyumludur. Geri dönüş eski API'de tam GET'ye döner.
3. Veri şeması değişmese de mevcut bağımsız yedek ve hesap konteyneri geri dönüşü doğrulanmalı. v64 web-only yayın betiği bu backend değişikliğine yeterli değildir.
4. Dilara ile 40 dakika fiziksel iPad testi; ardından 3–5 öğrenci. Başarılı sentetik testler 48+2 sınıf kabulü sayılmaz.
5. GitHub'a göndermeden önce Actions ücretsiz kota/harcama ayarı kontrol edilmeli. Workflow tanımı yereldir; bu tur GitHub işi veya ücretli hesaplama başlatılmadı.

Araştırma: [UX ve performans incelemesi](UX_PERFORMANCE_RESEARCH_2026-09-27.md). Kabul: [ACCEPTANCE](ACCEPTANCE.md).
