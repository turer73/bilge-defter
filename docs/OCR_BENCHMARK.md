# RapidOCR / Tesseract gerçek el yazısı kıyaslaması

Durum: NOT TESTED. Motor sıralaması ve gerçek el yazısı kalite kabulü yoktur.
Canlı Tesseract 5.5.0, Türkçe `tur`, PSM 6 kullanır. RapidOCR sürümü/modeli
henüz seçilmedi; üretime motor değişikliği yapılmaz.

İlk giriş: kişisel bilgi içermeyen 10-20 örnek ve doğrulanmış doğru metin.
Bu yalnız smoke kümesidir. Kabul kümesi için öneri en az 10 yazardan 100
örnek; ayarlama/kabul bölümleri yazar bazında ayrılır. Türkçe harfler, hızlı
yazı, terim/rakam, çok satır, düşük kontrast ve silgi sonrası yazı kapsanır.
Örnek sahibinin açık izni olmadan özel notlar alınmaz; üçüncü tarafa gönderilmez.

RapidOCR varsayılan dili Türkçe kabul edilmez. Türkçe karakterleri kapsayan
tanıyıcı, sözlük, model hash'i/lisansı, motor ve çalışma zamanı sabitlenir.
Kaynaklar: https://github.com/RapidAI/RapidOCR ve
https://tesseract-ocr.github.io/tessdoc/ImproveQuality.html . Model/API
ayrıntıları uygulama öncesi sabit sürüm dokümanıyla tekrar doğrulanır.

## Ölçüm sözleşmesi

İki motor aynı örnek dosyaları ve ön işleme ile, aynı donanımda çalıştırılır.
Soğuk başlangıç ayrı; sıcak gecikme en az 3 tekrar, CPU/RAM ve thread sınırı
raporlanır. Model kurma/indirme süresi çıkarılıp gizlenmez. Yanlış/eksik/boş
sonuçlar ölçümden atılmaz. Motor sürümü ve model dosya hash'leri raporda olur.

`tools/ocr_benchmark.py` iki motorun kaydedilmiş çıktısını değerlendirir;
motorları indirmez/çalıştırmaz ve veri göndermez. İlk araç kapsamı CER/WER,
yazar alt grubu ve gecikme hesabıdır; motor çalıştırma, bellek ölçümü, kritik
terim/rakam ve insan düzeltme süresi ayrıca toplanır. Araç testi OCR kalitesi değildir.

Yerel özel dosya örneği (JSON; `private-data/` Git dışında):

```json
{"samples":[{"id":"s01","writer":"w01","split":"acceptance","consent":true,"reference":"İnsan vücudu"}]}
```

Her motorun çıktısı:

```json
{"engine":"tesseract","version":"5.5.0","model_hash":"GERCEK_SHA256","predictions":[{"id":"s01","text":"İnsan vücudu","latency_ms":120}]}
```

```powershell
python tools/ocr_benchmark.py private-data/samples.json private-data/tesseract.json private-data/rapidocr.json --out private-data/comparison.json
```

Araç eksik/fazla/tekrarlı örneği, izinsiz girdiyi ve yazar bölümü sızıntısını
reddeder. NFC/boşluk normalizasyonu iki tarafa aynıdır; Türkçe harfler ve
büyük/küçük harf hataları silinmez. CER/WER 1'den büyük olabilir.

## Açık kabul kararı

Öneri, henüz kullanıcı tarafından onaylanmış kalite eşiği değildir:
CER <= %10, WER <= %20 ve düzeltme süresinde yeniden yazmaya göre >= %30
kazanç. Kritik terim/rakam hataları ayrıca insan tarafından incelenir.
Ortalama sonuç tek başına zayıf bir yazar/cihaz grubunu gizleyemez.
İki motor da eşiği geçmezse özellik deneysel kalır; özgün mürekkep korunur,
sonuç otomatik doğru kabul edilmez. Model seçimi ve gerçek kabul açık kalır.
