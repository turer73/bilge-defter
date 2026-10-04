# v75 adayı: 100 sayfalık PDF ve PowerPoint

5 Ekim 2026. **Yerel kod ve test adayı; canlı yayın değildir.**
Uygulama tabanı: `32d0f5be89cd0fed0d90de16012f547e3fb6db32`.
Yayın dalı: `codex/pptx-100-pages-v75`; master birleşimi
`f4473ca5466910e0fe852fec38a966cc63766f61` üzerine hazırlanır.
Canlılık yalnız kaynak commit'ine bağlı `live-proof.json` ile doğrulanır.

## Kullanıcı sorunu ve kapsam

Kullanıcının 69 slaytlık, 16.184.486 baytlık PPTX'i v73'te yalnız 50 slayt sınırı
nedeniyle reddediliyordu. Genel "içerik desteklenmiyor" mesajı nedeni gizliyordu
(merkezi bulgu #2197). Kaynak dosya değiştirilmedi veya Git'e eklenmedi.

- PPTX: en fazla 100 slayt. Sınır aşımı doğrulanmış dosyalarda 422 ve
  `presentation_slide_limit`, `max_slides`, `actual_slides` alanları döner.
- PDF: içe aktarma, kayıt/JSON yedek doğrulaması ve notlu dışa aktarma 100 sayfa.
- Tehlikeli veya bozuk 101 slayt dosya yine genel 415 alır: sayfa sınırı güvenlik
  doğrulamasını atlatmaz. Makro, dış kaynak, OLE ve gömülü paket kuralları değişmedi.
- İstemci yalnız beklenen yapıdaki sınırlı JSON hata ayrıntısını gösterir; ham
  sunucu hata metni/dosya adı gösterilmez. Hata gövdesi en fazla 4096 bayt okunur.
- Rasterleştirme her sayfadan sonra olay döngüsüne döner; iptal/yeni seçim eski
  sonucu uygulayamaz. Tuval ve PDF sayfa kaynakları hata durumunda da temizlenir.

## Değişmeyen kaynak sınırları

| Sınır | Değer |
| --- | --- |
| PPTX yükleme / dönüştürülmüş PDF | Ayrı ayrı 20 MiB |
| Tek aktarımın sayfa görüntüleri | 24 MiB (data URL boyutu) |
| Tek PDF sayfasının görüntüsü | 6 MiB |
| Yerel defter görselleri, çöp dahil | 96 MiB |
| Notlu PDF çıktısı | 64 MiB |
| Şifreli sunucu eşitlemesi | 5 MiB |
| Yerel PDF sayfalarını hazırlama | 60 saniye |
| Ağsız dönüştürücü | 45 saniye, 2 GiB RAM, 1 CPU, 160 PID |

100 sayfa kabul üst sınırıdır; her 100 sayfalık/görsel yoğun dosyanın her iPad'de
yüklenmesi veya sunucuya eşitlenmesi garanti değildir. Kaynak sınırında mevcut
defter değiştirilmez. Özellikle 5 MiB eşitleme sınırı bu işte yükseltilmedi.

## Geri dönüş: önce v74 okuyucu, sonra v75 yazıcı

v73'ün kayıt doğrulayıcısı `pdf.total > 50` kayıtlarını reddeder. Dolayısıyla
doğrudan v75'e çıkıp v73'e geri dönmek güvenli değildir.

1. `npm run prepare:compat-reader` yayımlanmış v73 kaynak commit'i
   `d8cc025d9bcc43a08c12654a9aabc6958da9a051` üzerinden v74'ü yeniden üretir.
   Tek işlevsel fark kayıt okuyucusunun 100 sayfa kabul etmesidir. İçe/dışa aktarma
   hâlâ 50; API v73 kalır. Sürüm etiketi, SW ve manifest de güncellenir.
2. v74 web paketi önce ayrı yayın olarak alınır ve paket kimliği doğrulanır.
   Öğrenciler kayıt/yedek sonrası günceller; açık eski pencere zorla yenilenmez.
3. v75 web ve 100 slayt kabul eden API birlikte hazırlanır. Hesap DB şeması,
   kimlik doğrulama, nginx boyutları veya dönüştürücü imajı değişmez.
4. **v75 sonrası geri dönüş tabanı v74'tür. v73/v72'ye otomatik dönüş yasaktır.**
   Eski yayın betiğine yalnız sürüm numarası değiştirerek bu sürüm yayımlanmaz.
   Yeni yayın aracında okuyucu tabanı/provenance ve geri dönüş koruması gerekir.

v74 `SHA256SUMS` özeti:
`932de743ac5baf5c71b9e9ec82e51361dbd15c6b2b1f16da6ebb0445b58dd566`.
Test edilen v75 `SHA256SUMS` özeti (235 varlık, yeniden build ile aynı):
`47b4799127d9d52653648d89cd05ee9db8a984c8e54e66cc18de191097101fdc`.
Üretici farklı bir mevcut v74 paketini üzerine yazmayı reddeder; karşılaştırma
kanıtı `outputs/page-limit-20261005/v74-compat/build-proof.json`.

## Gerçek ders dosyası: izinli izole ölçüm

Kullanıcı dosyanın yalnız Klipper'daki ayrı test dönüştürücüsüne gönderilmesine
açık onay verdi. Üçüncü taraf/ücretli hizmet kullanılmadı. Kaynak SHA256:
`955170ca7d7ca2093bdbf6871a764c29d2717df345be12b75fa065c607329ca7`.

Canlı işçiyle aynı sabit imaj, ayrı `network=none` konteynerde kullanıldı:
`sha256:c7288011ccb2df31469c59aaa7398dd7d9d926647a4b3dbff78e0a672100f95c`.
Port yok; Unix socket, salt okunur kök, ayrı tmpfs, yetki/CPU/RAM/PID sınırları;
kullanıcı defteri veya üretim veri dizini mount edilmedi. Dönüşüm **5,057 saniye**,
HTTP 200; **69 sayfa / 4.160.754 bayt** PDF üretti. PDF SHA256:
`146cd4b8821ad8993d8af829c94c899dcd882b501cdd21f0d390fd93d31f6f52`.

Geçici konteyner kimlik/claim etiketi doğrulanarak kaldırıldı. Sunucuya gönderilen
geçici PPTX ve üretilmiş PDF kopyaları kaldırıldı; özgün masaüstü dosyası ve yerel
test çıktısı korundu. Canlı web/API/işçi konteyner kimliği ve başlama zamanları
önce/sonra aynı kaldı. Kanıt: `outputs/page-limit-20261005/conversion-proof.json`.

Bu PDF Chromium ve WebKit'te yerel PDF.js akışıyla açıldı; son sayfaya kalem notu,
kayıt, yeniden açma ve görselli JSON yedeği doğrulandı. Görüntü toplamı Chromium
6.065.833, WebKit 5.627.457 bayt (24 MiB altında). 1/35/69 sayfa görüntüleri
gözden geçirildi: boş sayfa/kayıp ana görsel görülmedi. **Özgün PowerPoint ile
piksel eşitliği veya font sadakati onaylanmadı; font ikamesi olabilir.** Bu çalışma
fiziksel iPad performans/kullanım kabulü değildir.

## Tekrarlanabilir testler

```powershell
npm run build
npm run prepare:compat-reader
npm run test:presentations
npm run test:page-limit
node work/verify-page-limit-sw.cjs
npm run test:reliability
npm run test:fixes-v72
npm run test:previous-copy
outputs/ppt-test-venv/Scripts/python.exe -m pytest server-candidate/v49/tests -q -p no:cacheprovider
```

Sentetik 100 farklı sayfa; 101 reddi; iptal; 24 MiB görsel sınırı; kalem notu;
yeniden açma; JSON yedek/geri yükleme; gerçek PDF çıktı sayısı ve v74 aynı depolama
üzerinde okuma/düzenleme/kayıt kapsamı vardır. İsteğe bağlı `BILGE_REAL_PDF`
yerel dosyayla 69 sayfa kabulünü ekler. Bu dosya CI'ya veya Git'e taşınmaz.
Raporlar `outputs/page-limit-final/`, `outputs/page-limit-sw/`,
`outputs/presentations/` altında; özet sonuçlar oturum sonu kanıtında tutulur.

| Son yerel ölçüm | Sonuç |
| --- | --- |
| Hesap/sunum/güvenlik API testleri | 330/330 |
| 100 sayfa, gerçek 69 PDF ve güvenli hata akışları | 48/48; Chromium + WebKit |
| Mevcut sunum sözleşmeleri | 64/64; Chromium + WebKit |
| Gerçek SW v74 -> v75 -> v74 -> v75, 100 sayfa | 5/5; Chromium |
| Mevcut çok-pencereli SW güncelleme testi | 6/6; Chromium |
| Güvenilirlik | 26/26 |
| v72 görsel göçü / eşitleme düzeltmeleri | 12/12 |
| Önceki sunucu kopyası / yedek kurtarma | 6/6 |
| Kalem ve kaydırma regresyonları | İki motorda geçti |
| Değişmeyen v73 yayın aracının sentetik testleri | 17/17; v75 yayın aracı değildir |
| İşçi testleri (Windows) | 8 geçti, Linux'a özgü 25 test atlandı |

Yeni SW testinin ilk denemesi hatalı asenkron bekleme nedeniyle kontrolsüz
pencerede çalışıyordu. Gerçek worker-state polling ve kontrolcü şartıyla test
düzeltildi; üretim `pwa.js` değişmedi. Son gerçek güncelleme/geri dönüş geçti.
Eski göç testlerinin v70/v71 okumayı doğrulaması yalnız eski küçük veri örnekleri
içindir; **yeni 100 sayfalık veri için v74 geri dönüş tabanı geçerlidir**.

## Yayından önce kalan kapılar

### Hazır yayın aracı

`work/build-release-v75.py` yalnız commit'lenmiş uygulama kaynaklarından paket
üretir. Sentetik 100 slayt ayrı hash ile bağlanır ve yalnız test imajına girer.
`work/deploy-v75.py` sırası: `prepare`, `stage`, bağımsız PDF ölçümü ve sunucu
dışı yedek doğrulaması, `rehearse`, `bridge`, `activate`, `verify`.
25/25 yayın güvenlik testi ve bağımsız kod incelemesi geçti.

Yeni yol `/opt/bilge-defter-classroom-v75`; okuyucu köprüsü
`/opt/bilge-defter-classroom-v74`. Mevcut ağsız v73 dönüştürücü korunur.
Hazırlık mevcut canlı kimlikleri/hash'leri doğrular; SQLite tutarlı yedeği alır.
Prova canlı veriyi değil bu kopyayı kullanır; kimlik sırlarını bağlamaz.
Yayın öncesi ayrı PDF okuyucusuyla 100 sayfa/100 farklı sayfa işareti doğrulanmalı;
`page-count-proof.json`, paket ve dönüşüm hash'lerine bağlıdır.

v75 başlamadan önce `/opt/bilge-defter-invited/minimum-reader.json` kalıcı olarak
v74 tabanını yazar. Kısmi hata veya `rollback`, saklanan v74 web + v73 API'yi
açar; eski DB yedeğini canlı verinin üzerine yazmaz. Eski betikler kullanılmaz.

- Geri dönüş: `sudo python3 -B /opt/bilge-defter-classroom-v75/deploy-v75.py rollback`
- Kanıtlar: `source-receipt.json`, `stage-proof.json`, `page-count-proof.json`,
  `rehearsal-proof.json`, `bridge-proof.json`, `live-proof.json`.
- Özel yedekler ve sentetik imzalama anahtarları Git'e girmez.

- Son kaynak commit'i, push/PR/CI ve bağımsız kaynak/paket hash doğrulaması.
- Yayından hemen önce CLAIM, güncel durum,
  kapsamlı geri dönüş yedeği ve yalnız Bilge Defter'e özgü değişiklik.
- Davetli yetki kapısından gerçek API ile 100 kabul / 101 açıklamalı ret; mevcut
  20 MiB sınırı ve kimlik korumalarının canlı kontrolü.
- iPad'de gerçek ders: ilk/orta/son sayfa, yazma, iki parmak kaydırma, kaydetme,
  kapatıp açma ve ayrı test ortamında JSON geri yükleme. Öncesinde JSON yedeği.

Yerel testlerin geçmesi bu kapıların tamamlandığı veya canlı v73'ün 69 sayfa
sunumu artık açabileceği anlamına gelmez.

## 5 Ekim yayın provası (henüz canlı değil)

Kaynak paket commit'i `456b92498f82832e10f6553bc35559cfd261998c`; PR #16.
Paket SHA256 `6c210d546f45207a59506e44fdc61ca8e052ca976a580d23c5007b7e2741af1d`.
Tam tarihsel istemci regresyonu geçti. Klipper'da ayrı v75 test imajında
**331 API testi** (330 uygulama + yayın sözlük kontrolü) geçti.

Yalnız sentetik hesaplarla gerçek nginx/yetki/dönüştürücü yolu sınandı:
100 slayt kabul, 101 için açıklamalı 422 ret, 20 MiB ve hesap/CSRF/onay
korumaları, sözlükte 146.532 madde, yedek hesap yalıtımı ve önceki kopya.
100 slayt **2,37 saniyede** 100 sayfalık PDF oldu; bağımsız pypdf okuyucusu
100 farklı sayfa işaretini doğruladı. PDF SHA256:
`3f356b489827b7dd3d3568965c67a012ab666e10fb62e13559e9e844a0d435a1`.
Gerçek PDF'nin 1/50/100 sayfalarında Türkçe karakterler ve yerleşim görsel
olarak da incelendi; bu tüm sayfaların veya fiziksel cihazın kabulü değildir.

v74 web + v73 API geri dönüş provası ayrı veritabanı kopyasında geçti:
238 HTTP dosya hash'i, 235 çevrimdışı varlık, 16 yetkisiz istek reddi ve
6 özel yol engeli doğrulandı. Canlı DB mount edilmedi, yedek canlıya yazılmadı.
Mevcut işçi ve diğer uygulamalar değişmedi.

İlk CI çalışması WebKit testindeki fiziksel kayıt karşılaştırmasında durdu:
arka plan görsel göçü aynı içeriği `data:` yerine `asset:` ile saklayabiliyor.
Bu testin düzeltmesi ve CI tekrarının sonucu ayrıca doğrulanmalı; uygulama
paketi değiştirilmeden test düzeltmesi yapılırsa iki commit'in uygulama/yayın
dosyaları byte düzeyinde eşit olmalıdır. Özel sunucu dışı hesap yedeği aktarımı
güvenlik denetimi nedeniyle açık kullanıcı onayını beklemektedir; bu koşul
atlanarak canlıya geçilmez.
