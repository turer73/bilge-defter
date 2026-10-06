# Doğrudan PowerPoint: kalıcı yerel pilot

Durum: **v76 ana uygulama entegrasyon adayı**; bu başlık tek başına canlı yayın kanıtı değildir. Taban: v75,
`d4f64734bcb92f22024643a5c610cab94d80b568`. Çalışma dalı:
`codex/direct-pptx-pilot`. Mevcut defterlerin veri biçimi, veritabanı,
sunucu dönüştürücüsü ve hesap servisi değiştirilmez.

## Hedef ve kullanım

Kullanıcı `.pptx` seçer, slaytları cihazda görür ve ayrı katmanda kalemle not
alır. **PDF dönüşümü ve sunucuya dosya gönderimi yoktur.** Slaytın kendi
metinleri/şekilleri düzenlenmez. Kayıtlı sunum yeniden açıldığında notları
yerinde kalır. Ana uygulamada seçili deftere **bağlı sunum** olarak eklenir;
normal defter sayfalarının arasına dönüştürülmüş sayfalar eklenmez.

v76 akışı: **Defteri seç → Ekle → PowerPoint ekle → PowerPoint seç**.
Yeniden açmak için defter panelindeki **Bu defterin sunumları** veya
Ekle içindeki sunum listesi kullanılır. Varsayılan liste seçili deftere aittir.
“Diğer defterlerin sunumlarını da göster” seçeneği, silinmiş/eski defter
bağlarını da kurtarabilmek için hesaptaki bütün sunumları gösterir; kayıtları
taşımaz. Sunum yedeği yükleme, o anda seçilen deftere **yeni** kopya ekler.

Gerçek uygulama yalnız onaylı hesabın doğrulanmış kimliğini kullanır; aşağıdaki
bağımsız yerel başlatıcı fixture deposu aynı hesap veya aynı defter sayılmaz.
Çıkış/slayt değişimi bekleyen kalem kaydını tamamlar; hesap izni iptal edilirse
görüntü gizlenir ve henüz tamamlanmamış yazım kaydedilmemiş olabilir.

```powershell
cd D:\Projelerim\bilge-defter-repair-v57
npm run pilot:pptx
```

Adres: `http://127.0.0.1:8775/`. Bu yalnız bilgisayardaki yerel denemedir;
iPad'den erişilebilir yayın değildir. Başlatıcı yalnız yedi sabit uygulama
dosyasını sunar; sunumları, notları, repo kökünü veya `outputs` klasörünü
sunmaz. Ctrl+C sunucuyu durdurur, tarayıcıdaki kayıtları silmez.

1. **PowerPoint seç** ile dosyayı açın. İlk açılışın tamamlanmasını bekleyin.
2. Kalem/fareyle yazın; renk ve kalınlığı değiştirebilirsiniz. **Çizgi sil**
   değdiği not çizgisini kaldırır; **Geri al** o slayttaki son işlemi geri alır.
3. Önceki/Sonraki ile gezin. Slayt değişmeden önce bekleyen kayıt tamamlanır.
4. Kaydedildi bilgisi geldikten sonra kapatıp aynı adreste, aynı tarayıcıyla
   açın; **Kayıtlı sunum** listesinden seçin.
5. **Sunum ve not yedeği al** bir `.bdpptx` dosyası üretir. İndirilen dosyanın
   varlığını kontrol edin. **Sunum yedeği yükle** eski kaydı değiştirmeden
   yeni bir kopya oluşturur.

Normal Bilge Defter JSON yedeği bu pilotun sunumlarını **içermez**.
`.bdpptx`, özgün sunumu ve notları beraber içerir; şifreli değildir.
Yalnız güvenilen kişilerle paylaşılmalıdır. Hash kontrolleri bozulmayı
tespit eder; gönderenin kimliğini doğrulamaz. Farklı port/adres veya
tarayıcı profili ayrı depolamadır. Tarayıcı verilerini silmek notları siler.

## Depolama sözleşmesi

