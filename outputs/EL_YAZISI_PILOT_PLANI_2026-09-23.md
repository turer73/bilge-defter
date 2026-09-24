# Bilge Defter — el yazısı pilotu ve güvenli başlangıç

Tarih: 23 Eylül 2026. Durum: inceleme ve uygulama şartnamesi hazır; kod uygulaması, sağlayıcı hesabı, gerçek örnek ölçümü ve yayın yapılmadı.

## Kapsam ve yetki

- Yerel taban: `D:/Projelerim/bilge-defter`, HEAD `90b6841`, uygulama v46 ve önceden var olan kaydedilmemiş V2 arayüz değişiklikleri.
- Bu belge önceki kullanıcı metnini talimat olarak değil, doğrulanacak öneri olarak ele alır. Ana planın yerine geçmez; ilk iş paketini tanımlar.
- Üst AGENTS.md kaynak değişikliklerini Claude'a, bağımsız incelemeyi Codex'e ayırıyor. Burada kaynak veya dağıtım dosyası değiştirilmedi. Codex'in uygulama yapması için bu projeye özgü açık rol istisnası gerekiyor; yönerge kendiliğinden değiştirilmez.
- Ücretli hesap açmak, faturalandırmayı etkinleştirmek, gerçek notu üçüncü tarafa göndermek ve canlı yayın bu hazırlığın kapsamında değil.

## Öneri değerlendirmesi

| Aday | Doğrulanan kapsam | Pilot kararı |
|---|---|---|
| MyScript | Resmî SDK dil listesinde Türkçe; REST çizgi tanıma ve alternatif sonuçlar sunuyor. | Mevcut web düzenleyicisini değiştirmeden seçili çizgi tanıma için ilk aday. Seçilecek güncel Cloud API sürümü ve hesap dil yetkisi ayrıca doğrulanacak. |
| Google ML Kit Digital Ink | `tr-TR`; Android/iOS üzerinde cihazda tanıma. Model edinimi gerekiyor. | PWA'ya doğrudan JS eklentisi değil; ileride yerel mobil katman için aday. Mevcut PWA tüm cihazlarda korunur. |
| Cloud Vision | Türkçe OCR ve görüntüde el yazısı için DOCUMENT_TEXT_DETECTION. | İzinli aynı örneklerin görüntüleriyle karşılaştırma. Kullanıcı onayı ve maliyet sınırı olmadan çağrı yok. |
| PaddleOCR PP-OCRv5 | Latin modelinin dil listesinde Türkçe. | Klipper üzerinde yerel görüntü OCR alternatifi; donanım uygunluğu ve el yazısı başarısı ölçülmedi. |
| Tesseract | Resmî belge basılı metin odaklı olduğunu ve el yazısı sınırını açıkça belirtiyor. | Türkçe el yazısı kalitesi için varsayılan kazanan sayılmayacak; mevcut çalışan motor ayrıca doğrulanırsa karşılaştırma tabanı olur. |

