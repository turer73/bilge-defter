# Eğitim çevirisi karşılaştırma paketi

## Güncel durum

25 Eylül 2026: Kullanıcı bu çeviri pilotu için Codex'e uzak model ölçümü istisnası
verdi. Aşağıdaki ilk hazırlık kaydı tarihsel durumu anlatır; gerçek yerel model
koşusunun sonuçları bu belgenin sonundaki **Gerçek model karşılaştırması** bölümündedir.
İstisna üretim entegrasyonu, ücretli API, model indirme veya canlı yayın izni değildir.

## İlk hazırlık aşamasının durumu ve kapsamı

25 Eylül 2026. Kullanıcının 3d-labx altyapısını değerlendirme onayıyla hazırlanan
**bağımsız yerel test tasarımıdır**. Uygulama/servis koduna entegrasyon, canlı yayın,
ücretli veya ücretsiz model çağrısı yapılmaz. 3d-labx deposu değiştirilmez.
Bu çalışma mevcut AGENTS rol ayrımının test tasarımı sınırında kalır; üretim
uygulamasına bağlama ve uzak model koşusu ayrı aşamalardır.

30 özgün **sentetik** kısa İngilizce eğitim metni ve taslak Türkçe referansı vardır.
Bunlar dış kaynaktan alınmış makaleler, uzman onaylı çeviriler veya klinik öneriler
değildir. Altı kategori, her birinde beş örnek: anatomi, terminoloji, sayılar/birimler,
olumsuzluk, belge yapısı, belirsizlik/güvenlik. Gerçek kaynaklı kabul seti ve uzman
incelemesi hâlâ gereklidir. Canlı sözlüğün 100 taslak kaydı doğru cevap anahtarı
sayılmaz; bu paketten sözlüğe veri yazılmaz.

## Hazırlanan dosyalar

- `work/translation-pilot/cases.json`: kaynak metinler, taslak referanslar,
  mekanik kontrol ipuçları ve insan inceleme konuları.
- `audit.cjs`: modelden bağımsız, ağ erişimi olmayan değerlendirme.
- `cli.cjs`: cevap anahtarını dışarı vermeyen istek paketi ve boş cevap şablonu;
  ayrı elde edilmiş model çıktılarının raporlanması.
- `audit.test.cjs`: kayıp paragraf, sayı/birim değişikliği, kısmi başarısızlık,
  yanlış terim, ters olumsuzluk, alıntı komutu ve yanıltıcı başarı senaryoları.

## Tekrarlanabilir yerel kullanım

Node 22 veya sonrası; harici paket gerekmez. Proje kökünde:

```powershell
node --test work/translation-pilot/audit.test.cjs
node work/translation-pilot/cli.cjs prepare outputs/translation-pilot/requests-v1
# Gerçek model koşusu bu komutlarla YAPILMAZ.
# Ayrı koşudan doldurulmuş ve kaynağı belirtilmiş cevap dosyası geldiğinde:
node work/translation-pilot/cli.cjs score responses.json outputs/translation-pilot/report-new.json
```

Çıktı dosyaları varsa üzerlerine yazılmaz; yeni klasör/dosya adı seçilir. CLI ağ
çağrısı yapamaz; API anahtarı okumaz. Testler yalnız işletim sistemi geçici alanına
kendi sentetik dosyalarını oluşturur. İçe alınan JSON en fazla 512 KiB olabilir.

İstek paketi Türkçe referans cevapları içermez. Yanıtta kaynak/prompt hash'i,
sağlayıcı, gerçek model kimliği ve koşu zamanı zorunludur. Her örneğin bütün
segmentleri aynı kimlik/sırayla dönmelidir. Başarısız kısım İngilizceyle doldurulup
başarılı gösterilmez. `not-run` şablonu çeviri yapılmış sayılmaz.

## Denetimin dürüst sınırı

- Sayılar tekrar sayısıyla karşılaştırılır; 0.5/0,5 ve 25%/%25 eşdeğer kabul edilir.
  Birim dönüşümü/yuvarlama yapılmaz. Sayıların yanlış nesneyle eşleşmesi, sayıların
  sözcükle yazılması ve karmaşık binlik ayraçları insan incelemesi gerektirir.
