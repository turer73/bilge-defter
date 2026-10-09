# v78 medya seçimi çizim düzeltmesi

## Kapsam ve önceden belirlenmiş kabul planı

9 Ekim 2026; CLAIM #102456. Başlangıç `897a424d0d8249572ede087ee3f8426588fe9cb4`.
Kullanıcının tamamlama isteği kapsamında ürün düzeltmesi ve doğrulama yürütülür.
Canlı yayın, fiziksel iPad/Pencil kabulü ve motor mekanizmasının kanıtı ayrı kalır.

Önceki kapanış adayı aynı kaynaklarla Linux'ta başarısız/başarılı/başarısız
sonuçlandı. Tek başarılı koşu kabul değildir. Önceki deney betikleri, raporları
ve özgün kabul testinin eşikleri değiştirilmeyecek.

## Yeni aday

- Medya seçimi açıkken yalnız aktif sayfa, mevcut doğrudan çizim yolunda kalır.
  Sürükleme sonunda ve geri almada, henüz geçici yerleşimde yeni karolar üretilmez.
- Kapanış önce light-DOM yerleşimini ve onu sahiplenen V2 host sınıfını eşler,
  ardından mevcut `resize()` yolu son ölçüde çizer. Ölçü değişmediyse tek çizim yapılır.
- Not değişikliği, undo geçmişi ve kayıt hemen gerçekleşir; ertelenmez.
  RAF, zamanlayıcı, piksel okuması, CPU/GPU ipucu veya ek bellek bütçesi yoktur.
- Komşu sayfalar ve medya seçimi dışındaki sıcak karo kullanımı korunur.

Bedel: seçim açıkken aktif sayfanın ek yeniden çizimleri çizgileri yeniden işler.
Sürükleme zaten doğrudan çiziyordu. Bu değişiklik seçili ama hareketsiz durumdaki
redraw maliyetini artırabilir; gerçek iPad gecikmesi ölçülmeden hız iddiası yapılmaz.

## Kabul kapıları

1. Yerel yaşam döngüsü: commit/undo/kayıt eşzamanlı, komşu içerik korunuyor,
   kapanış son geometride, sonrasında sıcak çizim sıfır geometri tekrarı.
2. Özgün `work/verify-slide-flow.cjs` değişmeden kalır; DPR2 tam 54 vaka.
3. Üç bağımsız Linux işi: sabit sıra **AB, BA, AB**. A yukarıdaki commit'ten
   yeniden üretilen başlangıç; B aynı yeni aday. Her hücre ayrı Node süreci
   ve tarayıcı bağlamları kullanır. Rastgele yeniden deneme yapılmaz.
4. Üç B hücresi de 54/54, sıfır kaynak kayması ve normal çıkış vermeli.
   A'da yalnız bilinen WebKit medya-undo kalite hatasına izin verilir;
   diğer hata kabulü geçersiz kılar. A'ların hiçbiri bilinen hatayı
   üretmezse adayın etkisi ayrıştırılamamıştır; tekrarlarla yeşil aranmaz.
5. Mevcut geniş `synthetic-checks` işi bütünüyle geçmeli: DPR1, historical,
   kayıt/kurtarma/eşitleme, PPTX, sunucu/worker ve yayın aracı kontrolleri.

Her paket için tam dosya kümesi ve SHA256 değerleri çalışmadan önce/sonra
karşılaştırılır; gerçekten sunulan `report.source` haritasıyla eşlenir.
54 benzersiz motor/vaka, exit kodu, runner kimliği ve tüm başarısızlıklar korunur.
Görseller, parity JSON, ham izler ve loglar `outputs/media-cache-fix/` ile
özgün `outputs/slide-flow/` altında tutulur. Kanıtı root üretir; inceleyici
salt okunur doğrular. Sonuçlar ölçüm tamamlanınca aşağıya eklenecektir.

Eski hash-pinli tanılama adımları yalnız eski manifestte çalışır. Adayın
zorunlu testleri başarısızsa iş yine başarısızdır; tanılama betiklerini eski
pinlere uydurmak veya bunları kalite kapısının yerine koymak yoktur.

## Yerel ön eleme

İlk aday Windows'ta 54/54 geçti. Bağımsız inceleme sonrasında #2357 bulundu:
seçili sayfa için dar görünürlük filtresi, yüksek basınçlı kalemin ekran sınırına
uzanan ucunu atabiliyordu. Yalnız aktif seçim satırı tam çizilecek şekilde
düzeltildi ve ayrı basınç-kenarı regresyonu eklendi. Arada başlatılan tarihsel
regresyon kaynak revizyonu için durduruldu; sonuç **geçti** sayılmaz.

Son ürün kaynaklarıyla özgün tam DPR2 testi Windows Chromium + WebKit'te
**54/54**, drift yok. Saf ölçüm sözleşmesi kontrolleri **18/18**.
Son yaşam döngüsü kontrolleri **10/10**: basınçlı kenar, gerçek taşıma/undo,
açık panelde kayıt, son yerleşimde tek çizim ve üç belge modunda iptal/ekleme.
Kanıt: `outputs/media-cache-fix/lifecycle-20261009195039219/results.json`.
Bu sonuçlar Linux veya fiziksel iPad kabulünün yerine geçmez.

Son paket manifest SHA256:
`915df1b7afdc14f91ba3937a591ab764def3a0ce1118691dd4fb78fb0f9d2862`.
Yerel kanıt: `outputs/slide-flow/dpr-2-media-cache-local-final/report.json`.
