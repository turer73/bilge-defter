# PowerPoint içe aktarma adayı

4 Ekim 2026. **Yerel geliştirme adayı; canlı v72'ye yayımlanmadı.**

5 Ekim devamı: v73 birleşik yayın adayı [RELEASE_V73.md](RELEASE_V73.md).
Aşağıdaki Stirling/UNO gözlemleri tarihsel kabul ölçümleridir. Yeni aday aynı
LibreOffice bağımlılığını ayrı, ağsız ve Unix socket üzerinden erişilen süreç
işçisiyle kullanır; kalıcı UNO/Java süreci veya 40 saniyelik geri dönüş yoktur.
Yayın durumu yalnız v73 live-proof ve origin doğrulamasıyla kesinleşir.

## Kapsam

- Ekle > PowerPoint aç > `.pptx` seç > dosya gönderimine onay ver > dönüştür.
- Dönüşümden sonra slayt önizlemesini kontrol et; Yeni deftere ekle.
- Slaytlar mevcut PDF zemini olarak saklanır. Kalem, fosforlu, silgi, görsel,
  yerel kayıt, JSON yedeği ve notlu PDF çıktısı mevcut motoru kullanır.
- Kaynak sunum değiştirilmez. İlk seçim ve önizleme mevcut defteri değiştirmez.
- En fazla 20 MiB / 50 slayt. Dönüştürülen PDF de 20 MiB ile sınırlı.
- v72'nin 96 MiB yerel görsel bütçesi ve 5 MiB şifreli eşitleme sınırı değişmez.
- Eski `.ppt` desteklenmez: PowerPoint'ten PDF dışa aktarılır ve cihazda açılır.
  `.pptm`, makro, dışarıdan yüklenen resim/belge, ActiveX ve OLE nesneleri reddedilir.
  Slayt ve konuşmacı notu metnindeki sıradan HTTP(S) kaynak bağlantıları dar
  doğrulamayla kabul edilir; özgün sunumun baytları/atıfları değiştirilmez.
- Yerel grafiklerin `ppt/embeddings/*.xlsx` veri paketleri desteklenir: uzantı
  yeterli değildir; grafiğe bağlı ilişki, içerik türü, workbook/worksheet yapısı
  ve gömülü paketin tamamı doğrulanır. İç içe paketleme ve gömülü DOCX desteklenmez.
  PPTX ile içindeki XLSX'ler aynı dosya sayısı, açılmış bayt ve XML bütçesini paylaşır.
- Animasyon, video ve konuşmacı notları aktarılmaz. Slaytlar sabit görüntüdür.
  Notlardaki atıflar özgün sunumda kalır; slayt PDF'i konuşmacı notlarını içermez.
  Paylaşılacak bir PDF için kaynak/lisans atıfları ayrıca korunmalıdır.
  Yazı tipi/yerleşim sadakati gerçek dönüştürücüyle ayrıca sınanmalıdır.

## Gizlilik ve güvenlik

Cihazdan açılan PDF için sunucuya yükleme eklenmedi. PPTX için kullanıcı her dosyada
ayrı onay verir; yalnız seçilen sunum gönderilir. Defter içeriği gönderilmez.
Adaptör özgün dosya adını, hesap kimliğini, cookie veya Access JWT'yi dönüştürücüye
iletmez. Dönüştürücüye verilen dosyanın adı sabit `document.pptx` olur.

`/api/v1/bilge-defter/pdf-tools/status` ve `/convert` mevcut onaylı hesap kapısını
kullanır. POST ayrıca Origin, hesap kimliği, istek işareti ve `X-Bilge-Pdf-Consent`
gerektirir. Yönlendirme ve kullanıcının seçtiği hedef URL kabul edilmez.

ZIP giriş sayısı, açılmış toplam boyut, sıkıştırma oranı, XML boyutu/DTD/entity,
dosya adı, gerçek akış boyutu ve CRC denetlenir. Bu kontroller dosyayı zararsız
ilan etmez; dönüştürücü izolasyonu zorunludur.