Kaynaklar: [MyScript dilleri](https://developer.myscript.com/doc/interactive-ink/4.2/overview/text-languages/), [REST mimarisi — 3.1, sürüme özgü](https://developer.myscript.com/doc/interactive-ink/3.1/web/rest/architecture/), [ML Kit](https://developers.google.com/ml-kit/vision/digital-ink-recognition), [ML Kit modeller](https://developers.google.com/ml-kit/vision/digital-ink-recognition/base-models), [Cloud Vision el yazısı](https://docs.cloud.google.com/vision/docs/handwriting), [Vision dilleri](https://docs.cloud.google.com/vision/docs/languages), [PaddleOCR](https://www.paddleocr.ai/main/en/version3.x/algorithm/PP-OCRv5/PP-OCRv5_multi_languages.html), [Tesseract FAQ](https://tesseract-ocr.github.io/tessdoc/FAQ.html#can-i-use-tesseract-for-handwriting-recognition).

MyScript fiyat sayfası 2.000 ücretsiz istek, sonrasında teklif/kontrat ve kota sonunda ret bildiriyor. Bunu sınırsız kullanım veya doğrulanmış aylık bütçe kabul etmiyoruz; hesaba uygulanacak güncel koşullar pilot açılmadan kontrol edilmeli. İstemci kütüphanesinin açık kaynak lisansı, hizmeti ücretsiz yapmaz. [Fiyat](https://developer.myscript.com/pricing), [istemci deposu](https://github.com/MyScript/iinkTS).

## Mevcut koda özgü eksikler

1. `index.html:392` noktaları `x,y,p` olarak kaydediyor; zaman ve kalıcı çizgi kimliği yok. Dizi sırası korunuyor. Eski zamanlar geri kazanılamaz. MyScript 3.1 REST belgesinde `t` ve `p` isteğe bağlı: eski notlar için zaman uydurmadan alan atlanabilir; bu durum seçilen güncel API'de ayrıca test edilir.
2. `ocr-workspace.js:13` silgiyi yok sayıyor. Görüntü yolunda çizgiler, silgi dahil işlem sırasıyla ayrı şeffaf mürekkep katmanında birleştirilmeli, ardından beyaz zemine oturtulmalı. Silgi PDF/fotoğraf zeminini silmemeli.
3. `ocr-workspace.js:17` sabit 2x ölçek + 2000 px kesme kullanıyor. Seçim sınırı, fırça genişliği ve pay birlikte hesaplanmalı; okunaklılık için bölme gerektiğinde kullanıcı bilgilendirilmeli. Sessiz kırpma yasak.
4. Çizgi tabanlı tanımada silinen parçaları olduğu gibi göndermek yasak. İlk pilotta silgiyle kesişen seçim için güvenli görüntü yolu önerilebilir; başka bulut sağlayıcısına geçiş yeniden açık onay gerektirir. Sonraki dilimde görünür çizgi parçaları işlem sırası korunarak ayrılabilir.
5. Mevcut pencere açılır açılmaz istek gönderiyor. Yeni akış önce seçim önizlemesi ve veri alıcısını gösterir; yalnız Tanı düğmesi istek başlatır.
6. Eşitleme ve PDF kayıt hataları önceki incelemede sentetik testle üretildi. Bu turda giderilmiş sayılmıyor. Gerçek notlu pilot bunlar kapanmadan başlamaz.

## Uygulama sırası ve çıkış koşulları

### A — veri güvenliği ve arayüz (pilot önkoşulu)

- Bekleyen eşitleme revizyonunu notla atomik ve kalıcı sakla; yeniden açılışta kaybetme.
- Gönderim sadece aldığı revizyonu onaylasın. Tek eşitleme işlemi kilidi, sunucu sürüm koşulu ve çakışmada iki kopyayı koruma tasarla.
- PDF zoom arayüzü güvenli mevcut işlevi kullansın; geçersiz kayıt diske yazılmasın, sağlam son kopya korunsun.
- V2 metin/kamera/PDF/düzenleme/sayfa seçme/kurtarma bağlantılarını düzelt; doğrudan gizli DOM düğmelerine bağımlılığı azalt.
- Kabul: önceki incelemenin üç veri senaryosu ve bütün V2 komutları hatasız. Yayın paketi temiz kaynaktan yeniden üretilebilir. Değişiklikler ve inceleme kanıtları aynı sürümle ilişkilendirilir.

### B — dış hizmetsiz tanıma hazırlığı

- Alan seçimi: belge koordinatlarında dikdörtgen/paragraf; ekran zoom/pan/döndürmeden bağımsız.
- Akış: Seç → Önizle → Tanı → Karşılaştır/düzelt → Metin olarak ekle → Bitti.
- Orijinal el yazısı korunur; sonuç mevcut ilk yerleşim akışında taslaktır. Vazgeç notu değiştirmez; Bitti tek geri alma adımı üretir.
- İstek bağlamı: sayfa kimliği, seçim kimliği, içerik revizyonu ve istek kimliği. Sayfa değişince veya seçim düzenlenince eski sonuç kendiliğinden eklenmez. Kapatma ve yeni istek eskisini iptal eder.
- Yeni çizgiler için belge genelinde tutarlı sıra ve oturumlar arası tanımlı zaman temeli tasarla; ham performance.now değerleri yeniden açılışta geriye gitmesin. Eski kayıt/yedeklerle uyumluluğu sınamadan şemayı değiştirme.
- Ortak ara biçim sağlayıcıdan bağımsız olsun. Dil, belge koordinat birimi, çizgi sırası, zamanın var/yok oluşu açık olsun. Sağlayıcı dil kodu/istek biçimi ayrı bağdaştırıcıda tutulur.
- Kabul: ağ kapalıyken seçim, doğru görüntü ve taklit sonuç akışı çalışır; dış servise sıfır istek. Gerçek tanıma başarısı iddiası yok.

### C — sınırlı MyScript pilotu

- Tüm çizim motorunu iinkTS ile yeniden yazma; sunucudan REST bağdaştırıcısı ilk seçenek. Anahtarlar JS, PWA önbelleği, Git, test çıktısı veya JSON yedeğine girmez.
- Kimliği doğrulanmış mevcut kullanıcı üzerinden yetki; istek/süre/boyut/nokta sayısı sınırı, hız sınırı, zaman aşımı ve toplam maliyet tavanı. Adres ve sağlayıcı kullanıcı girdisinden keyfî URL olamaz.
- Varsayılan kapalı özellik bayrağı. Sağlayıcı hazır değilse tanıma kapalı ve açıklayıcı; normal çizim/kayıt etkilenmez.
- Gönderilecek seçili içerik, sağlayıcı ve internet gereksinimi işlem öncesi görünür. Şifreli yedek, tanıma sağlayıcısının içerik görmediği anlamına gelmez. Ham not ve tanınan metin normal sunucu günlüklerine yazılmaz.
- Kota, hata ve iptalde otomatik başka sağlayıcıya gönderme/ücretli yeniden deneme yok. Çift tıklama aynı isteği çoğaltmaz.
- Hesap/anahtar/koşullar güvenli yönetim üzerinden sağlanır; sohbet içine anahtar istenmez. Bulut aktarımı ve maliyet yetkisi alınmadan C başlamaz.

### D — karşılaştırma ve karar

- 20–30 izinli, kişisel veri içermeyen gerçek el yazısı örneği; en az birkaç farklı yazar ve cihaz. Küçük pilot tüm kullanıcılar için başarı kanıtı değildir.
- Her örnekte aynı görünür içerik: MyScript çizgileri ile diğer motorlara verilen görüntü eşleşsin. Basılı PDF, taranmış PDF ve uygulama içi mürekkep sonuçları ayrı gruplansın.
- Referans metin kullanıcı tarafından doğrulanır. Türkçe karakterler korunur; normalleştirme kuralları sabitlenir.
- Ölç: karakter/kelime hata oranı, kritik terim ve rakam hataları, düzeltme süresi, elle yeniden yazma süresi, medyan/p95 yanıt süresi, başarısız istek oranı, örnek başına maliyet ve kullanıcı tercihi.
- Eşikler sonuçları görmeden kararlaştırılır. Sentetik çizgiler altyapı testidir; Türkçe doğruluk ölçümü değildir. Sağlayıcı güven puanları ortak ölçekmiş gibi karşılaştırılmaz.
- OCR çıktısına sözlük veya AI ile sessiz otomatik tıbbi düzeltme uygulanmaz; öneriler kullanıcının onayına sunulur.

## Şu anki tamamlanma durumu

- Sağlayıcı belgeleri incelendi; zaman verisi, silgi, kırpma ve gizlilik eksikleri belirlendi.
- Uygulama sırası ve ayrı kabul testleri belgelendi.
- Motor entegrasyonu, gerçek tanıma çağrısı, yeni anahtar edinimi, ücretli işlem, mobil SDK kurulumu ve yayın: yapılmadı.
- İlk uygulanacak dilim A; ardından B. Kaynak uygulaması rol kararı bekliyor.