- İşaretli birim, kısaltma, oran, Latince etiket ve URL aynen korunur.
- Segment kaybı/sıra değişikliği, boş çıktı, kaynak metnin aynen dönmesi ve yeni
  HTML işaretlenir. Aynı segment içindeki cümle kaybı otomatik olarak ispatlanamaz.
- Terim ve olumsuzluk ipuçları sözcükseldir: doğru bir eş anlamlı uyarı üretebilir;
  yanlış anlamlı bir cümle bütün sözcükleri içerip uyarısız geçebilir. Testte bu
  sınır özellikle gösterilir. Eksik Latin karşılığı modelle uydurulmaz.
- `no-flags` = mekanik uyarı bulunmadı; doğru çeviri demek DEĞİLDİR.
- Her çıktının `humanReview` alanı pending, `semanticAccuracy` null,
  `publicationReady` false kalır. Bu araç uzman onayı vermez.
- İçe aktarılan sağlayıcı bilgisi bağımsız yürütme kanıtı değildir:
  `providerExecutionVerified` false. Sentetik denemeler `kind: fixture` olarak
  ayrılır; gerçek model başarısı veya maliyeti gibi sunulmaz.

## 3d-labx'ten yeniden kullanılacak tasarım

İncelenen GitHub ana dalı d14da3425d3180a585d6186dcb6c7134412461b2.
Sağlayıcı bağlantıları, parçalama ve önbellek yaklaşımı örnek alınabilir; haber
promptu ve otomatik yayın mantığı alınmaz. 3d-labx çeviri kodu bu pakete kopyalanmadı.

Üretim aşamasında gerekli düzeltmeler:

1. Çeviri ve açıklama/özet ayrı işlemler. Kaynaktaki bilgi genişletilmez.
2. Kaynak metin güvenilmeyen veri; model araç kullanamaz, bağlantı açamaz.
3. Sağlayıcı cevabı biçim ve tamamlanma denetiminden sonra kabul edilir.
   Bozuk/eksik cevapta güvenli hata, sınırlı yeniden deneme; sessiz ücretli geçiş yok.
4. Önbellek anahtarı kaynak hash'i, iki dil, model, prompt ve doğrulanmış sözlük
   sürümünü içerir. Kişisel içerik için kullanıcı/tenant sınırı gerekir; ortak
   kaynak önbelleğiyle karıştırılmaz. Anahtarlar yalnız sunucuda saklanır.
5. Kullanıcı başına ve toplam günlük token/istek bütçesi; kota bitince durdurma.
   Ücretsiz 3d-labx hesabı kotasının paylaşılacağı varsayılmaz.
6. Özgün metin, çeviri, kaynak adresi, kaynak kullanım izni durumu, model/sürüm,
   tarih ve inceleme sonucu birlikte tutulur. Kaynak bağlantısı tek başına yeniden
   yayın izni yerine geçmez; izin belirsizse tam metni otomatik yayımlama yok.

## Kabul kapısı (ilk hazırlıkta belirlenen hedefler)

Önce bu seti iki dilli alan inceleyicisi denetler; ardından kullanım izni belli
gerçek eğitim metinleri eklenir. Gerçek model koşuları aynı veri/prompt sürümünde,
aynı sınırlarla yapılmalı, süre/token/başarısızlık ve gerçek model kimliği tutulmalı.
İlk karşılaştırma 3d-labx yaklaşımı ile seçilmiş yerel model olabilir; hangisinin
kaliteli veya ücretsiz kotaya uygun olduğu henüz ölçülmüş değildir.

Başlangıç kabul önerisi: kritik anlam, olumsuzluk, sayı/birim veya kayıp içerik
hatası sıfır; alan uzmanının değerlendirdiği terim doğruluğu en az %95; bütün
örnekler incelenmiş. Bunlar hedef, elde edilmiş sonuç değildir. Küçük set genel
tıbbi doğruluğu kanıtlamaz. Başarılı olursa seçili paragraf için kullanıcı isteğiyle
çeviri taslağı gösterilir; notun üstüne yazılmaz ve kaynakla karşılaştırılabilir.