Adaptör sonuçları kalıcı yazmaz. Uzak işçinin geçici dosya temizliği ve günlükleri
bu testlerle doğrulanmış değildir; kullanıcıya sunucuda hiç kopya kalmadığı
garantisi verilmez. İstek iptali uzak LibreOffice işlemini sonlandırdığını kanıtlamaz.
Dönüştürücüye gönderimden sonra gövde tamamlanmadan zaman aşımı, kopma veya iptal
olursa adaptör yeni dönüşümleri kapatır. Yanıt boyut sınırında okuma durdurulduğunda
da sonuç belirsizdir. Yönetici işçinin durumunu ve işin bittiğini doğrulamadan
API'yi yeniden başlatarak bu korumayı kaldırmaz. Gövdesi tamamlanmış 4xx/5xx
yanıtları veya tamamen alınmış bozuk PDF sonraki öğrencinin işini kilitlemez.
Hata yanıtı en fazla 64 KiB ham bayt olarak okunur; ayrıntıları kullanıcıya sızmaz.
Yükleme veya yerel doğrulama zaman aşımı bu kesiciyi açmaz. İstek iptal edilse bile
yerel doğrulama işi gerçekten bitene kadar tek işlem hakkı tutulur.

## Entegrasyon kaynağı

Önceki `b03bb10` çalışması eski `feat/klipper-pdf-backup` dalındadır. Bu aday,
güncel `repair/v57-stability` / `64f6054` tabanına elle uyarlanmıştır; eski kirli
checkout'a dokunulmadı. v72 atomik PDF kaydı, görsel bütçesi ve `scheduleAssetSweep`
korundu. Ayrı PDF sıkıştırma özelliği bu kapsamda taşınmadı.

Yeni sunucu bağımlılığı eklenmedi. Testler için yalnız `outputs/ppt-test-venv`
altında, mevcut Python paketlerini kullanan ve eksik `pywebpush==2.0.3` bağımlılığını
izole tamamlayan bir test ortamı kullanıldı.

## Yerel doğrulama

```powershell
npm run build
npm run test:presentations
npm run test:reliability
outputs/ppt-test-venv/Scripts/python.exe -m pytest server-candidate/v49/tests -q -p no:cacheprovider
```

API testleri sentetik JWT, ayrı SQLite ve taklit dönüştürücü yanıtı kullanır.
Tarayıcı testleri gerçek PDF.js ile dönen sentetik PDF'yi açar; bunlar LibreOffice
dönüşüm kalitesini ya da gerçek iPad kalem gecikmesini ölçmez.

İlk adayın 4 Ekim yerel sonuçları (aşağıdaki inceleme düzeltmelerinden önce):

| Kontrol | Sonuç |
| --- | --- |
| Sunucu: hesap/yetki ve yeni dönüşüm adaptörü | 144/144 (62 yeni, 82 mevcut) |
| PowerPoint tarayıcı sözleşmeleri | 64/64; Chromium 32, WebKit 32 |
| Mevcut güvenilirlik paketi | 26/26 |
| v72 göç/eşitleme düzeltmeleri ve v71 geri dönüş | 12/12 |
| Görsel kayıt/temizlik ve v70 geri dönüş | 14/14 |
| Tablet arayüzü regresyonu | Geçti; fiziksel cihaz değil |

Kanıtlar: `outputs/presentations/presentation-contract-tests.json`,
`outputs/presentations/backend-tests.xml` ve aynı klasörde masaüstü/mobil ekran
görüntüleri. Tarayıcı testi gerçek ham yükleme baytlarını yalnız loopback taklit
dönüştürücüde karşılaştırır; önizleme, kalem çizgisi, yeniden açma ve görselleri
içeren JSON yedeğini kontrol eder. Sunucu testleri ZIP/PPTX sınırlarını ayrıca sınar.

İnceleme sırasında iki hata da giderildi:

- #2164: Dönüştürücüye gönderilmeden biten yükleme/doğrulama zaman aşımı hizmeti
  gereksiz kapatıyordu; evreye bağlı kesici ve doğrulama bitene kadar slot koruması eklendi.
- #2166: v72'de de bulunan gecikmiş pencere kapanışı, hemen yeniden açılan aktarımı
  temizleyebiliyordu. Önceki kapanış yeni açık pencereye uygulanmıyor. Değişmemiş
  `64f6054` üzerinde eski hata görüldü; deterministik tarayıcı testinde yalnız bu
  koruma çıkarıldığında yeni seçimin kaybolduğu ayrıca doğrulandı.

Son yerel web paket özeti (`work/bilge-defter-invited-v72/SHA256SUMS` SHA256):
`73ac8edfcd7c5e1aea31e18072f3ccdad772ace7009162f01e8c83df5fb9d46e`.
235 çevrim dışı varlık; sürüm etiketi geliştirme tabanı olan v72. Bu hash canlı
v72'nin hash'i değildir. Testler bütün tarihsel sürüm matrisinin tamamı değildir.
Bu yerel ölçüm anında CI, commit/push ve yayın yapılmamıştı. Sonraki commit ve
GitHub CI durumu ilgili PR'dan izlenir; PR açılması canlı yayın anlamına gelmez.