- `bilge-defter-pptx-pilot-v1::<scope>` adında ayrı IndexedDB.
- `documents`: sunum bilgisi ve revizyon; `assets`: değişmeyen özgün PPTX;
  `notes`: slayt numarasına bağlı çizgiler; `control`: kapsam ve kota.
- Yeni kayıt dört depoya tek işlemle yazılır. Her kalem kaydında PPTX
  tekrar okunmaz/yazılmaz; yalnız not, revizyon ve kota güncellenir.
- Beklenen revizyon uyuşmazsa yazma reddedilir. Taslak bellekte korunur;
  yedek veya ayrı kopya sunulur. Çakışan kayıt körlemesine ezilmez.
- Sonuç mesajı ancak işlem tamamlandığında “kaydedildi” olur. Kota/kayıt
  hatasında sayfa değiştirilmez; kaydedilmeyen taslak yedeklenebilir.
- Hesap koruması düşerse bekleyen işlemler iptal edilir, okuyucu ve not
  görüntüsü kapatılır. Bu, depodaki kayıtları silmez. Bir işlem kapanmadan
  önce tamamlandıysa tekrar açılıp durumu doğrulanmalıdır.
  Güvenlik gereği artık erişimi olmayan hesaba yeni yazım yapılmaz;
  kilit anında henüz kaydedilmemiş çizimler kaybolabilir. Son başarılı
  kayıt korunur; kapanış sonrası tüm taslağın kurtarılabildiği vaat edilmez.
- Yerel sayfa yalnız `local-fixture:local-pilot` kullanır. Gelecek gerçek
  hesap entegrasyonu `mountPilot(container,{scope,guard,onClose})` üzerinden
  doğrulanmış hesap kapsamını ve sürekli geçerlilik kontrolünü vermelidir;
  e-posta/URL parametresi kimlik yerine kullanılamaz.

Ölçüler: dosya en fazla **20 MiB / 100 slayt**; kapsam başına en fazla
**20 sunum / toplam 96 MiB** özgün dosya + not; bir sunumun notları en fazla 8 MiB,
20.000 çizgi ve toplam 500.000 nokta, kayıt parçası başına 5.000 nokta.
Uzun kesintisiz çizgi, aynı uç noktayı paylaşan parçalara bölünür; yeni
noktalar sessizce atılmaz. Tek Geri al bütün kalem hareketini kaldırır.
İptal/kapanma anında uzun çizginin tamamlanıp kaydedilmiş parçaları kalabilir.
Bunlar uygulama sınırıdır; tarayıcı kotası veya cihaz RAM garantisi değildir.
Pilot henüz sunum silme yönetimi içermez; kota dolarsa yeni içeriği
eklemeyip mevcut kayıtları korur. Paylaşımlı cihazda ayrı tarayıcı profili gerekir.

## Okuyucu ve güvenlik sınırı

Sabitlenmiş `@aiden0z/pptx-renderer@1.3.0` kullanılır. Kaynak hash'i,
türetilmiş çıktı hash'leri ve lisanslar `work/pptx-pilot/vendor/` altındadır.
Apache-2.0 ve dahil edilen bileşenlerin bildirimleri korunur. Uygulama
modülleri repo lisansına tabidir; üçüncü taraf lisansı değiştirilmez.

Sunum, `sandbox="allow-scripts"` olan ayrı iframe'de açılır;
ana pencere okuyucu HTML'ini aynı adresten/kurulu önbellekten alır, 4 MiB
sınırı ve sabit SHA-256 doğrulamasından sonra `srcdoc` ile yükler. Böylece
çevrimdışı iframe gezinmesinin önbelleğe ulaşamaması aşılır. Giriş HTML'i,
bozulmuş paket veya yönlendirme çalıştırılmaz. Hesap kilidi bekleyen indirmeyi
iptal eder; yeniden açılışta hesap doğrulama politikası değişmez.
`allow-same-origin`, pop-up, form veya üst sayfaya gezinme izni yoktur.
Frame belgesi iki hash-izinli güvenilir script içerir; dış script,
bağlantı, medya, iç frame ve worker CSP ile kapalıdır. Herhangi bir
`unsafe-eval`, `script-src unsafe-inline` veya CORS istisnası eklenmez.
Ana sayfa yalnız seçilen PPTX'in bir kopyasını gönderir; hesap bilgisi,
notlar veya veri yazma yetkisi göndermez. Kaynak pencere, tek kullanımlık
token ve MessageChannel kontrolü; sınırlı `load/show` komutları kullanılır.