İlk hazırlık aşamasında gerçek sağlayıcı koşusu, maliyet doğrulaması, fiziksel cihaz
testi ve canlı entegrasyon tamamlanmamıştı. Güncel koşu kapsamı aşağıdadır.
Bu paket v54'ü güncellemez veya öğrenci verisine erişmez.

## İlk hazırlığın yerel doğrulama sonucu

- Node 24.13.0 ile 27/27 mekanik denetim testi geçti; ağ/model çağrısı sayısı 0.
- 30 örnek, toplam 36 segment; altı kategori dengeli. Bütün referanslar taslak.
- İlk koşuda iki test başarısızdı: mm harflerinin recommendation sözcüğü içinde
  de sayılması ve URL sonundaki cümle noktasının URL'ye katılması. Sözcük sınırı
  ve URL noktalama denetimleri düzeltildi, iki regresyon testi eklendi.
- Cevap anahtarsız istek paketi: `outputs/translation-pilot/requests-v1/requests.json`.
  Aynı klasördeki `response-template.json` henüz boş/not-run durumundadır.
- Veri SHA256: `3dd6376a4aa930895986e6750c7009eb62c405f957e818222796b4348f9f7bc0`.
- Prompt SHA256: `d46309ba1e40a64ac7f2492e636b48114e8204fc2866dfea54cf1b574cdb2fed`.
- `git diff --check` geçti. Önceki sözlük değişiklikleri korundu; bu aşamada
  uygulama, manifest, hesap, sunucu veya 3d-labx dosyası değiştirilmedi.
- Gerçek sağlayıcı kıyası yapılmadığından kazanan model, doğruluk yüzdesi veya
  maliyet sonucu yok. Uzak koşu mevcut depo kuralı gereği Claude oturumunda
  yürütülmeli veya kullanıcı bu çeviri işi için Codex'e açık istisna vermeli.

## Gerçek model karşılaştırması — 25 Eylül 2026

Kullanıcının bu pilot için verdiği açık istisnayla, Klipper'da zaten kurulu iki
yerel model üzerinde 30'ar örnek, toplam **60 gerçek çeviri isteği** çalıştırıldı.
Her model 30 örneğin 36 segmentini döndürdü. JSON biçiminin tamamlanması anlamın
doğru olduğu anlamına gelmez. Sonuç: **ikisi de otomatik yayın için uygun değil**.

| Model | Tam biçimli yanıt | Ortanca süre | P95 | Toplam koşu | Mekanik engel / inceleme / uyarısız |
|---|---:|---:|---:|---:|---:|
| qwen2.5:7b | 30/30 | 5,54 sn | 8,67 sn | 194,90 sn | 2 / 20 / 8 |
| qwen3.5:9b | 30/30 | 10,13 sn | 16,20 sn | 342,13 sn | 2 / 13 / 15 |

Bu tablo bir doğruluk sıralaması değildir; otomatik ipuçlarının yanlış alarm ve
gözden kaçırma sınırları yukarıda açıklanmıştır. Alan uzmanı incelemesi 0/60;
`semanticAccuracy: null`, `publicationReady: false` olarak bırakıldı.

### Kritik gözlemler

- 7B, kaynakta kemik olarak geçen femuru kas diye çevirdi; tendon/kas örneğinde
  okun hangi yapıyı gösterdiğini tersine çevirdi.
- 9B birçok örnekte daha okunaklıydı; ancak `term-02` örneğinde karşılaştırma ile
  birleştirmeme talimatını tersine çevirdi. `cor` Latince etiketini `kor` yaptı.
- 7B `number-04` örneğinde kesin mesafeyi olasılığa dönüştürdü; mekanik kontrol
  uyarısız geçti. Terim/sayı kontrolü tek başına yeterli değil.