## Bağımsız inceleme düzeltmeleri (#101939)

#2168 için testler aynı hesap/işçi durumunda hata yanıtının ardından geçerli bir
sunum gönderir; testler arasında kesicinin sıfırlanması artık bu kusuru gizlemez.
Tam yanıt ile kesilmiş yanıt ayrı sınanır. Timeout, bağlantı kopması ve iptal
korumaları kaldırılmadı.

#2169 için paket içi `/ppt/presentation.xml` gibi mutlak hedefler kabul edilir.
`//host`, URL şeması, ters eğik çizgi, arşiv kökünden kaçış ve olmayan hedef
reddedilir. Tek `/` ile başlayan iç yolun geçerli olması
[OPC ilişki belgesine](https://learn.microsoft.com/en-us/dotnet/api/system.io.packaging.packagepart.createrelationship?view=netframework-4.8.1),
grafik verisinin gömülü OOXML çalışma kitabı olabilmesi
[Open XML grafik veri belgesine](https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.drawing.charts.externaldata?view=openxml-3.0.1)
dayanır. Grafik klasörü sabit varsayılmaz; içerik türü, XML kökü ve grafik ilişkisi
birlikte doğrulanır. İç XLSX'te makro/XL4, ActiveX, OLE, DDE, dış bağlantı,
connection/queryTable ve yeniden gömülü paketler reddedilir.

Dar pilot sınırı: yüzde kaçışlı part/hedef adları (geçerli `%20` dahil), sorgu ve
fragment iç paket URI'leri, alışılmadık XML uzantıları ve worksheet dışı XLSX sayfa türleri
desteklenmez. Bu doğrulayıcı bütün geçerli OOXML dosyalarını
kabul eden bir genel Office ayrıştırıcısı veya zararlı yazılım temizleyicisi değildir.

Teknik uyumluluk için `artifact-tool` ile gerçek yerel grafik ve XLSX paketli
sentetik sunum üretildi; özgün öğrenci verisi veya ücretli hizmet kullanılmadı.
Dosya: `outputs/presentations-review/fixtures/native-chart.pptx` (14.644 bayt),
SHA256 `0bb369dd7708ccc61790820381d084f4a1de531c98d5e19a0edc8d6c9533c3be`.
Native grafik/çalışma kitabı yapısal denetimi geçti. Bu dosyanın dönüştürücüye
yüklenmesi veya gerçek PowerPoint/iPad uygulamasında açılması denenmedi.

Satır sonları mantıksal içerik değiştirilmeden düzeltildi: `main.py` LF, PDF
kaynağı HEAD gibi CRLF, karışık UI dosyasında yalnız etkilenen satırlar düzeltildi.
Mevcut `-text` hash politikası korunur; CRLF farkını boşluk hatası saymamak için
`git -c core.whitespace=blank-at-eol,blank-at-eof,space-before-tab,cr-at-eol diff --check`
kullanıldı. Ardışık iki build aynı manifest özetini üretti.

### Düzeltmelerden sonra yeniden ölçülen sonuçlar

| Kontrol | 4 Ekim 2026 son yerel sonuç |
| --- | --- |
| Bütün sunucu testleri | 248/248; 82 mevcut hesap, 78 sunum, 88 paket güvenliği |
| PowerPoint tarayıcı sözleşmeleri | 64/64; Chromium 32, WebKit 32 |
| Güvenilirlik regresyonu | 26/26; Chromium 13, WebKit 13 |
| Gerçek grafik + gömülü XLSX test paketi | Yukarıdaki aynı SHA256 kabul edildi |
| Bağımsız kod/güvenlik incelemesi | İncelenen kapsamda açık kanıtlanmış maddi kusur bulunmadı |

Son sunucu raporu `outputs/presentations-review/backend-tests.xml`;
tarayıcı raporları `outputs/presentations/presentation-contract-tests.json` ve
`outputs/reliability-1/results.json`. Native grafik kontrolünü tekrarlamak için
`outputs/ppt-test-venv/Scripts/python.exe outputs/presentations-review/build/check-native-chart.py`
kullanılabilir. Bu çıktı ve fixture yerel, Git dışında test kanıtıdır. Kalıcı
`test_presentation_packages.py` harici dosya gerektirmeyen sentetik paketleri üretir.

Bağımsız incelemede ek bulunan büyük harfli `.RELS` dış bağlantı kaçışı da kapatıldı.
Bu varyant, `xml:base`, yinelenen ilişki kimlikleri, iç içe ilişki düğümleri ve XML
içeriğinin farklı uzantıyla gizlenmesi hem dış PPTX hem gömülü XLSX için sınanır.
Eski kusurları örten test-fixture sıfırlaması yerine, aynı kesici durumunda ardışık
bozuk yanıt / geçerli istek senaryosu kullanılır.

Bu önceki sonuçlar yerel kod/test durumudur. O ölçümde CI, gerçek Stirling/LibreOffice dönüşümü,
font ve yerleşim sadakati, gerçek nginx sınırları ve fiziksel iPad kabulü
doğrulanmadı. Bu ölçüm anında commit, push, birleştirme veya yayın yapılmamıştı.

## 4 Ekim takip düzeltmesi: kaynak bağlantıları ve dönüşüm gecikmesi

PR #15 tabanı `d87867f`; takip yaması bu ölçüm sırasında henüz commit/push edilmedi.
Canlı v72 ve diğer servisler değiştirilmedi. Üç yayın kapısı açılmadı.

### Kaynak bağlantıları (#2178)

Lumen Learning'in [CC BY 4.0 biyoloji sunumu](https://courses.lumenlearning.com/wm-biology2/chapter/powerpoints/)
30 slayt ve 53 kaynak/lisans hyperlink ilişkisi içeriyor. Eski doğrulayıcı özgün
dosyayı reddetti; yeni doğrulayıcı aynı SHA256 ile kabul ediyor:
`58224395ad6e4c9019cddc72058a6ad56d4da79200717c96887cf24c30d65d02`.
Dosyadan bağlantı veya atıf çıkarılmadı. Kaynak fixture Git'e eklenmedi.

İstisna yalnız doğru içerik türü/köke sahip slide/notes parçalarında, metin
biçimlendirme düğümüne bağlı DrawingML `hlinkClick` içindir. Aynı ilişki bir resim
veya başka yükleme düğümünde de kullanılıyorsa reddedilir. Kullanılmayan ilişkiler,
fareyle üzerine gelme, özel action, alt düğüm/ses, belirsiz URL, kimlik bilgisi,
dosya/diğer şema, yerel adres ve standart dışı port bu pilotun dışındadır.
Gömülü XLSX için dış ilişki yasağı değişmedi. URL hedefi çözülmez veya istenmez.
URI denetimi DNS/redirect koruması değildir; dış ağı kapalı dönüştürücü zorunludur.

Referans: Microsoft [HyperlinkOnClick](https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.drawing.hyperlinkonclick?view=openxml-3.0.1)
ve [NotesSlidePart](https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.packaging.notesslidepart?view=openxml-3.0.1).
İlişki kullanımları her kaynak XML için bir kez indekslenir; her bağlantıda tekrar
bütün kaynak taranmaz. Ham dosya API'den dönüştürücüye aynen aktarılır.

Sunucu regresyonu **295/295** geçti (önceki 248'e 47 yeni kabul/ret testi).
Kanıt: `outputs/pptx-followup-20261004/backend-tests.xml`, `original-validation.json`.
Bu yeni yamanın bağımsız ajan incelemesi araç engeline takıldı; tamamlanmış sayılmaz.

### Yalnız geçici işçide sıcak UNO karşılaştırması

Kurulu unoserver **3.6** kodunda `_connect(retries=5, sleep=10)` doğrulandı.
Dinleyici yokken dört kez 10 saniye bekleniyor. Java'ya `auto-uno-server=true`
demek tek başına süreç başlatmayı kanıtlamaz; resmi giriş betiği bunu ayrı başlatır.
Bu denemede mevcut servis değiştirilmeden ayrı `network=none` işçide UNO,
loopback üzerinde açıkça başlatıldı ve XML-RPC `info()` ile hazır olduğu ölçüldü.
Hazır olma süresi **6,259 saniye**, aşağıdaki dönüşüm sürelerinden ayrıdır.

| Aynı dosya | Önceki UNO dinleyicisiz ölçüm | Hazır UNO ölçümü |
| --- | --- | --- |
| Yerel grafik, 1 slayt | 41,188 sn; sonraki işlem 41,101 sn | 0,535 / 0,304 / 0,296 sn |
| Lumen, 30 slayt | 43,544 sn | 0,799 sn |
| Bozuk paket | 500; 41,015 sn | 500; 1,117 sn |
| Bozuk paket sonrası geçerli grafik | 41,772 sn | 0,312 sn |

Bu az sayıda kontrollü ölçümdür; eşzamanlı sınıf kapasitesi veya her dosya için
garanti değildir. Sıcak PDF'in 30 sayfası soğuk çıktıyla aynı metni içeriyor;
aynı Poppler ayarında **30/30 sayfanın PNG hash'i aynı**. Önceki font ikameleri
değişmedi; özgün PowerPoint font/yerleşim sadakati onaylanmış değildir.

UNO'ya 45 saniye dönüşüm sınırı ve 12 iş sonrası çıkış verildi. Ancak HTTP istemcisi
57 ms sonra kapatıldığında `unoconvert` çalışmaya devam etti; 2,55 saniye sonraki
örnekte bitmişti. **Bağlantının kapanması uzak işi iptal etmiyor.** API'nin belirsiz
iş kesicisi kaldırılmadı. Gerçek uzun işte 45 saniyelik sınırın süreçleri öldürmesi,
Stirling fallback davranışı ve tam API/nginx zinciri henüz doğrulanmadı.

Sabit imaj `sha256:96eed6dc542afca240700857c633379e7d5992259903026f1f629b7a8df21359`;
2 GiB, 1 CPU, 160 PID, UID1000, salt-okunur kök, sınırlı tmpfs, port/bind mount yok.
Geçici konteyner kimlik/claim etiketiyle kaldırıldı. Mevcut konteynerlerin ID,
başlama zamanı ve restart sayısı değişmedi. Kanıtlar `outputs/pptx-followup-20261004/`.
Bu test betiği üretim süreç yöneticisi veya yayın paketi değildir.

Resmi kaynaklar: [Stirling v2.10.1 dönüşüm yolu](https://github.com/Stirling-Tools/Stirling-PDF/blob/v2.10.1/app/core/src/main/java/stirling/software/SPDF/controller/api/converters/ConvertOfficeController.java),
[Unoserver 3.6 istemcisi](https://github.com/unoconv/unoserver/blob/3.6/src/unoserver/client.py),
[süreç seçenekleri](https://github.com/unoconv/unoserver/blob/3.6/README.rst).

## Yayın öncesi zorunlu kapılar

1. Kaynağı yeni sürüm numarası ve tek commit/provenance altında paketle. Bu yerel
   çalışma hâlâ v72 etiketli geliştirme tabanıdır; **canlı v72 dosyalarını üzerine
   yazarak güncelleme yapılmaz**.
2. API ve nginx de değişti. `deploy-v72.py` web-only akışı API v68'i sabit tutar;
   bu özelliği tek başına yayımlayamaz. Yeni API imajı, nginx ve web için kontrollü
   yayın/geri dönüş paketi gerekir. Hesap DB şeması değişmez.
3. Eski v53 işçisini doğrudan açma/değiştirme. Yukarıdaki izole karşılaştırma
   gecikmeyi daralttı; sıcak UNO için gözetim, hazır olma, süreç sonlandırma ve
   geri dönüşü doğrulanmış yeni bir yayın paketi hâlâ gerekli.
4. Ayrı işçi; dış ağa çıkış yok, yalnız API'den erişim; kullanıcı verisi mount'u
   yok; CPU/RAM/PID/süre sınırı, makro kapatma, geçici dosya temizliği ve iptalde
   süreç sonlanması gerçek kötü/şifreli/büyük dosyalarla doğrulanmalı.
   Paylaşılan `stirling-pdf` servisine sırf hızlı diye geçiş yapılmaz.
5. `.env.classroom.example` içindeki üç kapı varsayılan `0` kalır. `PDF_URL` yalnız
   izinli özel hedefe, API tek worker olacak şekilde yapılandırılır. İzolasyon
   doğrulanmadan `BILGE_DEFTER_PDF_ISOLATION_VERIFIED=1` verilmez.
6. Sunucuya 20 MiB yalnız `/pdf-tools/` için izin verilir; genel API'nin 8 MiB
   sınırı değişmez. Gerçek nginx üstünden sınır ve yetki testleri yapılmalı.
7. Gerçek 16:9/4:3, Türkçe karakter, tablo/görsel/font ve 50 slayt PPTX örneklerini
   görsel karşılaştır; iPad'de ekle, yaz, kaydet, yeniden aç ve ayrı hedefe JSON
   yedeğini yükle. Bozuk/51 slayt dosya mevcut notları değiştirmemeli.
8. Yayın için ayrı kullanıcı onayı ve mevcut notların JSON yedeği gerekir.

Bu kapılar tamamlanmadan sınıf kullanımına açık veya yayına hazır denmez.