Doğrulayıcı ZIP boyut/genişleme/yol sınırlarını, XML bütçesini, resim ve
font sınırlarını denetler. Makro, ActiveX, OLE, gömülü paketler ve dış
kaynak ilişkileri reddedilir. HTTP(S) köprüleri kabul edilse bile tıklanamaz.
Bu pilot **gömülü Excel içeren yerel PowerPoint grafiklerini reddeder**;
sunucudaki önceki doğrulayıcıyla destek kapsamı aynı değildir. EMF/WMF
desteği kısıtlıdır; mevcut bitmap önizlemeleri kullanılabilir. Video,
animasyon, 3B içerik ve tam Office yerleşim sadakati vaat edilmez.

Tek slayt DOM'u tutulur, ancak kütüphane medya/ayrıştırma verilerini
bellekte tutabilir. Opaque iframe bir Web Worker veya işletim sistemi
süreci değildir; sert CPU/RAM izolasyonu sağlandığı iddia edilmez.
Zaman aşımı okuyucuyu kaldırır. Fiziksel düşük bellekli iPad kabulü şarttır.

Kaynaklar: [renderer projesi](https://github.com/aiden0z/pptx-renderer),
[iframe sandbox](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/iframe),
[CSP script hash'leri](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/script-src).

## Tekrar üretme ve test

Node 22+ ve mevcut repo Playwright sürümü kullanılır. Gerekli Chromium ve
WebKit tarayıcılarının test makinesinde kurulu olması gerekir. Başlatma
paket indirme veya kurulum çalıştırmaz.

```powershell
npm run check:pptx-pilot
npm run test:pptx-store
npm run test:pptx-races
node work/verify-pptx-pilot.cjs --segment=store
npm run test:pptx-pilot
```

Tam test, kullanıcı tarafından izin verilen 69 slaytlık 16.184.486 bayt
ders sunumunu yerel Desktop yolunda arar. Alternatif yol:
`node work/verify-pptx-pilot.cjs --source="C:\izinli-dosya.pptx"`.
Dosyanın SHA-256'sı
`955170ca7d7ca2093bdbf6871a764c29d2717df345be12b75fa065c607329ca7`
olmalıdır. Başka bir dosya aynı kabul kanıtı sayılamaz. Dosya ve ekran
görüntüleri Git'e eklenmez. Model/depo testleri sentetik veriyle çalışır.

`prepare:pptx-pilot` sabitlenmiş kaynak ve frame kodundan türetilen dosyaları
üretir; `check:pptx-pilot` yalnız eşleşmeyi kontrol eder. Harici paket
güncellemesi sessizce alınmaz. Test sırasında kaynaklar değiştirilirse
nihai test tekrar edilmelidir. Makine kanıtları:
`outputs/pptx-pilot-20261006/` (yerel/özel, repo dışı çıktı).

## 6 Ekim 2026 bağımsız yerel pilot doğrulaması (v76 öncesi)

O turdaki host SHA-256 (v76 entegrasyonundan önce):
`4516ab54fc8f45080af50c3616361e7ffa30cff6f14fbd9b6f4c01a2a5f69de9`.

| Kontrol | Sonuç |
| --- | --- |
| Gerçek dosyalı bağımsız Chromium + WebKit turu | 70/70 |
| Sentetik gerçek IndexedDB kayıt/yedek/kota testleri | 24/24 |
| Kopyalama yarışı, dar ekran ve uzun çizgi regresyonları | 6/6 |
| Yerel başlatıcı izin listesi ve HTTP sınırları | 15/15 |
| Türetilmiş paket hash kontrolü | Geçti |

Gerçek 69 slayt iki motorda gösterildi; kaynak baytları, not kalıcılığı ve
indirilen yedeği yeniden açma doğrulandı. Son geniş turdaki dış ağ isteği ve
yakalanmamış tarayıcı hatası sıfır; çalışma sırasında kaynak değişimi sıfır.
Beklenen CSP engelleme denemeleri konsola hata yazdırır; bunlar ağ erişiminin
başarılı olduğu anlamına gelmez. Nihai tarayıcı raporu zamanı:
`2026-10-06T19:19:18.574Z`.

İncelemede bulunan kopyalama yarışı ve 5.000 noktadan sonra çizgi kaybı için
eski kaynakta başarısız, düzeltilmiş kaynakta başarılı negatif kontroller
yapıldı. WebKit'te kapanan işlemin yanıtının askıda kalması da giderildi;
iptal sonrası eski kayıt korunumu denetlendi. Bu tura ait merkezi kayıtlar:
CLAIM #102143, kapsam genişletmeleri #102145/#102148, bulgular #2235/#2236.

Sonuçlar **yerel aday** içindir. Canlı v75 değiştirilmedi; commit/push veya
yayın yapılmadı. Ana uygulamanın tüm eski regresyon paketi bu turda
çalıştırılmadı; takipli uygulama kodu yerine yeni pilot dosyaları ve npm
komutları eklendi. Fiziksel depolama doluluğu, yoğun el yazısı performansı,
100 slaytlık gerçek sunum ve Apple Pencil kabulü bu kanıtın dışında.

## İlk pilot turunda belirlenen kapılar

- Ana uygulama **Ekle** menüsü ve gerçek hesap yaşam döngüsü entegrasyonu.
- Sunum yönetimi/silme akışı; kullanım kotasının kullanıcıya gösterimi.
- Servis çalışanı, çevrimdışı paket ve sürüm/güncelleme uyumluluğu. Mevcut
  pilot tek başına çevrimdışı PWA olarak sunulmaz.
- Nihai kaynak üzerinde tüm testlerin tekrar geçmesi; paket ve lisans
  kontrolü; hash'e bağlı PR/yayın/geri alma planı.
- Fiziksel iPad'de 69 slayt, soğuk açılış, kalem+avuç, iki parmak, yatay/
  dikey dönüş, uzun yazı, arka plana geçiş, kapatıp açma, yedekten dönme.
- Gerçek dosyalardaki başlık, resim, grafik, EMF ve font sadakati. WebKit
  otomasyonu fiziksel iPad, Apple Pencil veya bellek kabulü değildir.

v76'da menü/defter bağı, hesap yaşam döngüsü, ayrı yedek açıklaması ve
hash-kontrollü çevrimdışı paket bağlantısı eklendi. Yayın sonuçları ve geri
alma adımları `RELEASE_V76.md` içinde ayrı tutulur. Ana defter şeması ve
sunucu API'si değişmez. Normal defter JSON yedeği/eşitlemesi sunumları içermez.

Bu sınırlı denemede kayıt sınırı hesap başına **20 sunum / özgün dosyalar ve
notlarla toplam 96 MiB**; her PPTX en fazla **20 MiB / 100 slayt**. Sunum silme
ve kota yönetimi henüz yoktur; sınır dolduğunda yeni ekleme reddedilir,
mevcut sunumlar korunur. Bu, sınıf geneline hazır ürün kabulü değil, izinli
gerçek cihaz denemesidir. Ana ekran yedeği ve ayrı `.bdpptx` yedeği alınmalıdır.

Gerçek iPad kalemi, avuç içi, bellek baskısı, yoğun notlarda performans ve
öğretmen dosyasının görsel sadakati otomasyonla tamamlanmış sayılmaz.