- Ayrıntılı örnekler: `outputs/translation-pilot/real-20260925/REVIEW_FINDINGS.md`.
  Bütün kaynaklar ve iki modelin çıktıları yan yana:
  `outputs/translation-pilot/real-20260925/review/REVIEW.md`.
  Makineye okunur ölçümler aynı klasörde `comparison.json` dosyasında.

### Yürütme ve maliyet sınırları

- Ollama 0.32.3; her istekte temperature 0.1, seed 42, context 2048,
  çıktı üst sınırı 512 token, 4 CPU iş parçacığı; `format: json`.
  9B için `think: false`; 7B için bu desteklenmeyen alan gönderilmedi.
- Her iki modelde tüm koşu gözlemlerinde `size_vram: 0`; GPU hızlandırması bu
  koşuda gözlenmedi. Tekli kısa metin deneyi 50 eşzamanlı öğrenci yük testi değil.
- İlk yükleme dahil tek koşu ölçümleri; tekrarlar arası varyans ölçülmedi.
  7B giriş/çıkış 5274/1736, 9B 5394/1889 token. Model tokenizer'ları farklıdır.
- Yalnız özgün sentetik metinler gönderildi; öğrenci notları, sözlük kayıtları,
  özel belge veya API anahtarı model girdisine eklenmedi.
- Harici model API çağrısı ve ücreti **0**. Yerel elektrik maliyeti ölçülmedi.
  Cloudflare abonelik sorgusu 403 döndü; ücretsiz kullanım garanti edilemediği
  için Workers AI çağrısı yapılmadı. Gemini/DeepSeek de çağrılmadı.
  Dolayısıyla bu sonuç **3d-labx bulut sağlayıcılarına karşı kazanım** kanıtı değil.
- Yeni model indirilmedi. Servis yeniden başlatılmadı, ayar değiştirilmedi.
  Önce/sonra Ollama, linux-ai-server süreç kimlikleri/başlangıçları ve Bilge Defter
  web konteyner kimliği/başlangıcı aynı. Diğer bütün servislerin ayrı kabul testi
  yapıldığı iddia edilmiyor.
- Kaynak hash'leri, sabit istek hash'leri, model kimlikleri, ham yanıtlar ve
  raporlar karşılaştırılarak iç tutarlılık doğrulandı. Bağımsız tasdik değildir.

### Kod ve kayıtlar

- `work/translation-pilot/run-models.cjs`: sabit sentetik veri ve iki kurulu model
  için sınırlı SSH/Ollama çalıştırıcısı. RAM/yük koruması, süre/token sınırları,
  art arda hata durdurması, servis kimliği kontrolü ve çıktı kayıtları içerir.
  Model çıktısını komut olarak çalıştırmaz, ücretli sağlayıcıya geçmez.
- `run-models.test.cjs` ile önceki `audit.test.cjs` toplam **38/38 test geçti**.
  Bunlar kod testidir, çeviri doğruluğu oranı değildir.
- `review-results.cjs`: ağsız kayıt denetimi ve yan yana inceleme belgesi.
- Ham kayıtlar `outputs/translation-pilot/real-20260925/qwen25-7b` ve
  `qwen35-9b` klasörlerinde. `outputs` Git dışında; bunlar yerel kanıtlardır,
  GitHub'a yüklenmiş veya bağımsız yedeklenmiş sayılmaz.
- 7B model SHA256: `845dbda0ea48ed749caafd9e6037047aa19acfcfd82e704d7ca97d631a0b697e`.
- 9B model SHA256: `6488c96fa5faab64bb65cbd30d4289e20e6130ef535a93ef9a49f42eda893ea7`.
- Çalıştırıcı SHA256: `3db84f213d5c2e28ab3559bcca712b5354b9f233d5ce0b83fcae2ba5c3e1b068`.

Canlı uygulama, 3d-labx, hesaplar ve sözlük değiştirilmedi; commit/push/yayın yok.
Sonraki aday aşama uzman denetimli terim koruması, kaynakla yan yana taslak ve
insan onaylı incelemedir. Bu aşama uygulanmış değildir. Bulut kıyası, gerçek
kaynak kabul seti ve fiziksel cihaz/sınıf kabulü açık kalır.
